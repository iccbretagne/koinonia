import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockNotifyDeptMembers = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({
  notifyDeptMembers: (...args: unknown[]) => mockNotifyDeptMembers(...args),
}));

const {
  unassignedDueAt,
  isUnassignedDue,
  unscheduledDueAt,
  isUnscheduledDue,
  runCareRelances,
} = await import("../services/relances");

const DELAYS = { unassignedDelayDays: 7, unscheduledDelayDays: 14 };

/**
 * T60, T62 — échéances pures par état, dédoublonnage, sortie de relance après affectation ou
 * date fixée.
 */
describe("unassignedDueAt / isUnassignedDue", () => {
  it("suivi SUBMITTED : même échéance qu'une demande de RDV non confiée", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    expect(unassignedDueAt({ status: "SUBMITTED", createdAt }, DELAYS)).toEqual(
      new Date("2026-01-08T00:00:00Z")
    );
  });

  it("PENDING : échéance = createdAt + délai", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const due = unassignedDueAt({ status: "PENDING", createdAt }, DELAYS);
    expect(due).toEqual(new Date("2026-01-08T00:00:00Z"));
  });

  it("hors PENDING : pas d'échéance (sortie de relance après affectation)", () => {
    expect(unassignedDueAt({ status: "VALIDATED", createdAt: new Date() }, DELAYS)).toBeNull();
    expect(unassignedDueAt({ status: "REJECTED", createdAt: new Date() }, DELAYS)).toBeNull();
  });

  it("due seulement une fois le délai écoulé", () => {
    const createdAt = new Date(Date.now() - 6 * 86_400_000);
    expect(isUnassignedDue({ status: "PENDING", createdAt }, DELAYS, new Date())).toBe(false);

    const overdue = new Date(Date.now() - 8 * 86_400_000);
    expect(isUnassignedDue({ status: "PENDING", createdAt: overdue }, DELAYS, new Date())).toBe(true);
  });
});

describe("unscheduledDueAt / isUnscheduledDue", () => {
  it("suivi ASSIGNED (sans premier contact) : échéance = assignedAt + délai", () => {
    const assignedAt = new Date("2026-01-01T00:00:00Z");
    expect(unscheduledDueAt({ status: "ASSIGNED", assignedAt }, DELAYS)).toEqual(
      new Date("2026-01-15T00:00:00Z")
    );
    expect(unscheduledDueAt({ status: "CONTACTED", assignedAt }, DELAYS)).toBeNull();
  });

  it("VALIDATED avec assignedAt : échéance = assignedAt + délai", () => {
    const assignedAt = new Date("2026-01-01T00:00:00Z");
    const due = unscheduledDueAt({ status: "VALIDATED", assignedAt }, DELAYS);
    expect(due).toEqual(new Date("2026-01-15T00:00:00Z"));
  });

  it("sans assignedAt (jamais confiée) : pas d'échéance", () => {
    expect(unscheduledDueAt({ status: "VALIDATED", assignedAt: null }, DELAYS)).toBeNull();
  });

  it("hors VALIDATED (planifiée, rejetée…) : pas d'échéance — sortie de relance après date fixée", () => {
    const assignedAt = new Date(Date.now() - 20 * 86_400_000);
    expect(unscheduledDueAt({ status: "SCHEDULED", assignedAt }, DELAYS)).toBeNull();
    expect(unscheduledDueAt({ status: "PENDING", assignedAt: null }, DELAYS)).toBeNull();
  });

  it("due seulement une fois le délai écoulé", () => {
    const recent = new Date(Date.now() - 10 * 86_400_000);
    expect(isUnscheduledDue({ status: "VALIDATED", assignedAt: recent }, DELAYS, new Date())).toBe(false);

    const overdue = new Date(Date.now() - 15 * 86_400_000);
    expect(isUnscheduledDue({ status: "VALIDATED", assignedAt: overdue }, DELAYS, new Date())).toBe(true);
  });
});

