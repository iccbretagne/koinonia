import type { Prisma, ServiceStatus } from "@/generated/prisma/client";
import { listAvailabilitySettingsByChurch, DEFAULT_AVAILABILITY_SETTINGS } from "./availability/settings";

/**
 * Notifications regroupées des changements de planning (spec 060, ADR-0021).
 *
 * Chaque écriture du planning enregistre, par STAR × événement × département, le statut **d'avant
 * la première modification** et la date de la dernière. Une tâche planifiée envoie, une fois le
 * délai de l'église écoulé sans nouvelle modification du STAR, **un seul** récapitulatif de son
 * **changement net** (situation d'origine comparée à la situation actuelle).
 *
 * `@/lib/notifications`, `@/lib/email` et `@/lib/prisma` sont importés à l'usage, pour que l'index
 * du module reste importable dans les tests (même raison que `event-change-notices.ts`).
 */

type Db = Prisma.TransactionClient;

export const PLANNING_DIGEST_TYPE = "PLANNING_DIGEST";
const DIGEST_LINK = "/planning";

export interface PlanningChange {
  memberId: string;
  eventId: string;
  departmentId: string;
  /** Statut avant la modification ; `null` = absent du planning. */
  previousStatus: ServiceStatus | null;
}

// ─── Changement net (pur) ────────────────────────────────────────────────────

/** `INDISPONIBLE` est un statut hérité (ADR-0020) : il vaut « ne sert pas ». */
function served(status: ServiceStatus | null | undefined): ServiceStatus | null {
  return status && status !== "INDISPONIBLE" ? status : null;
}

export type NetChange =
  | { kind: "ADDED"; eventId: string; departmentId: string; status: ServiceStatus }
  | { kind: "REMOVED"; eventId: string; departmentId: string }
  | { kind: "CHANGED"; eventId: string; departmentId: string; from: ServiceStatus; to: ServiceStatus };

export const planningKey = (eventId: string, departmentId: string) => `${eventId}:${departmentId}`;

/**
 * Compare la situation d'origine (`rows`) à la situation actuelle (`current`, indexée par
 * `planningKey` ; clé absente = ne sert pas). Une ligne revenue à son état d'origine disparaît.
 */
export function computeNetChanges(
  rows: { eventId: string; departmentId: string; previousStatus: ServiceStatus | null }[],
  current: Map<string, ServiceStatus | null>
): NetChange[] {
  const out: NetChange[] = [];
  for (const row of rows) {
    const from = served(row.previousStatus);
    const to = served(current.get(planningKey(row.eventId, row.departmentId)));
    const { eventId, departmentId } = row;
    if (from === to) continue;
    if (from === null && to !== null) out.push({ kind: "ADDED", eventId, departmentId, status: to });
    else if (from !== null && to === null) out.push({ kind: "REMOVED", eventId, departmentId });
    else if (from !== null && to !== null) out.push({ kind: "CHANGED", eventId, departmentId, from, to });
  }
  return out;
}

// ─── Récapitulatif (pur) ─────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  EN_SERVICE: "en service",
  EN_SERVICE_DEBRIEF: "en service (débrief)",
  REMPLACANT: "remplaçant",
};
const label = (s: ServiceStatus) => STATUS_LABELS[s] ?? s;

const dayFmt = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export type DigestChange = NetChange & { eventTitle: string; eventDate: Date; departmentName: string };

export interface PlanningDigest {
  title: string;
  message: string;
  lines: string[];
  link: string;
}

function digestLine(c: DigestChange): string {
  const where = `${dayFmt(c.eventDate)} — « ${c.eventTitle} » (${c.departmentName})`;
  switch (c.kind) {
    case "ADDED":
      return `${where} : vous servez, ${label(c.status)}.`;
    case "REMOVED":
      return `${where} : vous ne servez plus.`;
    case "CHANGED":
      return `${where} : ${label(c.from)} → ${label(c.to)}.`;
  }
}

export function buildPlanningDigest(changes: DigestChange[]): PlanningDigest {
  const sorted = [...changes].sort(
    (a, b) => a.eventDate.getTime() - b.eventDate.getTime() || a.departmentName.localeCompare(b.departmentName, "fr")
  );
  const lines = sorted.map(digestLine);
  return { title: "Planning mis à jour", message: lines.join(" "), lines, link: DIGEST_LINK };
}

