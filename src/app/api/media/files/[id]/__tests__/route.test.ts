/**
 * Tests de sécurité — BLOCKER-3 : originalKey/thumbnailKey ne doivent pas être acceptés du client.
 * Le serveur re-dérive la clé S3.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockRequireMediaUploadAccess = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  requireMediaUploadAccess: (...args: unknown[]) => mockRequireMediaUploadAccess(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/s3", () => ({
  deleteMediaFiles: vi.fn().mockResolvedValue(undefined),
}));

// Mock getFileOriginalKey pour vérifier qu'elle est appelée server-side
const mockGetFileOriginalKey = vi.fn().mockReturnValue("media-events/evt-1/files/v1/file-1.jpg");

vi.mock("@/modules/media", () => ({
  getFileOriginalKey: (...args: unknown[]) => mockGetFileOriginalKey(...args),
}));

const { PATCH } = await import("../route");

const makeParams = (id: string) => Promise.resolve({ id });

// Fichier média de base retourné par resolveMediaFileChurchId
const mockMediaFile = {
  id: "file-1",
  filename: "photo.jpg",
  mediaEventId: "evt-1",
  mediaProjectId: null,
  mediaEvent: { churchId: "church-1" },
  mediaProject: null,
};

describe("BLOCKER-3 : PATCH /api/media/files/[id] — clés S3 server-side", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireMediaUploadAccess.mockResolvedValue(createAdminSession("church-1"));
    mockGetFileOriginalKey.mockReturnValue("media-events/evt-1/files/v1/file-1.jpg");

    prismaMock.mediaFile.findUnique.mockResolvedValue(mockMediaFile as never);
    prismaMock.mediaFile.update.mockResolvedValue({ id: "file-1", status: "IN_REVIEW" } as never);
  });

  it("originalKey du client est ignoré — la clé est re-dérivée côté serveur", async () => {
    prismaMock.mediaFileVersion.count.mockResolvedValue(0);
    prismaMock.mediaFileVersion.create.mockResolvedValue({ id: "v-1" } as never);

    const request = new Request("http://localhost/api/media/files/file-1", {
      method: "PATCH",
      body: JSON.stringify({
        confirmUpload: true,
        // Ces champs ne doivent plus être acceptés :
        originalKey: "ATTACKER_CONTROLLED_KEY",
        thumbnailKey: "ATTACKER_CONTROLLED_THUMBNAIL",
      }),
    });

    const res = await PATCH(request, { params: makeParams("file-1") });
    expect(res.status).toBe(200);

    // getFileOriginalKey doit avoir été appelé (dérivation server-side)
    expect(mockGetFileOriginalKey).toHaveBeenCalledWith(
      "media-events",
      "evt-1",
      "file-1",
      1,
      "jpg"
    );

    // mediaFileVersion.create doit utiliser la clé dérivée, PAS la clé du client
    const createCall = prismaMock.mediaFileVersion.create.mock.calls[0][0];
    expect(createCall.data.originalKey).toBe("media-events/evt-1/files/v1/file-1.jpg");
    expect(createCall.data.originalKey).not.toBe("ATTACKER_CONTROLLED_KEY");
    expect(createCall.data.thumbnailKey).not.toBe("ATTACKER_CONTROLLED_THUMBNAIL");
  });

  it("la version 1 est créée avec la clé re-dérivée correcte", async () => {
    prismaMock.mediaFileVersion.count.mockResolvedValue(0);
    prismaMock.mediaFileVersion.create.mockResolvedValue({ id: "v-1" } as never);

    const request = new Request("http://localhost/api/media/files/file-1", {
      method: "PATCH",
      body: JSON.stringify({ confirmUpload: true }),
    });

    const res = await PATCH(request, { params: makeParams("file-1") });
    expect(res.status).toBe(200);

    expect(prismaMock.mediaFileVersion.create).toHaveBeenCalledOnce();
    const createCall = prismaMock.mediaFileVersion.create.mock.calls[0][0];
    expect(createCall.data.versionNumber).toBe(1);
    expect(createCall.data.originalKey).toBe("media-events/evt-1/files/v1/file-1.jpg");
    expect(createCall.data.mediaFileId).toBe("file-1");
  });

  it("si confirmUpload est absent, aucune version n'est créée", async () => {
    const request = new Request("http://localhost/api/media/files/file-1", {
      method: "PATCH",
      body: JSON.stringify({ filename: "nouveau-nom.jpg" }),
    });

    const res = await PATCH(request, { params: makeParams("file-1") });
    expect(res.status).toBe(200);

    expect(prismaMock.mediaFileVersion.create).not.toHaveBeenCalled();
    expect(mockGetFileOriginalKey).not.toHaveBeenCalled();
  });

  it("si une version existe déjà, confirmUpload ne crée pas de doublon", async () => {
    prismaMock.mediaFileVersion.count.mockResolvedValue(1); // déjà une version

    const request = new Request("http://localhost/api/media/files/file-1", {
      method: "PATCH",
      body: JSON.stringify({ confirmUpload: true }),
    });

    const res = await PATCH(request, { params: makeParams("file-1") });
    expect(res.status).toBe(200);

    expect(prismaMock.mediaFileVersion.create).not.toHaveBeenCalled();
  });
});
