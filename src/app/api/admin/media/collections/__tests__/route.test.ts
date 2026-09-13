/**
 * Tests — POST /api/admin/media/collections
 *
 * Le champ `includeAllPhotos` (option « toutes les photos ») doit être accepté par le
 * schéma Zod, propagé tel quel dans la `collectionConfig` transmise à `createMediaShareToken`,
 * et journalisé via `logAudit`. Par défaut (absent), le comportement reste inchangé.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireMediaCollectionAccess = vi.fn();
const mockGetMediaShareScope = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireMediaCollectionAccess: (...args: unknown[]) => mockRequireMediaCollectionAccess(...args),
  getMediaShareScope: (...args: unknown[]) => mockGetMediaShareScope(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockCreateMediaShareToken = vi.fn();
vi.mock("@/modules/media", () => ({
  createMediaShareToken: (...args: unknown[]) => mockCreateMediaShareToken(...args),
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

const { POST } = await import("../route");

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/media/collections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/media/collections — includeAllPhotos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireMediaCollectionAccess.mockResolvedValue(createAdminSession());
    mockGetMediaShareScope.mockResolvedValue({ photos: true, visuels: true });
    prismaMock.mediaEvent.findMany.mockResolvedValue([{ id: "evt-1" }] as never);
    prismaMock.mediaProject.findMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockCreateMediaShareToken.mockResolvedValue({
      id: "token-1",
      url: "http://localhost/media/c/abc",
      label: null,
    });
  });

  it("propage includeAllPhotos: true dans la collectionConfig du token créé", async () => {
    const res = await POST(
      makeRequest({
        churchId: "church-1",
        scope: "photos",
        eventIds: ["evt-1"],
        projectIds: [],
        includeAllPhotos: true,
      })
    );

    expect(res.status).toBe(201);
    expect(mockCreateMediaShareToken).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionConfig: expect.objectContaining({ includeAllPhotos: true }),
      })
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ includeAllPhotos: true }) })
    );
  });

  it("par défaut (champ absent), includeAllPhotos n'est pas forcé à true et l'audit journalise false", async () => {
    const res = await POST(
      makeRequest({
        churchId: "church-1",
        scope: "photos",
        eventIds: ["evt-1"],
        projectIds: [],
      })
    );

    expect(res.status).toBe(201);
    expect(mockCreateMediaShareToken).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionConfig: expect.objectContaining({ includeAllPhotos: undefined }),
      })
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ includeAllPhotos: false }) })
    );
  });

  // Spec 043 : requireMediaCollectionAccess ouvre les collections à la Communication,
  // contrairement à l'ancien requireMediaManageAccess.
  it("un membre Communication (accepté par requireMediaCollectionAccess) obtient 201", async () => {
    mockRequireMediaCollectionAccess.mockResolvedValue(createAdminSession());

    const res = await POST(
      makeRequest({
        churchId: "church-1",
        scope: "photos",
        eventIds: ["evt-1"],
        projectIds: [],
      })
    );

    expect(res.status).toBe(201);
    expect(mockRequireMediaCollectionAccess).toHaveBeenCalledWith("church-1");
  });
});

// Spec 049 : le partage est limité au périmètre de la personne — une équipe Photos ne peut pas
// inclure des visuels dans son lien, et réciproquement.
describe("POST /api/admin/media/collections — périmètre de partage (spec 049)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireMediaCollectionAccess.mockResolvedValue(createAdminSession());
    prismaMock.mediaEvent.findMany.mockResolvedValue([{ id: "evt-1" }] as never);
    prismaMock.mediaProject.findMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockCreateMediaShareToken.mockResolvedValue({
      id: "token-1",
      url: "http://localhost/media/c/abc",
      label: null,
    });
  });

  it("403 si eventIds fourni sans périmètre photos", async () => {
    mockGetMediaShareScope.mockResolvedValue({ photos: false, visuels: true });

    const res = await POST(
      makeRequest({ churchId: "church-1", scope: "photos", eventIds: ["evt-1"], projectIds: [] })
    );

    expect(res.status).toBe(403);
    expect(mockCreateMediaShareToken).not.toHaveBeenCalled();
  });

  it("403 si projectIds fourni sans périmètre visuels", async () => {
    mockGetMediaShareScope.mockResolvedValue({ photos: true, visuels: false });

    const res = await POST(
      makeRequest({ churchId: "church-1", scope: "files", eventIds: [], projectIds: ["proj-1"] })
    );

    expect(res.status).toBe(403);
    expect(mockCreateMediaShareToken).not.toHaveBeenCalled();
  });

  it("201 si le périmètre couvre les sources demandées (both)", async () => {
    mockGetMediaShareScope.mockResolvedValue({ photos: true, visuels: true });

    const res = await POST(
      makeRequest({ churchId: "church-1", scope: "both", eventIds: ["evt-1"], projectIds: ["proj-1"] })
    );

    expect(res.status).toBe(201);
    expect(mockCreateMediaShareToken).toHaveBeenCalledOnce();
  });
});
