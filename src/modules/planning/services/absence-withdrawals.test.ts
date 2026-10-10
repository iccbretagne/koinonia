import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

/**
 * Spec 062 : branchement des désistements de service dans les services d'absence (déclaration,
 * modification, annulation). La mécanique des désistements est testée dans
 * `withdrawals/__tests__/absence.test.ts` ; ici, l'ordre, les paramètres et les bilans.
 */

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const withdrawForAbsence = vi.fn();
const cancelAbsenceWithdrawals = vi.fn();
const sendAbsenceWithdrawalNotices = vi.fn().mockResolvedValue(undefined);
vi.mock("./withdrawals/absence", () => ({
  withdrawForAbsence: (...a: unknown[]) => withdrawForAbsence(...a),
  cancelAbsenceWithdrawals: (...a: unknown[]) => cancelAbsenceWithdrawals(...a),
  sendAbsenceWithdrawalNotices: (...a: unknown[]) => sendAbsenceWithdrawalNotices(...a),
}));

const { declareAbsence, updateAbsence, cancelAbsence } = await import("./absence.service");

const notificationTypes = () =>
  prismaMock.notification.createMany.mock.calls.flatMap((c) => (c[0] as { data: { type: string }[] }).data.map((d) => d.type));

const absence = {
  id: "abs-1",
  churchId: "church-1",
  memberId: "paul",
  kind: "PERIOD",
  startDate: new Date("2026-11-07T00:00:00Z"),
  endDate: new Date("2026-11-20T00:00:00Z"),
  allDepartments: true,
  reason: null,
  status: "ACTIVE",
  createdById: "u-paul",
  targetDepartments: [],
  targetEvents: [],
  member: { firstName: "Paul", lastName: "Martin" },
  backups: [],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T10:00:00Z"));
  vi.clearAllMocks();
  prismaMock.member.findUnique.mockResolvedValue({ firstName: "Paul", lastName: "Martin" } as never);
  prismaMock.absence.create.mockResolvedValue(absence as never);
  prismaMock.absence.findUnique.mockResolvedValue(absence as never);
  prismaMock.planning.findMany.mockResolvedValue([]);
  prismaMock.memberDepartment.findMany.mockResolvedValue([{ department: { id: "dept-1", ministryId: "min-1" } }] as never);
  prismaMock.userDepartment.findMany.mockResolvedValue([{ userChurchRole: { userId: "u-marie" } }] as never);
  prismaMock.userChurchRole.findMany.mockResolvedValue([]);
  prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "u-paul" }] as never);
  prismaMock.memberUserLink.findFirst.mockResolvedValue({ id: "link" } as never);
  prismaMock.notification.createMany.mockResolvedValue({} as never);
  withdrawForAbsence.mockResolvedValue([]);
  cancelAbsenceWithdrawals.mockResolvedValue({ cancelled: [], kept: [] });
});

afterEach(() => vi.useRealTimers());

const declare = (createdById = "u-paul") =>
  declareAbsence({ churchId: "church-1", memberId: "paul", startDate: absence.startDate, endDate: absence.endDate, createdById });

describe("declareAbsence — désistements (spec 062)", () => {
  it("désiste les services couverts avant de calculer les conflits, et renvoie le bilan", async () => {
    withdrawForAbsence.mockResolvedValue(["w-8", "w-15"]);

    const result = await declare();

    expect(withdrawForAbsence).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ absenceId: "abs-1", churchId: "church-1", memberId: "paul", actorId: "u-paul", targeting: expect.objectContaining({ kind: "PERIOD", allDepartments: true }) }),
      expect.any(Date)
    );
    const conflictLookup = prismaMock.planning.findMany.mock.invocationCallOrder[0];
    expect(withdrawForAbsence.mock.invocationCallOrder[0]).toBeLessThan(conflictLookup);
    expect(result).toMatchObject({ id: "abs-1", withdrawalCount: 2, cancelledWithdrawalCount: 0 });
    expect(sendAbsenceWithdrawalNotices).toHaveBeenCalledWith(
      expect.objectContaining({ absenceId: "abs-1", created: ["w-8", "w-15"], thirdParty: false }),
      undefined,
      expect.any(Date)
    );
  });

  it("services désistés : plus d'alerte de conflit, « Absence déclarée » toujours envoyée", async () => {
    withdrawForAbsence.mockResolvedValue(["w-8"]);
    await declare();
    expect(notificationTypes()).toContain("ABSENCE_DECLARED");
    expect(notificationTypes()).not.toContain("ABSENCE_CONFLICT");
  });

  it("services restés en place (échéance passée) : alerte de conflit pour eux", async () => {
    prismaMock.planning.findMany.mockResolvedValue([
      { eventDepartment: { departmentId: "dept-1", event: { id: "evt-8", title: "Culte", date: new Date("2026-11-08T10:00:00Z") } } },
    ] as never);
    await declare();
    expect(notificationTypes()).toContain("ABSENCE_CONFLICT");
  });

  it("déclarée par un tiers : le STAR sera informé", async () => {
    prismaMock.memberUserLink.findFirst.mockResolvedValue(null);
    withdrawForAbsence.mockResolvedValue(["w-8"]);
    await declare("u-marie");
    expect(sendAbsenceWithdrawalNotices).toHaveBeenCalledWith(expect.objectContaining({ thirdParty: true, actorId: "u-marie" }), undefined, expect.any(Date));
  });
});

