/**
 * Tests — spec 029 (M-02) : la borne de taille est constatee sur l'objet reellement depose.
 *
 * La borne validee a la signature ne porte que sur la taille ANNONCEE par le client ; une URL
 * presignee PutObject n'impose aucune limite a S3. La confirmation de depot est donc le point
 * ou le serveur constate la taille reelle avant d'accepter le fichier dans le circuit de revue.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const MAX_FILE_SIZE = 500 * 1024 * 1024;

const mockGetMediaObjectSize = vi.fn();
const mockDeleteMediaFiles = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth", () => ({
  requireMediaAccess: vi.fn(),
  requireMediaUploadAccess: vi.fn(async () => createAdminSession()),
  requireMediaManageAccess: vi.fn(),
  requireMediaReviewAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/s3", () => ({
  deleteMediaFiles: (...args: unknown[]) => mockDeleteMediaFiles(...args),
  getMediaObjectSize: (...args: unknown[]) => mockGetMediaObjectSize(...args),
}));

vi.mock("@/modules/media", () => ({
  getFileOriginalKey: vi.fn().mockReturnValue("media-projects/mp-1/file-1/v1/visuel.png"),
  MAX_FILE_SIZE,
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

const { PATCH } = await import("../route");

const params = Promise.resolve({ id: "file-1" });

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/media/files/file-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.mediaFile.findUnique.mockResolvedValue({
    id: "file-1",
    filename: "visuel.png",
    mediaEventId: null,
    mediaProjectId: "mp-1",
    mediaEvent: null,
    mediaProject: { churchId: "church-1", createdById: "user-1" },
  });
  prismaMock.mediaFile.update.mockResolvedValue({ id: "file-1" });
  prismaMock.mediaFileVersion.count.mockResolvedValue(0);
  prismaMock.mediaFileVersion.create.mockResolvedValue({ id: "v-1" });
});

describe("PATCH /api/media/files/[id] — confirmUpload, borne de taille reelle", () => {
  it("refuse (400) un objet plus gros que la limite, le supprime et ne cree aucune version", async () => {
    mockGetMediaObjectSize.mockResolvedValue(MAX_FILE_SIZE + 1);

    const res = await PATCH(patchRequest({ confirmUpload: true }), { params });

    expect(res.status).toBe(400);
    expect(mockDeleteMediaFiles).toHaveBeenCalledWith(["media-projects/mp-1/file-1/v1/visuel.png"]);
    expect(prismaMock.mediaFileVersion.create).not.toHaveBeenCalled();
    // Aucun passage en IN_REVIEW : le fichier reste en DRAFT
    expect(prismaMock.mediaFile.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IN_REVIEW" }) })
    );
  });

  it("refuse (404) une confirmation portant sur un objet absent, sans rien creer ni supprimer", async () => {
    mockGetMediaObjectSize.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ confirmUpload: true }), { params });

    expect(res.status).toBe(404);
    expect(mockDeleteMediaFiles).not.toHaveBeenCalled();
    expect(prismaMock.mediaFileVersion.create).not.toHaveBeenCalled();
  });

  it("accepte un objet dans les clous et enregistre la taille REELLE, pas celle annoncee", async () => {
    const realSize = 1234;
    mockGetMediaObjectSize.mockResolvedValue(realSize);

    const res = await PATCH(patchRequest({ confirmUpload: true }), { params });

    expect(res.status).toBe(200);
    expect(prismaMock.mediaFileVersion.create).toHaveBeenCalledOnce();
    expect(prismaMock.mediaFile.update).toHaveBeenCalledWith({
      where: { id: "file-1" },
      data: { status: "IN_REVIEW", size: realSize },
    });
    expect(mockDeleteMediaFiles).not.toHaveBeenCalled();
  });

  it("ne verifie rien et ne cree rien si une version existe deja (garde existante preservee)", async () => {
    prismaMock.mediaFileVersion.count.mockResolvedValue(1);

    const res = await PATCH(patchRequest({ confirmUpload: true }), { params });

    expect(res.status).toBe(200);
    expect(mockGetMediaObjectSize).not.toHaveBeenCalled();
    expect(prismaMock.mediaFileVersion.create).not.toHaveBeenCalled();
  });
});
