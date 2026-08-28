import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

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
    segments: [
      {
        id: "seg-1",
        kind: "SEQUENCE",
        order: 0,
        title: "Louange",
        rendition: { durationMs: 60000 },
      },
    ],
    ...overrides,
  };
}

describe("listPublishedServices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne renvoie jamais un culte non publié", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([]);
    await listPublishedServices({ churchId });

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PUBLISHED" }) })
    );
  });

  it("cumule les critères orateur + type + période + recherche libre", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([]);
    const from = new Date("2026-01-01");
    const to = new Date("2026-01-31");

    await listPublishedServices({
      churchId,
      speaker: "Pasteur Jean",
      type: "CULTE",
      q: "dimanche",
      from,
      to,
    });

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          churchId,
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
    await listPublishedServices({ churchId, sort });

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expected })
    );
  });

  it("un culte sans titre ni orateur reste renvoyé, identifiable par sa date", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([
      service({ title: null, speaker: null }),
    ]);

    const result = await listPublishedServices({ churchId });

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

    const [result] = await listPublishedServices({ churchId });

    expect(result.segmentCount).toBe(1);
    expect(result.totalDurationMs).toBe(60000);
    expect(result.segmentIds).toEqual(["seg-1"]);
  });
});

describe("listSpeakers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne renvoie que les orateurs distincts des cultes publiés", async () => {
    prismaMock.audioService.findMany.mockResolvedValue([{ speaker: "Pasteur Jean" }, { speaker: null }]);

    const speakers = await listSpeakers(churchId);

    expect(prismaMock.audioService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId, status: "PUBLISHED", speaker: { not: null } } })
    );
    expect(speakers).toEqual(["Pasteur Jean"]);
  });
});

describe("getPublishedServiceForMember", () => {
  beforeEach(() => vi.clearAllMocks());

  it("null si le culte n'existe pas", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    expect(await getPublishedServiceForMember("service-1", churchId)).toBeNull();
  });

  it("null si le culte appartient à une autre église", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(service({ churchId: "other-church" }) as never);
    expect(await getPublishedServiceForMember("service-1", churchId)).toBeNull();
  });

  it("null si le culte n'est pas publié", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(service({ status: "DRAFT" }) as never);
    expect(await getPublishedServiceForMember("service-1", churchId)).toBeNull();
  });

  it("renvoie la fiche du culte publié", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(service() as never);

    const result = await getPublishedServiceForMember("service-1", churchId);

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Culte du dimanche");
    expect(result?.segments).toHaveLength(1);
  });
});
