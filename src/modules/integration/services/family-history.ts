import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const ENTITY_TYPE = "FamilyIntegrationRequest";

/**
 * Statut d'arrivée des actions journalisées avant la spec 051, dont le journal ne stockait
 * que `{ action }` : permet d'afficher l'historique existant sans reprise de données.
 */
const LEGACY_ACTION_TARGET: Record<string, string> = {
  assign: "ASSIGNED",
  contact: "CONTACTED",
  whatsapp: "WHATSAPP_ADDED",
  integrate: "INTEGRATED",
  abandon: "ABANDONED",
  reopen: "SUBMITTED",
};

export interface RequestHistoryEntry {
  id: string;
  action: string;
  from: string | null;
  to: string | null;
  note: string | null;
  at: Date;
  author: string | null;
}

/**
 * Journalise une action sur une demande avec son état de départ et d'arrivée — c'est ce qui
 * rend l'historique des statuts consultable sur la fiche (spec 051).
 */
export async function recordStatusChange(params: {
  userId: string;
  churchId: string;
  requestId: string;
  action: string;
  from: string;
  to: string;
  note?: string | null;
}): Promise<void> {
  const { userId, churchId, requestId, action, from, to, note } = params;
  await logAudit({
    userId,
    churchId,
    action: "UPDATE",
    entityType: ENTITY_TYPE,
    entityId: requestId,
    details: { action, from, to, ...(note ? { note } : {}) },
  });
}

/**
 * Met en forme les entrées du journal : ne garde que les changements d'état et les relances
 * consignées (les notes et corrections de fiche n'y figurent pas), dans l'ordre chronologique.
 */
export function toRequestHistory(
  logs: {
    id: string;
    details: unknown;
    createdAt: Date;
    user: { name: string | null; displayName: string | null } | null;
  }[]
): RequestHistoryEntry[] {
  const entries: RequestHistoryEntry[] = [];
  for (const log of logs) {
    const details = (log.details ?? {}) as Record<string, unknown>;
    const action = typeof details.action === "string" ? details.action : null;
    if (!action) continue;
    const from = typeof details.from === "string" ? details.from : null;
    const to = typeof details.to === "string" ? details.to : (LEGACY_ACTION_TARGET[action] ?? null);
    const isStatusChange = to !== null && from !== to;
    if (!isStatusChange && action !== "relance") continue;
    entries.push({
      id: log.id,
      action,
      from,
      to,
      note: typeof details.note === "string" ? details.note : null,
      at: log.createdAt,
      author: log.user?.displayName ?? log.user?.name ?? null,
    });
  }
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function getRequestHistory(requestId: string): Promise<RequestHistoryEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { entityType: ENTITY_TYPE, entityId: requestId },
    select: {
      id: true,
      details: true,
      createdAt: true,
      user: { select: { name: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return toRequestHistory(logs);
}
