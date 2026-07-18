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
import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

// `tokens.ts` importe `@/lib/prisma` au niveau module (instancie un vrai client sinon).
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../s3", () => ({
  getSignedThumbnailUrl: (key: string) => Promise.resolve(`signed://${key}`),
}));

const { collectionPhotoWhere, resolveDownloadData, resolveGalleryData, resolveCollectionData, resolveValidatorData } = await import("../tokens");
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
