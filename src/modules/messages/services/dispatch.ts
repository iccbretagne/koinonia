import { resolveRecipients } from "./audience";
import { parseAudience } from "./messages";

/**
 * Notification des messages système au début de leur période (spec 071) : appelée juste après
 * une publication immédiate et par la tâche cron `system-messages` (programmés, rattrapage).
 * `notifiedAt`, pris de façon atomique, garantit un seul envoi par message.
 */

const BATCH_SIZE = 500;
const MAX_MESSAGES_PER_RUN = 20;
const EXCERPT_LENGTH = 160;

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export function excerpt(text: string, max = EXCERPT_LENGTH): string {
  const flat = text.replaceAll(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface DueMessage {
  id: string;
  churchId: string | null;
  title: string;
  body: string;
  severity: "INFO" | "IMPORTANT" | "URGENT";
  audience: unknown;
}

async function notifyMessage(message: DueMessage): Promise<number> {
  const { notifyUsers } = await import("@/lib/notifications");
  const recipients = await resolveRecipients({ churchId: message.churchId, audience: parseAudience(message.audience) });
  const notification = {
    domain: "system-messages",
    type: "SYSTEM_MESSAGE",
    title: message.title,
    message: excerpt(message.body),
    link: `/messages/${message.id}`,
    entityType: "SystemMessage",
    entityId: message.id,
  };
  const options = message.severity === "URGENT" ? { emailPolicy: "always" as const } : undefined;
  // Lots successifs : un message d'instance peut viser des milliers de comptes.
  await chunk(recipients, BATCH_SIZE).reduce(
    (previous, batch) => previous.then(() => notifyUsers(batch, notification, options)),
    Promise.resolve()
  );
  return recipients.length;
}

/** Notifie les messages dont la période a commencé et qui ne l'ont pas encore été. */
export async function dispatchDueMessages(now = new Date()): Promise<{ notified: number; recipients: number }> {
  const prisma = await db();
  const due = await prisma.systemMessage.findMany({
    where: { notifiedAt: null, withdrawnAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    take: MAX_MESSAGES_PER_RUN,
    select: { id: true, churchId: true, title: true, body: true, severity: true, audience: true },
  });

  const results = await Promise.all(
    due.map(async (message) => {
      const claimed = await prisma.systemMessage.updateMany({
        where: { id: message.id, notifiedAt: null, withdrawnAt: null },
        data: { notifiedAt: now },
      });
      if (claimed.count === 0) return null;
      const count = await notifyMessage(message);
      await prisma.systemMessage.update({ where: { id: message.id }, data: { recipientCount: count } });
      return count;
    })
  );

  const sent = results.filter((r): r is number => r !== null);
  return { notified: sent.length, recipients: sent.reduce((sum, n) => sum + n, 0) };
}
