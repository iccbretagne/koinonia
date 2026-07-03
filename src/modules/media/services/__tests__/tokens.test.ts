/**
 * Tests — collectionPhotoWhere
 *
 * Périmètre des photos d'une collection : « validées uniquement » (défaut) ou
 * « toutes les photos » (tous statuts), piloté par `CollectionConfig.includeAllPhotos`.
 */
import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

// `tokens.ts` importe `@/lib/prisma` au niveau module (instancie un vrai client sinon).
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { collectionPhotoWhere } = await import("../tokens");
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
