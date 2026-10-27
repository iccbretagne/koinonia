import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { createSession, fakeHasChurchPermission } from "@/__mocks__/auth";

let currentSession: Session;
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: async (permission: string, churchId: string) => {
    if (!(await fakeHasChurchPermission(currentSession, permission, churchId))) throw new Error("FORBIDDEN");
    return currentSession;
  },
  requireChurchAccess: async (churchId: string) => {
    const ok = currentSession.user.isSuperAdmin || currentSession.user.churchRoles.some((r) => r.churchId === churchId);
    if (!ok) throw new Error("FORBIDDEN");
    return currentSession;
  },
}));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), RATE_LIMIT_MUTATION: {} }));

const setChurchLogo = vi.fn();
const removeChurchLogo = vi.fn();
const getChurchLogo = vi.fn();
vi.mock("@/modules/core", () => ({
  setChurchLogo: (...args: unknown[]) => setChurchLogo(...args),
  removeChurchLogo: (...args: unknown[]) => removeChurchLogo(...args),
  getChurchLogo: (...args: unknown[]) => getChurchLogo(...args),
}));

const { GET, POST, DELETE } = await import("../route");

const params = (churchId = "church-1") => ({ params: Promise.resolve({ churchId }) });
const url = (query = "") => `http://localhost/api/churches/church-1/logo${query}`;

function sessionWithRole(role: Role, churchId = "church-1"): Session {
  return createSession({
    churchRoles: [
      { id: "r", churchId, role, ministryId: null, church: { id: churchId, name: "ICC", slug: "icc" }, departments: [] },
    ],
  });
}

async function upload(variant = "light", size = 10) {
  const form = new FormData();
  form.append("variant", variant);
  form.append("file", new File([new Uint8Array(size)], "logo.png", { type: "image/png" }));
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  return new Request(url(), {
    method: "POST",
    body,
    headers: { "content-type": encoded.headers.get("content-type")!, "content-length": String(body.byteLength) },
  });
}

describe("/api/churches/[churchId]/logo (spec 072)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setChurchLogo.mockResolvedValue("abc123");
    getChurchLogo.mockResolvedValue(null);
  });

  it("dépôt par l'Admin de l'église : 201 et version", async () => {
    currentSession = sessionWithRole("ADMIN");
    const res = await POST(await upload("dark"), params());
    expect(res.status).toBe(201);
    expect((await res.json()).version).toBe("abc123");
    expect(setChurchLogo).toHaveBeenCalledWith("church-1", "dark", expect.any(Buffer), { id: currentSession.user.id });
  });

  it.each<Role>(["SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "STAR"])("dépôt refusé au rôle %s", async (role) => {
    currentSession = sessionWithRole(role);
    expect((await POST(await upload(), params())).status).toBe(403);
    expect(setChurchLogo).not.toHaveBeenCalled();
  });

  it("dépôt refusé à l'Admin d'une autre église", async () => {
    currentSession = sessionWithRole("ADMIN", "church-2");
    expect((await POST(await upload(), params())).status).toBe(403);
  });

  it("411 sans Content-Length, 413 au-delà de la limite, sans lire le corps", async () => {
    currentSession = sessionWithRole("ADMIN");
    const missing = new Request(url(), { method: "POST" });
    const readMissing = vi.spyOn(missing, "formData");
    expect((await POST(missing, params())).status).toBe(411);
    const tooBig = new Request(url(), { method: "POST", headers: { "content-length": String(3 * 1024 * 1024) } });
    const readTooBig = vi.spyOn(tooBig, "formData");
    expect((await POST(tooBig, params())).status).toBe(413);
    expect(readMissing).not.toHaveBeenCalled();
    expect(readTooBig).not.toHaveBeenCalled();
  });

  it("400 pour une variante inconnue", async () => {
    currentSession = sessionWithRole("ADMIN");
    expect((await POST(await upload("neon"), params())).status).toBe(400);
  });

  it("retrait par l'Admin ; refusé au Secrétaire", async () => {
    currentSession = sessionWithRole("ADMIN");
    const res = await DELETE(new Request(url("?variant=light"), { method: "DELETE" }), params());
    expect(res.status).toBe(200);
    expect(removeChurchLogo).toHaveBeenCalledWith("church-1", "light", { id: currentSession.user.id });
    currentSession = sessionWithRole("SECRETARY");
    expect((await DELETE(new Request(url("?variant=light"), { method: "DELETE" }), params())).status).toBe(403);
  });

  it("lecture par un STAR de l'église : PNG en cache immuable", async () => {
    currentSession = sessionWithRole("STAR");
    getChurchLogo.mockResolvedValue(Buffer.from([137, 80, 78, 71]));
    const res = await GET(new Request(url("?variant=light&v=abc")), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("lecture refusée hors de l'église, 404 sans logo", async () => {
    currentSession = sessionWithRole("ADMIN", "church-2");
    expect((await GET(new Request(url("?variant=light")), params())).status).toBe(403);
    expect(getChurchLogo).not.toHaveBeenCalled();
    currentSession = sessionWithRole("STAR");
    expect((await GET(new Request(url("?variant=dark")), params())).status).toBe(404);
  });
});
