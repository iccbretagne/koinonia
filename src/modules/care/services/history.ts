import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * Historique unifié des demandes de rendez-vous et des suivis (spec 052, lot 2) — sur le
 * modèle de `family-history.ts` (051), généralisé aux deux entités `care`. Lit aussi bien les
 * entrées `{ action, from, to, assignee?, note? }` du lot 2 que les formats hérités du lot 1 :
 * `{ transition: "PENDING→VALIDATED", … }` (demandes) et `{ action }` seul (suivis).
 */

export type CareItemKind = "requests" | "followups";

const ENTITY_TYPE: Record<CareItemKind, string> = {
  requests: "AppointmentRequest",
  followups: "MsdpFollowUp",
};

export interface CareHistoryEntry {
  id: string;
  action: string | null;
  from: string | null;
  to: string | null;
  assignee: string | null;
  note: string | null;
  at: Date;
  author: string | null;
}

export async function recordCareHistory(params: {
  userId: string;
  churchId: string;
  kind: CareItemKind;
  itemId: string;
  action: string;
  from: string | null;
  to: string | null;
  assignee?: string | null;
  note?: string | null;
}): Promise<void> {
  const { userId, churchId, kind, itemId, action, from, to, assignee, note } = params;
  await logAudit({
    userId,
    churchId,
    action: "UPDATE",
    entityType: ENTITY_TYPE[kind],
    entityId: itemId,
    details: {
      action,
      from,
      to,
      ...(assignee ? { assignee } : {}),
      ...(note ? { note } : {}),
    },
  });
}

export function toCareHistory(
  logs: {
    id: string;
    details: unknown;
    createdAt: Date;
    user: { name: string | null; displayName: string | null } | null;
  }[]
): CareHistoryEntry[] {
  const entries: CareHistoryEntry[] = [];
  for (const log of logs) {
    const details = (log.details ?? {}) as Record<string, unknown>;
    const author = log.user?.displayName ?? log.user?.name ?? null;

    if (typeof details.action === "string") {
      // Lot 2 : { action, from, to, assignee?, note? } — ou lot 1 MSDP : { action } seul.
      entries.push({
        id: log.id,
        action: details.action,
        from: typeof details.from === "string" ? details.from : null,
        to: typeof details.to === "string" ? details.to : null,
        assignee: typeof details.assignee === "string" ? details.assignee : null,
        note: typeof details.note === "string" ? details.note : null,
        at: log.createdAt,
        author,
      });
      continue;
    }

    if (typeof details.transition === "string") {
      // Lot 1 : { transition: "PENDING→VALIDATED", … }
      const [from, to] = details.transition.split("→");
      entries.push({
        id: log.id,
        action: null,
        from: from ?? null,
        to: to ?? null,
        assignee: null,
        note: null,
        at: log.createdAt,
        author,
      });
    }
  }
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function getCareHistory(kind: CareItemKind, itemId: string): Promise<CareHistoryEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { entityType: ENTITY_TYPE[kind], entityId: itemId },
    select: {
      id: true,
      details: true,
      createdAt: true,
      user: { select: { name: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return toCareHistory(logs);
}

/** Église et existence d'un item `care`, pour contrôler l'accès avant d'en lire l'historique. */
export async function getItemChurchId(kind: CareItemKind, itemId: string): Promise<string | null> {
  if (kind === "requests") {
    const item = await prisma.appointmentRequest.findUnique({ where: { id: itemId }, select: { churchId: true } });
    return item?.churchId ?? null;
  }
  const item = await prisma.msdpFollowUp.findUnique({ where: { id: itemId }, select: { churchId: true } });
  return item?.churchId ?? null;
}
