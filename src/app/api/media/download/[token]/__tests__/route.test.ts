/**
 * Tests — GET /api/media/download/[token] doit servir les fichiers d'un projet
 * (et pas seulement les photos d'un événement).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockValidateMediaShareToken = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/media", () => ({
  validateMediaShareToken: (...args: unknown[]) => mockValidateMediaShareToken(...args),
  getSignedThumbnailUrl: (key: string) => Promise.resolve(`signed://${key}`),
}));

const { GET } = await import("../route");

const makeParams = (token: string) => Promise.resolve({ token });

function projectFile(id: string, status: string) {
  return {
    id,
    filename: `${id}.jpg`,
    type: "VISUAL",
    mimeType: "image/jpeg",
    size: 1000,
    status,
    versions: [{ thumbnailKey: `thumb/${id}`, originalKey: `orig/${id}` }],
  };
}

describe("GET /api/media/download/[token] — projet média", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MEDIA : ne retourne que les fichiers validés du projet", async () => {
    mockValidateMediaShareToken.mockResolvedValue({
      id: "tok-1",
      type: "MEDIA",
      label: null,
      mediaEvent: null,
      mediaProject: {
        id: "proj-1",
        name: "Affiche Culte",
        createdAt: new Date("2026-07-01"),
        files: [
          projectFile("f-approved", "APPROVED"),
          projectFile("f-final", "FINAL_APPROVED"),
          projectFile("f-review", "IN_REVIEW"),
          projectFile("f-pending", "PENDING"),
        ],
      },
    });

    const res = await GET(new Request("http://localhost"), { params: makeParams("tok-1") });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.event).toMatchObject({ id: "proj-1", name: "Affiche Culte", photoCount: 2 });
    expect(json.photos.map((p: { id: string }) => p.id)).toEqual(["f-approved", "f-final"]);
    expect(json.photos[0].thumbnailUrl).toBe("signed://thumb/f-approved");
    // aucune requête sur les photos d'événement
    expect(prismaMock.mediaPhoto.findMany).not.toHaveBeenCalled();
  });

  it("MEDIA_ALL : retourne tous les fichiers non-brouillons du projet", async () => {
    mockValidateMediaShareToken.mockResolvedValue({
      id: "tok-2",
      type: "MEDIA_ALL",
      label: null,
      mediaEvent: null,
      mediaProject: {
        id: "proj-1",
        name: "Affiche Culte",
        createdAt: new Date("2026-07-01"),
        // l'include filtre déjà les DRAFT côté validateMediaShareToken
        files: [
          projectFile("f-approved", "APPROVED"),
          projectFile("f-review", "IN_REVIEW"),
          projectFile("f-pending", "PENDING"),
        ],
      },
    });

    const res = await GET(new Request("http://localhost"), { params: makeParams("tok-2") });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.event.photoCount).toBe(3);
    expect(json.photos.map((p: { id: string }) => p.id)).toEqual([
      "f-approved",
      "f-review",
      "f-pending",
    ]);
  });
});
