import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { createSession, fakeHasChurchPermission } from "@/__mocks__/auth";

let currentSession: Session;
const requireChurchPermission = vi.fn(async (permission: string, churchId: string) => {
  if (!(await fakeHasChurchPermission(currentSession, permission, churchId))) throw new Error("FORBIDDEN");
  return currentSession;
});
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (permission: string, churchId: string) => requireChurchPermission(permission, churchId),
}));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), RATE_LIMIT_MUTATION: {} }));

const setGivingLogo = vi.fn();
const getGivingLogoStream = vi.fn();
vi.mock("@/modules/giving", () => ({
  LOGO_MAX_BYTES: 2 * 1024 * 1024,
  setGivingLogo: (...args: unknown[]) => setGivingLogo(...args),
  getGivingLogoStream: (...args: unknown[]) => getGivingLogoStream(...args),
}));

const { POST, DELETE, GET } = await import("../route");

function sessionWithRole(role: Role, churchId = "church-1"): Session {
  return createSession({
    churchRoles: [
      { id: "r", churchId, role, ministryId: null, church: { id: churchId, name: "ICC", slug: "icc" }, departments: [] },
    ],
  });
}

/** Multipart réel, avec le Content-Length qu'un navigateur envoie. */
async function upload(churchId = "church-1", size = 10) {
  const form = new FormData();
  form.append("churchId", churchId);
  form.append("file", new File([new Uint8Array(size)], "logo.png", { type: "image/png" }));
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  return new Request("http://localhost/api/giving/logo", {
    method: "POST",
    body,
    headers: { "content-type": encoded.headers.get("content-type")!, "content-length": String(body.byteLength) },
  });
}

/** Requête dont le corps ne doit jamais être lu. */
function headersOnly(length: string | null) {
  const headers = new Headers();
  if (length !== null) headers.set("content-length", length);
  const request = new Request("http://localhost/api/giving/logo", { method: "POST", headers });
  const formData = vi.spyOn(request, "formData");
  return { request, formData };
}

describe("/api/giving/logo (spec 066)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGivingLogo.mockResolvedValue("v1");
  });

  it("411 sans Content-Length et 413 au-delà de la limite, sans lire le corps", async () => {
    currentSession = sessionWithRole("ADMIN");
    const missing = headersOnly(null);
    expect((await POST(missing.request)).status).toBe(411);
    expect(missing.formData).not.toHaveBeenCalled();
    const tooBig = headersOnly(String(3 * 1024 * 1024));
    expect((await POST(tooBig.request)).status).toBe(413);
    expect(tooBig.formData).not.toHaveBeenCalled();
    expect(setGivingLogo).not.toHaveBeenCalled();
  });

  it.each(["MINISTER", "DEPARTMENT_HEAD", "STAR", "REPORTER"] as Role[])("403 pour %s", async (role) => {
    currentSession = sessionWithRole(role);
    expect((await POST(await upload())).status).toBe(403);
    expect((await DELETE(new Request("http://localhost/api/giving/logo?churchId=church-1", { method: "DELETE" }))).status).toBe(403);
    expect((await GET(new Request("http://localhost/api/giving/logo?churchId=church-1"))).status).toBe(403);
    expect(setGivingLogo).not.toHaveBeenCalled();
  });

  it("l'église du formulaire fait autorité : Admin ailleurs, refusé ici", async () => {
    currentSession = sessionWithRole("ADMIN", "church-2");
    expect((await POST(await upload("church-1"))).status).toBe(403);
    expect(requireChurchPermission).toHaveBeenCalledWith("giving:manage", "church-1");
  });

  it("201 pour un Comptable, avec la version du logo", async () => {
    currentSession = sessionWithRole("ACCOUNTANT");
    const res = await POST(await upload());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ logoVersion: "v1" });
    expect(setGivingLogo).toHaveBeenCalledWith("church-1", expect.any(Buffer), expect.objectContaining({ id: "user-1" }));
  });

  it("400 si le fichier dépasse 2 Mo", async () => {
    currentSession = sessionWithRole("ADMIN");
    expect((await POST(await upload("church-1", 2 * 1024 * 1024 + 1))).status).toBe(400);
    expect(setGivingLogo).not.toHaveBeenCalled();
  });

  it("DELETE retire le logo", async () => {
    currentSession = sessionWithRole("SECRETARY");
    setGivingLogo.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost/api/giving/logo?churchId=church-1", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(setGivingLogo).toHaveBeenCalledWith("church-1", null, expect.anything());
  });

  it("GET : image sans cache, 404 sans logo", async () => {
    currentSession = sessionWithRole("ADMIN");
    getGivingLogoStream.mockResolvedValue(Readable.from([Buffer.from("png")]));
    const res = await GET(new Request("http://localhost/api/giving/logo?churchId=church-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    getGivingLogoStream.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/giving/logo?churchId=church-1"))).status).toBe(404);
  });
});
