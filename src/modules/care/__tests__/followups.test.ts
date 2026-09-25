import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockSendEmail = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
vi.mock("next-auth", () => ({
  default: () => ({
    auth: mockAuth,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const {
  computeMsdpTransitionData,
  buildMsdpCounselorNotifEmail,
  notifyMsdpCounselorAssigned,
  buildMsdpInactivityEmail,
  runMsdpInactivityNotifications,
} = await import("../services/followups");

// ─── Machine à états — reprise à l'identique (ex-msdp-service) ────────────────

describe("computeMsdpTransitionData", () => {
  const now = new Date("2026-01-01T10:00:00Z");

  it("assign_counselor passe en ASSIGNED", () => {
    const data = computeMsdpTransitionData({ status: "SUBMITTED" }, { action: "assign_counselor", counselorId: "u1" }, now);
    expect(data).toEqual({ status: "ASSIGNED", assignedConseillerMsdpId: "u1", assignedAt: now });
  });

  it("contact exige ASSIGNED", () => {
    expect(() => computeMsdpTransitionData({ status: "SUBMITTED" }, { action: "contact" }, now)).toThrow(
      "Transition invalide"
    );
    expect(computeMsdpTransitionData({ status: "ASSIGNED" }, { action: "contact" }, now)).toEqual({
      status: "CONTACTED",
      contactedAt: now,
    });
  });

  it("in_formation exige CONTACTED", () => {
    expect(() => computeMsdpTransitionData({ status: "ASSIGNED" }, { action: "in_formation" }, now)).toThrow();
    expect(computeMsdpTransitionData({ status: "CONTACTED" }, { action: "in_formation" }, now)).toEqual({
      status: "IN_FORMATION",
      inFormationAt: now,
    });
  });

  it("complete exige IN_FORMATION", () => {
    expect(() => computeMsdpTransitionData({ status: "CONTACTED" }, { action: "complete" }, now)).toThrow();
    expect(computeMsdpTransitionData({ status: "IN_FORMATION" }, { action: "complete" }, now)).toEqual({
      status: "COMPLETED",
      completedAt: now,
    });
  });

  it("abandon refuse un suivi déjà terminé", () => {
    expect(() => computeMsdpTransitionData({ status: "COMPLETED" }, { action: "abandon" }, now)).toThrow(
      "suivi terminé"
    );
    expect(computeMsdpTransitionData({ status: "CONTACTED" }, { action: "abandon" }, now)).toEqual({
      status: "ABANDONED",
      abandonedAt: now,
    });
  });

  it("reopen exige ABANDONED", () => {
    expect(() => computeMsdpTransitionData({ status: "CONTACTED" }, { action: "reopen" }, now)).toThrow();
    expect(computeMsdpTransitionData({ status: "ABANDONED" }, { action: "reopen" }, now)).toEqual({
      status: "SUBMITTED",
      abandonedAt: null,
    });
  });

  it("note met à jour les notes quel que soit le statut", () => {
    expect(computeMsdpTransitionData({ status: "SUBMITTED" }, { action: "note", notes: "Contexte" }, now)).toEqual({
      notes: "Contexte",
    });
  });
});

describe("buildMsdpCounselorNotifEmail", () => {
  it("inclut le nom du conseiller, le nom de la personne suivie et le lien vers /care/followups", () => {
    const html = buildMsdpCounselorNotifEmail({
      counselorName: "Jean Dupont",
      personName: "Marie Curie",
      followUpId: "f1",
      appUrl: "https://koinonia.example",
    });

    expect(html).toContain("Jean Dupont");
    expect(html).toContain("Marie Curie");
    expect(html).toContain("https://koinonia.example/care/followups/f1");
  });
});

describe("notifyMsdpCounselorAssigned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
  });

  it("envoie un email quand le conseiller a une adresse email", async () => {
    prismaMock.notification.create.mockResolvedValue({} as never);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jean Dupont",
      email: "jean@example.com",
    } as never);

    await notifyMsdpCounselorAssigned({
      counselorId: "u1",
      followUpId: "f1",
      personName: "Marie Curie",
      appUrl: "https://koinonia.example",
    });

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jean@example.com" })
    );
  });

  it("n'envoie pas d'email si le conseiller n'a pas d'adresse email, mais crée la notification in-app", async () => {
    prismaMock.notification.create.mockResolvedValue({} as never);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jean Dupont",
      email: null,
    } as never);

    await notifyMsdpCounselorAssigned({
      counselorId: "u1",
      followUpId: "f1",
      personName: "Marie Curie",
      appUrl: "https://koinonia.example",
    });

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("ne lève pas d'exception si l'envoi de l'email échoue", async () => {
    prismaMock.notification.create.mockResolvedValue({} as never);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jean Dupont",
      email: "jean@example.com",
    } as never);
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));

    await expect(
      notifyMsdpCounselorAssigned({
        counselorId: "u1",
        followUpId: "f1",
        personName: "Marie Curie",
        appUrl: "https://koinonia.example",
      })
    ).resolves.toBeUndefined();
  });
});

