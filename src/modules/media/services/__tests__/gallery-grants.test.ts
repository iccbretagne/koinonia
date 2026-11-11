/**
 * Tests — src/modules/media/services/gallery-grants.ts (spec 080).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const createNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));

const { upsertGalleryGrant, updateGalleryGrant, deleteGalleryGrant, listGalleryGrants } = await import("../gallery-grants");

const future = new Date(Date.now() + 10 * 86_400_000);
const past = new Date(Date.now() - 86_400_000);
const row = (over: Record<string, unknown> = {}) => ({
  id: "g-1",
  userId: "u-1",
  expiresAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  user: { name: "Jean", displayName: null, email: "jean@example.test" },
  grantedBy: { name: "Admin", displayName: "L'admin" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "r" });
  prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue(null);
  prismaMock.mediaGalleryGrant.upsert.mockResolvedValue(row());
});

describe("upsertGalleryGrant", () => {
  it("crée l'accès, journalise et notifie la personne", async () => {
    const view = await upsertGalleryGrant("church-1", "admin-1", { userId: "u-1", expiresAt: future });
    expect(view).toMatchObject({ id: "g-1", name: "Jean", grantedBy: "L'admin", expired: false });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "MediaGalleryGrant", churchId: "church-1", userId: "admin-1" }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-1", domain: "media", type: "MEDIA_GALLERY_GRANTED", link: "/media/galerie" }));
  });

  it("prolonger un accès actif : mise à jour journalisée, pas de nouvelle notification", async () => {
    prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue({ id: "g-1", expiresAt: future });
    await upsertGalleryGrant("church-1", "admin-1", { userId: "u-1", expiresAt: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE" }));
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("renouveler un accès expiré : la personne est de nouveau prévenue", async () => {
    prismaMock.mediaGalleryGrant.findUnique.mockResolvedValue({ id: "g-1", expiresAt: past });
    await upsertGalleryGrant("church-1", "admin-1", { userId: "u-1", expiresAt: null });
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it("date de fin passée : 400, rien n'est écrit", async () => {
    await expect(upsertGalleryGrant("church-1", "a", { userId: "u-1", expiresAt: past })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.mediaGalleryGrant.upsert).not.toHaveBeenCalled();
  });

  it("compte sans rôle dans l'église : 400", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    await expect(upsertGalleryGrant("church-1", "a", { userId: "u-x", expiresAt: null })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.mediaGalleryGrant.upsert).not.toHaveBeenCalled();
  });
});

describe("modifier, retirer, lister", () => {
  it("modifier la date : 404 pour un accès d'une autre église", async () => {
    prismaMock.mediaGalleryGrant.findFirst.mockResolvedValue(null);
    await expect(updateGalleryGrant("church-1", "a", "g-9", null)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.mediaGalleryGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "g-9", churchId: "church-1" } }));
  });

  it("modifier la date : journalisé avec l'ancienne valeur", async () => {
    prismaMock.mediaGalleryGrant.findFirst.mockResolvedValue({ id: "g-1", userId: "u-1", expiresAt: null });
    prismaMock.mediaGalleryGrant.update.mockResolvedValue(row({ expiresAt: future }));
    await updateGalleryGrant("church-1", "a", "g-1", future);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", details: expect.objectContaining({ previousExpiresAt: null }) }));
  });

  it("retirer : suppression journalisée", async () => {
    prismaMock.mediaGalleryGrant.findFirst.mockResolvedValue({ id: "g-1", userId: "u-1", expiresAt: null });
    await deleteGalleryGrant("church-1", "a", "g-1");
    expect(prismaMock.mediaGalleryGrant.delete).toHaveBeenCalledWith({ where: { id: "g-1" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityId: "g-1" }));
  });

  it("lister : un accès dont la date est passée est marqué expiré", async () => {
    prismaMock.mediaGalleryGrant.findMany.mockResolvedValue([row({ expiresAt: past }), row({ id: "g-2", expiresAt: null })]);
    const list = await listGalleryGrants("church-1");
    expect(list.map((g) => g.expired)).toEqual([true, false]);
  });
});
