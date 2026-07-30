import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const {
  declareAbsence,
  cancelAbsence,
  updateAbsence,
  findAbsenceConflicts,
  resolveResponsibleUserIds,
  validateBackupTargets,
} = await import("@/modules/planning");
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
    backups: [],
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

describe("declareAbsence avec backups", () => {
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
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);
    prismaMock.userDepartment.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.planning.findMany.mockResolvedValue([]);
    prismaMock.absenceBackup.createMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.notification.create.mockResolvedValue({} as never);
  });

  it("crée les AbsenceBackup et notifie un backup STAR lié à un compte", async () => {
    prismaMock.memberUserLink.findMany.mockImplementation(({ where }: never) =>
      Promise.resolve((where as { memberId: string }).memberId === "member-backup" ? [{ userId: "user-backup" }] : [])
    );

    await declareAbsence({ ...baseParams, backups: [{ type: "STAR", memberId: "member-backup" }] });

    expect(prismaMock.absenceBackup.createMany).toHaveBeenCalledWith({
      data: [{ absenceId: "abs-1", type: "STAR", memberId: "member-backup", userChurchRoleId: null }],
    });
    expect(notificationsOfType("ABSENCE_BACKUP_ASSIGNED").map((n) => n.userId)).toEqual(["user-backup"]);
  });

  it("ne notifie personne pour un backup STAR sans compte lié (silencieux)", async () => {
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);

    await declareAbsence({ ...baseParams, backups: [{ type: "STAR", memberId: "member-backup" }] });

    expect(notificationsOfType("ABSENCE_BACKUP_ASSIGNED")).toHaveLength(0);
  });

  it("crée un AbsenceBackup RESPONSIBLE et notifie directement le user cible", async () => {
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findUnique.mockResolvedValue({ userId: "user-minister-backup" } as never);

    await declareAbsence({ ...baseParams, backups: [{ type: "RESPONSIBLE", userChurchRoleId: "role-1" }] });

    expect(prismaMock.absenceBackup.createMany).toHaveBeenCalledWith({
      data: [{ absenceId: "abs-1", type: "RESPONSIBLE", memberId: null, userChurchRoleId: "role-1" }],
    });
    expect(notificationsOfType("ABSENCE_BACKUP_ASSIGNED").map((n) => n.userId)).toEqual(["user-minister-backup"]);
  });

  it("ne crée aucun AbsenceBackup sans backups fournis (non-régression)", async () => {
    await declareAbsence(baseParams);

    expect(prismaMock.absenceBackup.createMany).not.toHaveBeenCalled();
    expect(notificationsOfType("ABSENCE_BACKUP_ASSIGNED")).toHaveLength(0);
  });
});

