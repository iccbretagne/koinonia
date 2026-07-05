/**
 * Helpers de dates purs pour la vue hebdomadaire des événements (STAR).
 * Semaine française : lundi 00:00:00.000 → dimanche 23:59:59.999.
 */

/**
 * Calcule les bornes (lundi 00:00 → dimanche 23:59:59.999) de la semaine
 * contenant la date `ref`. Fonctionne en heure locale, robuste aux
 * changements de mois/année.
 */
export function weekBounds(ref: Date): { start: Date; end: Date } {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Renvoie l'ISO (yyyy-mm-dd) du lundi de la semaine précédente (`delta = -1`)
 * ou suivante (`delta = 1`) par rapport au lundi `mondayISO`.
 */
export function shiftWeek(mondayISO: string, delta: -1 | 1): string {
  const [year, month, day] = mondayISO.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + delta * 7);
  return toISODate(d);
}

/** Renvoie l'ISO (yyyy-mm-dd) du lundi de la semaine contenant `ref`. */
export function currentWeekMonday(ref: Date = new Date()): string {
  const { start } = weekBounds(ref);
  return toISODate(start);
}

/**
 * Construit les paramètres d'une requête Prisma `event.findMany` bornée à
 * l'église `churchId` et à la semaine contenant `ref`. Extrait en fonction
 * pure pour être testable indépendamment de Prisma (non-fuite multi-tenant,
 * cohérence de la plage de dates).
 */
export function buildWeekEventsQuery(churchId: string, ref: Date) {
  const { start, end } = weekBounds(ref);
  return {
    where: {
      churchId,
      date: { gte: start, lte: end },
    },
    orderBy: { date: "asc" as const },
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
    } as const,
  };
}