describe("buildMsdpInactivityEmail", () => {
  it("inclut le nom de la personne, le message contextualisé par statut et le lien", () => {
    const html = buildMsdpInactivityEmail({
      churchName: "ICC Rennes",
      personName: "Marie Curie",
      status: "ASSIGNED",
      daysSince: 9,
      link: "/care/followups/f1",
      appUrl: "https://koinonia.example",
    });

    expect(html).toContain("Marie Curie");
    expect(html).toContain("9 jours");
    expect(html).toContain("Un conseiller a été assigné mais le contact n'a pas encore été établi.");
    expect(html).toContain("https://koinonia.example/care/followups/f1");
  });
});

describe("runMsdpInactivityNotifications", () => {
  const originalSmtpHost = process.env.SMTP_HOST;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    process.env.SMTP_HOST = "smtp.example.com";
    prismaMock.notification.create.mockResolvedValue({} as never);
    prismaMock.notification.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalSmtpHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = originalSmtpHost;
  });

  function makeFollowUp(overrides: Record<string, unknown> = {}) {
    return {
      id: "f1",
      churchId: "church-1",
      status: "ASSIGNED",
      updatedAt: new Date(Date.now() - 10 * 86_400_000),
      assignedConseillerMsdp: { id: "counselor-1", name: "Jean Dupont", email: "jean@example.com" },
      request: { firstName: "Marie", lastName: "Curie" },
      church: { id: "church-1", name: "ICC Rennes" },
      ...overrides,
    };
  }

  it("notifie et envoie un email au conseiller assigné pour un suivi inactif", async () => {
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([makeFollowUp()] as never);

    const result = await runMsdpInactivityNotifications("https://koinonia.example");

    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "counselor-1", type: "CARE_MSDP_INACTIVITY", link: "/care/followups/f1" }),
      })
    );
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jean@example.com" }));
    expect(result).toEqual({ notified: 1, skipped: 0, total: 1 });
  });

  it("notifie l'équipe MSDP quand aucun conseiller n'est assigné", async () => {
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([
      makeFollowUp({ status: "SUBMITTED", assignedConseillerMsdp: null }),
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-msdp" }] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { userChurchRole: { userId: "manager-1", user: { id: "manager-1", email: "manager@example.com" } } },
    ] as never);

    const result = await runMsdpInactivityNotifications("https://koinonia.example");

    expect(prismaMock.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ function: "MSDP" }) })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "manager-1" }) })
    );
    expect(result.notified).toBe(1);
  });

  it("MSDP porté par deux départements : une personne membre des deux n'est notifiée qu'une fois (spec 046)", async () => {
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([
      makeFollowUp({ status: "SUBMITTED", assignedConseillerMsdp: null }),
    ] as never);
    prismaMock.department.findMany.mockResolvedValue([{ id: "dept-msdp-1" }, { id: "dept-msdp-2" }] as never);
    prismaMock.userDepartment.findMany.mockResolvedValue([
      { userChurchRole: { userId: "manager-1", user: { id: "manager-1", email: "manager@example.com" } } },
      { userChurchRole: { userId: "manager-1", user: { id: "manager-1", email: "manager@example.com" } } },
    ] as never);

    const result = await runMsdpInactivityNotifications("https://koinonia.example");

    expect(prismaMock.userDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: { in: ["dept-msdp-1", "dept-msdp-2"] } } })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(result.notified).toBe(1);
  });

  it("n'interroge que les statuts non terminaux", async () => {
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([]);

    await runMsdpInactivityNotifications("https://koinonia.example");

    expect(prismaMock.msdpFollowUp.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION"] },
        }),
      })
    );
  });

  it("ne renotifie pas un suivi déjà notifié récemment", async () => {
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([makeFollowUp()] as never);
    prismaMock.notification.findMany.mockResolvedValue([
      { link: "/care/followups/f1" },
    ] as never);

    const result = await runMsdpInactivityNotifications("https://koinonia.example");

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0, skipped: 1, total: 1 });
  });

  it("continue de traiter les autres suivis si l'envoi d'email échoue pour l'un d'eux", async () => {
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([
      makeFollowUp({ id: "f1" }),
      makeFollowUp({
        id: "f2",
        assignedConseillerMsdp: { id: "counselor-2", name: "Paul", email: "paul@example.com" },
      }),
    ] as never);
    mockSendEmail.mockRejectedValueOnce(new Error("SMTP down")).mockResolvedValueOnce(undefined);

    const result = await expect(
      runMsdpInactivityNotifications("https://koinonia.example")
    ).resolves.toEqual({ notified: 2, skipped: 0, total: 2 });

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    return result;
  });
});
