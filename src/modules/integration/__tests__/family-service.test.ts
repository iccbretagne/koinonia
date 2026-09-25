import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockCreateNotification = vi.fn();
const mockNotifyUsers = vi.fn();
const mockDispatchUserEmails = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  notifyUsers: (...args: unknown[]) => mockNotifyUsers(...args),
  dispatchUserEmails: (...args: unknown[]) => mockDispatchUserEmails(...args),
}));

const {
  runInactivityNotifications,
  runWaitingRelanceNotifications,
  relanceDueAt,
  isRelanceDue,
  getIntegrationSettings,
} = await import("../services/family-service");

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    churchId: "church-1",
    status: "SUBMITTED",
    firstName: "Marie",
    lastName: "Curie",
    updatedAt: new Date(Date.now() - 10 * 86_400_000),
    assignedBerger: null,
    church: { id: "church-1", name: "ICC Rennes" },
    ...overrides,
  };
}

describe("runInactivityNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatchUserEmails.mockResolvedValue({ sent: 0, failed: 0 });
    prismaMock.notification.findMany.mockResolvedValue([]);
  });

  it("Intégration portée par deux départements : une personne membre des deux n'est notifiée qu'une fois (spec 046)", async () => {
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([makeRequest()] as never);
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-int-1" }, { id: "dept-int-2" }] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { userChurchRole: { userId: "manager-1", user: { id: "manager-1", email: "manager@example.com" } } },
      { userChurchRole: { userId: "manager-1", user: { id: "manager-1", email: "manager@example.com" } } },
    ] as never);

    const result = await runInactivityNotifications("https://koinonia.example");

    expect(prismaMock.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ function: "INTEGRATION" }) })
    );
    expect(prismaMock.userDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: { in: ["dept-int-1", "dept-int-2"] } } })
    );
    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    expect(mockNotifyUsers.mock.calls[0][0]).toEqual(["manager-1"]);
    expect(mockNotifyUsers.mock.calls[0][1]).toEqual(expect.objectContaining({ domain: "integration" }));
    expect(result.notified).toBe(1);
  });

  it("aucun département INTEGRATION configuré : pas de notification, pas d'erreur", async () => {
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([makeRequest()] as never);
    prismaMock.department.findMany.mockResolvedValue([] as never);

    const result = await runInactivityNotifications("https://koinonia.example");

    expect(prismaMock.userDepartment.findMany).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
  });
});

const DAY = 86_400_000;
const DELAYS = { recontactDelayDays: 60, missionDelayDays: 30 };

describe("échéance de relance (spec 051)", () => {
  const now = new Date("2026-09-23T10:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

  it("chaque état d'attente utilise son propre délai", () => {
    expect(isRelanceDue({ status: "WAITING_MISSION", waitingSince: daysAgo(31), lastRelanceAt: null }, DELAYS, now)).toBe(true);
    expect(isRelanceDue({ status: "WAITING_RECONTACT", waitingSince: daysAgo(31), lastRelanceAt: null }, DELAYS, now)).toBe(false);
    expect(isRelanceDue({ status: "WAITING_RECONTACT", waitingSince: daysAgo(61), lastRelanceAt: null }, DELAYS, now)).toBe(true);
  });

  it("la dernière relance consignée prime sur la date de mise en attente", () => {
    const req = { status: "WAITING_MISSION", waitingSince: daysAgo(200), lastRelanceAt: daysAgo(10) };
    expect(relanceDueAt(req, DELAYS)).toEqual(new Date(daysAgo(10).getTime() + 30 * DAY));
    expect(isRelanceDue(req, DELAYS, now)).toBe(false);
  });

  it("une relance qui vient d'être consignée sort la demande de la sélection", () => {
    expect(isRelanceDue({ status: "WAITING_RECONTACT", waitingSince: daysAgo(400), lastRelanceAt: now }, DELAYS, now)).toBe(false);
  });

  it("le cycle se répète sans plafond : échue à nouveau un délai complet après la relance", () => {
    expect(isRelanceDue({ status: "WAITING_RECONTACT", waitingSince: daysAgo(400), lastRelanceAt: daysAgo(60) }, DELAYS, now)).toBe(true);
  });

  it.each(["SUBMITTED", "ASSIGNED", "CONTACTED", "ABANDONED", "INTEGRATED"])(
    "une demande hors attente (%s) n'est jamais à relancer, même avec des champs d'attente résiduels",
    (status) => {
      expect(isRelanceDue({ status, waitingSince: daysAgo(999), lastRelanceAt: null }, DELAYS, now)).toBe(false);
    }
  );
});

describe("getIntegrationSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("valeurs par défaut tant qu'aucun réglage n'a été enregistré", async () => {
    prismaMock.integrationSettings.findUnique.mockResolvedValue(null as never);
    expect(await getIntegrationSettings("church-1")).toEqual({ recontactDelayDays: 60, missionDelayDays: 30 });
  });
});

describe("runWaitingRelanceNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatchUserEmails.mockResolvedValue({ sent: 0, failed: 0 });
    prismaMock.notification.count.mockResolvedValue(0 as never);
    prismaMock.integrationSettings.findUnique.mockResolvedValue(null as never);
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-int" }] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { userChurchRole: { userId: "m1", user: { id: "m1", email: null } } },
      { userChurchRole: { userId: "m2", user: { id: "m2", email: null } } },
    ] as never);
  });

  function waiting(overrides: Record<string, unknown> = {}) {
    return {
      id: "req-w",
      churchId: "church-1",
      status: "WAITING_MISSION",
      firstName: "Jean",
      lastName: "Dupont",
      waitingSince: new Date(Date.now() - 40 * DAY),
      lastRelanceAt: null,
      church: { name: "ICC Rennes" },
      ...overrides,
    };
  }

  it("alerte tous les membres de l'équipe intégration en précisant la cible", async () => {
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([waiting()] as never);

    const result = await runWaitingRelanceNotifications("https://koinonia.example");

    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    expect(mockNotifyUsers.mock.calls[0][0]).toEqual(["m1", "m2"]);
    const notification = mockNotifyUsers.mock.calls[0][1] as { domain: string; message: string };
    expect(notification.domain).toBe("integration");
    expect(notification.message).toContain("le département mission");
    expect(result).toEqual({ notified: 2, skipped: 0, total: 1 });
  });

  it("ne sélectionne que les demandes en attente, jamais pour les abandonner", async () => {
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([] as never);

    await runWaitingRelanceNotifications("https://koinonia.example");

    const args = prismaMock.familyIntegrationRequest.findMany.mock.calls[0][0] as { where: { status: unknown } };
    expect(args.where.status).toEqual({ in: ["WAITING_RECONTACT", "WAITING_MISSION"] });
    expect(prismaMock.familyIntegrationRequest.update).not.toHaveBeenCalled();
    expect(prismaMock.familyIntegrationRequest.updateMany).not.toHaveBeenCalled();
  });

  it("une alerte déjà émise pour cette échéance n'est pas répétée", async () => {
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([waiting()] as never);
    prismaMock.notification.count.mockResolvedValue(2 as never);

    const result = await runWaitingRelanceNotifications("https://koinonia.example");

    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("une demande dont l'échéance n'est pas atteinte n'est pas signalée", async () => {
    prismaMock.familyIntegrationRequest.findMany.mockResolvedValue([
      waiting({ status: "WAITING_RECONTACT" }), // 40 j < 60 j
    ] as never);

    const result = await runWaitingRelanceNotifications("https://koinonia.example");

    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });
});
