import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
const listReplacementCandidates = vi.fn();
vi.mock("../candidates", () => ({ listReplacementCandidates: (...a: unknown[]) => listReplacementCandidates(...a) }));
const recordPlanningChanges = vi.fn().mockResolvedValue({ recorded: 1 });
vi.mock("../../planning-change-notices", () => ({ recordPlanningChanges: (...a: unknown[]) => recordPlanningChanges(...a) }));

const { replaceWithdrawal } = await import("../replace");

const eventDate = new Date("2026-11-08T10:00:00Z");
const lea = { memberId: "lea", firstName: "Léa", lastName: "Bernard", state: "AVAILABLE" };

function setup({ originalStatus = "EN_SERVICE", updated = 1 } = {}) {
  prismaMock.serviceWithdrawal.findUnique.mockImplementation(((args: { select?: Record<string, unknown> }) => {
    if (args.select?.originalStatus) {
      return Promise.resolve({
        churchId: "church-1",
        eventId: "evt-1",
        departmentId: "dept-1",
        memberId: "paul",
        originalStatus,
        event: { id: "evt-1", date: eventDate },
      });
    }
    if (args.select?.replacementMember) {
      return Promise.resolve({ status: "REPLACED", replacementMember: { firstName: "Zoé", lastName: "Adam" } });
    }
    // Contexte de notification.
    return Promise.resolve({
      id: "w-1",
      churchId: "church-1",
      departmentId: "dept-1",
      memberId: "paul",
      event: { id: "evt-1", date: eventDate },
      department: { name: "Choristes" },
      member: { firstName: "Paul", lastName: "Martin" },
    });
  }) as never);
  prismaMock.serviceWithdrawal.updateMany.mockResolvedValue({ count: updated });
  listReplacementCandidates.mockResolvedValue([lea]);
  prismaMock.eventDepartment.findUnique.mockResolvedValue({ id: "ed-1" } as never);
  prismaMock.planning.findFirst.mockResolvedValue(null);
  prismaMock.planning.findUnique.mockResolvedValue(null);
  prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "u-paul" }] as never);
  prismaMock.member.findUnique.mockResolvedValue({ firstName: "Léa", lastName: "Bernard" } as never);
}

const run = (now = new Date("2026-11-04T10:00:00Z")) =>
  replaceWithdrawal({ withdrawalId: "w-1", memberId: "lea", actorId: "marie" }, now);

describe("replaceWithdrawal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("place le remplaçant avec le statut d'origine, le signale à la spec 060 et confirme au STAR désisté", async () => {
    setup({ originalStatus: "EN_SERVICE_DEBRIEF" });
    expect(await run()).toEqual({ id: "w-1", replacementName: "Léa Bernard" });

    expect(prismaMock.serviceWithdrawal.updateMany).toHaveBeenCalledWith({
      where: { id: "w-1", status: "PENDING" },
      data: expect.objectContaining({ status: "REPLACED", replacementMemberId: "lea", resolvedById: "marie" }),
    });
    expect(prismaMock.planning.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { eventDepartmentId: "ed-1", memberId: "lea", status: "EN_SERVICE_DEBRIEF" },
        update: { status: "EN_SERVICE_DEBRIEF" },
      })
    );
    expect(recordPlanningChanges).toHaveBeenCalledWith(
      prismaMock,
      "church-1",
      [{ memberId: "lea", eventId: "evt-1", departmentId: "dept-1", previousStatus: null }],
      expect.objectContaining({ actorId: "marie" })
    );
    expect(notifyUsers).toHaveBeenCalledWith(
      ["u-paul"],
      expect.objectContaining({ type: "SERVICE_WITHDRAWAL_REPLACED", link: "/planning", message: expect.stringMatching(/^Léa Bernard te remplace le /) })
    );
    expect(logAudit).toHaveBeenCalled();
  });

  it("409 quand un autre responsable a déjà pourvu le service, en le nommant", async () => {
    setup({ updated: 0 });
    await expect(run()).rejects.toMatchObject({ statusCode: 409, message: "Ce service a déjà été pourvu par Zoé Adam" });
    expect(prismaMock.planning.upsert).not.toHaveBeenCalled();
  });

  it("422 si la personne choisie n'est plus un remplaçant possible", async () => {
    setup();
    listReplacementCandidates.mockResolvedValue([]);
    await expect(run()).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining("Léa Bernard") });
    expect(prismaMock.planning.upsert).not.toHaveBeenCalled();
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("422 si un autre membre est déjà « en service + débrief »", async () => {
    setup({ originalStatus: "EN_SERVICE_DEBRIEF" });
    prismaMock.planning.findFirst.mockResolvedValue({ id: "p-other" } as never);
    await expect(run()).rejects.toMatchObject({ statusCode: 422 });
  });

  it("refusé une fois l'événement commencé", async () => {
    setup();
    await expect(run(new Date("2026-11-08T10:30:00Z"))).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.serviceWithdrawal.updateMany).not.toHaveBeenCalled();
  });

  it("accepté après la date limite de planification, avant le début", async () => {
    setup();
    await expect(run(new Date("2026-11-08T08:00:00Z"))).resolves.toMatchObject({ id: "w-1" });
  });
});
