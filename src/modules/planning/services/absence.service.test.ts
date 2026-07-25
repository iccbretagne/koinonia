import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { declareAbsence, cancelAbsence, findAbsenceConflicts, resolveResponsibleUserIds } =
  await import("@/modules/planning");
const { planningBus } = await import("@/modules/planning");

function notifiedUserIds() {
  return prismaMock.notification.create.mock.calls.map((c) => (c[0] as { data: { userId: string } }).data.userId);
}

function notificationsOfType(type: string) {
  return prismaMock.notification.create.mock.calls
    .map((c) => (c[0] as { data: { userId: string; type: string } }).data)
    .filter((d) => d.type === type);
}

describe("findAbsenceConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne détecte aucun conflit quand aucun service ne chevauche la période", async () => {
    prismaMock.planning.findMany.mockResolvedValue([]);

    const conflicts = await findAbsenceConflicts(
      "member-1",
      "church-1",
      new Date("2026-08-01"),
      new Date("2026-08-10")
    );

    expect(conflicts).toEqual([]);
  });

  it("ne filtre que sur EN_SERVICE / EN_SERVICE_DEBRIEF", async () => {
    prismaMock.planning.findMany.mockResolvedValue([]);

    await findAbsenceConflicts("member-1", "church-1", new Date("2026-08-01"), new Date("2026-08-10"));

    expect(prismaMock.planning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] },
        }),
      })
    );
  });

  it("retourne les conflits détectés avec les infos de l'événement", async () => {
    const eventDate = new Date("2026-08-05");
    prismaMock.planning.findMany.mockResolvedValue([
      { eventDepartment: { departmentId: "dept-1", event: { id: "evt-1", title: "Culte", date: eventDate } } },
    ] as never);

    const conflicts = await findAbsenceConflicts(
      "member-1",
      "church-1",
      new Date("2026-08-01"),
      new Date("2026-08-10")
    );

    expect(conflicts).toEqual([{ eventId: "evt-1", title: "Culte", date: eventDate, departmentId: "dept-1" }]);
  });
});

describe("resolveResponsibleUserIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne un tableau vide si le membre n'a aucun département", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);

    const ids = await resolveResponsibleUserIds("member-1", "church-1");

    expect(ids).toEqual([]);
    expect(prismaMock.userDepartment.findMany).not.toHaveBeenCalled();
  });

  it("dédoublonne un utilisateur qui cumule Resp. département et Ministre", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { department: { id: "dept-1", ministryId: "min-1" } },
      { department: { id: "dept-2", ministryId: "min-2" } },
    ] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { userChurchRole: { userId: "user-resp1" } },
    ] as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { userId: "user-resp1" },
      { userId: "user-resp2" },
    ] as never);

    const ids = await resolveResponsibleUserIds("member-1", "church-1");

    expect(new Set(ids)).toEqual(new Set(["user-resp1", "user-resp2"]));
    expect(ids.length).toBe(2);
  });

  it("scope systématiquement les requêtes sur le churchId fourni (pas de fuite cross-église)", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { department: { id: "dept-1", ministryId: "min-1" } },
    ] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([] as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([] as never);

    await resolveResponsibleUserIds("member-1", "church-A");

    expect(prismaMock.userDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userChurchRole: expect.objectContaining({ churchId: "church-A" }) }),
      })
    );
    expect(prismaMock.userChurchRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) })
    );
  });
});