describe("validateBackupTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse (403) si le déclarant n'a ni rôle Resp. département ni Ministre", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);

    await expect(
      validateBackupTargets("user-star-only", "church-1", [{ type: "STAR", memberId: "member-x" }])
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("autorise un backup STAR appartenant au département du Resp. département déclarant", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "DEPARTMENT_HEAD", ministryId: null, departments: [{ departmentId: "dept-1" }] },
    ] as never);
    prismaMock.member.findUnique.mockResolvedValue({
      departments: [{ department: { id: "dept-1", ministry: { churchId: "church-1" } } }],
    } as never);

    await expect(
      validateBackupTargets("user-resp", "church-1", [{ type: "STAR", memberId: "member-x" }])
    ).resolves.toBeUndefined();
  });

  it("refuse un backup STAR hors du périmètre du Resp. département déclarant", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "DEPARTMENT_HEAD", ministryId: null, departments: [{ departmentId: "dept-1" }] },
    ] as never);
    prismaMock.member.findUnique.mockResolvedValue({
      departments: [{ department: { id: "dept-other", ministry: { churchId: "church-1" } } }],
    } as never);

    await expect(
      validateBackupTargets("user-resp", "church-1", [{ type: "STAR", memberId: "member-x" }])
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("un Resp. département peut désigner le Ministre de son ministère en backup", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "DEPARTMENT_HEAD", ministryId: null, departments: [{ departmentId: "dept-1" }] },
    ] as never);
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      userId: "user-minister",
      role: "MINISTER",
      churchId: "church-1",
      ministryId: "min-1",
      departments: [],
    } as never);
    prismaMock.department.findMany.mockResolvedValue([{ ministryId: "min-1" }] as never);

    await expect(
      validateBackupTargets("user-resp", "church-1", [{ type: "RESPONSIBLE", userChurchRoleId: "role-min" }])
    ).resolves.toBeUndefined();
  });

  it("un Resp. département peut désigner un autre Resp. département du même ministère", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "DEPARTMENT_HEAD", ministryId: null, departments: [{ departmentId: "dept-1" }] },
    ] as never);
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      userId: "user-peer",
      role: "DEPARTMENT_HEAD",
      churchId: "church-1",
      ministryId: null,
      departments: [{ department: { ministryId: "min-1" } }],
    } as never);
    prismaMock.department.findMany.mockResolvedValue([{ ministryId: "min-1" }] as never);

    await expect(
      validateBackupTargets("user-resp", "church-1", [{ type: "RESPONSIBLE", userChurchRoleId: "role-peer" }])
    ).resolves.toBeUndefined();
  });

  it("refuse un Resp. département d'un autre ministère que le déclarant", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "DEPARTMENT_HEAD", ministryId: null, departments: [{ departmentId: "dept-1" }] },
    ] as never);
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      userId: "user-other",
      role: "DEPARTMENT_HEAD",
      churchId: "church-1",
      ministryId: null,
      departments: [{ department: { ministryId: "min-2" } }],
    } as never);
    prismaMock.department.findMany.mockResolvedValue([{ ministryId: "min-1" }] as never);

    await expect(
      validateBackupTargets("user-resp", "church-1", [{ type: "RESPONSIBLE", userChurchRoleId: "role-other" }])
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("un Ministre peut désigner un autre Ministre en backup", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "MINISTER", ministryId: "min-1", departments: [] },
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      userId: "user-minister-2",
      role: "MINISTER",
      churchId: "church-1",
      ministryId: "min-2",
      departments: [],
    } as never);

    await expect(
      validateBackupTargets("user-min", "church-1", [{ type: "RESPONSIBLE", userChurchRoleId: "role-min2" }])
    ).resolves.toBeUndefined();
  });

  it("refuse qu'un Ministre se désigne lui-même en backup", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "MINISTER", ministryId: "min-1", departments: [] },
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      userId: "user-min",
      role: "MINISTER",
      churchId: "church-1",
      ministryId: "min-1",
      departments: [],
    } as never);

    await expect(
      validateBackupTargets("user-min", "church-1", [{ type: "RESPONSIBLE", userChurchRoleId: "role-self" }])
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuse qu'un Ministre désigne un Resp. département en backup", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { role: "MINISTER", ministryId: "min-1", departments: [] },
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findUnique.mockResolvedValue({
      userId: "user-depthead",
      role: "DEPARTMENT_HEAD",
      churchId: "church-1",
      ministryId: null,
      departments: [{ department: { ministryId: "min-1" } }],
    } as never);

    await expect(
      validateBackupTargets("user-min", "church-1", [{ type: "RESPONSIBLE", userChurchRoleId: "role-depthead" }])
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("cancelAbsence notifie les backups", () => {
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
    backups: [
      { type: "STAR", memberId: "member-backup", userChurchRoleId: null },
      { type: "RESPONSIBLE", memberId: null, userChurchRoleId: "role-1" },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    planningBus.clear();
    prismaMock.absence.findUnique.mockResolvedValue(existingAbsence as never);
    prismaMock.absence.update.mockResolvedValue({ ...existingAbsence, status: "CANCELLED" } as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);
    prismaMock.userDepartment.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.planning.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockResolvedValue({} as never);
  });

  it("notifie les backups STAR et RESPONSIBLE de l'absence annulée", async () => {
    prismaMock.memberUserLink.findMany.mockImplementation(({ where }: never) =>
      Promise.resolve((where as { memberId: string }).memberId === "member-backup" ? [{ userId: "user-backup" }] : [])
    );
    prismaMock.userChurchRole.findUnique.mockResolvedValue({ userId: "user-responsible-backup" } as never);

    await cancelAbsence({ absenceId: "abs-1", churchId: "church-1", cancelledById: "user-1" });

    expect(new Set(notifiedUserIds())).toEqual(new Set(["user-backup", "user-responsible-backup"]));
  });
});

describe("updateAbsence", () => {
  const existingAbsence = {
    id: "abs-1",
    churchId: "church-1",
    memberId: "member-1",
    startDate: new Date("2026-09-01"),
    endDate: new Date("2026-09-10"),
    reason: null,
    status: "ACTIVE",
    createdById: "user-1",
    cancelledById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledAt: null,
    member: { firstName: "Jean", lastName: "Dupont" },
    backups: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    planningBus.clear();
    prismaMock.absence.findUnique.mockResolvedValue(existingAbsence as never);
    prismaMock.absence.update.mockResolvedValue({ ...existingAbsence, startDate: new Date("2026-09-02") } as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([]);
    prismaMock.userDepartment.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
    prismaMock.planning.findMany.mockResolvedValue([]);
    prismaMock.absenceBackup.deleteMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.absenceBackup.createMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.notification.create.mockResolvedValue({} as never);
  });

  it("modifie la période et notifie ABSENCE_UPDATED", async () => {
    await updateAbsence({
      absenceId: "abs-1",
      churchId: "church-1",
      updatedById: "user-1",
      startDate: new Date("2026-09-02"),
      endDate: new Date("2026-09-12"),
    });

    expect(prismaMock.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { startDate: new Date("2026-09-02"), endDate: new Date("2026-09-12") },
    });
  });

  it("notifie les backups déjà notifiés à la déclaration initiale (backups inchangés)", async () => {
    prismaMock.absence.findUnique.mockResolvedValue({
      ...existingAbsence,
      backups: [{ type: "STAR", memberId: "member-backup", userChurchRoleId: null }],
    } as never);
    prismaMock.memberUserLink.findMany.mockImplementation(({ where }: never) =>
      Promise.resolve((where as { memberId: string }).memberId === "member-backup" ? [{ userId: "user-backup" }] : [])
    );

    await updateAbsence({
      absenceId: "abs-1",
      churchId: "church-1",
      updatedById: "user-1",
      reason: "nouveau motif",
    });

    expect(notificationsOfType("ABSENCE_UPDATED").map((n) => n.userId)).toEqual(["user-backup"]);
  });

  it("notifie ABSENCE_CONFLICT si un nouveau conflit apparaît suite à la modification", async () => {
    prismaMock.planning.findMany
      .mockResolvedValueOnce([]) // conflits avant (période actuelle)
      .mockResolvedValueOnce([
        { eventDepartment: { departmentId: "dept-1", event: { id: "evt-1", title: "Culte", date: new Date("2026-09-05") } } },
      ] as never); // conflits après (nouvelle période)
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "user-star" }] as never);

    await updateAbsence({
      absenceId: "abs-1",
      churchId: "church-1",
      updatedById: "user-1",
      startDate: new Date("2026-09-02"),
      endDate: new Date("2026-09-12"),
    });

    expect(notificationsOfType("ABSENCE_CONFLICT")).toHaveLength(1);
  });

  it("refuse (409) une absence déjà passée", async () => {
    prismaMock.absence.findUnique.mockResolvedValue({
      ...existingAbsence,
      endDate: new Date("2020-01-01"),
    } as never);

    await expect(
      updateAbsence({ absenceId: "abs-1", churchId: "church-1", updatedById: "user-1", reason: "x" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuse (400) une nouvelle date de début antérieure à celle déjà enregistrée si l'absence est en cours", async () => {
    prismaMock.absence.findUnique.mockResolvedValue({
      ...existingAbsence,
      startDate: new Date("2020-01-01"), // déjà commencée
      endDate: new Date("2027-01-01"), // pas encore terminée
    } as never);

    await expect(
      updateAbsence({
        absenceId: "abs-1",
        churchId: "church-1",
        updatedById: "user-1",
        startDate: new Date("2019-01-01"),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("remplace intégralement les backups quand une nouvelle liste est fournie", async () => {
    prismaMock.userChurchRole.findUnique.mockResolvedValue({ userId: "user-new-backup" } as never);

    await updateAbsence({
      absenceId: "abs-1",
      churchId: "church-1",
      updatedById: "user-1",
      backups: [{ type: "RESPONSIBLE", userChurchRoleId: "role-new" }],
    });

    expect(prismaMock.absenceBackup.deleteMany).toHaveBeenCalledWith({ where: { absenceId: "abs-1" } });
    expect(prismaMock.absenceBackup.createMany).toHaveBeenCalledWith({
      data: [{ absenceId: "abs-1", type: "RESPONSIBLE", memberId: null, userChurchRoleId: "role-new" }],
    });
  });

  it("laisse les backups inchangés quand `backups` est omis", async () => {
    await updateAbsence({ absenceId: "abs-1", churchId: "church-1", updatedById: "user-1", reason: "x" });

    expect(prismaMock.absenceBackup.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.absenceBackup.createMany).not.toHaveBeenCalled();
  });
});
