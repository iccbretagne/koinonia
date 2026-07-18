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

const { collectionPhotoWhere, resolveDownloadData, resolveGalleryData } = await import("../tokens");
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
