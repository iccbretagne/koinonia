import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const {
  absenceCovers,
  effectiveDepartmentIds,
  lastEffectiveDate,
  validateTargeting,
  listTargetOptions,
} = await import("@/modules/planning");

describe("absenceCovers", () => {
  const eventDate = new Date("2026-10-06");

  it("période : couvre une date à l'intérieur, pas en dehors", () => {
    const absence = {
      kind: "PERIOD" as const,
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-10"),
      allDepartments: true,
      targetDepartments: [],
      targetEvents: [],
    };
    expect(absenceCovers(absence, { eventDate, departmentId: "dept-1" })).toBe(true);
    expect(absenceCovers(absence, { eventDate: new Date("2026-11-01"), departmentId: "dept-1" })).toBe(false);
  });

  it("événements : couvre l'événement ciblé, pas l'événement intermédiaire", () => {
    const absence = {
      kind: "EVENTS" as const,
      startDate: null,
      endDate: null,
      allDepartments: true,
      targetDepartments: [],
      targetEvents: [{ eventId: "evt-1" }, { eventId: "evt-3" }],
    };
    expect(absenceCovers(absence, { eventId: "evt-1", eventDate, departmentId: "dept-1" })).toBe(true);
    expect(absenceCovers(absence, { eventId: "evt-2", eventDate, departmentId: "dept-1" })).toBe(false);
  });

  it("événement supprimé (eventId null en base) ne couvre plus rien", () => {
    const absence = {
      kind: "EVENTS" as const,
      startDate: null,
      endDate: null,
      allDepartments: true,
      targetDepartments: [],
      targetEvents: [{ eventId: null }],
    };
    expect(absenceCovers(absence, { eventId: "evt-1", eventDate, departmentId: "dept-1" })).toBe(false);
  });

  it("tous départements : couvre n'importe quel département dès que la date/l'événement correspond", () => {
    const absence = {
      kind: "PERIOD" as const,
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-10"),
      allDepartments: true,
      targetDepartments: [],
      targetEvents: [],
    };
    expect(absenceCovers(absence, { eventDate, departmentId: "dept-louange" })).toBe(true);
    expect(absenceCovers(absence, { eventDate, departmentId: "dept-accueil" })).toBe(true);
  });

  it("ciblage départemental : ne couvre que les départements visés", () => {
    const absence = {
      kind: "PERIOD" as const,
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-10"),
      allDepartments: false,
      targetDepartments: [{ departmentId: "dept-louange" }],
      targetEvents: [],
    };
    expect(absenceCovers(absence, { eventDate, departmentId: "dept-louange" })).toBe(true);
    expect(absenceCovers(absence, { eventDate, departmentId: "dept-accueil" })).toBe(false);
  });

  it("sans departmentId (ouverture/fermeture) : ne teste que l'axe « quand »", () => {
    const absence = {
      kind: "PERIOD" as const,
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-10"),
      allDepartments: false,
      targetDepartments: [{ departmentId: "dept-louange" }],
      targetEvents: [],
    };
    expect(absenceCovers(absence, { eventDate })).toBe(true);
  });
});

describe("effectiveDepartmentIds", () => {
  it("tous départements : suit l'appartenance courante, y compris un département rejoint après coup", () => {
    const absence = { allDepartments: true, targetDepartments: [] };
    expect(effectiveDepartmentIds(absence, ["dept-1", "dept-2", "dept-nouveau"])).toEqual([
      "dept-1",
      "dept-2",
      "dept-nouveau",
    ]);
  });

  it("ciblage explicite : s'arrête de s'appliquer à un département quitté", () => {
    const absence = { allDepartments: false, targetDepartments: [{ departmentId: "dept-1" }, { departmentId: "dept-2" }] };
    // Le membre a quitté dept-2 : n'appartient plus qu'à dept-1.
    expect(effectiveDepartmentIds(absence, ["dept-1"])).toEqual(["dept-1"]);
  });

  it("ciblage explicite : ne s'étend jamais à un département non coché", () => {
    const absence = { allDepartments: false, targetDepartments: [{ departmentId: "dept-1" }] };
    expect(effectiveDepartmentIds(absence, ["dept-1", "dept-nouveau"])).toEqual(["dept-1"]);
  });
});

describe("lastEffectiveDate", () => {
  it("période : renvoie endDate", () => {
    const endDate = new Date("2026-10-10");
    expect(lastEffectiveDate({ kind: "PERIOD", endDate, targetEvents: [] })).toBe(endDate);
  });

  it("événements : renvoie la plus tardive des dates encore existantes", () => {
    const result = lastEffectiveDate({
      kind: "EVENTS",
      endDate: null,
      targetEvents: [
        { eventId: "evt-1", eventDate: new Date("2026-10-06") },
        { eventId: "evt-2", eventDate: new Date("2026-10-13") },
      ],
    });
    expect(result).toEqual(new Date("2026-10-13"));
  });

  it("événements tous supprimés : renvoie null (aucun effet, non modifiable)", () => {
    const result = lastEffectiveDate({
      kind: "EVENTS",
      endDate: null,
      targetEvents: [{ eventId: null, eventDate: new Date("2026-10-06") }],
    });
    expect(result).toBeNull();
  });

  it("événements : ignore les événements supprimés pour calculer la dernière date", () => {
    const result = lastEffectiveDate({
      kind: "EVENTS",
      endDate: null,
      targetEvents: [
        { eventId: null, eventDate: new Date("2026-10-20") },
        { eventId: "evt-2", eventDate: new Date("2026-10-13") },
      ],
    });
    expect(result).toEqual(new Date("2026-10-13"));
  });
});

