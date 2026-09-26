import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockSendEmail = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  appendPreferenceFooter: (html: string, label: string) => `${html}<!--footer:${label}-->`,
  buildGenericNotificationEmail: (params: { title: string; message: string; link?: string }) => ({
    subject: params.title,
    html: `<p>${params.message}</p>`,
  }),
}));

const {
  createNotification,
  notifyUsers,
  notifyUsersWithRole,
  notifyDeptMembers,
  dispatchUserEmails,
} = await import("../notifications");

describe("dispatchUserEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([]);
  });

  it("aucun destinataire → aucune requête, résultat vide", async () => {
    const result = await dispatchUserEmails([], "accounting", { subject: "s", html: "h" });
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("envoie au compte avec adresse email et préférence par défaut activée (domaine accounting), ignore celui sans adresse", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", email: "a@example.com" },
      { id: "u2", email: null },
    ]);

    const result = await dispatchUserEmails(["u1", "u2"], "accounting", { subject: "Sujet", html: "<p>Corps</p>" });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith({ to: "a@example.com", subject: "Sujet", html: expect.stringContaining("<!--footer:") });
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it("n'envoie rien si l'interrupteur général est coupé, même pour un domaine activé par défaut", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", email: "a@example.com" }]);
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([
      { userId: "u1", domain: "*", enabled: false },
    ]);

    const result = await dispatchUserEmails(["u1"], "accounting", { subject: "s", html: "h" });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("n'envoie rien pour un domaine désactivé par défaut (rooms) sans préférence explicite", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", email: "a@example.com" }]);

    const result = await dispatchUserEmails(["u1"], "rooms", { subject: "s", html: "h" });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("envoie pour un domaine désactivé par défaut si l'utilisateur l'a explicitement activé", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", email: "a@example.com" }]);
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([
      { userId: "u1", domain: "rooms", enabled: true },
    ]);

    const result = await dispatchUserEmails(["u1"], "rooms", { subject: "s", html: "h" });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it("avale et journalise une erreur SMTP sans faire échouer l'appel, et la compte dans failed", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", email: "a@example.com" },
      { id: "u2", email: "b@example.com" },
    ]);
    mockSendEmail.mockRejectedValueOnce(new Error("SMTP down")).mockResolvedValueOnce(undefined);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await expect(dispatchUserEmails(["u1", "u2"], "accounting", { subject: "s", html: "h" })).resolves.toEqual({
      sent: 1,
      failed: 1,
    });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    void result;
  });
});

describe("tx optionnel — jamais d'email envoyé quand une transaction est fournie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([]);
  });

  it("createNotification avec tx : écrit via le client transactionnel, n'envoie aucun email même si un contenu est fourni", async () => {
    const txCreate = vi.fn().mockResolvedValue({});
    const tx = { notification: { create: txCreate } } as never;

    await createNotification(
      { userId: "u1", domain: "accounting", type: "T", title: "titre", message: "msg" },
      { tx, email: { subject: "s", html: "h" } }
    );

    expect(txCreate).toHaveBeenCalledWith({ data: { userId: "u1", domain: "accounting", type: "T", title: "titre", message: "msg", link: undefined } });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("notifyUsers avec tx : createMany sur le client transactionnel, aucun email", async () => {
    const txCreateMany = vi.fn().mockResolvedValue({});
    const tx = { notification: { createMany: txCreateMany } } as never;

    await notifyUsers(["u1", "u2"], { domain: "accounting", type: "T", title: "t", message: "m" }, { tx, email: { subject: "s", html: "h" } });

    expect(txCreateMany).toHaveBeenCalled();
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("notifyUsersWithRole avec tx : résout les destinataires et écrit via le client transactionnel, aucun email", async () => {
    const txFindMany = vi.fn().mockResolvedValue([{ userId: "u1" }]);
    const txCreateMany = vi.fn().mockResolvedValue({});
    const tx = { userChurchRole: { findMany: txFindMany }, notification: { createMany: txCreateMany } } as never;

    await notifyUsersWithRole("church1", "ACCOUNTANT", { domain: "accounting", type: "T", title: "t", message: "m" }, { tx, email: { subject: "s", html: "h" } });

    expect(txFindMany).toHaveBeenCalled();
    expect(txCreateMany).toHaveBeenCalled();
    expect(prismaMock.userChurchRole.findMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("notifyDeptMembers avec tx : résout les destinataires et écrit via le client transactionnel, aucun email", async () => {
    const txFindMany = vi.fn().mockResolvedValue([]);
    const txCreateMany = vi.fn().mockResolvedValue({});
    const tx = { userChurchRole: { findMany: txFindMany }, notification: { createMany: txCreateMany } } as never;

    await notifyDeptMembers("church1", "CAPTATION_AUDIO", { domain: "accounting", type: "T", title: "t", message: "m" }, { tx, email: { subject: "s", html: "h" } });

    expect(txFindMany).toHaveBeenCalled();
    expect(prismaMock.userChurchRole.findMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("sans tx — l'email part quand un contenu est fourni et la préférence l'autorise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockResolvedValue({});
    prismaMock.notification.createMany.mockResolvedValue({});
  });

  it("createNotification sans tx et avec email : écrit in-app puis envoie l'email", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", email: "a@example.com" }]);

    await createNotification(
      { userId: "u1", domain: "accounting", type: "T", title: "t", message: "m" },
      { email: { subject: "s", html: "h" } }
    );

    expect(prismaMock.notification.create).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("createNotification sans contenu email fourni : construit un gabarit générique et l'envoie quand même (spec 053, lot 2)", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", email: "a@example.com" }]);

    await createNotification({ userId: "u1", domain: "accounting", type: "T", title: "t", message: "m" });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: "t" }));
  });

  it("notifyUsers([]) : aucune écriture, aucun envoi", async () => {
    await notifyUsers([], { domain: "accounting", type: "T", title: "t", message: "m" }, { email: { subject: "s", html: "h" } });
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

/**
 * Test de bout en bout (spec 053, T61) : un domaine désactivé par défaut (`rooms`,
 * `defaultEmail: false`) n'envoie rien tant que l'utilisateur ne l'a pas explicitement activé,
 * puis envoie effectivement l'email une fois cette préférence enregistrée — en passant par le
 * point d'entrée réel (`createNotification`), pas directement par `dispatchUserEmails`.
 */
describe("bout en bout — activer un domaine désactivé par défaut déclenche bien l'email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    prismaMock.notification.create.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", email: "a@example.com" }]);
  });

  it("domaine « rooms » jamais réglé : aucun email, malgré un contenu email fourni", async () => {
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([]);

    await createNotification(
      { userId: "u1", domain: "rooms", type: "ROOM_CHECKLIST_ISSUE", title: "t", message: "m", link: "/rooms" },
      { email: { subject: "s", html: "h" } }
    );

    expect(prismaMock.notification.create).toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("domaine « rooms » explicitement activé par l'utilisateur : l'email part", async () => {
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([
      { userId: "u1", domain: "rooms", enabled: true },
    ]);

    await createNotification(
      { userId: "u1", domain: "rooms", type: "ROOM_CHECKLIST_ISSUE", title: "t", message: "m", link: "/rooms" },
      { email: { subject: "s", html: "h" } }
    );

    expect(prismaMock.notification.create).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith({ to: "a@example.com", subject: "s", html: expect.stringContaining("<!--footer:") });
  });
});
