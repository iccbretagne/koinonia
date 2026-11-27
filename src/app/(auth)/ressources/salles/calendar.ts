/**
 * Helpers de calendrier pour la page Salles (vues semaine et mois).
 *
 * Fichier **pur** : aucun import (ni React, ni Prisma, ni `@/modules/*`). C'est de la
 * presentation — ranger des reservations dans des cases — pas du metier. Place en frere du
 * composant et non dans `src/modules/rooms/` : l'index du module reexporte des services qui
 * importent Prisma, qu'un composant client ne doit pas tirer dans le bundle navigateur.
 *
 * Regle non negociable : le rattachement d'une reservation a un jour se fait sur sa date
 * **locale**, jamais sur `startAt.split("T")[0]` (date UTC) — sinon une activite de soiree
 * (heure francaise) tombe la veille.
 */

export const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Date **locale** au format `YYYY-MM-DD` — cle de cellule de toutes les grilles. */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Copie de `d` decalee de `days` jours (sert la navigation de semaine). */
export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** Lundi 00h00 (heure locale) de la semaine contenant `date`. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = dimanche
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface CalendarDay {
  dateStr: string;
  dayNum: number;
  /** Libelle court du jour (« Lun »…), rempli seulement par la grille semaine. */
  weekday?: string;
  /** Faux pour les jours de debordement de la grille mensuelle. */
  inMonth: boolean;
}

/** Les 7 jours (lundi → dimanche) de la semaine ouverte par `weekStart`. */
export function buildWeekDays(weekStart: Date): CalendarDay[] {
  return DAYS_FR.map((weekday, i) => {
    const d = addDays(weekStart, i);
    return { dateStr: localDateStr(d), dayNum: d.getDate(), weekday, inMonth: true };
  });
}

/** Grille mensuelle complete en semaines pleines (lundi → dimanche). `month` est 1-indexe. */
export function buildMonthDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: CalendarDay[] = [];

  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month - 1, -startDow + i + 1);
    days.push({ dateStr: localDateStr(d), dayNum: d.getDate(), inMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month - 1, d);
    days.push({ dateStr: localDateStr(dt), dayNum: d, inMonth: true });
  }
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month, i);
      days.push({ dateStr: localDateStr(d), dayNum: d.getDate(), inMonth: false });
    }
  }
  return days;
}

/** Libelle de la periode d'une semaine, ex. « 8 – 14 septembre 2026 » ou, a cheval sur deux
 * mois, « 28 sept. – 4 octobre 2026 ». */
export function formatWeekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startFmt = new Intl.DateTimeFormat("fr-FR", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const endFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `${startFmt.format(weekStart)} – ${endFmt.format(end)}`;
}

/** Cle composite d'une cellule de la grille salles × jours. */
export function cellKey(roomId: string, dateStr: string): string {
  return `${roomId}|${dateStr}`;
}

/**
 * Regroupe les reservations par salle **et** par jour local, chaque cellule triee par heure
 * de debut. Point unique de rattachement jour/reservation : la correction du bug de date
 * (UTC → local) vaut donc d'un coup pour la vue semaine et la vue mois.
 */
export function groupByRoomAndDay<T extends { room: { id: string }; startAt: string }>(
  items: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = cellKey(item.room.id, localDateStr(new Date(item.startAt)));
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  for (const bucket of map.values()) bucket.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return map;
}
