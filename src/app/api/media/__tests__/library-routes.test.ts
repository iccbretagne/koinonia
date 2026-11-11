/**
 * Tests — routes de la galerie médias (spec 080) : accès, validation, ZIP, téléchargement,
 * accès nominatifs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/api-utils";

const galleryAccess = vi.fn();
const grantAccess = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => ({ user: { id: "u-1" } })),
  getCurrentChurchId: vi.fn(async () => "church-1"),
  requireMediaGalleryAccess: (...a: unknown[]) => galleryAccess(...a),
  requireMediaGalleryGrantAccess: (...a: unknown[]) => grantAccess(...a),
}));

const media = {
  listLibraryItems: vi.fn(async () => ({ items: [], nextCursor: null, total: 0 })),
  listLibrarySources: vi.fn(async () => []),
  resolveLibraryOriginals: vi.fn(async () => [] as { originalKey: string; filename: string; folder: string }[]),
  getSignedDownloadUrl: vi.fn(async () => "https://stockage.example.test/signe"),
  listGalleryGrants: vi.fn(async () => []),
  upsertGalleryGrant: vi.fn(async () => ({ id: "g-1" })),
  updateGalleryGrant: vi.fn(async () => ({ id: "g-1" })),
  deleteGalleryGrant: vi.fn(async () => undefined),
  searchChurchUsersForGrant: vi.fn(async () => []),
};
vi.mock("@/modules/media", () => media);
vi.mock("../_zip", () => ({ streamZip: () => new ReadableStream({ start: (c) => { c.enqueue(new TextEncoder().encode("ZIP")); c.close(); } }) }));

const library = await import("../library/route");
const download = await import("../library/[kind]/[id]/download/route");
const zip = await import("../library/zip/route");
const grants = await import("../library/grants/route");
const grant = await import("../library/grants/[id]/route");

const BASE = "http://localhost/api/media/library";
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const forbidden = () => { throw new Error("FORBIDDEN"); };

beforeEach(() => {
  vi.clearAllMocks();
  galleryAccess.mockResolvedValue({ session: {}, grantOnly: false });
  grantAccess.mockResolvedValue({ user: { id: "admin-1" } });
});

describe("GET /api/media/library", () => {
  it("sans droit : 403, rien n'est lu", async () => {
    galleryAccess.mockImplementation(forbidden);
    expect((await library.GET(new Request(BASE))).status).toBe(403);
    expect(media.listLibraryItems).not.toHaveBeenCalled();
  });

  it("filtres validés par Zod (400) puis traduits pour le service", async () => {
    expect((await library.GET(new Request(`${BASE}?type=video`))).status).toBe(400);
    expect((await library.GET(new Request(`${BASE}?source=autre:1`))).status).toBe(400);
    expect((await library.GET(new Request(`${BASE}?from=03/2026`))).status).toBe(400);
    const res = await library.GET(new Request(`${BASE}?type=photos&from=2026-03-01&to=2026-03-31&source=event:e1&order=asc&cursor=abc&limit=20`));
    expect(res.status).toBe(200);
    expect(media.listLibraryItems).toHaveBeenCalledWith(
      "church-1",
      {
        type: "photos",
        from: new Date("2026-03-01T00:00:00.000Z"),
        to: new Date("2026-03-31T23:59:59.999Z"),
        sourceType: "event",
        sourceId: "e1",
        q: undefined,
        order: "asc",
      },
      "abc",
      20
    );
  });

  it("un accès nominatif lit la galerie comme les équipes", async () => {
    galleryAccess.mockResolvedValue({ session: {}, grantOnly: true });
    expect((await library.GET(new Request(BASE))).status).toBe(200);
  });
});

describe("téléchargement d'un original", () => {
  const p = (kind: string) => ({ params: Promise.resolve({ kind, id: "x" }) });

  it("redirige vers l'adresse signée d'un média validé de l'église", async () => {
    media.resolveLibraryOriginals.mockResolvedValueOnce([{ originalKey: "o/x", filename: "x.jpg", folder: "f" }]);
    const res = await download.GET(new Request(`${BASE}/photo/x/download`), p("photo"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://stockage.example.test/signe");
    expect(media.resolveLibraryOriginals).toHaveBeenCalledWith("church-1", ["x"], []);
  });

  it("média absent, non validé ou d'une autre église : 404 ; type inconnu : 404", async () => {
    expect((await download.GET(new Request(BASE), p("file"))).status).toBe(404);
    expect((await download.GET(new Request(BASE), p("video"))).status).toBe(404);
  });

  it("sans droit : 403", async () => {
    galleryAccess.mockImplementation(forbidden);
    expect((await download.GET(new Request(BASE), p("photo"))).status).toBe(403);
  });
});

describe("POST /api/media/library/zip", () => {
  it("plus de 200 médias : 400 ; sélection vide : 400", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `p${i}`);
    expect((await zip.POST(new Request(`${BASE}/zip`, json("POST", { photoIds: ids })))).status).toBe(400);
    expect((await zip.POST(new Request(`${BASE}/zip`, json("POST", {})))).status).toBe(400);
    expect(media.resolveLibraryOriginals).not.toHaveBeenCalled();
  });

  it("aucun média valide (autre église, non validé) : 404", async () => {
    expect((await zip.POST(new Request(`${BASE}/zip`, json("POST", { photoIds: ["autre"] })))).status).toBe(404);
  });

  it("archive en flux des médias revérifiés", async () => {
    media.resolveLibraryOriginals.mockResolvedValueOnce([{ originalKey: "o/a", filename: "a.jpg", folder: "f" }]);
    const res = await zip.POST(new Request(`${BASE}/zip`, json("POST", { photoIds: ["a"], fileIds: ["b"] })));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(media.resolveLibraryOriginals).toHaveBeenCalledWith("church-1", ["a"], ["b"]);
  });
});

describe("accès nominatifs", () => {
  it("réservés à l'Admin et au Ministre média : 403 sinon", async () => {
    grantAccess.mockImplementation(forbidden);
    expect((await grants.GET()).status).toBe(403);
    expect((await grants.POST(new Request(`${BASE}/grants`, json("POST", { userId: "u-2" })))).status).toBe(403);
    expect(media.upsertGalleryGrant).not.toHaveBeenCalled();
  });

  it("donner un accès : date de fin facultative, transmise au service", async () => {
    const res = await grants.POST(new Request(`${BASE}/grants`, json("POST", { userId: "u-2", expiresAt: "2026-12-31T22:59:59.000Z" })));
    expect(res.status).toBe(201);
    expect(media.upsertGalleryGrant).toHaveBeenCalledWith("church-1", "admin-1", { userId: "u-2", expiresAt: new Date("2026-12-31T22:59:59.000Z") });
    await grants.POST(new Request(`${BASE}/grants`, json("POST", { userId: "u-3" })));
    expect(media.upsertGalleryGrant).toHaveBeenLastCalledWith("church-1", "admin-1", { userId: "u-3", expiresAt: null });
  });

  it("corps invalide : 400", async () => {
    expect((await grants.POST(new Request(`${BASE}/grants`, json("POST", { userId: "" })))).status).toBe(400);
    expect((await grants.POST(new Request(`${BASE}/grants`, json("POST", { userId: "u", expiresAt: "demain" })))).status).toBe(400);
  });

  it("erreur métier du service rendue telle quelle (date passée, autre église)", async () => {
    media.updateGalleryGrant.mockRejectedValueOnce(new ApiError(404, "Accès introuvable"));
    const res = await grant.PATCH(new Request(`${BASE}/grants/g-9`, json("PATCH", { expiresAt: null })), { params: Promise.resolve({ id: "g-9" }) });
    expect(res.status).toBe(404);
  });

  it("retirer un accès : 204", async () => {
    const res = await grant.DELETE(new Request(`${BASE}/grants/g-1`, { method: "DELETE" }), { params: Promise.resolve({ id: "g-1" }) });
    expect(res.status).toBe(204);
    expect(media.deleteGalleryGrant).toHaveBeenCalledWith("church-1", "admin-1", "g-1");
  });
});
