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