describe("runCareRelances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.careSettings.findMany.mockResolvedValue([]);
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.notification.create.mockResolvedValue({} as never);
    mockNotifyDeptMembers.mockResolvedValue(undefined);
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([]);
  });

  function pendingRequest(overrides: Record<string, unknown> = {}) {
    return {
      id: "req-1",
      churchId: "church-1",
      status: "PENDING",
      firstName: "Marie",
      lastName: "Curie",
      createdAt: new Date(Date.now() - 8 * 86_400_000), // en retard sur le défaut (7j)
      ...overrides,
    };
  }

  function validatedRequest(overrides: Record<string, unknown> = {}) {
    return {
      id: "req-2",
      churchId: "church-1",
      status: "VALIDATED",
      firstName: "Jean",
      lastName: "Dupont",
      assignedAt: new Date(Date.now() - 15 * 86_400_000), // en retard sur le défaut (14j)
      assignedMemberId: null,
      assignedTo: null,
      ...overrides,
    };
  }

  it("demande non confiée en retard : notifie tous les référents de l'église", async () => {
    prismaMock.appointmentRequest.findMany
      .mockResolvedValueOnce([pendingRequest()])
      .mockResolvedValueOnce([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { userId: "admin-1" },
      { userId: "referent-1" },
    ] as never);

    const result = await runCareRelances();

    expect(prismaMock.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ userId: "admin-1", type: "CARE_RELANCE_UNASSIGNED" }),
          expect.objectContaining({ userId: "referent-1", type: "CARE_RELANCE_UNASSIGNED" }),
        ],
      })
    );
    expect(result.unassignedNotified).toBe(1);
  });

  it("demande non confiée pas encore en retard : aucune notification", async () => {
    prismaMock.appointmentRequest.findMany
      .mockResolvedValueOnce([pendingRequest({ createdAt: new Date(Date.now() - 2 * 86_400_000) })])
      .mockResolvedValueOnce([]);

    const result = await runCareRelances();

    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    expect(result.unassignedNotified).toBe(0);
  });

  it("confiée à un membre du MSDP, sans date, en retard : notifie ce membre", async () => {
    prismaMock.appointmentRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([validatedRequest({ assignedMemberId: "member-1" })]);

    const result = await runCareRelances();

    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "member-1", type: "CARE_RELANCE_UNSCHEDULED" }),
      })
    );
    expect(mockNotifyDeptMembers).not.toHaveBeenCalled();
    expect(result.unscheduledNotified).toBe(1);
  });

  it("confiée à un profil pastoral, sans date, en retard : notifie le protocole, pas le profil", async () => {
    prismaMock.appointmentRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([validatedRequest({ assignedTo: { userId: "pastor-user-1" } })]);

    const result = await runCareRelances();

    expect(mockNotifyDeptMembers).toHaveBeenCalledWith(
      "church-1",
      "PROTOCOLE",
      expect.objectContaining({ type: "CARE_RELANCE_UNSCHEDULED" })
    );
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(result.unscheduledNotified).toBe(1);
  });

  it("déjà relancée récemment (dans le délai) : pas de renvoi (dédoublonnage)", async () => {
    prismaMock.appointmentRequest.findMany
      .mockResolvedValueOnce([pendingRequest()])
      .mockResolvedValueOnce([]);
    prismaMock.notification.findMany.mockResolvedValue([
      { link: "/care/requests/req-1", type: "CARE_RELANCE_UNASSIGNED", createdAt: new Date() },
    ] as never);

    const result = await runCareRelances();

    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    expect(result.unassignedNotified).toBe(0);
  });

  it("relancée il y a plus longtemps que le délai : renvoi (renotification périodique)", async () => {
    prismaMock.appointmentRequest.findMany
      .mockResolvedValueOnce([pendingRequest()])
      .mockResolvedValueOnce([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "admin-1" }] as never);
    prismaMock.notification.findMany.mockResolvedValue([
      {
        link: "/care/requests/req-1",
        type: "CARE_RELANCE_UNASSIGNED",
        createdAt: new Date(Date.now() - 8 * 86_400_000),
      },
    ] as never);

    const result = await runCareRelances();

    expect(prismaMock.notification.createMany).toHaveBeenCalled();
    expect(result.unassignedNotified).toBe(1);
  });

  it("utilise les délais propres à l'église quand ils sont réglés", async () => {
    prismaMock.appointmentRequest.findMany
      .mockResolvedValueOnce([pendingRequest({ createdAt: new Date(Date.now() - 2 * 86_400_000) })])
      .mockResolvedValueOnce([]);
    prismaMock.careSettings.findMany.mockResolvedValue([
      { churchId: "church-1", unassignedDelayDays: 1, unscheduledDelayDays: 14 },
    ] as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "admin-1" }] as never);

    const result = await runCareRelances();

    expect(result.unassignedNotified).toBe(1);
  });

  function assignedFollowUp(overrides: Record<string, unknown> = {}) {
    return {
      id: "f-1",
      churchId: "church-1",
      status: "ASSIGNED",
      firstName: null,
      lastName: null,
      createdAt: new Date(Date.now() - 20 * 86_400_000),
      assignedAt: new Date(Date.now() - 15 * 86_400_000), // en retard sur le défaut (14j)
      assignedConseillerMsdpId: null,
      assignedProfile: null,
      request: { firstName: "Grâce", lastName: "Mavoungou" },
      ...overrides,
    };
  }

  it("suivi de nouveau converti non confié en retard : notifie les référents", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prismaMock.msdpFollowUp.findMany
      .mockResolvedValueOnce([
        {
          id: "f-2",
          churchId: "church-1",
          status: "SUBMITTED",
          firstName: "Kevin",
          lastName: "Loubaki",
          createdAt: new Date(Date.now() - 8 * 86_400_000),
          request: null,
        },
      ] as never)
      .mockResolvedValueOnce([]);
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ userId: "referent-1" }] as never);

    const result = await runCareRelances();

    expect(prismaMock.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            userId: "referent-1",
            type: "CARE_RELANCE_UNASSIGNED",
            title: "Suivi de nouveau converti à confier",
            link: "/care/followups/f-2",
          }),
        ],
      })
    );
    expect(result.unassignedNotified).toBe(1);
  });

  it("suivi confié à un référent, sans premier contact, en retard : notifie ce référent", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prismaMock.msdpFollowUp.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([assignedFollowUp({ assignedConseillerMsdpId: "member-2" })] as never);

    const result = await runCareRelances();

    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "member-2",
          type: "CARE_RELANCE_UNSCHEDULED",
          link: "/care/followups/f-1",
          message: expect.stringContaining("Grâce Mavoungou"),
        }),
      })
    );
    expect(mockNotifyDeptMembers).not.toHaveBeenCalled();
    expect(result.unscheduledNotified).toBe(1);
  });

  it("suivi confié à un profil pastoral avec compte : notifie ce compte, pas le protocole", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prismaMock.msdpFollowUp.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([assignedFollowUp({ assignedProfile: { userId: "pastor-user-2" } })] as never);

    const result = await runCareRelances();

    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "pastor-user-2" }) })
    );
    expect(mockNotifyDeptMembers).not.toHaveBeenCalled();
    expect(result.unscheduledNotified).toBe(1);
  });

  it("aucune demande en attente ou confiée non planifiée : ne fait aucun appel superflu", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await runCareRelances();

    expect(prismaMock.careSettings.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ unassignedNotified: 0, unscheduledNotified: 0 });
  });
});
