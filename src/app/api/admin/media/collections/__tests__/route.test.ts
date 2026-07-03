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

const mockRequireMediaManageAccess = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireMediaManageAccess: (...args: unknown[]) => mockRequireMediaManageAccess(...args),
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
    mockRequireMediaManageAccess.mockResolvedValue(createAdminSession());
    prismaMock.mediaEvent.findMany.mockResolvedValue([{ id: "evt-1" }] as never);
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
});
