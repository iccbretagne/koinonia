import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
const resolveWithdrawalRecipients = vi.fn().mockResolvedValue(["marie"]);
vi.mock("../recipients", () => ({ resolveWithdrawalRecipients: (...a: unknown[]) => resolveWithdrawalRecipients(...a) }));

const { cancelWithdrawal, closeWithdrawal, cancelPendingWithdrawal } = await import("../resolve");

const eventDate = new Date("2026-11-08T10:00:00Z");
const now = new Date("2026-11-04T10:00:00Z");

function setup(updated = 1) {
  prismaMock.serviceWithdrawal.findUnique.mockImplementation(((args: { select?: Record<string, unknown> }) => {
    if (args.select?.replacementMember) return Promise.resolve({ status: "REPLACED", replacementMember: { firstName: "Léa", lastName: "Bernard" } });
    return Promise.resolve({
      id: "w-1",
      churchId: "church-1",
      eventId: "evt-1",
      departmentId: "dept-1",
      memberId: "paul",
      originalStatus: "EN_SERVICE",
      event: { id: "evt-1", date: eventDate },
      department: { name: "Choristes" },
      member: { firstName: "Paul", lastName: "Martin" },
    });
  }) as never);
  prismaMock.serviceWithdrawal.updateMany.mockResolvedValue({ count: updated });
  prismaMock.eventDepartment.findUnique.mockResolvedValue({ id: "ed-1" } as never);
  prismaMock.memberUserLink.findMany.mockResolvedValue([{ userId: "u-paul" }] as never);
}

describe("cancelWithdrawal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restaure le statut d'origine, repasse la réponse à « Disponible » et prévient les responsables", async () => {
    setup();
    await cancelWithdrawal({ withdrawalId: "w-1", actorId: "u-paul" }, now);

    expect(prismaMock.serviceWithdrawal.updateMany).toHaveBeenCalledWith({
      where: { id: "w-1", status: "PENDING" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
    expect(prismaMock.planning.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { status: "EN_SERVICE" } }));
    expect(prismaMock.availabilityResponse.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { answer: "AVAILABLE", enteredById: "u-paul" } })
    );
    expect(notifyUsers).toHaveBeenCalledWith(
      ["marie"],
      expect.objectContaining({ type: "SERVICE_WITHDRAWAL_CANCELLED", message: expect.stringMatching(/^Paul Martin peut finalement servir le /) })
    );
  });

  it("refusée une fois un remplaçant choisi", async () => {
    setup(0);
    await expect(cancelWithdrawal({ withdrawalId: "w-1", actorId: "u-paul" }, now)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.planning.upsert).not.toHaveBeenCalled();
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});

describe("closeWithdrawal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clôt le désistement (fin du signalement et de la relance) et informe le STAR", async () => {
    setup();
    await closeWithdrawal({ withdrawalId: "w-1", actorId: "marie" }, now);

    expect(prismaMock.serviceWithdrawal.updateMany).toHaveBeenCalledWith({
      where: { id: "w-1", status: "PENDING" },
      data: expect.objectContaining({ status: "CLOSED", resolvedById: "marie" }),
    });
    expect(notifyUsers).toHaveBeenCalledWith(
      ["u-paul"],
      expect.objectContaining({ type: "SERVICE_WITHDRAWAL_CLOSED", message: expect.stringMatching(/^Ton désistement du .+ est pris en compte\.$/) })
    );
  });

  it("409 si le service a déjà été pourvu", async () => {
    setup(0);
    await expect(closeWithdrawal({ withdrawalId: "w-1", actorId: "marie" }, now)).rejects.toMatchObject({
      statusCode: 409,
      message: "Ce service a déjà été pourvu par Léa Bernard",
    });
  });
});

describe("cancelPendingWithdrawal", () => {
  beforeEach(() => vi.clearAllMocks());
  const w = { id: "w-1", churchId: "church-1", eventId: "evt-1", departmentId: "dept-1", memberId: "paul", originalStatus: "REMPLACANT" as const };

  it("sans restoreResponse (annulation par la période, spec 062) : statut restauré, aucune réponse fabriquée", async () => {
    setup();
    await cancelPendingWithdrawal(prismaMock as never, w, "u-paul", { restoreResponse: false }, now);
    expect(prismaMock.planning.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { status: "REMPLACANT" } }));
    expect(prismaMock.availabilityResponse.upsert).not.toHaveBeenCalled();
  });

  it("409 si le désistement n'est plus en attente", async () => {
    setup(0);
    await expect(cancelPendingWithdrawal(prismaMock as never, w, "u-paul", { restoreResponse: false }, now)).rejects.toMatchObject({ statusCode: 409 });
  });
});