describe("declareAbsence", () => {
  const baseParams = {
    churchId: "church-1",
    memberId: "member-1",
    startDate: new Date("2026-08-01"),
    endDate: new Date("2026-08-10"),
    reason: null,
    createdById: "user-1",
  };

  const createdAbsence = {
    id: "abs-1",
    churchId: "church-1",
    memberId: "member-1",
    startDate: baseParams.startDate,
    endDate: baseParams.endDate,
    reason: null,
    status: "ACTIVE",
    createdById: "user-1",
    cancelledById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    planningBus.clear();
    prismaMock.member.findUnique.mockResolvedValue({ firstName: "Jean", lastName: "Dupont" } as never);
    prismaMock.absence.create.mockResolvedValue(createdAbsence as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { department: { id: "dept-1", ministryId: "min-1" } },
      { department: { id: "dept-2", ministryId: "min-2" } },
    ] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { userChurchRole: { userId: "user-resp1" } },
    ] as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { userId: "user-resp1" },
      { userId: "user-resp2" },
    ] as never);
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "user-star" }] as never);
    prismaMock.notification.create.mockResolvedValue({} as never);
  });

  it("crée l'absence et retourne l'enregistrement créé", async () => {
    prismaMock.planning.findMany.mockResolvedValue([]);

    const result = await declareAbsence(baseParams);

    expect(result).toEqual(createdAbsence);
  });

  it("notifie tous les responsables de tous les départements sans doublon (sans conflit)", async () => {
    prismaMock.planning.findMany.mockResolvedValue([]);

    await declareAbsence(baseParams);

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(2);
    expect(new Set(notifiedUserIds())).toEqual(new Set(["user-resp1", "user-resp2"]));
    expect(notificationsOfType("ABSENCE_CONFLICT")).toHaveLength(0);
  });

  it("notifie en plus le STAR quand un conflit est détecté", async () => {
    prismaMock.planning.findMany.mockResolvedValue([
      { eventDepartment: { departmentId: "dept-1", event: { id: "evt-1", title: "Culte", date: new Date("2026-08-05") } } },
    ] as never);

    await declareAbsence(baseParams);

    const declared = notificationsOfType("ABSENCE_DECLARED");
    const conflicts = notificationsOfType("ABSENCE_CONFLICT");

    expect(declared).toHaveLength(2); // resp1, resp2
    expect(new Set(conflicts.map((c) => c.userId))).toEqual(new Set(["user-resp1", "user-resp2", "user-star"]));
  });

  it("émet planning:absence:declared avec hasConflict à jour", async () => {
    prismaMock.planning.findMany.mockResolvedValue([
      { eventDepartment: { departmentId: "dept-1", event: { id: "evt-1", title: "Culte", date: new Date("2026-08-05") } } },
    ] as never);
    const handler = vi.fn();
    planningBus.on("planning:absence:declared", handler);

    await declareAbsence(baseParams);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]).toMatchObject({ memberId: "member-1", hasConflict: true });
  });

  it("lève une ApiError 404 si la fiche STAR est introuvable", async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);

    await expect(declareAbsence(baseParams)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("cancelAbsence", () => {
  const existingAbsence = {
    id: "abs-1",
    churchId: "church-1",
    memberId: "member-1",
    startDate: new Date("2026-08-01"),
    endDate: new Date("2026-08-10"),
    reason: null,
    status: "ACTIVE",
    createdById: "user-1",
    cancelledById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledAt: null,
    member: { firstName: "Jean", lastName: "Dupont" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    planningBus.clear();
    prismaMock.absence.findUnique.mockResolvedValue(existingAbsence as never);
    prismaMock.absence.update.mockResolvedValue({ ...existingAbsence, status: "CANCELLED" } as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { department: { id: "dept-1", ministryId: "min-1" } },
    ] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { userChurchRole: { userId: "user-resp1" } },
    ] as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([] as never);
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "user-star" }] as never);
    prismaMock.notification.create.mockResolvedValue({} as never);
  });

  it("notifie systématiquement les responsables déjà notifiés à la déclaration", async () => {
    prismaMock.planning.findMany.mockResolvedValue([]); // pas de conflit préalable

    await cancelAbsence({ absenceId: "abs-1", churchId: "church-1", cancelledById: "user-1" });

    expect(new Set(notifiedUserIds())).toEqual(new Set(["user-resp1"]));
  });

  it("notifie aussi le STAR si un conflit préexistait", async () => {
    prismaMock.planning.findMany.mockResolvedValue([
      { eventDepartment: { departmentId: "dept-1", event: { id: "evt-1", title: "Culte", date: new Date("2026-08-05") } } },
    ] as never);

    await cancelAbsence({ absenceId: "abs-1", churchId: "church-1", cancelledById: "user-1" });

    expect(new Set(notifiedUserIds())).toEqual(new Set(["user-resp1", "user-star"]));
  });

  it("refuse (403) si l'absence n'appartient pas à cette église", async () => {
    prismaMock.absence.findUnique.mockResolvedValue({ ...existingAbsence, churchId: "church-other" } as never);

    await expect(
      cancelAbsence({ absenceId: "abs-1", churchId: "church-1", cancelledById: "user-1" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuse (409) si l'absence est déjà annulée", async () => {
    prismaMock.absence.findUnique.mockResolvedValue({ ...existingAbsence, status: "CANCELLED" } as never);

    await expect(
      cancelAbsence({ absenceId: "abs-1", churchId: "church-1", cancelledById: "user-1" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("lève une ApiError 404 si l'absence est introuvable", async () => {
    prismaMock.absence.findUnique.mockResolvedValue(null);

    await expect(
      cancelAbsence({ absenceId: "unknown", churchId: "church-1", cancelledById: "user-1" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
