import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { ApiError } from "@/lib/errors";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/storage", () => ({
  deleteMediaFile: vi.fn(),
  abortMultipartUpload: vi.fn(),
}));

const { createAudioService, updateAudioService, deleteAudioService } = await import("../service");
const { deleteMediaFile } = await import("@/modules/storage");

const churchId = "church-1";
const serviceId = "service-1";

describe("createAudioService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 si ni serviceDate ni événement rattaché", async () => {
    await expect(createAudioService({ churchId })).rejects.toThrow(/serviceDate est requis/);
  });

  it("crée avec titre et orateur saisis manuellement", async () => {
    prismaMock.audioService.create.mockResolvedValue({ id: serviceId, status: "DRAFT" } as never);

    await createAudioService({
      churchId,
      serviceDate: new Date("2026-01-01"),
      title: "Marcher par la foi",
      speaker: "Pasteur X",
    });

    expect(prismaMock.audioService.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Marcher par la foi",
        speaker: "Pasteur X",
        planningEventId: null,
        status: "DRAFT",
      }),
    });
  });

  it("409 si un culte audio existe déjà pour l'événement rattaché", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({ id: "other" } as never);
    prismaMock.event.findUnique.mockResolvedValue({ date: new Date(), churchId } as never);

    await expect(
      createAudioService({ churchId, planningEventId: "event-1" })
    ).rejects.toThrow(/déjà été déposé/);
  });

  // Spec 020 : un rattachement à un événement fait foi sur le type de rassemblement — il
  // écrase toute valeur saisie manuellement, plutôt que de laisser deux réponses possibles à
  // « quel type est-ce ? » selon qu'on regarde l'événement ou l'enregistrement.
  it("dérive le type depuis l'événement rattaché, en écrasant une valeur saisie", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    prismaMock.event.findUnique.mockResolvedValue({ date: new Date("2026-01-01"), churchId, type: "PRIERE" } as never);
    prismaMock.audioService.create.mockResolvedValue({ id: serviceId, status: "DRAFT" } as never);

    await createAudioService({ churchId, planningEventId: "event-1", type: "AUTRE" });

    expect(prismaMock.audioService.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "PRIERE" }),
    });
  });

  it("conserve le type saisi quand aucun événement n'est rattaché", async () => {
    prismaMock.audioService.create.mockResolvedValue({ id: serviceId, status: "DRAFT" } as never);

    await createAudioService({ churchId, serviceDate: new Date("2026-01-01"), type: "FORMATION" });

    expect(prismaMock.audioService.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "FORMATION" }),
    });
  });
});

describe("updateAudioService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 si le culte n'existe pas ou n'appartient pas à l'église", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    await expect(updateAudioService(serviceId, churchId, {})).rejects.toThrow(ApiError);
  });

  // Régression : le formulaire de dépôt permet de préciser orateur, date de l'événement et
  // titre du message, mais seuls orateur/rattachement/couverture étaient persistés — titre et
  // date restaient figés (retour terrain « je ne vois pas d'options pour préciser… »).
  it("persiste le titre et la date du culte, pas seulement l'orateur", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId } as never);
    prismaMock.audioService.update.mockResolvedValue({ id: serviceId } as never);

    const serviceDate = new Date("2026-02-01");
    await updateAudioService(serviceId, churchId, {
      title: "Nouveau titre",
      speaker: "Pasteur Y",
      serviceDate,
      planningEventId: null,
    });

    expect(prismaMock.audioService.update).toHaveBeenCalledWith({
      where: { id: serviceId },
      data: {
        title: "Nouveau titre",
        speaker: "Pasteur Y",
        serviceDate,
        planningEventId: null,
        coverKey: undefined,
      },
    });
  });

  it("re-dérive le type depuis l'événement quand le rattachement change", async () => {
    prismaMock.audioService.findUnique
      .mockResolvedValueOnce({ id: serviceId, churchId } as never)
      .mockResolvedValueOnce(null);
    prismaMock.event.findUnique.mockResolvedValue({ churchId, type: "REUNION" } as never);
    prismaMock.audioService.update.mockResolvedValue({ id: serviceId } as never);

    await updateAudioService(serviceId, churchId, { planningEventId: "event-1", type: "AUTRE" });

    expect(prismaMock.audioService.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "REUNION" }) })
    );
  });

  it("409 si l'événement rattaché a déjà un autre culte audio", async () => {
    prismaMock.audioService.findUnique
      .mockResolvedValueOnce({ id: serviceId, churchId } as never)
      .mockResolvedValueOnce({ id: "other-service" } as never);
    prismaMock.event.findUnique.mockResolvedValue({ churchId } as never);

    await expect(
      updateAudioService(serviceId, churchId, { planningEventId: "event-1" })
    ).rejects.toThrow(/déjà été déposé/);
  });
});

describe("deleteAudioService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
    );
  });

  it("404 si le culte n'existe pas ou n'appartient pas à l'église", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    await expect(deleteAudioService(serviceId, churchId)).rejects.toThrow(ApiError);
  });

  it("400 si le culte est déjà publié", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      status: "PUBLISHED",
      sources: [],
      segments: [],
    } as never);

    await expect(deleteAudioService(serviceId, churchId)).rejects.toThrow(/dépubliez-le avant/);
    expect(prismaMock.audioSource.deleteMany).not.toHaveBeenCalled();
  });

  it("supprime le culte et ses dépendances, puis nettoie le stockage", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: serviceId,
      churchId,
      status: "READY",
      sources: [{ id: "src-1", s3Key: "key-1", uploadId: null, uploadStatus: "DONE" }],
      segments: [{ id: "seg-1", rendition: { s3Key: "rendition-key-1" } }],
    } as never);

    await deleteAudioService(serviceId, churchId);

    expect(prismaMock.audioShareToken.deleteMany).toHaveBeenCalledWith({ where: { serviceId } });
    expect(prismaMock.audioJob.deleteMany).toHaveBeenCalledWith({ where: { serviceId } });
    expect(prismaMock.audioSegment.deleteMany).toHaveBeenCalledWith({ where: { serviceId } });
    expect(prismaMock.audioSource.deleteMany).toHaveBeenCalledWith({ where: { serviceId } });
    expect(prismaMock.audioService.delete).toHaveBeenCalledWith({ where: { id: serviceId } });
    expect(deleteMediaFile).toHaveBeenCalledWith("key-1");
    expect(deleteMediaFile).toHaveBeenCalledWith("rendition-key-1");
  });
});
