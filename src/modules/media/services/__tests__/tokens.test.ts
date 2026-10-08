/**
 * Tests — collectionPhotoWhere, resolveDownloadData, resolveGalleryData
 *
 * Périmètre des photos d'une collection : « validées uniquement » (défaut) ou
 * « toutes les photos » (tous statuts), piloté par `CollectionConfig.includeAllPhotos`.
 *
 * resolveDownloadData/resolveGalleryData : un token MEDIA/MEDIA_ALL/GALLERY peut être
 * lié à un événement (photos) ou à un projet média (fichiers) — les deux branches
 * doivent être servies, sinon le lien de partage d'un projet affiche 0 média.
 * Ces fonctions sont partagées entre les routes API et les pages SSR publiques
 * pour éviter toute divergence entre les deux.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

// `tokens.ts` importe `@/lib/prisma` au niveau module (instancie un vrai client sinon).
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/storage", () => ({
  getSignedThumbnailUrl: (key: string) => Promise.resolve(`signed://${key}`),
  generateToken: () => "test-token",
  isTokenExpired: (expiresAt: Date | null) => !!expiresAt && new Date() > expiresAt,
}));

const { collectionPhotoWhere, createMediaShareToken, resolveDownloadData, resolveGalleryData, resolveCollectionData, resolveValidatorData } = await import("../tokens");
type CollectionConfig = Parameters<typeof collectionPhotoWhere>[0];

const baseConfig: CollectionConfig = {
  scope: "photos",
  eventIds: ["evt-1"],
  projectIds: [],
};

describe("collectionPhotoWhere", () => {
  it("retourne { status: APPROVED } quand includeAllPhotos est absent", () => {
    expect(collectionPhotoWhere(baseConfig)).toEqual({ status: "APPROVED" });
  });

  it("retourne { status: APPROVED } quand includeAllPhotos vaut false", () => {
    expect(collectionPhotoWhere({ ...baseConfig, includeAllPhotos: false })).toEqual({ status: "APPROVED" });
  });

  it("retourne {} (aucun filtre) quand includeAllPhotos vaut true", () => {
    expect(collectionPhotoWhere({ ...baseConfig, includeAllPhotos: true })).toEqual({});
  });
});

function projectFile(id: string, status: string) {
  return {
    id,
    filename: `${id}.jpg`,
    size: 1000,
    status,
    versions: [{ thumbnailKey: `thumb/${id}`, originalKey: `orig/${id}` }],
  };
}

function projectToken(type: "MEDIA" | "MEDIA_ALL" | "GALLERY", config: unknown = null) {
  return {
    id: "tok-1",
    type,
    label: null,
    config,
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
  } as never;
}

describe("resolveDownloadData — projet média (MEDIA/MEDIA_ALL)", () => {
  it("MEDIA : ne retourne que les fichiers validés du projet", async () => {
    const data = await resolveDownloadData(projectToken("MEDIA"));

    expect(data.event).toMatchObject({ id: "proj-1", name: "Affiche Culte", photoCount: 2 });
    expect(data.photos.map((p) => p.id)).toEqual(["f-approved", "f-final"]);
    expect(data.photos[0].thumbnailUrl).toBe("signed://thumb/f-approved");
    expect(prismaMock.mediaPhoto.findMany).not.toHaveBeenCalled();
  });

  it("MEDIA_ALL : retourne tous les fichiers du projet", async () => {
    const data = await resolveDownloadData(projectToken("MEDIA_ALL"));

    expect(data.event?.photoCount).toBe(4);
    expect(data.photos.map((p) => p.id)).toEqual(["f-approved", "f-final", "f-review", "f-pending"]);
  });

  it("aucun événement ni projet : retourne une liste vide", async () => {
    const data = await resolveDownloadData({
      id: "tok-2",
      type: "MEDIA",
      label: null,
      mediaEvent: null,
      mediaProject: null,
    } as never);

    expect(data.event).toBeNull();
    expect(data.photos).toEqual([]);
  });
});

describe("resolveGalleryData — projet média (GALLERY)", () => {
  it("onlyApproved : ne retourne que les fichiers validés du projet", async () => {
    const data = await resolveGalleryData(projectToken("GALLERY", { onlyApproved: true }));

    expect(data.event).toMatchObject({ id: "proj-1", name: "Affiche Culte", photoCount: 2 });
    expect(data.photos.map((p) => p.id)).toEqual(["f-approved", "f-final"]);
  });

  it("sans onlyApproved : retourne tous les fichiers du projet", async () => {
    const data = await resolveGalleryData(projectToken("GALLERY", { onlyApproved: false }));

    expect(data.event?.photoCount).toBe(4);
    expect(data.photos.map((p) => p.id)).toEqual(["f-approved", "f-final", "f-review", "f-pending"]);
  });
});

describe("resolveDownloadData / resolveGalleryData — événement (photos)", () => {
  function eventToken(type: "MEDIA" | "MEDIA_ALL" | "GALLERY", config: unknown = null) {
    return {
      id: "tok-3",
      type,
      label: "Culte",
      config,
      mediaEvent: { id: "evt-1", name: "Culte", date: new Date("2026-07-05") },
      mediaProject: null,
    } as never;
  }

  beforeEach(() => {
    prismaMock.mediaPhoto.findMany.mockReset();
    prismaMock.mediaPhoto.findMany.mockResolvedValue([
      { id: "p1", filename: "p1.jpg", size: 10, width: 800, height: 600, status: "APPROVED", thumbnailKey: "thumb/p1" },
    ] as never);
  });

  afterEach(() => prismaMock.mediaPhoto.findMany.mockReset());

  it("MEDIA : ne demande que les photos approuvées de l'événement", async () => {
    const data = await resolveDownloadData(eventToken("MEDIA"));

    expect(prismaMock.mediaPhoto.findMany).toHaveBeenCalledWith({
      where: { mediaEventId: "evt-1", status: "APPROVED" },
      orderBy: { uploadedAt: "asc" },
    });
    expect(data.token).toEqual({ id: "tok-3", type: "MEDIA", label: "Culte" });
    expect(data.event).toMatchObject({ id: "evt-1", name: "Culte", photoCount: 1 });
    expect(data.photos[0]).toMatchObject({ id: "p1", width: 800, thumbnailUrl: "signed://thumb/p1" });
  });

  it("MEDIA_ALL et GALLERY sans onlyApproved : toutes les photos de l'événement", async () => {
    await resolveDownloadData(eventToken("MEDIA_ALL"));
    const gallery = await resolveGalleryData(eventToken("GALLERY", { onlyApproved: false }));

    for (const call of prismaMock.mediaPhoto.findMany.mock.calls) {
      expect(call[0]).toMatchObject({ where: { mediaEventId: "evt-1" } });
      expect(call[0]?.where).not.toHaveProperty("status");
    }
    expect(gallery.token).toEqual({ id: "tok-3", type: "GALLERY", label: "Culte", config: { onlyApproved: false } });
  });
});

describe("resolveCollectionData — respecte includeAllPhotos (COLLECTION)", () => {
  it("includeAllPhotos: true — inclut les photos non approuvées de l'événement", async () => {
    prismaMock.mediaEvent.findMany.mockResolvedValue([
      {
        id: "evt-1",
        name: "Culte",
        date: new Date("2026-07-01"),
        photos: [
          { id: "p-approved", filename: "a.jpg", size: 100, width: null, height: null, thumbnailKey: "t/p-approved" },
          { id: "p-pending", filename: "b.jpg", size: 100, width: null, height: null, thumbnailKey: "t/p-pending" },
        ],
      },
    ] as never);

    const data = await resolveCollectionData({
      id: "tok-1",
      type: "COLLECTION",
      label: null,
      config: { scope: "photos", eventIds: ["evt-1"], projectIds: [], includeAllPhotos: true },
    } as never);

    expect(data?.photoGroups[0].photos.map((p) => p.id)).toEqual(["p-approved", "p-pending"]);
    expect(prismaMock.mediaEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ photos: expect.objectContaining({ where: {} }) }),
      })
    );
  });

  it("includeAllPhotos absent — filtre sur APPROVED uniquement", async () => {
    prismaMock.mediaEvent.findMany.mockResolvedValue([]);

    await resolveCollectionData({
      id: "tok-2",
      type: "COLLECTION",
      label: null,
      config: { scope: "photos", eventIds: ["evt-1"], projectIds: [] },
    } as never);

    expect(prismaMock.mediaEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ photos: expect.objectContaining({ where: { status: "APPROVED" } }) }),
      })
    );
  });

  it("config manquante : retourne null", async () => {
    const data = await resolveCollectionData({ id: "tok-3", type: "COLLECTION", label: null, config: null } as never);
    expect(data).toBeNull();
  });
});

describe("resolveValidatorData — événement vs projet (VALIDATOR/PREVALIDATOR)", () => {
  it("token lié à un projet : retourne les fichiers du projet (pas de requête mediaPhoto)", async () => {
    const data = await resolveValidatorData({
      id: "tok-1",
      type: "VALIDATOR",
      label: null,
      mediaEvent: null,
      mediaProject: {
        id: "proj-1",
        name: "Affiche Culte",
        shareTokens: [],
        files: [
          { id: "f-1", filename: "a.jpg", type: "VISUAL", mimeType: "image/jpeg", size: 100, status: "PENDING", versions: [] },
        ],
      },
    } as never);

    expect(data?.type).toBe("project");
    expect(prismaMock.mediaPhoto.findMany).not.toHaveBeenCalled();
  });

  it("token lié à un événement PREVALIDATOR : ne retourne que les photos PENDING", async () => {
    prismaMock.mediaPhoto.findMany.mockResolvedValue([]);

    const data = await resolveValidatorData({
      id: "tok-2",
      type: "PREVALIDATOR",
      label: null,
      mediaEvent: {
        id: "evt-1",
        name: "Culte",
        date: new Date("2026-07-01"),
        status: "ACTIVE",
        shareTokens: [],
        photos: [],
      },
      mediaProject: null,
    } as never);

    expect(data?.type).toBe("event");
    expect(prismaMock.mediaPhoto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ["PENDING"] } }) })
    );
  });

  it("ni événement ni projet : retourne null", async () => {
    const data = await resolveValidatorData({
      id: "tok-3",
      type: "VALIDATOR",
      label: null,
      mediaEvent: null,
      mediaProject: null,
    } as never);
    expect(data).toBeNull();
  });
});

describe("createMediaShareToken — cible et configuration", () => {
  const created = () => prismaMock.mediaShareToken.create.mock.calls.at(-1)![0].data;

  beforeEach(() => {
    prismaMock.mediaShareToken.create.mockImplementation(((args: { data: object }) =>
      Promise.resolve({ id: "share-1", ...args.data })) as never);
  });

  it("rattache un partage galerie à son événement avec onlyApproved par défaut à false", async () => {
    const res = await createMediaShareToken({ churchId: "c1", type: "GALLERY", mediaEventId: "evt-1", baseUrl: "https://k" });
    expect(created()).toMatchObject({ mediaEventId: "evt-1", config: { onlyApproved: false } });
    expect(created()).not.toHaveProperty("mediaProjectId");
    expect(res.url).toBe("https://k/media/g/test-token");
  });

  it("rattache un partage à son projet média", async () => {
    await createMediaShareToken({ churchId: "c1", type: "MEDIA", mediaProjectId: "prj-1", baseUrl: "https://k" });
    expect(created()).toMatchObject({ mediaProjectId: "prj-1" });
    expect(created()).not.toHaveProperty("config");
  });

  it("stocke la configuration d'une collection sans cible", async () => {
    await createMediaShareToken({ churchId: "c1", type: "COLLECTION", collectionConfig: baseConfig, baseUrl: "https://k" });
    expect(created()).toMatchObject({ config: baseConfig });
    expect(created()).not.toHaveProperty("mediaEventId");
    expect(created()).not.toHaveProperty("mediaProjectId");
  });
});
