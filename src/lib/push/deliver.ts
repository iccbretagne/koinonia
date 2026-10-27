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

/** Prise de main atomique : l'appel immédiat et le rattrapage ne livrent jamais deux fois. */
async function claim(notifications: PendingNotification[]): Promise<PendingNotification[]> {
  const now = new Date();
  const results = await Promise.all(
    notifications.map((notification) =>
      prisma.notification.updateMany({ where: { id: notification.id, pushedAt: null }, data: { pushedAt: now } })
    )
  );
  return notifications.filter((_, i) => results[i].count === 1);
}

async function allowed(notifications: PendingNotification[]): Promise<PendingNotification[]> {
  const byDomain = new Map<string, PendingNotification[]>();
  for (const n of notifications) {
    const key = n.domain ?? "";
    byDomain.set(key, [...(byDomain.get(key) ?? []), n]);
  }
  const perDomain = await Promise.all(
    [...byDomain].map(async ([domain, list]) => {
      const prefs = await pushAllowedByUser([...new Set(list.map((n) => n.userId))], domain);
      return list.filter((n) => prefs.get(n.userId));
    })
  );
  return perDomain.flat();
}

/** Au plus `CONCURRENCY` envois simultanés : les éléments sont répartis en files traitées en série. */
async function runBounded<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, (_, lane) =>
    items.filter((_, i) => i % CONCURRENCY === lane)
  );
  await Promise.all(
    lanes.map((lane) => lane.reduce<Promise<void>>((previous, item) => previous.then(() => worker(item)), Promise.resolve()))
  );
}

/**
 * Livre en notification native les notifications de la cloche encore à traiter (spec 068,
 * ADR-0024). Appelée juste après l'email pour les notifications créées hors transaction, et par
 * le rattrapage cron pour les autres. Ne fait jamais échouer l'appelant.
 */
export async function deliverPendingPush(filter: PendingPushFilter): Promise<{ sent: number; removed: number }> {
  const webpush = getWebPush();
  if (!webpush || ("userIds" in filter && filter.userIds.length === 0)) return { sent: 0, removed: 0 };
  let sent = 0;
  let removed = 0;

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
    if (pending.length === 0) return { sent, removed };

    const toSend = await allowed(await claim(pending));
    if (toSend.length === 0) return { sent, removed };

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
        sent++;
        await prisma.pushSubscription.updateMany({ where: { id: subscription.id }, data: { lastSuccessAt: new Date() } });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Appareil désabonné, désinstallé ou autorisation retirée : on cesse de le viser.
          await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
          removed++;
        } else {
          logger.warn({ err: error, subscriptionId: subscription.id, status }, "Notification native non envoyée");
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, "Livraison des notifications natives interrompue");
  }
  return { sent, removed };
}

/** Rattrapage cron (`push-delivery`, every-run) : notifications de la dernière heure non livrées. */
export function runPushCatchUp(now: Date = new Date()) {
  return deliverPendingPush({ since: new Date(now.getTime() - CATCH_UP_WINDOW_MS) });
}
