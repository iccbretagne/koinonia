import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { ApiError } from "@/lib/errors";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { validateSequences, applySequences } = await import("../sequences");

describe("validateSequences", () => {
  it("rejette un titre vide", () => {
    expect(() => validateSequences([{ sourceId: "s1", order: 0, title: "  " }])).toThrow(ApiError);
  });

  it("rejette deux séquences avec le même ordre", () => {
    expect(() =>
      validateSequences([
        { sourceId: "s1", order: 0, title: "Louange" },
        { sourceId: "s2", order: 0, title: "Prédication" },
      ])
    ).toThrow(/même ordre/);
  });

  it("rejette deux séquences avec le même titre (insensible à la casse/espaces)", () => {
    expect(() =>
      validateSequences([
        { sourceId: "s1", order: 0, title: "Louange" },
        { sourceId: "s2", order: 1, title: "  louange " },
      ])
    ).toThrow(/même titre/);
  });

  it("accepte une liste valide", () => {
    expect(() =>
      validateSequences([
        { sourceId: "s1", order: 0, title: "Louange" },
        { sourceId: "s2", order: 1, title: "Prédication" },
      ])
    ).not.toThrow();
  });
});

describe("applySequences", () => {
  const serviceId = "service-1";
  const churchId = "church-1";

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.audioService.findUnique.mockResolvedValue({ id: serviceId, churchId, status: "PENDING_REVIEW" } as never);
    prismaMock.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
    );
    prismaMock.audioSegment.update.mockImplementation((args: never) => Promise.resolve(args));
    prismaMock.audioSegment.create.mockImplementation((args: { data: unknown }) =>
      Promise.resolve(args.data)
    );
  });

  it("404 si le culte n'existe pas ou n'appartient pas à l'église", async () => {
    prismaMock.audioService.findUnique.mockResolvedValue(null);
    await expect(
      applySequences(serviceId, churchId, [{ sourceId: "s1", order: 0, title: "Louange" }])
    ).rejects.toThrow(ApiError);
  });

  it("rejette une source qui n'appartient pas à ce culte", async () => {
    prismaMock.audioSource.findMany.mockResolvedValue([]);
    prismaMock.audioSegment.findMany.mockResolvedValue([]);
    await expect(
      applySequences(serviceId, churchId, [{ sourceId: "s1", order: 0, title: "Louange" }])
    ).rejects.toThrow(/sources sont invalides/);
  });

  it("crée un segment par source déposée (ajout après coup, sans toucher aux autres)", async () => {
    prismaMock.audioSource.findMany.mockResolvedValue([
      { id: "s1", durationMs: 120_000 },
      { id: "s2", durationMs: 60_000 },
    ] as never);
    // s1 a déjà un segment ; s2 vient d'être déposée et n'en a pas encore
    prismaMock.audioSegment.findMany
      .mockResolvedValueOnce([{ id: "seg-1", sourceId: "s1", order: 0, title: "Louange" }] as never)
      .mockResolvedValueOnce([
        { id: "seg-1", sourceId: "s1", order: 0, title: "Louange" },
        { sourceId: "s2", order: 1, title: "Prédication" },
      ] as never);

    const result = await applySequences(serviceId, churchId, [
      { sourceId: "s1", order: 0, title: "Louange" },
      { sourceId: "s2", order: 1, title: "Prédication" },
    ]);

    expect(prismaMock.audioSegment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceId: "s2", order: 1, startMs: 0, endMs: 60_000 }),
      })
    );
    expect(result).toHaveLength(2);
  });

  it("réordonne via une phase intermédiaire à des ordres négatifs disjoints (échange 1 ↔ 2)", async () => {
    prismaMock.audioSource.findMany.mockResolvedValue([
      { id: "s1", durationMs: 100 },
      { id: "s2", durationMs: 100 },
    ] as never);
    const existing = [
      { id: "seg-1", sourceId: "s1", order: 1, title: "Louange" },
      { id: "seg-2", sourceId: "s2", order: 2, title: "Prédication" },
    ];
    prismaMock.audioSegment.findMany.mockResolvedValueOnce(existing as never).mockResolvedValueOnce([] as never);

    await applySequences(serviceId, churchId, [
      { sourceId: "s1", order: 2, title: "Louange" },
      { sourceId: "s2", order: 1, title: "Prédication" },
    ]);

    const updateCalls = prismaMock.audioSegment.update.mock.calls.map((c) => c[0]);
    // Phase 1 : les deux segments existants sont décalés vers des ordres négatifs disjoints
    // avant toute pose de valeur finale — sinon @@unique([serviceId, order]) collisionnerait.
    const negativeOrders = updateCalls
      .filter((c) => typeof c.data.order === "number" && c.data.order < 0)
      .map((c) => c.data.order);
    expect(negativeOrders).toEqual([-1, -2]);
    // Phase 2 : les valeurs finales échangées sont bien posées ensuite.
    const finalOrders = updateCalls
      .filter((c) => typeof c.data.order === "number" && c.data.order >= 0)
      .map((c) => c.data.order);
    expect(finalOrders.sort()).toEqual([1, 2]);
  });
});
