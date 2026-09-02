import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { renditionVersion } from "../rendition-cache";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/storage", () => ({
  getSignedStreamUrl: vi.fn(async (key: string) => `https://signed/${key}`),
}));

const { listPublishedServices, listSpeakers, getPublishedServiceForMember } = await import("../library");

const churchId = "church-1";

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: "service-1",
    churchId,
    title: "Culte du dimanche",
    serviceDate: new Date("2026-01-04"),
    speaker: "Pasteur Jean",
    type: "CULTE",
    status: "PUBLISHED",
    coverKey: null,
    planningEventId: null,
    church: { id: churchId, name: "Église 1", primaryColor: "#5E17EB" },
    segments: [
      {
        id: "seg-1",
        kind: "SEQUENCE",
        order: 0,
        title: "Louange",
        rendition: { durationMs: 60000, sourceHash: "hash-1" },
      },
    ],
    ...overrides,
  };
}

describe("listPublishedServices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne renvoie jamais un culte non publié", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([]);
    await listPublishedServices({ churchIds: [churchId] });

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PUBLISHED" }) })
    );
  });

  it("cumule les critères orateur + type + période + recherche libre", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([]);
    const from = new Date("2026-01-01");
    const to = new Date("2026-01-31");

    await listPublishedServices({
      churchIds: [churchId],
      speaker: "Pasteur Jean",
      type: "CULTE",
      q: "dimanche",
      from,
      to,
    });

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          churchId: { in: [churchId] },
          status: "PUBLISHED",
          speaker: "Pasteur Jean",
          type: "CULTE",
          title: { contains: "dimanche" },
          serviceDate: { gte: from, lte: to },
        },
      })
    );
  });

  it.each([
    ["recent", { serviceDate: "desc" }],
    ["oldest", { serviceDate: "asc" }],
    ["speaker", { speaker: "asc" }],
  ] as const)("trie par %s", async (sort, expected) => {
    prismaMock.audioService.findMany.mockResolvedValue([]);
    await listPublishedServices({ churchIds: [churchId], sort });

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expected })
    );
  });

  it("un culte sans titre ni orateur reste renvoyé, identifiable par sa date", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([
      service({ title: null, speaker: null }),
    ]);

    const result = await listPublishedServices({ churchIds: [churchId] });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: null,
      speaker: null,
      serviceDate: new Date("2026-01-04"),
    });
  });

  it("ne compte que les séquences rendues dans la durée totale et le nombre de séquences", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([
      service({
        segments: [
          { id: "seg-1", kind: "SEQUENCE", order: 0, title: "Louange", rendition: { durationMs: 60000 } },
          { id: "seg-2", kind: "SEQUENCE", order: 1, title: "Prédication", rendition: null },
        ],
      }),
    ]);

    const [result] = await listPublishedServices({ churchIds: [churchId] });

    expect(result.segmentCount).toBe(1);
    expect(result.totalDurationMs).toBe(60000);
    expect(result.segmentIds).toEqual(["seg-1"]);
  });
});

describe("listSpeakers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne renvoie que les orateurs distincts des cultes publiés", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([{ speaker: "Pasteur Jean" }, { speaker: null }]);

    const speakers = await listSpeakers([churchId]);

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: { in: [churchId] }, status: "PUBLISHED", speaker: { not: null } } })
    );
    expect(speakers).toEqual(["Pasteur Jean"]);
  });
});

describe("getPublishedServiceForMember", () => {
  beforeEach(() => vi.clearAllMocks());

  it("null si le culte n'existe pas", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    expect(await getPublishedServiceForMember("service-1", [churchId])).toBeNull();
  });

  it("null si le culte appartient à une autre église", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(service({ churchId: "other-church" }) as never);
    expect(await getPublishedServiceForMember("service-1", [churchId])).toBeNull();
  });

  it("null si le culte n'est pas publié", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(service({ status: "DRAFT" }) as never);
    expect(await getPublishedServiceForMember("service-1", [churchId])).toBeNull();
  });

  it("renvoie la fiche du culte publié", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(service() as never);

    const result = await getPublishedServiceForMember("service-1", [churchId]);

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Culte du dimanche");
    expect(result?.segments).toHaveLength(1);
    // Version dérivée du sourceHash (spec 026) — même mapping que la page publique.
    expect(result?.segments[0].version).toBe(renditionVersion("hash-1"));
  });
});

// Spec 036 — bibliothèque partagée entre plusieurs églises.
describe("bibliothèque partagée entre plusieurs églises (spec 036)", () => {
  beforeEach(() => vi.clearAllMocks());

  const churchB = "church-2";

  it("une liste d'églises ne remonte que des cultes PUBLISHED de ces églises — requête filtrée par IN", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([]);

    await listPublishedServices({ churchIds: [churchId, churchB] });

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ churchId: { in: [churchId, churchB] }, status: "PUBLISHED" }),
      })
    );
  });

  it("remonte l'église d'origine de chaque culte pour le badge de provenance", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([
      service({ church: { id: churchB, name: "Église 2", primaryColor: "#38B6FF" } }),
    ]);

    const [result] = await listPublishedServices({ churchIds: [churchId, churchB] });

    expect(result).toMatchObject({ churchId: churchB, churchName: "Église 2", churchPrimaryColor: "#38B6FF" });
  });

  it("un culte hors périmètre n'est jamais accessible via getPublishedServiceForMember", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(service({ churchId: "church-outside-scope" }) as never);

    expect(await getPublishedServiceForMember("service-1", [churchId, churchB])).toBeNull();
  });

  it("orateurs et séries sont restreints à l'église filtrée (cascade)", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([{ speaker: "Pasteur A" }]);

    await listSpeakers([churchB]);

    // Seule l'église filtrée est passée à la requête — pas tout le périmètre accessible.
    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: { in: [churchB] } }) })
    );
  });
});
