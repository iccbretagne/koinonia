import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
// Le désistement a ses propres tests (withdrawals/__tests__) : ici, on vérifie qu'il est déclenché.
const createWithdrawal = vi.fn();
const sendWithdrawalNotice = vi.fn().mockResolvedValue(undefined);
vi.mock("../../withdrawals/withdraw", () => ({
  createWithdrawal: (...a: unknown[]) => createWithdrawal(...a),
  sendWithdrawalNotice: (...a: unknown[]) => sendWithdrawalNotice(...a),
}));

const { saveResponses } = await import("../responses");

const now = new Date("2026-10-10T10:00:00Z");
const eventDate = new Date("2026-11-08T10:00:00Z");

function setup({
  eventDepts = ["dept-1", "dept-2"],
  memberDepts = ["dept-1", "dept-2"],
  date = eventDate,
  planningDeadline = null as Date | null,
} = {}) {
  prismaMock.memberDepartment.findMany.mockResolvedValue(memberDepts.map((departmentId) => ({ departmentId })) as never);
  prismaMock.event.findMany.mockResolvedValue([
    { id: "evt-1", title: "Culte", date, planningDeadline, eventDepts: eventDepts.map((departmentId) => ({ departmentId })) },
  ] as never);
  prismaMock.availabilityResponse.upsert.mockResolvedValue({} as never);
  prismaMock.planning.findMany.mockResolvedValue([]);
}

