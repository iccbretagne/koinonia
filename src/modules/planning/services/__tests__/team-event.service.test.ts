import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { createTeamEvent, updateTeamEvent, deleteTeamEvent, listTeamEventsForMember } = await import(
  "@/modules/planning"
);

describe("createTeamEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crée un événement unique sans récurrence", async () => {
    prismaMock.teamEvent.create.mockResolvedValue({ id: "te-1" } as never);

    const result = await createTeamEvent(
      {
        churchId: "church-1",
        departmentId: "dept-1",
        userId: "user-1",
        input: {
          title: "Réunion d'équipe",
          startsAt: new Date("2026-09-14T18:00:00"),
          endsAt: new Date("2026-09-14T19:00:00"),
        },
      },
      prismaMock as never
    );

    expect(result).toEqual({ created: 1, truncated: false });
    expect(prismaMock.teamEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.teamEvent.update).not.toHaveBeenCalled();
  });

  it("crée une série récurrente : durée conservée, seriesId commun, truncated correct", async () => {
    prismaMock.teamEvent.create.mockResolvedValue({ id: "te-first" } as never);
    prismaMock.teamEvent.update.mockResolvedValue({} as never);
    prismaMock.teamEvent.createMany.mockResolvedValue({ count: 2 } as never);

    const result = await createTeamEvent(
      {
        churchId: "church-1",
        departmentId: "dept-1",
        userId: "user-1",
        input: {
          title: "Répétition",
          startsAt: new Date("2026-09-01T18:00:00"),
          endsAt: new Date("2026-09-01T20:00:00"),
          recurrence: { rule: "weekly", until: new Date("2026-09-22T00:00:00") },
        },
      },
      prismaMock as never
    );

    // 1er (01/09) + occurrences hebdomadaires <= 22/09 00:00 : 08/09 18h et 15/09 18h
    // (22/09 18h dépasse la borne de fin, exclue) → 3 au total.
    expect(result.created).toBe(3);
    expect(result.truncated).toBe(false);
    expect(prismaMock.teamEvent.update).toHaveBeenCalledWith({
      where: { id: "te-first" },
      data: { seriesId: "te-first" },
    });

    const createManyCall = prismaMock.teamEvent.createMany.mock.calls[0][0];
    expect(createManyCall.data).toHaveLength(2);
    for (const occ of createManyCall.data) {
      expect(occ.seriesId).toBe("te-first");
      expect(occ.endsAt.getTime() - occ.startsAt.getTime()).toBe(2 * 60 * 60 * 1000);
    }
  });

  it("signale truncated quand la série dépasse 104 occurrences", async () => {
    prismaMock.teamEvent.create.mockResolvedValue({ id: "te-first" } as never);
    prismaMock.teamEvent.update.mockResolvedValue({} as never);
    prismaMock.teamEvent.createMany.mockResolvedValue({ count: 104 } as never);

    const result = await createTeamEvent(
      {
        churchId: "church-1",
        departmentId: "dept-1",
        userId: "user-1",
        input: {
          title: "Répétition sans fin",
          startsAt: new Date("2026-01-01T18:00:00"),
          endsAt: new Date("2026-01-01T20:00:00"),
          recurrence: { rule: "weekly", until: new Date("2100-01-01T00:00:00") },
        },
      },
      prismaMock as never
    );

    expect(result.truncated).toBe(true);
    expect(result.created).toBe(105);
  });
});

