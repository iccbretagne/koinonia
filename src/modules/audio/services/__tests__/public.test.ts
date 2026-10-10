import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { renditionVersion } from "../rendition-cache";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/storage", () => ({
  getSignedStreamUrl: vi.fn(async (key: string) => `https://signed/${key}`),
}));

const { mapPublishedSegments, resolvePublicAudioService } = await import("../public");

describe("mapPublishedSegments", () => {
  it("expose une version dérivée du sourceHash de la rendition (spec 026)", () => {
    const [result] = mapPublishedSegments([
      {
        id: "seg-1",
        title: "Louange",
        order: 0,
        rendition: { durationMs: 60000, sourceHash: "hash-a" },
      } as never,
    ]);

    expect(result.version).toBe(renditionVersion("hash-a"));
  });

  it("deux renditions de sourceHash différents donnent deux versions différentes", () => {
    const [a, b] = mapPublishedSegments([
      { id: "seg-1", title: "A", order: 0, rendition: { durationMs: 1000, sourceHash: "hash-a" } } as never,
      { id: "seg-2", title: "B", order: 1, rendition: { durationMs: 1000, sourceHash: "hash-b" } } as never,
    ]);

    expect(a.version).not.toBe(b.version);
  });

  it("exclut un segment sans rendition (non-régression)", () => {
    const result = mapPublishedSegments([
      { id: "seg-1", title: "A", order: 0, rendition: null } as never,
    ]);

    expect(result).toHaveLength(0);
  });
});

describe("resolvePublicAudioService — parité avec la bibliothèque membre", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expose la version du rendu dans les segments retournés", async () => {
    prismaMock.audioShareToken.findUnique.mockResolvedValue({
      token: "tok-1",
      serviceId: "service-1",
      segmentId: null,
      revokedAt: null,
    } as never);
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: "service-1",
      churchId: "church-1",
      title: "Culte du dimanche",
      serviceDate: new Date("2026-01-04"),
      speaker: "Pasteur Jean",
      coverKey: null,
      planningEventId: null,
      status: "PUBLISHED",
      segments: [
        {
          id: "seg-1",
          title: "Louange",
          order: 0,
          rendition: { durationMs: 60000, sourceHash: "hash-a" },
        },
      ],
    } as never);

    const result = await resolvePublicAudioService("tok-1");

    expect(result.status).toBe("OK");
    if (result.status === "OK") {
      expect(result.data.segments[0].version).toBe(renditionVersion("hash-a"));
    }
  });
});

describe("couverture : la clé doit appartenir à l'église", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isChurchCoverKey n'accepte que les couvertures de l'église elle-même", async () => {
    const { isChurchCoverKey } = await import("../settings");
    expect(isChurchCoverKey("church-1", "audio-settings/church-1/cover-abc.jpg")).toBe(true);
    expect(isChurchCoverKey("church-1", "audio-settings/church-2/cover-abc.jpg")).toBe(false);
    expect(isChurchCoverKey("church-1", "accounting/church-1/facture.pdf")).toBe(false);
    expect(isChurchCoverKey("church-1", "audio-settings/church-1/cover-../../church-2/x.jpg")).toBe(false);
    expect(isChurchCoverKey("church-1", "audio-settings/church-1/cover-a/b.jpg")).toBe(false);
  });

  it("ne signe pas une clé étrangère enregistrée sur un culte", async () => {
    const { resolveEffectiveCoverUrl } = await import("../public");

    await expect(
      resolveEffectiveCoverUrl("accounting/church-2/facture.pdf", "church-1", prismaMock as never)
    ).resolves.toBeNull();
    await expect(
      resolveEffectiveCoverUrl("audio-settings/church-1/cover-x.jpg", "church-1", prismaMock as never)
    ).resolves.toBe("https://signed/audio-settings/church-1/cover-x.jpg");
  });
});
