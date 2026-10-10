import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
const createWithdrawal = vi.fn();
const sendWithdrawalNotice = vi.fn().mockResolvedValue(undefined);
vi.mock("../withdraw", () => ({
  createWithdrawal: (...a: unknown[]) => createWithdrawal(...a),
  sendWithdrawalNotice: (...a: unknown[]) => sendWithdrawalNotice(...a),
}));
const cancelPendingWithdrawal = vi.fn().mockResolvedValue(undefined);
vi.mock("../resolve", () => ({ cancelPendingWithdrawal: (...a: unknown[]) => cancelPendingWithdrawal(...a) }));
const resolveWithdrawalRecipients = vi.fn().mockResolvedValue(["marie"]);
vi.mock("../recipients", () => ({ resolveWithdrawalRecipients: (...a: unknown[]) => resolveWithdrawalRecipients(...a) }));

const { findWithdrawableServicesForAbsence, withdrawForAbsence, cancelAbsenceWithdrawals, sendAbsenceWithdrawalNotices } =
  await import("../absence");

const now = new Date("2026-11-04T10:00:00Z");
const period = {
  kind: "PERIOD" as const,
  startDate: new Date("2026-11-07T00:00:00Z"),
  endDate: new Date("2026-11-20T00:00:00Z"),
  allDepartments: true,
};

const planned = (eventId: string, date: string, deadline: string | null, departmentId = "dept-1", name = "Choristes") => ({
  eventDepartment: {
    departmentId,
    department: { name },
    event: { id: eventId, title: "Culte", date: new Date(date), planningDeadline: deadline ? new Date(deadline) : null },
  },
});

describe("findWithdrawableServicesForAbsence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([]);
  });

  it("services planifiés couverts (remplaçant compris), à venir, triés par date", async () => {
    prismaMock.planning.findMany.mockResolvedValue([
      planned("evt-15", "2026-11-15T10:00:00Z", "2026-11-12T20:00:00Z", "dept-2", "Musiciens"),
      planned("evt-8", "2026-11-08T10:00:00Z", "2026-11-05T20:00:00Z"),
    ] as never);

    const services = await findWithdrawableServicesForAbsence(prismaMock as never, { memberId: "paul", churchId: "church-1", targeting: period }, now);

    expect(services.map((s) => [s.eventId, s.departmentName])).toEqual([
      ["evt-8", "Choristes"],
      ["evt-15", "Musiciens"],
    ]);
    expect(prismaMock.planning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberId: "paul",
          status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"] },
          eventDepartment: {
            event: { AND: [{ churchId: "church-1", date: { gt: now } }, { date: { gte: period.startDate, lte: period.endDate } }] },
          },
        }),
      })
    );
  });

  it("exclut un service dont la date limite est passée", async () => {
    prismaMock.planning.findMany.mockResolvedValue([planned("evt-8", "2026-11-08T10:00:00Z", "2026-11-03T20:00:00Z")] as never);
    expect(await findWithdrawableServicesForAbsence(prismaMock as never, { memberId: "paul", churchId: "church-1", targeting: period }, now)).toEqual([]);
  });

  it("exclut un service déjà désisté en attente", async () => {
    prismaMock.planning.findMany.mockResolvedValue([
      planned("evt-8", "2026-11-08T10:00:00Z", null),
      planned("evt-15", "2026-11-15T10:00:00Z", null),
    ] as never);
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([{ eventId: "evt-8", departmentId: "dept-1" }] as never);
    const services = await findWithdrawableServicesForAbsence(prismaMock as never, { memberId: "paul", churchId: "church-1", targeting: period }, now);
    expect(services.map((s) => s.eventId)).toEqual(["evt-15"]);
  });

  it("restreint aux départements visés", async () => {
    prismaMock.planning.findMany.mockResolvedValue([]);
    await findWithdrawableServicesForAbsence(
      prismaMock as never,
      { memberId: "paul", churchId: "church-1", targeting: { ...period, allDepartments: false, departmentIds: ["dept-2"] } },
      now
    );
    expect(prismaMock.planning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventDepartment: expect.objectContaining({ departmentId: { in: ["dept-2"] } }) }),
      })
    );
  });
});

describe("withdrawForAbsence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([]);
  });

  it("un désistement par service, portant l'absence et sans réponse écrite", async () => {
    prismaMock.planning.findMany.mockResolvedValue([
      planned("evt-8", "2026-11-08T10:00:00Z", null),
      planned("evt-15", "2026-11-15T10:00:00Z", null, "dept-2", "Musiciens"),
    ] as never);
    createWithdrawal.mockResolvedValueOnce("w-8").mockResolvedValueOnce("w-15");

    const ids = await withdrawForAbsence(
      prismaMock as never,
      { absenceId: "abs-1", churchId: "church-1", memberId: "paul", actorId: "u-paul", targeting: period },
      now
    );

    expect(ids).toEqual(["w-8", "w-15"]);
    expect(createWithdrawal).toHaveBeenCalledWith(
      { churchId: "church-1", eventId: "evt-15", departmentId: "dept-2", memberId: "paul", actorId: "u-paul" },
      prismaMock,
      now,
      { absenceId: "abs-1", recordResponse: false }
    );
  });
});

