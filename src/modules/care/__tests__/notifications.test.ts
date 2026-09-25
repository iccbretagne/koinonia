import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockSendEmail = vi.fn();
const mockCreateNotification = vi.fn();
const mockNotifyDeptMembers = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  buildAppointmentScheduledEmail: () => ({ subject: "Planifié", html: "<p>ok</p>" }),
  buildAppointmentRejectedEmail: () => ({ subject: "Rejet", html: "<p>ok</p>" }),
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  notifyDeptMembers: (...args: unknown[]) => mockNotifyDeptMembers(...args),
}));

const {
  notifyAssigneeAssigned,
  notifyAssigneeUnassigned,
  notifyReferentsHandback,
  notifyProtocoleToSchedule,
  notifyRequesterScheduled,
  notifyRequesterRejected,
} = await import("../services/notifications");

/**
 * T56 — nouveau flux (spec 052, lot 2) : affectation sans email réussie ; profil sans compte →
 * email seul ; dessaisissement notifié ; protocole prévenu pour un profil, pas pour un membre ;
 * demandeur prévenu de la date dans les deux cas.
 */
describe("notifyAssigneeAssigned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotification.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);
  });

  it("accompagnant avec compte : notification in-app, pas d'email", async () => {
    await notifyAssigneeAssigned({
      assignee: { kind: "MEMBER", id: "u1", userId: "u1", name: "Jean", email: "jean@example.com" },
      kind: "requests",
      itemId: "req-1",
      personName: "Marie Curie",
    });

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "CARE_ASSIGNED", link: "/care/requests/req-1" })
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("profil pastoral sans compte : email seul, pas de notification in-app", async () => {
    await notifyAssigneeAssigned({
      assignee: { kind: "PROFILE", id: "p1", userId: null, name: "Pasteur Paul", email: "paul@example.com" },
      kind: "followups",
      itemId: "f1",
      personName: "Marie Curie",
    });

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "paul@example.com" }));
  });

  it("profil pastoral sans compte ni email : rien n'est envoyé", async () => {
    await notifyAssigneeAssigned({
      assignee: { kind: "PROFILE", id: "p1", userId: null, name: "Pasteur Paul", email: null },
      kind: "followups",
      itemId: "f1",
      personName: "Marie Curie",
    });

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("notifyAssigneeUnassigned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("notifie l'ancien accompagnant s'il a un compte", async () => {
    await notifyAssigneeUnassigned({ userId: "u1", personName: "Marie Curie" });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "CARE_UNASSIGNED" })
    );
  });

  it("ne fait rien si l'ancien accompagnant n'a pas de compte", async () => {
    await notifyAssigneeUnassigned({ userId: null, personName: "Marie Curie" });

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

describe("notifyReferentsHandback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 } as never);
  });

  it("notifie tous les détenteurs de care:qualify de l'église", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { userId: "admin-1" },
      { userId: "referent-1" },
    ] as never);

    await notifyReferentsHandback({
      churchId: "church-1",
      kind: "requests",
      itemId: "req-1",
      personName: "Marie Curie",
      reason: "hors périmètre",
    });

    expect(prismaMock.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ userId: "admin-1", type: "CARE_HANDBACK" }),
          expect.objectContaining({ userId: "referent-1", type: "CARE_HANDBACK" }),
        ],
      })
    );
  });

  it("ne fait aucun appel si l'église n'a aucun référent", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([] as never);

    await notifyReferentsHandback({
      churchId: "church-1",
      kind: "followups",
      itemId: "f1",
      personName: "Marie Curie",
      reason: "x",
    });

    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("notifyProtocoleToSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifyDeptMembers.mockResolvedValue(undefined);
  });

  it("confié à un profil pastoral : le protocole est prévenu", async () => {
    await notifyProtocoleToSchedule({ churchId: "church-1", personName: "Marie Curie" });

    expect(mockNotifyDeptMembers).toHaveBeenCalledTimes(1);
    expect(mockNotifyDeptMembers).toHaveBeenCalledWith(
      "church-1",
      "PROTOCOLE",
      expect.objectContaining({ type: "CARE_APPOINTMENT_VALIDATED" })
    );
  });
});

describe("notifyRequesterScheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotification.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.church.findUnique.mockResolvedValue({ name: "ICC Rennes" } as never);
  });

  const base = {
    firstName: "Marie",
    lastName: "Curie",
    subject: "Besoin d'accompagnement",
    churchId: "church-1",
    scheduledFor: new Date("2026-01-15T10:00:00Z"),
  };

  it("demandeur connecté : notification in-app", async () => {
    await notifyRequesterScheduled({ ...base, userId: "requester-1", email: null });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "requester-1", type: "CARE_APPOINTMENT_SCHEDULED" })
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("demandeur non connecté avec email : envoi d'un email", async () => {
    await notifyRequesterScheduled({ ...base, userId: null, email: "marie@example.com" });

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "marie@example.com" }));
  });

  it("demandeur connecté avec email : les deux canaux, comme pour une planification par le protocole", async () => {
    await notifyRequesterScheduled({ ...base, userId: "requester-1", email: "marie@example.com" });

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("notifyRequesterRejected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotification.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.church.findUnique.mockResolvedValue({ name: "ICC Rennes" } as never);
  });

  const base = {
    firstName: "Marie",
    lastName: "Curie",
    subject: "Besoin d'accompagnement",
    churchId: "church-1",
    reasonCode: "OUT_OF_SCOPE" as const,
    comment: null,
  };

  it("inclut le motif qualifié dans le message in-app", async () => {
    await notifyRequesterRejected({ ...base, userId: "requester-1", email: null });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CARE_APPOINTMENT_REJECTED",
        message: expect.stringContaining("Hors du champ pastoral"),
      })
    );
  });

  it("ajoute le commentaire libre au motif si présent", async () => {
    await notifyRequesterRejected({ ...base, userId: "requester-1", email: null, comment: "déjà suivi ailleurs" });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("déjà suivi ailleurs") })
    );
  });

  it("demandeur non connecté avec email : envoi d'un email de rejet", async () => {
    await notifyRequesterRejected({ ...base, userId: null, email: "marie@example.com" });

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "marie@example.com" }));
  });
});
