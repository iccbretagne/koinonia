import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession, createSecretarySession, createSuperAdminSession } from "@/__mocks__/auth";
import { ApiError } from "@/lib/api-utils";

const requireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
  requireSuperAdmin: async () => {
    const session = await requireAuth();
    if (!session.user.isSuperAdmin) throw new Error("FORBIDDEN");
    return session;
  },
}));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), RATE_LIMIT_MUTATION: {} }));

const core = {
  getAppIconState: vi.fn(),
  setAppIcon: vi.fn(),
  setAppIconBadge: vi.fn(),
  removeAppIcon: vi.fn(),
  previewAppIcon: vi.fn(),
};
vi.mock("@/modules/core", () => core);

const { GET, PUT, DELETE } = await import("../route");
const { POST: PREVIEW } = await import("../preview/route");

const STATE = { custom: true, version: "abc" };

function multipart(fields: Record<string, string | Blob>, url = "http://localhost/api/admin/app-icon") {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const draft = new Request(url, { method: "PUT", body: form });
  return draft.arrayBuffer().then(
    (body) =>
      new Request(url, {
        method: draft.method,
        body,
        headers: { "content-type": draft.headers.get("content-type")!, "content-length": String(body.byteLength) },
      })
  );
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], "icon.png", { type: "image/png" });

describe("/api/admin/app-icon (spec 069)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue(createSuperAdminSession());
    core.getAppIconState.mockResolvedValue(STATE);
    core.setAppIcon.mockResolvedValue(STATE);
    core.setAppIconBadge.mockResolvedValue(STATE);
    core.removeAppIcon.mockResolvedValue({ custom: false });
    core.previewAppIcon.mockResolvedValue({ background: "#000000", variants: {}, badge: null });
  });

  it.each([
    ["Admin d'église", createAdminSession()],
    ["Secrétaire", createSecretarySession()],
  ])("403 pour un %s, sur chaque méthode", async (_label, session) => {
    requireAuth.mockResolvedValue(session);
    expect((await GET()).status).toBe(403);
    expect((await PUT(await multipart({ icon: png(), background: "#000000" }))).status).toBe(403);
    expect(
      (await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ target: "icon" }) })))
        .status
    ).toBe(403);
    expect((await PREVIEW(await multipart({ icon: png() }))).status).toBe(403);
    expect(core.setAppIcon).not.toHaveBeenCalled();
    expect(core.removeAppIcon).not.toHaveBeenCalled();
  });

  it("401 sans session", async () => {
    requireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await GET()).status).toBe(401);
  });

  it("GET : état pour un Super Admin", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(STATE);
  });

  it("PUT : icône et couleur transmises au service", async () => {
    const res = await PUT(await multipart({ icon: png(), background: "#3C148C" }));
    expect(res.status).toBe(200);
    expect(core.setAppIcon).toHaveBeenCalledWith(expect.any(Buffer), "#3c148c", { id: "user-1" });
    expect(core.setAppIconBadge).not.toHaveBeenCalled();
  });

  it("PUT : icône et silhouette ensemble", async () => {
    await PUT(await multipart({ icon: png(), background: "#000000", badge: png() }));
    expect(core.setAppIcon).toHaveBeenCalled();
    expect(core.setAppIconBadge).toHaveBeenCalled();
  });

  it("PUT : 400 sur une couleur invalide, sans écriture", async () => {
    const res = await PUT(await multipart({ icon: png(), background: "violet" }));
    expect(res.status).toBe(400);
    expect(core.setAppIcon).not.toHaveBeenCalled();
  });

  it("PUT : 400 sans fichier, ou icône sans couleur", async () => {
    expect((await PUT(await multipart({ background: "#000000" }))).status).toBe(400);
    expect((await PUT(await multipart({ icon: png() }))).status).toBe(400);
    expect(core.setAppIcon).not.toHaveBeenCalled();
  });

  it("PUT : 400 si le service refuse l'image", async () => {
    core.setAppIcon.mockRejectedValue(new ApiError(400, "L'image doit être carrée"));
    const res = await PUT(await multipart({ icon: png(), background: "#000000" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/carrée/);
  });

  it("PUT : 411 sans longueur, 413 au-delà de la limite", async () => {
    const noLength = new Request("http://localhost", { method: "PUT", body: "x" });
    noLength.headers.delete("content-length");
    expect((await PUT(noLength)).status).toBe(411);
    const huge = new Request("http://localhost", { method: "PUT", body: "x", headers: { "content-length": String(12 * 1024 * 1024) } });
    expect((await PUT(huge)).status).toBe(413);
  });

  it("DELETE : retrait de l'icône ou de la silhouette", async () => {
    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ target: "badge" }) })
    );
    expect(res.status).toBe(200);
    expect(core.removeAppIcon).toHaveBeenCalledWith("badge", { id: "user-1" });
  });

  it("DELETE : 400 sur une cible inconnue", async () => {
    const res = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ target: "x" }) }));
    expect(res.status).toBe(400);
  });

  it("POST preview : aperçu sans écriture", async () => {
    const res = await PREVIEW(await multipart({ icon: png() }));
    expect(res.status).toBe(200);
    expect(core.previewAppIcon).toHaveBeenCalledWith({ icon: expect.any(Buffer), background: undefined, badge: null });
    expect(core.setAppIcon).not.toHaveBeenCalled();
  });
});
