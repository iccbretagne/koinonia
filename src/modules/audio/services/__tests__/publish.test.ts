import { createHash } from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { ApiError } from "@/lib/errors";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { computeSourceHash, publishAudioService, unpublishAudioService, maybeCompletePublication } =
  await import("../publish");

const serviceId = "service-1";
const churchId = "church-1";

function hashOf(etag: string): string {
  return createHash("sha256").update(etag).digest("hex");
}

describe("computeSourceHash", () => {
  it("est déterministe pour un même ETag", () => {
    expect(computeSourceHash("abc")).toBe(computeSourceHash("abc"));
  });

  it("diffère pour deux ETags différents", () => {
    expect(computeSourceHash("abc")).not.toBe(computeSourceHash("def"));
  });
});

describe("publishAudioService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
    );
  });

  it("404 si le culte n'existe pas ou n'appartient pas à l'église", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    await expect(publishAudioService(serviceId, churchId, "user-1")).rejects.toThrow(ApiError);
  });

  it("400 si aucune séquence n'a été nommée", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      publishedAt: null,
      segments: [],
    } as never);

    await expect(publishAudioService(serviceId, churchId, "user-1")).rejects.toThrow(
      /Aucune séquence à publier/
    );
  });

  it("crée un job RENDER par segment sans rendition à jour et passe en READY", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      publishedAt: null,
      segments: [
        { id: "seg-1", source: { etag: "etag-1", uploadStatus: "DONE" }, rendition: null },
        { id: "seg-2", source: { etag: "etag-2", uploadStatus: "DONE" }, rendition: null },
      ],
    } as never);
    prismaMock.audioService.findUniqueOrThrow.mockResolvedValue({ id: serviceId, status: "READY" } as never);

    const result = await publishAudioService(serviceId, churchId, "user-1");

    expect(prismaMock.audioJob.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        { serviceId, type: "RENDER", status: "PENDING", payload: { segmentId: "seg-1", sourceHash: hashOf("etag-1") }, segmentId: "seg-1", sourceHash: hashOf("etag-1") },
        { serviceId, type: "RENDER", status: "PENDING", payload: { segmentId: "seg-2", sourceHash: hashOf("etag-2") }, segmentId: "seg-2", sourceHash: hashOf("etag-2") },
      ],
    });
    expect(prismaMock.audioService.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "READY" }) })
    );
    expect(result.status).toBe("READY");
  });

  it("robustesse concurrence (spec 029) — chaque job porte (segmentId, sourceHash) en colonnes et l'insertion ignore les doublons", async () => {
    // La garantie reelle est portee par la contrainte d'unicite (segmentId, sourceHash) en base,
    // que le mock Prisma ne peut pas simuler : ce test verrouille les deux conditions cote code
    // sans lesquelles elle ne s'appliquerait pas — colonnes renseignees, et insertion tolerante
    // au doublon pour qu'une publication concurrente n'echoue pas bruyamment.
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      publishedAt: null,
      segments: [{ id: "seg-1", source: { etag: "etag-1", uploadStatus: "DONE" }, rendition: null }],
    } as never);
    prismaMock.audioService.findUniqueOrThrow.mockResolvedValue({ id: serviceId, status: "READY" } as never);

    await publishAudioService(serviceId, churchId, "user-1");

    const call = prismaMock.audioJob.createMany.mock.calls[0][0] as {
      skipDuplicates: boolean;
      data: { segmentId: string; sourceHash: string }[];
    };
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0].segmentId).toBe("seg-1");
    expect(call.data[0].sourceHash).toBe(hashOf("etag-1"));
  });

  it("idempotence — republier sans redéposer ne recrée aucun job, passe direct à PUBLISHED", async () => {
    const etag = "etag-unchanged";
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      publishedAt: new Date("2026-01-01"),
      segments: [
        { id: "seg-1", source: { etag, uploadStatus: "DONE" }, rendition: { sourceHash: hashOf(etag) } },
      ],
    } as never);
    prismaMock.audioService.findUniqueOrThrow.mockResolvedValue({ id: serviceId, status: "PUBLISHED" } as never);

    await publishAudioService(serviceId, churchId, "user-1");

    expect(prismaMock.audioJob.createMany).not.toHaveBeenCalled();
    expect(prismaMock.audioService.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PUBLISHED" }) })
    );
  });

  it("redéposer une seule séquence ne recrée un job que pour cette séquence", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      publishedAt: new Date("2026-01-01"),
      segments: [
        // seg-1 a été redéposé : etag a changé, la rendition existante ne correspond plus.
        { id: "seg-1", source: { etag: "etag-1-new", uploadStatus: "DONE" }, rendition: { sourceHash: hashOf("etag-1-old") } },
        // seg-2 inchangé : rendition toujours à jour.
        { id: "seg-2", source: { etag: "etag-2", uploadStatus: "DONE" }, rendition: { sourceHash: hashOf("etag-2") } },
      ],
    } as never);
    prismaMock.audioService.findUniqueOrThrow.mockResolvedValue({ id: serviceId, status: "READY" } as never);

    await publishAudioService(serviceId, churchId, "user-1");

    expect(prismaMock.audioJob.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        { serviceId, type: "RENDER", status: "PENDING", payload: { segmentId: "seg-1", sourceHash: hashOf("etag-1-new") }, segmentId: "seg-1", sourceHash: hashOf("etag-1-new") },
      ],
    });
  });

  // Régression : une source dont le multipart n'a jamais abouti n'a pas d'objet S3. Publier
  // créait un job RENDER qui échouait sur « The specified key does not exist », épuisait ses
  // tentatives, et laissait le culte bloqué en READY sans jamais atteindre PUBLISHED.
  it("refuse de publier si une source n'a pas fini son dépôt, sans créer de job", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      status: "PENDING_REVIEW",
      segments: [
        { id: "seg-1", title: "Louange", source: { etag: "etag-1", uploadStatus: "DONE" }, rendition: null },
        { id: "seg-2", title: "Prédication", source: { etag: null, uploadStatus: "PENDING" }, rendition: null },
      ],
    } as never);

    await expect(publishAudioService(serviceId, churchId, "user-1")).rejects.toThrow(/Prédication/);
    expect(prismaMock.audioJob.createMany).not.toHaveBeenCalled();
    expect(prismaMock.audioService.update).not.toHaveBeenCalled();
  });
});

