import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notifyUsers = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...args: unknown[]) => notifyUsers(...args) }));
const resolveRecipients = vi.fn();
vi.mock("../services/audience", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/audience")>()),
  resolveRecipients: (...args: unknown[]) => resolveRecipients(...args),
}));

const { dispatchDueMessages, excerpt } = await import("../services/dispatch");

const ALL = { roles: [], ministryIds: [], departmentIds: [], headsOnly: false };
const message = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  churchId: "C1",
  title: "Maintenance",
  body: "Koinonia indisponible samedi.",
  severity: "IMPORTANT",
  audience: ALL,
  ...overrides,
});

describe("envoi des messages système (spec 071)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRecipients.mockResolvedValue(["a", "b", "c"]);
    prismaMock.systemMessage.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.systemMessage.update.mockResolvedValue({});
  });

  it("ne cherche que les messages commencés, non notifiés, non retirés, non terminés", async () => {
    prismaMock.systemMessage.findMany.mockResolvedValue([]);
    const now = new Date();
    await dispatchDueMessages(now);
    expect(prismaMock.systemMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { notifiedAt: null, withdrawnAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      })
    );
  });

  it("notifie le public dans la cloche, avec lien et objet, et enregistre le nombre", async () => {
    prismaMock.systemMessage.findMany.mockResolvedValue([message()]);
    expect(await dispatchDueMessages()).toEqual({ notified: 1, recipients: 3 });
    expect(notifyUsers).toHaveBeenCalledWith(
      ["a", "b", "c"],
      expect.objectContaining({
        domain: "system-messages",
        type: "SYSTEM_MESSAGE",
        link: "/messages/m1",
        entityType: "SystemMessage",
        entityId: "m1",
      }),
      undefined
    );
    expect(prismaMock.systemMessage.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { recipientCount: 3 } });
  });

  it("un message urgent part par email malgré la préférence (ADR-0025)", async () => {
    prismaMock.systemMessage.findMany.mockResolvedValue([message({ severity: "URGENT" })]);
    await dispatchDueMessages();
    expect(notifyUsers).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), { emailPolicy: "always" });
  });

  it("un seul envoi : déjà pris en charge ailleurs, rien ne part", async () => {
    prismaMock.systemMessage.findMany.mockResolvedValue([message()]);
    prismaMock.systemMessage.updateMany.mockResolvedValue({ count: 0 });
    expect(await dispatchDueMessages()).toEqual({ notified: 0, recipients: 0 });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("par lots de 500", async () => {
    resolveRecipients.mockResolvedValue(Array.from({ length: 1200 }, (_, i) => `u${i}`));
    prismaMock.systemMessage.findMany.mockResolvedValue([message()]);
    await dispatchDueMessages();
    expect(notifyUsers.mock.calls.map(([ids]) => (ids as string[]).length)).toEqual([500, 500, 200]);
  });

  it("extrait du texte pour la notification", () => {
    expect(excerpt("a\n\n  b")).toBe("a b");
    expect(excerpt("x".repeat(200))).toHaveLength(160);
  });
});
