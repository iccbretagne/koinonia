import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { ApiError } from "@/lib/errors";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/storage", () => ({
  generateToken: vi.fn(() => "generated-token-123"),
}));

const { createShareToken, resolveShareToken, revokeShareToken, getOrCreatePrimaryShareToken, buildPublicAudioUrl } =
  await import("../tokens");

const serviceId = "service-1";
const churchId = "church-1";

describe("buildPublicAudioUrl", () => {
  it("produit le chemin /ecouter/<token> — seul endroit où ce chemin est écrit en dur", () => {
    expect(buildPublicAudioUrl("abc123")).toBe("/ecouter/abc123");
  });
});

describe("createShareToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 si le culte n'existe pas ou n'appartient pas à l'église", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    await expect(createShareToken({ serviceId, churchId })).rejects.toThrow(ApiError);
  });

  it("crée un lien vers le culte entier quand segmentId est absent", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId } as never);
    prismaMock.audioShareToken.create.mockResolvedValue({
      id: "tok-1",
      serviceId,
      segmentId: null,
      token: "generated-token-123",
    } as never);

    const result = await createShareToken({ serviceId, churchId });

    expect(prismaMock.audioShareToken.create).toHaveBeenCalledWith({
      data: { serviceId, segmentId: null, token: "generated-token-123" },
    });
    expect(result.segmentId).toBeNull();
  });

  it("404 si segmentId est fourni mais n'appartient pas à ce culte", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId } as never);
    prismaMock.audioSegment.findUnique.mockResolvedValue({ id: "seg-1", serviceId: "other-service" } as never);

    await expect(createShareToken({ serviceId, churchId, segmentId: "seg-1" })).rejects.toThrow(
      /Séquence introuvable/
    );
  });

  it("crée un lien direct vers une séquence quand segmentId est valide", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId } as never);
    prismaMock.audioSegment.findUnique.mockResolvedValue({ id: "seg-1", serviceId } as never);
    prismaMock.audioShareToken.create.mockResolvedValue({
      id: "tok-2",
      serviceId,
      segmentId: "seg-1",
      token: "generated-token-123",
    } as never);

    const result = await createShareToken({ serviceId, churchId, segmentId: "seg-1" });

    expect(prismaMock.audioShareToken.create).toHaveBeenCalledWith({
      data: { serviceId, segmentId: "seg-1", token: "generated-token-123" },
    });
    expect(result.segmentId).toBe("seg-1");
  });
});

describe("resolveShareToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("null si le token n'existe pas", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue(null);
    expect(await resolveShareToken("unknown")).toBeNull();
  });

  it("null si le token est révoqué", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      id: "tok-1",
      token: "abc",
      revokedAt: new Date(),
    } as never);
    expect(await resolveShareToken("abc")).toBeNull();
  });

  it("renvoie le token s'il est valide", async () => {
    const shareToken = { id: "tok-1", token: "abc", revokedAt: null };
    prismaMock.audioShareToken.findUnique.mockResolvedValue(shareToken as never);
    expect(await resolveShareToken("abc")).toEqual(shareToken);
  });
});

describe("revokeShareToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 si le lien n'existe pas ou n'appartient pas à l'église", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue(null);
    await expect(revokeShareToken("tok-1", churchId)).rejects.toThrow(ApiError);

    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      id: "tok-1",
      service: { churchId: "other-church" },
    } as never);
    await expect(revokeShareToken("tok-1", churchId)).rejects.toThrow(ApiError);
  });

  it("marque le lien révoqué (il devient inopérant, spec §3)", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      id: "tok-1",
      service: { churchId },
    } as never);
    prismaMock.audioShareToken.update.mockResolvedValue({ id: "tok-1", revokedAt: new Date() } as never);

    await revokeShareToken("tok-1", churchId);

    expect(prismaMock.audioShareToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tok-1" }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) })
    );
  });
});

describe("getOrCreatePrimaryShareToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("réutilise le lien principal existant plutôt que d'en créer un nouveau", async () => {
    const existing = { id: "tok-1", serviceId, segmentId: null, token: "existing-token" };
    prismaMock.audioShareToken.findFirst.mockResolvedValue(existing as never);

    const result = await getOrCreatePrimaryShareToken(serviceId, churchId);

    expect(result).toEqual(existing);
    expect(prismaMock.audioShareToken.create).not.toHaveBeenCalled();
  });

  it("en crée un nouveau (lien culte entier) si aucun n'existe encore", async () => {
    prismaMock.audioShareToken.findFirst.mockResolvedValue(null);
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId } as never);
    prismaMock.audioShareToken.create.mockResolvedValue({
      id: "tok-new",
      serviceId,
      segmentId: null,
      token: "generated-token-123",
    } as never);

    const result = await getOrCreatePrimaryShareToken(serviceId, churchId);

    expect(prismaMock.audioShareToken.create).toHaveBeenCalledWith({
      data: { serviceId, segmentId: null, token: "generated-token-123" },
    });
    expect(result.id).toBe("tok-new");
  });
});