describe("cancelAbsenceWithdrawals", () => {
  beforeEach(() => vi.clearAllMocks());

  const row = (id: string, status: string, date: string, extra: Record<string, unknown> = {}) => ({
    id,
    churchId: "church-1",
    eventId: `evt-${id}`,
    departmentId: "dept-1",
    memberId: "paul",
    originalStatus: "EN_SERVICE",
    status,
    event: { date: new Date(date) },
    department: { name: "Choristes" },
    replacementMember: null,
    ...extra,
  });

  it("annule les désistements en attente, rapporte les pourvus et clos, ignore les événements commencés", async () => {
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([
      row("a", "PENDING", "2026-11-08T10:00:00Z"),
      row("b", "REPLACED", "2026-11-15T10:00:00Z", { replacementMember: { firstName: "Léa", lastName: "Bernard" } }),
      row("c", "CLOSED", "2026-11-16T10:00:00Z"),
      row("d", "PENDING", "2026-11-01T10:00:00Z"),
    ] as never);

    const result = await cancelAbsenceWithdrawals(prismaMock as never, { absenceId: "abs-1", actorId: "u-paul" }, now);

    expect(prismaMock.serviceWithdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { absenceId: "abs-1", status: { in: ["PENDING", "REPLACED", "CLOSED"] } } })
    );
    expect(result.cancelled).toEqual(["a"]);
    expect(cancelPendingWithdrawal).toHaveBeenCalledTimes(1);
    expect(cancelPendingWithdrawal).toHaveBeenCalledWith(prismaMock, expect.objectContaining({ id: "a" }), "u-paul", { restoreResponse: false }, now);
    expect(result.kept).toEqual([
      expect.objectContaining({ departmentName: "Choristes", replacementName: "Léa Bernard" }),
      expect.objectContaining({ replacementName: null }),
    ]);
  });

  it("`keep` épargne les services encore couverts", async () => {
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([
      row("a", "PENDING", "2026-11-08T10:00:00Z"),
      row("b", "PENDING", "2026-11-15T10:00:00Z"),
    ] as never);
    const result = await cancelAbsenceWithdrawals(
      prismaMock as never,
      { absenceId: "abs-1", actorId: "u-paul", keep: (w) => w.eventId === "evt-a" },
      now
    );
    expect(result.cancelled).toEqual(["b"]);
  });
});

describe("sendAbsenceWithdrawalNotices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.serviceWithdrawal.findUnique.mockResolvedValue({
      id: "w-8",
      churchId: "church-1",
      departmentId: "dept-1",
      memberId: "paul",
      event: { id: "evt-8", date: new Date("2026-11-08T10:00:00Z") },
      department: { name: "Choristes" },
      member: { firstName: "Paul", lastName: "Martin" },
    } as never);
    prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "u-paul" }] as never);
  });

  const base = { absenceId: "abs-1", churchId: "church-1", memberId: "paul", actorId: "u-marie" };

  it("période déclarée par un tiers : désistement notifié aux responsables, liste des services au STAR", async () => {
    await sendAbsenceWithdrawalNotices({ ...base, created: ["w-8"], thirdParty: true }, prismaMock as never, now);

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "ServiceWithdrawal", entityId: "w-8", details: expect.objectContaining({ source: "absence" }) }));
    expect(sendWithdrawalNotice).toHaveBeenCalledWith("w-8", prismaMock, now);
    expect(notifyUsers).toHaveBeenCalledWith(
      ["u-paul"],
      expect.objectContaining({ type: "SERVICE_WITHDRAWAL_BY_ABSENCE", message: expect.stringContaining("(Choristes)") })
    );
  });

  it("déclarée par le STAR lui-même : pas de notification redondante au STAR", async () => {
    await sendAbsenceWithdrawalNotices({ ...base, actorId: "u-paul", created: ["w-8"], thirdParty: false }, prismaMock as never, now);
    expect(notifyUsers).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "SERVICE_WITHDRAWAL_BY_ABSENCE" }));
  });

  it("annulation : responsables prévenus, STAR informé des services non replacés", async () => {
    await sendAbsenceWithdrawalNotices(
      {
        ...base,
        created: [],
        cancelled: ["w-8"],
        kept: [{ eventDate: new Date("2026-11-15T10:00:00Z"), departmentName: "Musiciens", replacementName: "Léa Bernard" }],
        thirdParty: false,
      },
      prismaMock as never,
      now
    );
    expect(notifyUsers).toHaveBeenCalledWith(["marie"], expect.objectContaining({ type: "SERVICE_WITHDRAWAL_CANCELLED" }));
    expect(notifyUsers).toHaveBeenCalledWith(
      ["u-paul"],
      expect.objectContaining({ type: "SERVICE_WITHDRAWAL_KEPT", message: expect.stringContaining("Léa Bernard te remplace") })
    );
  });

  it("n'échoue jamais", async () => {
    sendWithdrawalNotice.mockRejectedValueOnce(new Error("smtp"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendAbsenceWithdrawalNotices({ ...base, created: ["w-8"], thirdParty: true }, prismaMock as never, now)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
