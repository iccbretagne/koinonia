import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const resolveWithdrawalRecipients = vi.fn();
vi.mock("@/modules/planning", () => ({
  PLANNED_STATUSES: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"],
  listTeamEventsForMember: vi.fn().mockResolvedValue([]),
  resolveWithdrawalRecipients: (...a: unknown[]) => resolveWithdrawalRecipients(...a),
  // Même règle que le service : avant l'échéance (à défaut, avant l'événement).
  withdrawable: (e: { date: Date; planningDeadline: Date | null }, now: Date) =>
    now < (e.planningDeadline ?? e.date),
}));

const { loadMyPlanning } = await import("../my-planning-data");

const DAY = 24 * 3600 * 1000;
const planning = (id: string, status: string, date: Date, planningDeadline: Date | null, dept = "dept-1") => ({
  id,
  status,
  eventDepartment: {
    id: `ed-${id}`,
    event: { id: `evt-${id}`, title: "Culte", type: "CULTE", date, planningDeadline },
    department: { id: dept, name: "Choristes" },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.memberUserLink.findUnique.mockResolvedValue({
    memberId: "paul",
    member: { firstName: "Paul", lastName: "Martin" },
  } as never);
  prismaMock.taskAssignment.findMany.mockResolvedValue([]);
  prismaMock.openingClosingAssignment.findMany.mockResolvedValue([]);
  prismaMock.serviceWithdrawal.findMany.mockResolvedValue([]);
  prismaMock.planning.findMany.mockResolvedValue([]);
  resolveWithdrawalRecipients.mockResolvedValue([]);
});

describe("loadMyPlanning", () => {
  it("null sans fiche STAR liée", async () => {
    prismaMock.memberUserLink.findUnique.mockResolvedValue(null);
    expect(await loadMyPlanning("u-1", "church-1")).toBeNull();
  });

  it("inclut les services « Remplaçant » et indique s'ils sont encore désistables", async () => {
    const now = Date.now();
    prismaMock.planning.findMany.mockResolvedValue([
      planning("a", "REMPLACANT", new Date(now + 10 * DAY), new Date(now + 5 * DAY)),
      planning("b", "EN_SERVICE", new Date(now + 3 * DAY), new Date(now - DAY)),
    ] as never);

    const data = await loadMyPlanning("u-1", "church-1");

    expect(prismaMock.planning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId: "paul", status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"] } },
      })
    );
    expect(data!.plannings.map((p) => [p.id, p.withdrawable])).toEqual([
      ["a", true],
      ["b", false],
    ]);
    // L'échéance reste côté serveur.
    expect(data!.plannings[0].eventDepartment.event).not.toHaveProperty("planningDeadline");
  });

  it("renvoie les désistements en attente du STAR", async () => {
    const pending = [{ id: "w-1", originalStatus: "EN_SERVICE", event: { id: "evt-1" }, department: { id: "dept-1" } }];
    prismaMock.serviceWithdrawal.findMany.mockResolvedValue(pending as never);

    const data = await loadMyPlanning("u-1", "church-1");

    expect(prismaMock.serviceWithdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberId: "paul", status: "PENDING" } })
    );
    expect(data!.withdrawals).toEqual(pending);
  });

  it("après l'échéance, fournit les coordonnées des responsables du département", async () => {
    const now = Date.now();
    prismaMock.planning.findMany.mockResolvedValue([
      planning("b", "EN_SERVICE", new Date(now + 3 * DAY), new Date(now - DAY)),
    ] as never);
    resolveWithdrawalRecipients.mockResolvedValue(["u-head"]);
    prismaMock.user.findMany.mockResolvedValue([
      { email: "lea@ex.fr", name: "Léa", displayName: null, memberLinks: [{ member: { phone: "0600000000" } }] },
    ] as never);

    const data = await loadMyPlanning("u-1", "church-1");

    expect(resolveWithdrawalRecipients).toHaveBeenCalledWith("church-1", "dept-1", "paul", prismaMock);
    expect(data!.contactsByDepartment).toEqual({
      "dept-1": [{ name: "Léa", email: "lea@ex.fr", phone: "0600000000" }],
    });
  });

  it("les services d'ouverture/fermeture ne sont jamais désistables en ligne", async () => {
    prismaMock.openingClosingAssignment.findMany.mockResolvedValue([
      { id: "oc-1", slot: "OPENING", event: { id: "evt-1", title: "Culte", type: "CULTE", date: new Date() } },
    ] as never);
    const data = await loadMyPlanning("u-1", "church-1");
    expect(data!.plannings).toEqual([expect.objectContaining({ id: "opening-closing-oc-1", withdrawable: false })]);
  });
});
