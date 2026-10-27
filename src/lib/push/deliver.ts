import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getWebPush } from "./config";
import { buildPushPayload } from "./payload";
import { pushAllowedByUser } from "./preferences";

const TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 5000;
const CONCURRENCY = 10;
/** Au-delà, une notification n'est plus poussée en retard (rattrapage). */
export const CATCH_UP_WINDOW_MS = 60 * 60 * 1000;

export type PendingPushFilter =
  | { userIds: string[]; type: string; createdAfter: Date }
  | { since: Date };

type PendingNotification = {
  id: string;
  userId: string;
  domain: string | null;
  title: string;
  message: string;
  link: string | null;
};

async function claim(notifications: PendingNotification[]): Promise<PendingNotification[]> {
  const now = new Date();
  const claimed: PendingNotification[] = [];
  for (const notification of notifications) {
    // Prise de main atomique : l'appel immédiat et le rattrapage ne livrent jamais deux fois.
    const { count } = await prisma.notification.updateMany({
      where: { id: notification.id, pushedAt: null },
      data: { pushedAt: now },
    });
    if (count === 1) claimed.push(notification);
  }
  return claimed;
}

async function allowed(notifications: PendingNotification[]): Promise<PendingNotification[]> {
  const byDomain = new Map<string, PendingNotification[]>();
  for (const n of notifications) {
    const key = n.domain ?? "";
    byDomain.set(key, [...(byDomain.get(key) ?? []), n]);
  }
  const kept: PendingNotification[] = [];
  for (const [domain, list] of byDomain) {
    const prefs = await pushAllowedByUser([...new Set(list.map((n) => n.userId))], domain);
    kept.push(...list.filter((n) => prefs.get(n.userId)));
  }
  return kept;
}

async function runBounded<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Livre en notification native les notifications de la cloche encore à traiter (spec 068,
 * ADR-0024). Appelée juste après l'email pour les notifications créées hors transaction, et par
 * le rattrapage cron pour les autres. Ne fait jamais échouer l'appelant.
 */
export async function deliverPendingPush(filter: PendingPushFilter): Promise<{ sent: number; removed: number }> {
  const result = { sent: 0, removed: 0 };
  const webpush = getWebPush();
  if (!webpush) return result;
  if ("userIds" in filter && filter.userIds.length === 0) return result;

  try {
    const where =
      "since" in filter
        ? { pushedAt: null, createdAt: { gte: filter.since } }
        : { pushedAt: null, userId: { in: filter.userIds }, type: filter.type, createdAt: { gte: filter.createdAfter } };
    const pending = await prisma.notification.findMany({
      where,
      select: { id: true, userId: true, domain: true, title: true, message: true, link: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    if (pending.length === 0) return result;

    const toSend = await allowed(await claim(pending));
    if (toSend.length === 0) return result;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: [...new Set(toSend.map((n) => n.userId))] } },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });
    const jobs = toSend.flatMap((n) =>
      subscriptions.filter((s) => s.userId === n.userId).map((subscription) => ({ notification: n, subscription }))
    );

    await runBounded(jobs, async ({ notification, subscription }) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(buildPushPayload(notification)),
          { TTL: TTL_SECONDS, timeout: TIMEOUT_MS }
        );
        result.sent++;
        await prisma.pushSubscription.updateMany({ where: { id: subscription.id }, data: { lastSuccessAt: new Date() } });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Appareil désabonné, désinstallé ou autorisation retirée : on cesse de le viser.
          await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
          result.removed++;
        } else {
          logger.warn({ err: error, subscriptionId: subscription.id, status }, "Notification native non envoyée");
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, "Livraison des notifications natives interrompue");
  }
  return result;
}

/** Rattrapage cron (`push-delivery`, every-run) : notifications de la dernière heure non livrées. */
export function runPushCatchUp(now: Date = new Date()) {
  return deliverPendingPush({ since: new Date(now.getTime() - CATCH_UP_WINDOW_MS) });
}
