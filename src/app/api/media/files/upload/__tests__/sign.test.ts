/**
 * Tests — P0-5 : XOR strict mediaEventId/mediaProjectId
 *
 * - POST avec les deux IDs simultanément doit retourner 400
 * - POST avec aucun ID doit retourner 400
 * - POST avec exactement un ID doit passer la validation Zod
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/modules/media", () => ({
  getFileOriginalKey: vi.fn().mockReturnValue("media-events/me-1/file-1/v1/file.mp4"),
}));

vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_MUTATION: { windowMs: 60000, max: 10 },
}));

vi.mock("@/lib/s3", () => ({
  s3Media: {},
  MEDIA_BUCKET: "test-bucket",
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://s3.example.com/presigned-url"),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn(),
}));

const { POST } = await import("../sign/route");

describe("POST /api/media/files/upload/sign — P0-5 XOR validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    prismaMock.mediaFile.create.mockResolvedValue({
      id: "file-1",
      type: "VIDEO",
      status: "DRAFT",
      filename: "test.mp4",
      mimeType: "video/mp4",
      size: 1000,
      mediaEventId: "me-1",
      mediaProjectId: null,
    } as never);
  });

  it("retourne 400 si les deux IDs sont fournis (non-XOR)", async () => {
    const request = new Request("http://localhost/api/media/files/upload/sign", {
      method: "POST",
      body: JSON.stringify({
        filename: "test.mp4",
        contentType: "video/mp4",
        size: 1000,
        type: "VIDEO",
        mediaEventId: "me-1",
        mediaProjectId: "mp-1",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it("retourne 400 si aucun ID n'est fourni", async () => {
    const request = new Request("http://localhost/api/media/files/upload/sign", {
      method: "POST",
      body: JSON.stringify({
        filename: "test.mp4",
        contentType: "video/mp4",
        size: 1000,
        type: "VIDEO",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it("retourne 201 avec exactement mediaEventId", async () => {
    const request = new Request("http://localhost/api/media/files/upload/sign", {
      method: "POST",
      body: JSON.stringify({
        filename: "test.mp4",
        contentType: "video/mp4",
        size: 1000,
        type: "VIDEO",
        mediaEventId: "me-1",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fileId).toBe("file-1");
    expect(body.uploadUrl).toContain("presigned-url");
  });

  it("retourne 201 avec exactement mediaProjectId", async () => {
    prismaMock.mediaFile.create.mockResolvedValue({
      id: "file-2",
      type: "VIDEO",
      status: "DRAFT",
      filename: "test.mp4",
      mimeType: "video/mp4",
      size: 1000,
      mediaEventId: null,
      mediaProjectId: "mp-1",
    } as never);

    const request = new Request("http://localhost/api/media/files/upload/sign", {
      method: "POST",
      body: JSON.stringify({
        filename: "test.mp4",
        contentType: "video/mp4",
        size: 1000,
        type: "VIDEO",
        mediaProjectId: "mp-1",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(201);
  });
});