// ─── Enregistrement ──────────────────────────────────────────────────────────

/**
 * À appeler dans la transaction de l'écriture du planning (ou hors transaction avec le client
 * Prisma). Écarte l'auteur (jamais prévenu de ses propres modifications) et les événements passés.
 * Le statut d'origine d'une ligne existante n'est jamais écrasé : seule sa date avance.
 */
export async function recordPlanningChanges(
  db: Db,
  churchId: string,
  changes: PlanningChange[],
  opts: { actorId?: string | null; now?: Date } = {}
): Promise<{ recorded: number }> {
  if (changes.length === 0) return { recorded: 0 };
  const now = opts.now ?? new Date();

  const [authorLinks, upcoming] = await Promise.all([
    opts.actorId
      ? db.memberUserLink.findMany({
          where: { userId: opts.actorId, churchId, validatedAt: { not: null } },
          select: { memberId: true },
        })
      : Promise.resolve([] as { memberId: string }[]),
    db.event.findMany({
      where: { id: { in: [...new Set(changes.map((c) => c.eventId))] }, churchId, date: { gte: now } },
      select: { id: true },
    }),
  ]);
  const authorMembers = new Set(authorLinks.map((l) => l.memberId));
  const upcomingEvents = new Set(upcoming.map((e) => e.id));

  const kept = changes.filter((c) => !authorMembers.has(c.memberId) && upcomingEvents.has(c.eventId));
  for (const c of kept) {
    await db.planningChangeNotice.upsert({
      where: { memberId_eventId_departmentId: { memberId: c.memberId, eventId: c.eventId, departmentId: c.departmentId } },
      create: {
        churchId,
        memberId: c.memberId,
        eventId: c.eventId,
        departmentId: c.departmentId,
        previousStatus: c.previousStatus,
        lastChangedAt: now,
      },
      update: { lastChangedAt: now },
    });
  }
  if (kept.length > 0) {
    // Le délai court par STAR, pas par service : toutes ses lignes repartent du même instant.
    await db.planningChangeNotice.updateMany({
      where: { churchId, memberId: { in: [...new Set(kept.map((c) => c.memberId))] } },
      data: { lastChangedAt: now },
    });
  }
  return { recorded: kept.length };
}

/**
 * Retrait de départements d'un ou plusieurs événements : les STAR planifiés dedans ne servent
 * plus. À appeler dans la transaction, **avant** la suppression des plannings.
 */
export async function recordRemovedPlannings(
  db: Db,
  churchId: string,
  eventDepartmentIds: string[],
  opts: { actorId?: string | null; now?: Date } = {}
): Promise<{ recorded: number }> {
  if (eventDepartmentIds.length === 0) return { recorded: 0 };
  const plannings = await db.planning.findMany({
    where: { eventDepartmentId: { in: eventDepartmentIds } },
    select: { memberId: true, status: true, eventDepartment: { select: { eventId: true, departmentId: true } } },
  });
  return recordPlanningChanges(
    db,
    churchId,
    plannings.map((p) => ({
      memberId: p.memberId,
      eventId: p.eventDepartment.eventId,
      departmentId: p.eventDepartment.departmentId,
      previousStatus: p.status,
    })),
    opts
  );
}

// ─── Envoi ───────────────────────────────────────────────────────────────────

interface NoticeRow {
  id: string;
  churchId: string;
  memberId: string;
  eventId: string;
  departmentId: string;
  previousStatus: ServiceStatus | null;
  lastChangedAt: Date;
}

/** Une modification est arrivée (ou un autre vidage a tourné) pendant la lecture : on y revient au passage suivant. */
class ConcurrentChange extends Error {}

/**
 * Envoie les récapitulatifs des STAR dont toutes les lignes sont calmes depuis le délai de leur
 * église. Appelée par la tâche planifiée `planning-change-notices` (à chaque passage).
 */
