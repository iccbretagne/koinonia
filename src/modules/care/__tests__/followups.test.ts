import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockCreateNotification = vi.fn();
const mockNotifyUsers = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  notifyUsers: (...args: unknown[]) => mockNotifyUsers(...args),
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
  buildMsdpCounselorNotifEmail,
  notifyMsdpCounselorAssigned,
  buildMsdpInactivityEmail,
  runMsdpInactivityNotifications,
} = await import("../services/followups");

// La machine à états (assign/reassign/contact/…) est désormais testée dans
// `followup-state.test.ts` (T40, spec 052 lot 2) — signature et droits ont changé (accompagnant
// en charge, deux populations d'affectation).

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
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("transmet le contenu email quand le conseiller a une adresse email", async () => {
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

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const [params, options] = mockCreateNotification.mock.calls[0];
    expect(params).toEqual(expect.objectContaining({ userId: "u1", domain: "care", type: "CARE_MSDP_ASSIGNED" }));
    expect(options?.email).toBeDefined();
  });

  it("n'envoie pas de contenu email si le conseiller n'a pas d'adresse email, mais crée la notification in-app", async () => {
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

    const [, options] = mockCreateNotification.mock.calls[0];
    expect(options).toBeUndefined();
  });

  it("ne lève pas d'exception si l'écriture de la notification échoue", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jean Dupont",
      email: "jean@example.com",
    } as never);
    mockCreateNotification.mockRejectedValue(new Error("DB down"));

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
    expect(html).toContain("Un référent a été désigné mais le contact n'a pas encore été établi.");
    expect(html).toContain("https://koinonia.example/care/followups/f1");
  });
});

describe("runMsdpInactivityNotifications", () => {
  const originalSmtpHost = process.env.SMTP_HOST;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateNotification.mockResolvedValue(undefined);
    mockNotifyUsers.mockResolvedValue(undefined);
    process.env.SMTP_HOST = "smtp.example.com";
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

  it("notifie et transmet le contenu email au conseiller assigné pour un suivi inactif", async () => {
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([makeFollowUp()] as never);

    const result = await runMsdpInactivityNotifications("https://koinonia.example");

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const [params, options] = mockCreateNotification.mock.calls[0];
    expect(params).toEqual(expect.objectContaining({ userId: "counselor-1", domain: "care", type: "CARE_MSDP_INACTIVITY", link: "/care/followups/f1" }));
    expect(options?.email).toBeDefined();
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
    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    expect(mockNotifyUsers.mock.calls[0][0]).toEqual(["manager-1"]);
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
    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    expect(mockNotifyUsers.mock.calls[0][0]).toEqual(["manager-1"]);
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

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0, skipped: 1, total: 1 });
  });

  it("continue de traiter les autres suivis si l'écriture de l'un d'eux échoue", async () => {
    prismaMock.msdpFollowUp.findMany.mockResolvedValue([
      makeFollowUp({ id: "f1" }),
      makeFollowUp({
        id: "f2",
        assignedConseillerMsdp: { id: "counselor-2", name: "Paul", email: "paul@example.com" },
      }),
    ] as never);
    mockCreateNotification.mockRejectedValueOnce(new Error("DB down")).mockResolvedValueOnce(undefined);

    const result = await expect(
      runMsdpInactivityNotifications("https://koinonia.example")
    ).resolves.toEqual({ notified: 2, skipped: 0, total: 2 });

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    return result;
  });
});
