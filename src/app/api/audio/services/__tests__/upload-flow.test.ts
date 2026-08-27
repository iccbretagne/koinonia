/**
 * T042 — Intégration : dépôt multi-fichiers → probe (simulé) → nommage → publication,
 * y compris une reprise (une source sur trois incomplète).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAudioAccess = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAudioAccess: (...args: unknown[]) => mockRequireAudioAccess(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/rate-limit", () => ({
  requireRateLimit: vi.fn(),
  RATE_LIMIT_MUTATION: { windowMs: 60_000, max: 30 },
}));

const mockCreateMultipartUpload = vi.fn();
const mockGetSignedPartUrl = vi.fn();
const mockCompleteMultipartUpload = vi.fn();
const mockListUploadedParts = vi.fn();
vi.mock("@/modules/storage", () => ({
  createMultipartUpload: (...args: unknown[]) => mockCreateMultipartUpload(...args),
  getSignedPartUrl: (...args: unknown[]) => mockGetSignedPartUrl(...args),
  completeMultipartUpload: (...args: unknown[]) => mockCompleteMultipartUpload(...args),
  listUploadedParts: (...args: unknown[]) => mockListUploadedParts(...args),
}));

const { POST: signPost } = await import("../[id]/upload/sign/route");
const { POST: completePost } = await import("../[id]/upload/complete/route");
const { GET: partsGet } = await import("../[id]/upload/parts/route");
const { PUT: sequencesPut } = await import("../[id]/sequences/route");
const { POST: publishPost } = await import("../[id]/publish/route");

const serviceId = "service-1";
const churchId = "church-1";

function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/audio/services/x", {
    method,
    body: JSON.stringify(body),
  });
}

function params(id = serviceId) {
  return { params: Promise.resolve({ id }) };
}

describe("Dépôt multi-fichiers → nommage → publication (avec reprise)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAudioAccess.mockResolvedValue(createAdminSession(churchId));
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId, status: "DRAFT" } as never);
    mockCreateMultipartUpload.mockResolvedValue("upload-id-1");
    mockGetSignedPartUrl.mockImplementation((_key: string, _uploadId: string, partNumber: number) =>
      Promise.resolve(`https://s3.example.com/part-${partNumber}`)
    );
  });

  it("signe un upload multipart pour chacun des trois fichiers déposés", async () => {
    const sources = ["src-1", "src-2", "src-3"];
    for (const [i, sourceId] of sources.entries()) {
      prismaMock.audioSource.create.mockResolvedValueOnce({ id: sourceId, uploadStatus: "PENDING" } as never);
      prismaMock.audioSource.update.mockResolvedValueOnce({
        id: sourceId,
        s3Key: `audio-services/${serviceId}/sources/${sourceId}.mp3`,
        uploadId: "upload-id-1",
      } as never);

      const res = await signPost(
        jsonRequest({ kind: "SEQUENCE", filename: `seq-${i}.mp3`, contentType: "audio/mpeg", size: 1_000_000 }),
        params()
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { source: { id: string }; partUrls: string[] };
      expect(body.source.id).toBe(sourceId);
      expect(body.partUrls).toHaveLength(1);
    }
    expect(mockCreateMultipartUpload).toHaveBeenCalledTimes(3);
    // Le premier dépôt fait sortir le culte de DRAFT — au-delà, il est déjà PENDING_REVIEW.
    expect(prismaMock.audioService.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PENDING_REVIEW" } })
    );
  });

  it("finalise deux fichiers sur trois — le troisième reste incomplet et reprenable", async () => {
    // src-1 et src-2 terminent normalement.
    for (const sourceId of ["src-1", "src-2"]) {
      prismaMock.audioSource.findUnique.mockResolvedValueOnce({
        id: sourceId,
        serviceId,
        uploadId: "upload-id-1",
        s3Key: `audio-services/${serviceId}/sources/${sourceId}.mp3`,
        service: { churchId },
      } as never);
      mockCompleteMultipartUpload.mockResolvedValueOnce(`"etag-${sourceId}"`);
      prismaMock.audioSource.update.mockResolvedValueOnce({ id: sourceId, uploadStatus: "DONE" } as never);

      const res = await completePost(
        jsonRequest({ sourceId, parts: [{ partNumber: 1, etag: `"etag-${sourceId}"` }] }),
        params()
      );
      expect(res.status).toBe(200);
    }

    // src-3 n'a jamais reçu son POST /complete (coupure réseau) — reste PENDING côté DB, et
    // la route de reprise expose les parts déjà reçues côté S3 pour repartir sans tout renvoyer.
    prismaMock.audioSource.findUnique.mockResolvedValueOnce({
      id: "src-3",
      serviceId,
      uploadId: "upload-id-1",
      s3Key: `audio-services/${serviceId}/sources/src-3.mp3`,
      service: { churchId },
    } as never);
    mockListUploadedParts.mockResolvedValueOnce([{ partNumber: 1, etag: '"etag-part-1"', size: 8_000_000 }]);

    const resumeRes = await partsGet(
      new Request(`http://localhost/api/audio/services/${serviceId}/upload/parts?sourceId=src-3`),
      params()
    );
    expect(resumeRes.status).toBe(200);
    const resumeBody = (await resumeRes.json()) as { partNumber: number }[];
    expect(resumeBody).toEqual([{ partNumber: 1, etag: '"etag-part-1"', size: 8_000_000 }]);
  });

  it("nomme et ordonne les deux séquences complètes, puis publie", async () => {
    prismaMock.audioSource.findMany.mockResolvedValue([
      { id: "src-1", durationMs: 120_000 },
      { id: "src-2", durationMs: 90_000 },
    ] as never);
    prismaMock.audioSegment.findMany
      .mockResolvedValueOnce([] as never) // pas de segment existant
      .mockResolvedValueOnce([
        { id: "seg-1", sourceId: "src-1", order: 0, title: "Louange" },
        { id: "seg-2", sourceId: "src-2", order: 1, title: "Prédication" },
      ] as never);
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
    );
    prismaMock.audioSegment.create.mockImplementation((args: { data: unknown }) => Promise.resolve(args.data));

    const namingRes = await sequencesPut(
      jsonRequest(
        {
          sequences: [
            { sourceId: "src-1", order: 0, title: "Louange" },
            { sourceId: "src-2", order: 1, title: "Prédication" },
          ],
        },
        "PUT"
      ),
      params()
    );
    expect(namingRes.status).toBe(200);

    // Publication : deux segments nommés, aucune rendition existante → deux jobs RENDER,
    // le culte n'atteint pas encore READY tant que le worker n'a pas rendu.
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      publishedAt: null,
      segments: [
        { id: "seg-1", source: { etag: "etag-src-1", uploadStatus: "DONE" }, rendition: null },
        { id: "seg-2", source: { etag: "etag-src-2", uploadStatus: "DONE" }, rendition: null },
      ],
    } as never);
    prismaMock.audioService.findUniqueOrThrow.mockResolvedValue({ id: serviceId, status: "READY" } as never);

    const publishRes = await publishPost(new Request("http://localhost", { method: "POST" }), params());
    expect(publishRes.status).toBe(200);
    expect(prismaMock.audioJob.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ type: "RENDER", payload: expect.objectContaining({ segmentId: "seg-1" }) }),
          expect.objectContaining({ type: "RENDER", payload: expect.objectContaining({ segmentId: "seg-2" }) }),
        ]),
      })
    );
  });
});