describe("validateTargeting", () => {
  const unscoped = { scoped: false, departmentIds: [] };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse (400) un département ciblé hors de l'appartenance du STAR", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ departmentId: "dept-1" }] as never);

    await expect(
      validateTargeting(prismaMock as never, {
        churchId: "church-1",
        memberId: "member-1",
        kind: "PERIOD",
        eventIds: [],
        allDepartments: false,
        departmentIds: ["dept-autre"],
        declarerScope: unscoped,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse (403) un département hors du périmètre d'un déclarant restreint", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ departmentId: "dept-1" }, { departmentId: "dept-2" }] as never);

    await expect(
      validateTargeting(prismaMock as never, {
        churchId: "church-1",
        memberId: "member-1",
        kind: "PERIOD",
        eventIds: [],
        allDepartments: false,
        departmentIds: ["dept-2"],
        declarerScope: { scoped: true, departmentIds: ["dept-1"] },
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuse (400) un événement d'une autre église", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ departmentId: "dept-1" }] as never);
    prismaMock.event.findMany.mockResolvedValue([]);

    await expect(
      validateTargeting(prismaMock as never, {
        churchId: "church-1",
        memberId: "member-1",
        kind: "EVENTS",
        eventIds: ["evt-autre-eglise"],
        allDepartments: true,
        departmentIds: [],
        declarerScope: unscoped,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse (400) un événement déjà passé", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ departmentId: "dept-1" }] as never);
    prismaMock.event.findMany.mockResolvedValue([
      {
        id: "evt-1",
        title: "Culte passé",
        date: new Date("2000-01-01"),
        eventDepts: [{ departmentId: "dept-1" }],
      },
    ] as never);

    await expect(
      validateTargeting(prismaMock as never, {
        churchId: "church-1",
        memberId: "member-1",
        kind: "EVENTS",
        eventIds: ["evt-1"],
        allDepartments: true,
        departmentIds: [],
        declarerScope: unscoped,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse (400) un événement sans département visé attendu", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ departmentId: "dept-louange" }] as never);
    prismaMock.event.findMany.mockResolvedValue([
      {
        id: "evt-1",
        title: "Culte",
        date: new Date("2099-01-01"),
        eventDepts: [{ departmentId: "dept-accueil" }],
      },
    ] as never);

    await expect(
      validateTargeting(prismaMock as never, {
        churchId: "church-1",
        memberId: "member-1",
        kind: "EVENTS",
        eventIds: ["evt-1"],
        allDepartments: false,
        departmentIds: ["dept-louange"],
        declarerScope: unscoped,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepte un événement où au moins un département visé est attendu (combinaison partielle sans effet, pas d'erreur)", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { departmentId: "dept-louange" },
      { departmentId: "dept-accueil" },
    ] as never);
    prismaMock.event.findMany.mockResolvedValue([
      {
        id: "evt-1",
        title: "Culte",
        date: new Date("2099-01-01"),
        eventDepts: [{ departmentId: "dept-accueil" }],
      },
    ] as never);

    await expect(
      validateTargeting(prismaMock as never, {
        churchId: "church-1",
        memberId: "member-1",
        kind: "EVENTS",
        eventIds: ["evt-1"],
        allDepartments: false,
        departmentIds: ["dept-louange", "dept-accueil"],
        declarerScope: unscoped,
      })
    ).resolves.toEqual({ events: [{ eventId: "evt-1", title: "Culte", date: new Date("2099-01-01") }] });
  });

  it("refuse (400) une déclaration sans dates ni ciblage événements/départements requis", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([] as never);

    await expect(
      validateTargeting(prismaMock as never, {
        churchId: "church-1",
        memberId: "member-1",
        kind: "EVENTS",
        eventIds: [],
        allDepartments: true,
        departmentIds: [],
        declarerScope: unscoped,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("listTargetOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marque non sélectionnables les départements hors du périmètre d'un déclarant restreint", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { department: { id: "dept-1", name: "Louange" } },
      { department: { id: "dept-2", name: "Accueil" } },
    ] as never);
    prismaMock.event.findMany.mockResolvedValue([]);

    const result = await listTargetOptions(prismaMock as never, "church-1", "member-1", {
      scoped: true,
      departmentIds: ["dept-1"],
    });

    expect(result.departments).toEqual([
      { id: "dept-1", name: "Louange", selectable: true },
      { id: "dept-2", name: "Accueil", selectable: false },
    ]);
  });

  it("exclut les parents de série des événements proposés", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ department: { id: "dept-1", name: "Louange" } }] as never);
    prismaMock.event.findMany.mockResolvedValue([
      { id: "evt-1", title: "Culte", date: new Date("2099-01-01"), eventDepts: [{ departmentId: "dept-1" }] },
    ] as never);

    const result = await listTargetOptions(prismaMock as never, "church-1", "member-1", {
      scoped: false,
      departmentIds: [],
    });

    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isRecurrenceParent: false }) })
    );
    expect(result.events).toEqual([{ id: "evt-1", title: "Culte", date: new Date("2099-01-01"), departmentIds: ["dept-1"] }]);
  });

  it("ne requête pas les événements si le STAR n'a aucun département", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);

    const result = await listTargetOptions(prismaMock as never, "church-1", "member-1", {
      scoped: false,
      departmentIds: [],
    });

    expect(result).toEqual({ departments: [], events: [] });
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });
});