describe("updateTeamEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  const writeInput = {
    title: "Titre modifié",
    startsAt: new Date("2026-09-14T19:00:00"),
    endsAt: new Date("2026-09-14T20:30:00"),
  };

  it("occurrence : ne modifie que l'événement visé", async () => {
    prismaMock.teamEvent.update.mockResolvedValue({} as never);

    const result = await updateTeamEvent("te-2", writeInput, "occurrence", prismaMock as never);

    expect(result).toEqual({ updated: 1 });
    expect(prismaMock.teamEvent.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.teamEvent.update).toHaveBeenCalledWith({
      where: { id: "te-2" },
      data: {
        title: writeInput.title,
        startsAt: writeInput.startsAt,
        endsAt: writeInput.endsAt,
        location: null,
        description: null,
      },
    });
    expect(prismaMock.teamEvent.findMany).not.toHaveBeenCalled();
  });

  it("following : déplace la courante et les occurrences futures, jamais le passé", async () => {
    prismaMock.teamEvent.findUnique.mockResolvedValue({
      seriesId: "series-1",
      startsAt: new Date("2026-09-14T18:00:00"),
    } as never);
    prismaMock.teamEvent.findMany.mockResolvedValue([
      { id: "te-current", startsAt: new Date("2026-09-14T18:00:00") },
      { id: "te-next", startsAt: new Date("2026-09-21T18:00:00") },
    ] as never);
    prismaMock.teamEvent.update.mockResolvedValue({} as never);

    const result = await updateTeamEvent("te-current", writeInput, "following", prismaMock as never);

    expect(result).toEqual({ updated: 2 });
    expect(prismaMock.teamEvent.findMany).toHaveBeenCalledWith({
      where: { seriesId: "series-1", startsAt: { gte: new Date("2026-09-14T18:00:00") } },
      select: { id: true, startsAt: true },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.teamEvent.update).toHaveBeenCalledTimes(2);
  });

  it("following préserve le jour de chaque occurrence en appliquant la nouvelle heure", async () => {
    prismaMock.teamEvent.findUnique.mockResolvedValue({
      seriesId: "series-1",
      startsAt: new Date("2026-09-14T18:00:00"),
    } as never);
    prismaMock.teamEvent.findMany.mockResolvedValue([
      { id: "te-current", startsAt: new Date("2026-09-14T18:00:00") },
      { id: "te-next", startsAt: new Date("2026-09-21T18:00:00") },
    ] as never);
    const updateCalls: { where: { id: string }; data: { startsAt: Date; endsAt: Date } }[] = [];
    prismaMock.teamEvent.update.mockImplementation((args: never) => {
      updateCalls.push(args as never);
      return Promise.resolve({});
    });

    await updateTeamEvent("te-current", writeInput, "following", prismaMock as never);

    const nextUpdate = updateCalls.find((c) => c.where.id === "te-next")!;
    expect(nextUpdate.data.startsAt.getDate()).toBe(21); // jour conservé
    expect(nextUpdate.data.startsAt.getHours()).toBe(19); // nouvelle heure appliquée
    expect(nextUpdate.data.startsAt.getMinutes()).toBe(0);
    expect(nextUpdate.data.endsAt.getTime() - nextUpdate.data.startsAt.getTime()).toBe(90 * 60 * 1000);
  });

  it("following traversant le changement d'heure d'été : l'heure locale affichée reste correcte", async () => {
    // Dernier dimanche de mars 2026 en France : passage à l'heure d'été le 29/03.
    prismaMock.teamEvent.findUnique.mockResolvedValue({
      seriesId: "series-dst",
      startsAt: new Date("2026-03-24T19:00:00"),
    } as never);
    prismaMock.teamEvent.findMany.mockResolvedValue([
      { id: "te-before-dst", startsAt: new Date("2026-03-24T19:00:00") },
      { id: "te-after-dst", startsAt: new Date("2026-03-31T19:00:00") },
    ] as never);
    const updateCalls: { where: { id: string }; data: { startsAt: Date } }[] = [];
    prismaMock.teamEvent.update.mockImplementation((args: never) => {
      updateCalls.push(args as never);
      return Promise.resolve({});
    });

    await updateTeamEvent(
      "te-before-dst",
      { ...writeInput, startsAt: new Date("2026-03-24T20:00:00"), endsAt: new Date("2026-03-24T21:00:00") },
      "following",
      prismaMock as never
    );

    const afterDst = updateCalls.find((c) => c.where.id === "te-after-dst")!;
    expect(afterDst.data.startsAt.getDate()).toBe(31);
    expect(afterDst.data.startsAt.getHours()).toBe(20);
    expect(afterDst.data.startsAt.getMinutes()).toBe(0);
  });

  it("following sans série (seriesId nul) retombe sur occurrence", async () => {
    prismaMock.teamEvent.findUnique.mockResolvedValue({ seriesId: null, startsAt: new Date() } as never);
    prismaMock.teamEvent.update.mockResolvedValue({} as never);

    const result = await updateTeamEvent("te-solo", writeInput, "following", prismaMock as never);

    expect(result).toEqual({ updated: 1 });
    expect(prismaMock.teamEvent.findMany).not.toHaveBeenCalled();
  });
});