describe("unpublishAudioService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 si le culte n'existe pas ou n'appartient pas à l'église", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    await expect(unpublishAudioService(serviceId, churchId)).rejects.toThrow(ApiError);
  });

  it("400 si le culte n'est pas publié", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId, status: "DRAFT" } as never);
    await expect(unpublishAudioService(serviceId, churchId)).rejects.toThrow(/n'est pas publié/);
  });

  it("passe le statut à UNPUBLISHED", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId, status: "PUBLISHED" } as never);
    prismaMock.audioService.update.mockResolvedValue({ id: serviceId, status: "UNPUBLISHED" } as never);

    const result = await unpublishAudioService(serviceId, churchId);

    expect(result.status).toBe("UNPUBLISHED");
  });
});

describe("maybeCompletePublication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne fait rien si le culte n'est pas en READY", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, status: "PUBLISHED", segments: [] } as never);
    await maybeCompletePublication(serviceId);
    expect(prismaMock.audioService.update).not.toHaveBeenCalled();
  });

  it("ne fait rien tant que toutes les séquences ne sont pas à jour", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      status: "READY",
      segments: [
        { source: { etag: "etag-1", uploadStatus: "DONE" }, rendition: { sourceHash: hashOf("etag-1") } },
        { source: { etag: "etag-2", uploadStatus: "DONE" }, rendition: null },
      ],
    } as never);

    await maybeCompletePublication(serviceId);
    expect(prismaMock.audioService.update).not.toHaveBeenCalled();
  });

  it("passe à PUBLISHED quand toutes les séquences ont une rendition à jour", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      status: "READY",
      segments: [
        { source: { etag: "etag-1", uploadStatus: "DONE" }, rendition: { sourceHash: hashOf("etag-1") } },
        { source: { etag: "etag-2", uploadStatus: "DONE" }, rendition: { sourceHash: hashOf("etag-2") } },
      ],
    } as never);

    await maybeCompletePublication(serviceId);

    expect(prismaMock.audioService.update).toHaveBeenCalledWith({
      where: { id: serviceId },
      data: { status: "PUBLISHED" },
    });
  });
});
