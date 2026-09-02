/**
 * Partage de bibliothèque audio entre églises (spec 036) — non-réciprocité, refus typés,
 * survie au renommage d'identifiant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { listAccessibleLibraryChurchIds, grantLibraryShare } = await import("../sharing");

const churchA = "church-a";
const churchB = "church-b";

describe("listAccessibleLibraryChurchIds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sans partage, ne renvoie que l'église elle-même", async () => {
    prismaMock.audioLibraryShare.findMany.mockResolvedValue([]);

    const ids = await listAccessibleLibraryChurchIds(churchA);

    expect(ids).toEqual([churchA]);
  });

  it("avec un partage entrant, contient l'église propriétaire en plus de soi-même", async () => {
    prismaMock.audioLibraryShare.findMany.mockResolvedValue([{ ownerChurchId: churchB }] as never);

    const ids = await listAccessibleLibraryChurchIds(churchA);

    expect(ids).toEqual([churchA, churchB]);
  });

  it("un partage sortant ne donne rien en retour (non-réciprocité)", async () => {
    // churchA a ouvert sa bibliothèque à churchB : listAccessibleLibraryChurchIds(churchA)
    // ne doit chercher que les partages où churchA est INVITÉ (guestChurchId), jamais
    // propriétaire — la requête ne filtre que sur guestChurchId.
    prismaMock.audioLibraryShare.findMany.mockResolvedValue([]);

    const ids = await listAccessibleLibraryChurchIds(churchA);

    expect(prismaMock.audioLibraryShare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guestChurchId: churchA } })
    );
    expect(ids).toEqual([churchA]);
  });
});

describe("grantLibraryShare", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse un slug inconnu", async () => {
    prismaMock.church.findUnique.mockResolvedValue(null);

    await expect(grantLibraryShare(churchA, "inconnu", { confirmOnly: false })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("refuse le slug de sa propre église", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ id: churchA, name: "Église A" } as never);

    await expect(grantLibraryShare(churchA, "eglise-a", { confirmOnly: false })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("refuse un doublon", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ id: churchB, name: "Église B" } as never);
    prismaMock.audioLibraryShare.findUnique.mockResolvedValue({ id: "share-1" } as never);

    await expect(grantLibraryShare(churchA, "eglise-b", { confirmOnly: false })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("confirmOnly résout sans créer", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ id: churchB, name: "Église B" } as never);

    const result = await grantLibraryShare(churchA, "eglise-b", { confirmOnly: true });

    expect(result).toEqual({ churchId: churchB, churchName: "Église B" });
    expect(prismaMock.audioLibraryShare.create).not.toHaveBeenCalled();
  });

  it("crée le partage quand tout est valide", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ id: churchB, name: "Église B" } as never);
    prismaMock.audioLibraryShare.findUnique.mockResolvedValue(null);
    const createdAt = new Date("2026-09-02");
    prismaMock.audioLibraryShare.create.mockResolvedValue({ id: "share-1", createdAt } as never);

    const result = await grantLibraryShare(churchA, "eglise-b", { confirmOnly: false });

    expect(result).toMatchObject({ churchId: churchB, churchName: "Église B", shareId: "share-1", createdAt });
  });

  it("un renommage de slug ne rompt pas un partage existant — la relation référence l'église, pas le slug", async () => {
    // Après renommage, le slug résout toujours vers le même churchId : le partage déjà noué
    // (référencé par ownerChurchId/guestChurchId) n'est jamais requêté par slug une fois créé.
    prismaMock.church.findUnique.mockResolvedValue({ id: churchB, name: "Église B (renommée)" } as never);
    prismaMock.audioLibraryShare.findUnique.mockResolvedValue({ id: "share-1" } as never);

    await expect(grantLibraryShare(churchA, "nouveau-slug-b", { confirmOnly: false })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