describe("deleteTeamEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("occurrence : supprime uniquement l'événement visé", async () => {
    prismaMock.teamEvent.delete.mockResolvedValue({} as never);

    const result = await deleteTeamEvent("te-1", "occurrence", prismaMock as never);

    expect(result).toEqual({ deleted: 1 });
    expect(prismaMock.teamEvent.delete).toHaveBeenCalledWith({ where: { id: "te-1" } });
    expect(prismaMock.teamEvent.deleteMany).not.toHaveBeenCalled();
  });

  it("following : supprime la courante et les occurrences futures, jamais le passé", async () => {
    prismaMock.teamEvent.findUnique.mockResolvedValue({
      seriesId: "series-1",
      startsAt: new Date("2026-09-14T18:00:00"),
    } as never);
    prismaMock.teamEvent.deleteMany.mockResolvedValue({ count: 3 } as never);

    const result = await deleteTeamEvent("te-current", "following", prismaMock as never);

    expect(result).toEqual({ deleted: 3 });
    expect(prismaMock.teamEvent.deleteMany).toHaveBeenCalledWith({
      where: { seriesId: "series-1", startsAt: { gte: new Date("2026-09-14T18:00:00") } },
    });
  });

  it("following sans série retombe sur la suppression simple", async () => {
    prismaMock.teamEvent.findUnique.mockResolvedValue({ seriesId: null, startsAt: new Date() } as never);
    prismaMock.teamEvent.delete.mockResolvedValue({} as never);

    const result = await deleteTeamEvent("te-solo", "following", prismaMock as never);

    expect(result).toEqual({ deleted: 1 });
    expect(prismaMock.teamEvent.deleteMany).not.toHaveBeenCalled();
  });
});

describe("listTeamEventsForMember", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filtre par église et appartenance au département", async () => {
    prismaMock.teamEvent.findMany.mockResolvedValue([] as never);

    await listTeamEventsForMember("church-1", "member-1", prismaMock as never);

    expect(prismaMock.teamEvent.findMany).toHaveBeenCalledWith({
      where: { churchId: "church-1", department: { memberDepts: { some: { memberId: "member-1" } } } },
      include: { department: { select: { id: true, name: true } } },
      orderBy: { startsAt: "asc" },
    });
  });

  it("un membre retiré du département n'apparaît plus dans le résultat au prochain appel", async () => {
    const event = {
      id: "te-1",
      title: "Réunion",
      startsAt: new Date("2026-09-14T18:00:00"),
      endsAt: new Date("2026-09-14T19:00:00"),
      location: null,
      description: null,
      recurrenceRule: null,
      seriesId: null,
      department: { id: "dept-1", name: "Son" },
    };

    // Avant le retrait du département : l'événement est visible.
    prismaMock.teamEvent.findMany.mockResolvedValueOnce([event] as never);
    const before = await listTeamEventsForMember("church-1", "member-1", prismaMock as never);
    expect(before).toEqual([event]);

    // Après le retrait (simulé par le mock reflétant le nouvel état de member_departments) :
    // le service ne fait aucun filtrage en mémoire, le retrait est donc immédiatement effectif.
    prismaMock.teamEvent.findMany.mockResolvedValueOnce([] as never);
    const after = await listTeamEventsForMember("church-1", "member-1", prismaMock as never);
    expect(after).toEqual([]);
  });
});