export async function flushPlanningChangeNotices(
  now: Date = new Date()
): Promise<{ notified: number; members: number }> {
  const { prisma } = await import("@/lib/prisma");

  const [groups, settings] = await Promise.all([
    prisma.planningChangeNotice.groupBy({ by: ["churchId", "memberId"], _max: { lastChangedAt: true } }),
    listAvailabilitySettingsByChurch(prisma),
  ]);
  const due = groups.filter((g) => {
    const last = g._max.lastChangedAt;
    const delay = settings.get(g.churchId)?.planningNoticeDelayMinutes ?? DEFAULT_AVAILABILITY_SETTINGS.planningNoticeDelayMinutes;
    return last !== null && last.getTime() + delay * 60_000 <= now.getTime();
  });
  if (due.length === 0) return { notified: 0, members: 0 };

  // 1. Prise en charge : lecture puis suppression conditionnelle, annulée si une modification s'est glissée.
  const claimed: NoticeRow[][] = [];
  for (const { churchId, memberId } of due) {
    try {
      const rows = await prisma.$transaction(async (tx) => {
        const found = (await tx.planningChangeNotice.findMany({ where: { churchId, memberId } })) as NoticeRow[];
        if (found.length === 0) return found;
        const snapshot = new Date(Math.max(...found.map((r) => r.lastChangedAt.getTime())));
        const { count } = await tx.planningChangeNotice.deleteMany({
          where: { churchId, memberId, id: { in: found.map((r) => r.id) }, lastChangedAt: { lte: snapshot } },
        });
        if (count !== found.length) throw new ConcurrentChange();
        return found;
      });
      if (rows.length > 0) claimed.push(rows);
    } catch (error) {
      if (!(error instanceof ConcurrentChange)) console.error("[planning-change-notices] prise en charge impossible", memberId, error);
    }
  }
  if (claimed.length === 0) return { notified: 0, members: 0 };

  // 2. Données courantes, en un seul passage pour tous les STAR.
  const all = claimed.flat();
  const eventIds = [...new Set(all.map((r) => r.eventId))];
  const deptIds = [...new Set(all.map((r) => r.departmentId))];
  const memberIds = [...new Set(all.map((r) => r.memberId))];
  const churchIds = [...new Set(all.map((r) => r.churchId))];
  const [events, departments, plannings, links] = await Promise.all([
    prisma.event.findMany({ where: { id: { in: eventIds }, date: { gte: now } }, select: { id: true, title: true, date: true } }),
    prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } }),
    prisma.planning.findMany({
      where: { memberId: { in: memberIds }, eventDepartment: { eventId: { in: eventIds }, departmentId: { in: deptIds } } },
      select: { memberId: true, status: true, eventDepartment: { select: { eventId: true, departmentId: true } } },
    }),
    prisma.memberUserLink.findMany({
      where: { memberId: { in: memberIds }, churchId: { in: churchIds }, validatedAt: { not: null } },
      select: { memberId: true, churchId: true, userId: true },
    }),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const deptById = new Map(departments.map((d) => [d.id, d]));

  const { createNotification } = await import("@/lib/notifications");
  const { buildPlanningChangesEmail } = await import("@/lib/email");

  let notified = 0;
  let members = 0;
  for (const rows of claimed) {
    const { churchId, memberId } = rows[0];
    // Événement disparu ou passé (déjà traité par la spec 059) ou département disparu : rien à dire.
    const usable = rows.filter((r) => eventById.has(r.eventId) && deptById.has(r.departmentId));
    const current = new Map<string, ServiceStatus | null>(
      plannings
        .filter((p) => p.memberId === memberId)
        .map((p) => [planningKey(p.eventDepartment.eventId, p.eventDepartment.departmentId), p.status])
    );
    const net = computeNetChanges(usable, current);
    if (net.length === 0) continue;

    const userIds = links.filter((l) => l.memberId === memberId && l.churchId === churchId).map((l) => l.userId);
    if (userIds.length === 0) continue;

    const digest = buildPlanningDigest(
      net.map((c) => ({
        ...c,
        eventTitle: eventById.get(c.eventId)!.title,
        eventDate: eventById.get(c.eventId)!.date,
        departmentName: deptById.get(c.departmentId)!.name,
      }))
    );
    members += 1;
    for (const userId of userIds) {
      try {
        await createNotification(
          { userId, domain: "planning", type: PLANNING_DIGEST_TYPE, title: digest.title, message: digest.message, link: digest.link },
          { email: buildPlanningChangesEmail({ title: digest.title, lines: digest.lines, link: digest.link }) }
        );
        notified += 1;
      } catch (error) {
        console.error("[planning-change-notices] envoi impossible", userId, error);
      }
    }
  }
  return { notified, members };
}
