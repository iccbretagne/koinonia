/**
 * Tests — src/modules/media/services/shares.ts (spec 049)
 * listActiveShares/countActiveShares filtrent par expiration et périmètre ; revokeShare
 * contrôle le périmètre couvrant TOUTES les sources d'un lien avant de le supprimer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockRequireMediaManageAccess = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireMediaManageAccess: (...args: unknown[]) => mockRequireMediaManageAccess(...args),
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }));

const { listActiveShares, countActiveShares, revokeShare } = await import("../shares");

const PHOTO_SCOPE = { photos: true, visuels: false };
const VISUAL_SCOPE = { photos: false, visuels: true };
const FULL_SCOPE = { photos: true, visuels: true };

const now = new Date("2026-09-13T12:00:00Z");
const future = new Date("2026-10-01T00:00:00Z");
const past = new Date("2026-01-01T00:00:00Z");

function eventShare(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "share-evt",
    type: "GALLERY",
    label: "Mariage",
    token: "tok-evt",
    config: null,
    expiresAt: future,
    createdAt: now,
    usageCount: 3,
    mediaEventId: "evt-1",
    mediaProjectId: null,
    mediaEvent: { id: "evt-1", name: "Mariage Dupont" },
    mediaProject: null,
    ...overrides,
  };
}

function projectShare(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "share-proj",
    type: "MEDIA",
    label: null,
    token: "tok-proj",
    config: null,
    expiresAt: null,
    createdAt: now,
    usageCount: 0,
    mediaEventId: null,
    mediaProjectId: "proj-1",
    mediaEvent: null,
    mediaProject: { id: "proj-1", name: "Campagne Noël" },
    ...overrides,
  };
}

function collectionShare(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "share-coll",
    type: "COLLECTION",
    label: "Bilan trimestre",
    token: "tok-coll",
    config: { scope: "both", eventIds: ["evt-1"], projectIds: ["proj-1"] },
    expiresAt: future,
    createdAt: now,
    usageCount: 1,
    churchId: "church-1",
    mediaEventId: null,
    mediaProjectId: null,
    mediaEvent: null,
    mediaProject: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

describe("listActiveShares", () => {
  it("exclut les liens expirés", async () => {
    prismaMock.mediaShareToken.findMany.mockResolvedValue([eventShare({ expiresAt: past })] as never);

    const result = await listActiveShares("church-1", FULL_SCOPE);
    expect(result).toEqual([]);
  });

  it("filtre par église (délégué à la requête Prisma)", async () => {
    prismaMock.mediaShareToken.findMany.mockResolvedValue([eventShare()] as never);

    await listActiveShares("church-1", FULL_SCOPE);
    expect(prismaMock.mediaShareToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-1" } })
    );
  });

  it("masque une collection mixte à une équipe qui n'a que le périmètre photos", async () => {
    prismaMock.mediaShareToken.findMany.mockResolvedValue([collectionShare()] as never);

    const result = await listActiveShares("church-1", PHOTO_SCOPE);
    expect(result).toEqual([]);
  });

  it("montre une collection mixte à qui a le périmètre complet", async () => {
    prismaMock.mediaShareToken.findMany.mockResolvedValue([collectionShare()] as never);
    prismaMock.mediaEvent.findMany.mockResolvedValue([{ id: "evt-1", name: "Mariage Dupont" }] as never);
    prismaMock.mediaProject.findMany.mockResolvedValue([{ id: "proj-1", name: "Campagne Noël" }] as never);

    const result = await listActiveShares("church-1", FULL_SCOPE);
    expect(result).toHaveLength(1);
    expect(result[0].sources).toEqual([
      { type: "event", id: "evt-1", name: "Mariage Dupont" },
      { type: "project", id: "proj-1", name: "Campagne Noël" },
    ]);
  });

  it("un lien événement n'est visible qu'au périmètre photos", async () => {
    prismaMock.mediaShareToken.findMany.mockResolvedValue([eventShare()] as never);

    await expect(listActiveShares("church-1", VISUAL_SCOPE)).resolves.toEqual([]);
    await expect(listActiveShares("church-1", PHOTO_SCOPE)).resolves.toHaveLength(1);
  });
});

describe("countActiveShares", () => {
  it("compte uniquement les liens actifs et dans le périmètre", async () => {
    prismaMock.mediaShareToken.findMany.mockResolvedValue([
      eventShare(),
      projectShare(),
      eventShare({ id: "share-evt-2", expiresAt: past }),
    ] as never);

    await expect(countActiveShares("church-1", FULL_SCOPE)).resolves.toBe(2);
    await expect(countActiveShares("church-1", PHOTO_SCOPE)).resolves.toBe(1);
  });
});

describe("revokeShare", () => {
  it("refuse hors périmètre (event, refusé sur requireMediaManageAccess PHOTOS)", async () => {
    prismaMock.mediaShareToken.findUnique.mockResolvedValue({
      ...eventShare(),
      mediaEvent: { id: "evt-1", name: "Mariage Dupont", churchId: "church-1" },
    } as never);
    mockRequireMediaManageAccess.mockRejectedValue(new Error("FORBIDDEN"));

    await expect(revokeShare("share-evt", createAdminSession("church-1"))).rejects.toThrow("FORBIDDEN");
    expect(prismaMock.mediaShareToken.delete).not.toHaveBeenCalled();
  });

  it("exige le périmètre des deux activités pour un lien sensible (collection mixte)", async () => {
    prismaMock.mediaShareToken.findUnique.mockResolvedValue(collectionShare() as never);
    mockRequireMediaManageAccess.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.mediaShareToken.delete.mockResolvedValue({} as never);

    await revokeShare("share-coll", createAdminSession("church-1"));

    expect(mockRequireMediaManageAccess).toHaveBeenCalledWith("church-1", "PHOTOS");
    expect(mockRequireMediaManageAccess).toHaveBeenCalledWith("church-1", "VISUELS");
    expect(prismaMock.mediaShareToken.delete).toHaveBeenCalledWith({ where: { id: "share-coll" } });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "MediaShareToken", entityId: "share-coll" })
    );
  });

  it("404 si le lien n'existe pas", async () => {
    prismaMock.mediaShareToken.findUnique.mockResolvedValue(null);

    await expect(revokeShare("missing", createAdminSession("church-1"))).rejects.toThrow();
    expect(mockRequireMediaManageAccess).not.toHaveBeenCalled();
  });
});
