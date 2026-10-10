import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
const listReplacementCandidates = vi.fn().mockResolvedValue([{}]);
vi.mock("../candidates", () => ({ listReplacementCandidates: (...a: unknown[]) => listReplacementCandidates(...a) }));
vi.mock("../recipients", () => ({ resolveWithdrawalRecipients: vi.fn().mockResolvedValue(["marie"]) }));

const { runWithdrawalRelances } = await import("../relances");

const now = new Date("2026-11-06T12:00:00Z");
const eventDate = new Date("2026-11-08T10:00:00Z"); // dans 46 h

function due(createdAt: string) {
  prismaMock.serviceWithdrawal.findMany.mockResolvedValue([{ id: "w-1", createdAt: new Date(createdAt), event: { date: eventDate } }] as never);
}

describe("runWithdrawalRelances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.serviceWithdrawal.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.serviceWithdrawal.findUnique.mockResolvedValue({
      id: "w-1",
      churchId: "church-1",
      departmentId: "dept-1",
      memberId: "paul",
      event: { id: "evt-1", date: eventDate },
      department: { name: "Choristes" },
      member: { firstName: "Paul", lastName: "Martin" },
    } as never);
    prismaMock.memberUserLink.findMany.mockResolvedValue([]);
  });

  it("ne cherche que les désistements en attente, non relancés, d'un événement à venir dans les 48 h", async () => {
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue([]);
    await runWithdrawalRelances(now);
    expect(prismaMock.serviceWithdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PENDING",
          relanceSentAt: null,
          event: { date: { gt: now, lte: new Date("2026-11-08T12:00:00Z") } },
        },
      })
    );
  });

  it("relance une fois avec le nombre de candidats recalculé, et marque la relance", async () => {
    due("2026-11-04T10:00:00Z");
    expect(await runWithdrawalRelances(now)).toEqual({ relanced: 1 });
    expect(prismaMock.serviceWithdrawal.updateMany).toHaveBeenCalledWith({
      where: { id: "w-1", status: "PENDING", relanceSentAt: null },
      data: { relanceSentAt: now },
    });
    expect(notifyUsers).toHaveBeenCalledWith(
      ["marie"],
      expect.objectContaining({ type: "SERVICE_WITHDRAWAL_RELANCE", message: expect.stringContaining("1 remplaçant possible") })
    );
  });

  it("pas de seconde relance si une autre exécution l'a déjà marquée", async () => {
    due("2026-11-04T10:00:00Z");
    prismaMock.serviceWithdrawal.updateMany.mockResolvedValue({ count: 0 });
    expect(await runWithdrawalRelances(now)).toEqual({ relanced: 0 });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("pas de relance pour un désistement survenu moins de 48 h avant l'événement", async () => {
    due("2026-11-06T11:00:00Z");
    expect(await runWithdrawalRelances(now)).toEqual({ relanced: 0 });
    expect(prismaMock.serviceWithdrawal.updateMany).not.toHaveBeenCalled();
  });
});
