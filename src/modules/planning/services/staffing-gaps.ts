import type { Session } from "next-auth";

/**
 * Départements « sans STAR planifié » : prévus sur un événement (EventDepartment) mais sans
 * personne en service (En service, Debrief ou Remplaçant). Signalés seulement aux personnes qui
 * peuvent les planifier (`planning:department`, dans leur périmètre de départements) et seulement
 * pour les événements à venir — un STAR et l'export partagé n'en voient qu'une carte neutre.
 */

/** Statuts qui comptent comme « STAR planifié » sur un événement. */
export const PLANNED_STATUSES = ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"] as const;

/** Qui voit les départements sans STAR planifié, et lesquels. */
export interface StaffingGapViewer {
  /** Le département fait-il partie du périmètre que l'appelant peut planifier ? */
  readonly inScope: (departmentId: string) => boolean;
}

/** Événement à venir : à partir d'aujourd'hui (00:00), un événement du jour compte encore. */
export function isUpcoming(date: Date, now: Date = new Date()): boolean {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return date >= startOfToday;
}

/**
 * `null` si l'appelant ne peut planifier aucun département dans l'église (STAR, Reporter…) :
 * il ne voit alors aucun signalement.
 */
export async function getStaffingGapViewer(session: Session, churchId: string): Promise<StaffingGapViewer | null> {
  // Import différé : `@/lib/auth` instancie NextAuth au chargement (voir opening-closing.service).
  const { getUserDepartmentScope, hasChurchPermission } = await import("@/lib/auth");
  if (!(await hasChurchPermission(session, "planning:department", churchId))) return null;
  const scope = getUserDepartmentScope(session, churchId);
  if (!scope.scoped) return { inScope: () => true };
  const ids = new Set(scope.departmentIds);
  return { inScope: (departmentId) => ids.has(departmentId) };
}

/**
 * Nombre de départements sans STAR planifié par événement, dans le périmètre de `viewer`.
 * Les événements passés et ceux sans manque n'apparaissent pas dans le résultat.
 */
export async function countUnstaffedDepartments(
  events: readonly { readonly id: string; readonly date: Date }[],
  viewer: StaffingGapViewer,
  now: Date = new Date()
): Promise<Map<string, number>> {
  const eventIds = events.filter((e) => isUpcoming(e.date, now)).map((e) => e.id);
  const counts = new Map<string, number>();
  if (eventIds.length === 0) return counts;

  const { prisma } = await import("@/lib/prisma");
  const eventDepts = await prisma.eventDepartment.findMany({
    where: { eventId: { in: eventIds } },
    select: {
      eventId: true,
      departmentId: true,
      _count: { select: { plannings: { where: { status: { in: [...PLANNED_STATUSES] } } } } },
    },
  });
  for (const ed of eventDepts) {
    if (ed._count.plannings > 0 || !viewer.inScope(ed.departmentId)) continue;
    counts.set(ed.eventId, (counts.get(ed.eventId) ?? 0) + 1);
  }
  return counts;
}