describe("saveResponses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("« tous mes départements » est déplié sur les départements du STAR qui servent l'événement", async () => {
    setup({ eventDepts: ["dept-1", "dept-3"], memberDepts: ["dept-1", "dept-2"] });

    const res = await saveResponses({
      memberId: "m-1",
      churchId: "church-1",
      answers: [{ eventId: "evt-1", answer: "AVAILABLE" }],
      actorId: "u-1",
      now,
    });

    expect(res).toEqual({ updated: 1, alerts: 0, withdrawals: 0 });
    expect(prismaMock.availabilityResponse.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.availabilityResponse.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ departmentId: "dept-1", answer: "AVAILABLE", enteredById: "u-1" }) })
    );
  });

  it("une réponse restreinte à un département n'écrit que celui-là", async () => {
    setup();
    await saveResponses({
      memberId: "m-1",
      churchId: "church-1",
      answers: [{ eventId: "evt-1", answer: "IF_NEEDED", departmentIds: ["dept-2"] }],
      actorId: "u-1",
      now,
    });
    expect(prismaMock.availabilityResponse.upsert).toHaveBeenCalledOnce();
    expect(prismaMock.availabilityResponse.upsert.mock.calls[0][0]).toMatchObject({
      where: { memberId_eventId_departmentId: { memberId: "m-1", eventId: "evt-1", departmentId: "dept-2" } },
    });
  });

  it("400 pour un événement passé", async () => {
    setup({ date: new Date("2026-10-01T10:00:00Z") });
    await expect(
      saveResponses({ memberId: "m-1", churchId: "church-1", answers: [{ eventId: "evt-1", answer: "AVAILABLE" }], actorId: "u-1", now })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.availabilityResponse.upsert).not.toHaveBeenCalled();
  });

  it("400 si aucun département du STAR ne sert l'événement", async () => {
    setup({ eventDepts: ["dept-9"] });
    await expect(
      saveResponses({ memberId: "m-1", churchId: "church-1", answers: [{ eventId: "evt-1", answer: "AVAILABLE" }], actorId: "u-1", now })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("400 pour un département qui ne sert pas l'événement", async () => {
    setup({ eventDepts: ["dept-1"] });
    await expect(
      saveResponses({
        memberId: "m-1",
        churchId: "church-1",
        answers: [{ eventId: "evt-1", answer: "AVAILABLE", departmentIds: ["dept-2"] }],
        actorId: "u-1",
        now,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("400 pour un événement d'une autre église (non retourné par la requête)", async () => {
    prismaMock.memberDepartment.findMany.mockResolvedValue([{ departmentId: "dept-1" }] as never);
    prismaMock.event.findMany.mockResolvedValue([]);
    await expect(
      saveResponses({ memberId: "m-1", churchId: "church-1", answers: [{ eventId: "evt-x", answer: "AVAILABLE" }], actorId: "u-1", now })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-1" }) })
    );
  });

  it("STAR planifié passant « Pas disponible » avant l'échéance : désistement, notifié après validation (spec 061)", async () => {
    setup({ eventDepts: ["dept-1"], memberDepts: ["dept-1"], planningDeadline: new Date("2026-11-01T10:00:00Z") });
    prismaMock.planning.findMany.mockResolvedValueOnce([{ eventDepartment: { departmentId: "dept-1" } }] as never);
    createWithdrawal.mockResolvedValue("w-1");

    const res = await saveResponses({
      memberId: "m-1",
      churchId: "church-1",
      answers: [{ eventId: "evt-1", answer: "UNAVAILABLE" }],
      actorId: "u-1",
      now,
    });

    expect(res).toEqual({ updated: 1, alerts: 0, withdrawals: 1 });
    expect(createWithdrawal).toHaveBeenCalledWith(
      { churchId: "church-1", eventId: "evt-1", departmentId: "dept-1", memberId: "m-1", actorId: "u-1" },
      prismaMock,
      now
    );
    expect(sendWithdrawalNotice).toHaveBeenCalledWith("w-1", prismaMock, now);
    expect(notifyUsers).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "AVAILABILITY_PLANNED_UNAVAILABLE" }));
  });

  it("« Pas disponible » sur plusieurs services planifiés : un désistement par service", async () => {
    setup({ eventDepts: ["dept-1", "dept-2"], memberDepts: ["dept-1", "dept-2"] });
    prismaMock.planning.findMany.mockResolvedValueOnce([
      { eventDepartment: { departmentId: "dept-1" } },
      { eventDepartment: { departmentId: "dept-2" } },
    ] as never);
    createWithdrawal.mockResolvedValueOnce("w-1").mockResolvedValueOnce("w-2");

    const res = await saveResponses({
      memberId: "m-1",
      churchId: "church-1",
      answers: [{ eventId: "evt-1", answer: "UNAVAILABLE" }],
      actorId: "u-1",
      now,
    });

    expect(res.withdrawals).toBe(2);
    expect(sendWithdrawalNotice).toHaveBeenCalledTimes(2);
  });

  it("STAR planifié passant « Pas disponible » après l'échéance : notification simple, pas de désistement", async () => {
    setup({ eventDepts: ["dept-1"], memberDepts: ["dept-1"], planningDeadline: new Date("2026-10-05T10:00:00Z") });
    prismaMock.planning.findMany.mockResolvedValueOnce([{ eventDepartment: { departmentId: "dept-1" } }] as never);
    prismaMock.memberDepartment.findMany.mockResolvedValue([
      { departmentId: "dept-1", department: { id: "dept-1", ministryId: "min-1" } },
    ] as never);
    prismaMock.member.findUnique.mockResolvedValue({ firstName: "Jean", lastName: "Dupont" } as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([{ userChurchRole: { userId: "resp-1" } }] as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);

    const res = await saveResponses({
      memberId: "m-1",
      churchId: "church-1",
      answers: [{ eventId: "evt-1", answer: "UNAVAILABLE" }],
      actorId: "u-1",
      now,
    });

    expect(res.alerts).toBe(1);
    expect(createWithdrawal).not.toHaveBeenCalled();
    expect(notifyUsers).toHaveBeenCalledWith(
      expect.arrayContaining(["resp-1"]),
      expect.objectContaining({ type: "AVAILABILITY_PLANNED_UNAVAILABLE", domain: "planning" })
    );
  });

  it("une réponse « disponible » ne notifie personne", async () => {
    setup({ eventDepts: ["dept-1"], memberDepts: ["dept-1"] });
    await saveResponses({ memberId: "m-1", churchId: "church-1", answers: [{ eventId: "evt-1", answer: "AVAILABLE" }], actorId: "u-1", now });
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