describe("updateAbsence — désistements (spec 062)", () => {
  it("raccourcie : annule ce qui n'est plus couvert (uniquement ce que la modification découvre), puis désiste le nouveau ciblage", async () => {
    cancelAbsenceWithdrawals.mockResolvedValue({ cancelled: ["w-15"], kept: [] });
    prismaMock.absence.update.mockResolvedValue({ ...absence, endDate: new Date("2026-11-10T00:00:00Z") } as never);

    const result = await updateAbsence({ absenceId: "abs-1", churchId: "church-1", updatedById: "u-paul", endDate: new Date("2026-11-10T00:00:00Z") });

    const { keep } = cancelAbsenceWithdrawals.mock.calls[0][1] as { keep: (w: { eventId: string; eventDate: Date; departmentId: string }) => boolean };
    const svc = (date: string) => ({ eventId: "e", eventDate: new Date(date), departmentId: "dept-1" });
    expect(keep(svc("2026-11-08T10:00:00Z"))).toBe(true); // encore couvert
    expect(keep(svc("2026-11-15T10:00:00Z"))).toBe(false); // découvert par la modification
    expect(keep(svc("2026-11-25T10:00:00Z"))).toBe(true); // hors de l'ancien ciblage : intouché
    expect(withdrawForAbsence).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ absenceId: "abs-1", targeting: expect.objectContaining({ endDate: new Date("2026-11-10T00:00:00Z") }) }),
      expect.any(Date)
    );
    expect(result).toMatchObject({ withdrawalCount: 0, cancelledWithdrawalCount: 1 });
    expect(sendAbsenceWithdrawalNotices).toHaveBeenCalledWith(expect.objectContaining({ cancelled: ["w-15"] }), undefined, expect.any(Date));
  });

  it("prolongée : crée les désistements des nouveaux services", async () => {
    withdrawForAbsence.mockResolvedValue(["w-22"]);
    prismaMock.absence.update.mockResolvedValue({ ...absence, endDate: new Date("2026-11-30T00:00:00Z") } as never);
    const result = await updateAbsence({ absenceId: "abs-1", churchId: "church-1", updatedById: "u-paul", endDate: new Date("2026-11-30T00:00:00Z") });
    expect(result).toMatchObject({ withdrawalCount: 1 });
  });

  it("motif seul : aucun désistement touché, aucune notification de désistement", async () => {
    prismaMock.absence.update.mockResolvedValue({ ...absence, reason: "congés" } as never);
    await updateAbsence({ absenceId: "abs-1", churchId: "church-1", updatedById: "u-paul", reason: "congés" });
    expect(cancelAbsenceWithdrawals).not.toHaveBeenCalled();
    expect(withdrawForAbsence).not.toHaveBeenCalled();
    expect(sendAbsenceWithdrawalNotices).not.toHaveBeenCalled();
  });
});

describe("cancelAbsence — désistements (spec 062)", () => {
  it("annule tous les désistements en attente de l'absence et informe des services conservés", async () => {
    const kept = [{ eventDate: new Date("2026-11-08T10:00:00Z"), departmentName: "Choristes", replacementName: "Léa Bernard" }];
    cancelAbsenceWithdrawals.mockResolvedValue({ cancelled: ["w-15"], kept });
    prismaMock.absence.update.mockResolvedValue({ ...absence, status: "CANCELLED" } as never);

    const result = await cancelAbsence({ absenceId: "abs-1", churchId: "church-1", cancelledById: "u-paul" });

    expect(cancelAbsenceWithdrawals).toHaveBeenCalledWith(prismaMock, { absenceId: "abs-1", actorId: "u-paul" }, expect.any(Date));
    expect(result).toMatchObject({ status: "CANCELLED", cancelledWithdrawalCount: 1 });
    expect(sendAbsenceWithdrawalNotices).toHaveBeenCalledWith(
      expect.objectContaining({ created: [], cancelled: ["w-15"], kept }),
      undefined,
      expect.any(Date)
    );
  });
});
