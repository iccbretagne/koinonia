import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { ApiError } from "@/lib/errors";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/storage", () => ({
  abortMultipartUpload: vi.fn(),
  deleteMediaFile: vi.fn(),
}));

const { deleteAudioSource, assertUploadWithinLimits, AUDIO_UPLOAD_MAX_SIZE, partCountFor } =
  await import("../upload");

const serviceId = "service-1";
const churchId = "church-1";

describe("deleteAudioSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
    );
  });

  it("404 si la source n'existe pas ou n'appartient pas au culte/à l'église", async () => {
    prismaMock.audioSource.findUnique.mockResolvedValue(null);
    await expect(deleteAudioSource(serviceId, churchId, "src-1")).rejects.toThrow(ApiError);
  });

  // Régression : la purge des jobs RENDER en attente était scopée au culte entier, pas au
  // segment supprimé — supprimer une séquence en échec annulait aussi silencieusement le rendu
  // légitimement en cours d'une AUTRE séquence du même culte, la laissant bloquée en READY
  // sans jamais recevoir de nouveau job tant que « Publier » n'était pas recliqué.
  it("ne purge que les jobs RENDER du segment supprimé, pas ceux des autres séquences", async () => {
    prismaMock.audioSource.findUnique.mockResolvedValue({
      id: "src-1",
      serviceId,
      s3Key: "key-1",
      uploadId: null,
      uploadStatus: "DONE",
      service: { churchId, status: "READY" },
      segment: { id: "seg-1" },
    } as never);
    prismaMock.audioJob.findMany.mockResolvedValue([
      { id: "job-seg1", payload: { segmentId: "seg-1" } },
      { id: "job-seg2", payload: { segmentId: "seg-2" } },
    ] as never);

    await deleteAudioSource(serviceId, churchId, "src-1");

    expect(prismaMock.audioJob.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["job-seg1"] } } });
    expect(prismaMock.audioSegment.delete).toHaveBeenCalledWith({ where: { id: "seg-1" } });
    expect(prismaMock.audioSource.delete).toHaveBeenCalledWith({ where: { id: "src-1" } });
  });

  it("ne purge aucun job si aucun n'appartient au segment supprimé", async () => {
    prismaMock.audioSource.findUnique.mockResolvedValue({
      id: "src-1",
      serviceId,
      s3Key: "key-1",
      uploadId: null,
      uploadStatus: "DONE",
      service: { churchId, status: "READY" },
      segment: { id: "seg-1" },
    } as never);
    prismaMock.audioJob.findMany.mockResolvedValue([
      { id: "job-seg2", payload: { segmentId: "seg-2" } },
    ] as never);

    await deleteAudioSource(serviceId, churchId, "src-1");

    expect(prismaMock.audioJob.deleteMany).not.toHaveBeenCalled();
  });
});

// H-05 : la taille annoncee etait seulement `positive()`. `partCountFor(size)` generant une
// URL presignee par part, une taille arbitraire faisait signer un nombre illimite d'URLs
// (au-dela des 10 000 parts S3) — DoS applicatif et cout de stockage.
describe("assertUploadWithinLimits", () => {
  it("accepte un fichier audio dans les bornes", () => {
    expect(() => assertUploadWithinLimits("audio/mpeg", 50 * 1024 * 1024)).not.toThrow();
  });

  it("refuse un type MIME hors liste", () => {
    expect(() => assertUploadWithinLimits("application/zip", 1024)).toThrow(ApiError);
  });

  it("refuse une taille au-dela du maximum", () => {
    expect(() => assertUploadWithinLimits("audio/mpeg", AUDIO_UPLOAD_MAX_SIZE + 1)).toThrow(ApiError);
  });

  it("borne le nombre de parts signees bien en deca de la limite S3 de 10 000", () => {
    expect(partCountFor(AUDIO_UPLOAD_MAX_SIZE)).toBeLessThan(10_000);
  });
});
