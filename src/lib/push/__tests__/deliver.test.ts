import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const sendNotification = vi.fn();
let configured = true;
vi.mock("../config", () => ({ getWebPush: () => (configured ? { sendNotification } : null) }));

const { deliverPendingPush, runPushCatchUp, CATCH_UP_WINDOW_MS } = await import("../deliver");

const notification = (id: string, userId: string, domain = "planning") => ({
  id,
  userId,
  domain,
  title: "Ajouté au service",
  message: "Dimanche",
  link: "/planning",
});
const sub = (id: string, userId: string) => ({ id, userId, endpoint: `https://push.example/${id}`, p256dh: "p", auth: "a" });
const immediate = { userIds: ["u1"], type: "PLANNING_ADDED", createdAfter: new Date("2026-10-27T10:00:00Z") };

describe("deliverPendingPush (spec 068, ADR-0024)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured = true;
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.notificationPushPreference.findMany.mockResolvedValue([]);
    prismaMock.pushSubscription.findMany.mockResolvedValue([sub("s1", "u1")]);
    prismaMock.pushSubscription.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
    sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it("envoie la notification de la cloche à l'appareil, après l'avoir prise en charge", async () => {
    prismaMock.notification.findMany.mockResolvedValue([notification("n1", "u1")]);
    const result = await deliverPendingPush(immediate);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", pushedAt: null },
      data: { pushedAt: expect.any(Date) },
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [target, body, options] = sendNotification.mock.calls[0];
    expect(target).toEqual({ endpoint: "https://push.example/s1", keys: { p256dh: "p", auth: "a" } });
    expect(JSON.parse(body)).toEqual({ title: "Ajouté au service", body: "Dimanche", url: "/planning", tag: "n1" });
    expect(options).toEqual(expect.objectContaining({ TTL: 86400 }));
    expect(prismaMock.pushSubscription.updateMany).toHaveBeenCalledWith({ where: { id: "s1" }, data: { lastSuccessAt: expect.any(Date) } });
    expect(result).toEqual({ sent: 1, removed: 0 });
  });

  it("déjà prise par un autre passage : rien n'est envoyé (pas de doublon)", async () => {
    prismaMock.notification.findMany.mockResolvedValue([notification("n1", "u1")]);
    prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });
    await deliverPendingPush(immediate);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("préférence désactivée pour le domaine : prise en charge sans envoi", async () => {
    prismaMock.notification.findMany.mockResolvedValue([notification("n1", "u1")]);
    prismaMock.notificationPushPreference.findMany.mockResolvedValue([{ userId: "u1", domain: "planning", enabled: false }]);
    await deliverPendingPush(immediate);
    expect(prismaMock.notification.updateMany).toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("plusieurs appareils : chacun reçoit la notification", async () => {
    prismaMock.notification.findMany.mockResolvedValue([notification("n1", "u1")]);
    prismaMock.pushSubscription.findMany.mockResolvedValue([sub("s1", "u1"), sub("s2", "u1"), sub("s3", "autre")]);
    await deliverPendingPush(immediate);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it.each([404, 410])("réponse %i : l'appareil n'est plus visé", async (statusCode) => {
    prismaMock.notification.findMany.mockResolvedValue([notification("n1", "u1")]);
    sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode }));
    const result = await deliverPendingPush(immediate);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(result.removed).toBe(1);
  });

  it("autre erreur : journalisée, jamais remontée, appareil conservé", async () => {
    prismaMock.notification.findMany.mockResolvedValue([notification("n1", "u1")]);
    sendNotification.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 500 }));
    await expect(deliverPendingPush(immediate)).resolves.toEqual({ sent: 0, removed: 0 });
    expect(prismaMock.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it("une panne de base est avalée", async () => {
    prismaMock.notification.findMany.mockRejectedValue(new Error("db down"));
    await expect(deliverPendingPush(immediate)).resolves.toEqual({ sent: 0, removed: 0 });
  });

  it("sans clés VAPID : aucune prise en charge, aucun envoi", async () => {
    configured = false;
    prismaMock.notification.findMany.mockResolvedValue([notification("n1", "u1")]);
    await deliverPendingPush(immediate);
    expect(prismaMock.notification.findMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled();
  });

  it("appel immédiat : filtre sur les destinataires, le type et l'instant de création", async () => {
    prismaMock.notification.findMany.mockResolvedValue([]);
    await deliverPendingPush(immediate);
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pushedAt: null, userId: { in: ["u1"] }, type: "PLANNING_ADDED", createdAt: { gte: immediate.createdAfter } },
      })
    );
  });

  it("rattrapage : seulement la dernière heure", async () => {
    prismaMock.notification.findMany.mockResolvedValue([]);
    const now = new Date("2026-10-27T12:00:00Z");
    await runPushCatchUp(now);
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pushedAt: null, createdAt: { gte: new Date(now.getTime() - CATCH_UP_WINDOW_MS) } } })
    );
  });
});
