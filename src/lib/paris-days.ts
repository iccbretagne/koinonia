/**
 * Calculs au jour calendaire dans le fuseau de l'église (Europe/Paris) et normalisation de texte
 * pour la recherche, sans dépendance serveur : partagés par la file des demandes (spec 063) et
 * l'espace Offres (spec 064).
 */

const TIME_ZONE = "Europe/Paris";
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Une date saisie « en jour » (2026-10-12) ou en heure locale sans fuseau (2026-10-12T10:00) se
// lit telle quelle : la convertir décalerait d'un jour selon le fuseau du serveur.
const LOCAL_DATE = /^(\d{4}-\d{2}-\d{2})(T[\d:.]+)?$/;

/** Jour calendaire (`AAAA-MM-JJ`) d'une date, à Paris ; `null` si la valeur est invalide. */
export function dayKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const local = LOCAL_DATE.exec(value);
    if (local) return local[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dayKeyFmt.format(date);
}

/** Minuit UTC du jour `AAAA-MM-JJ`, pour compter des écarts en jours entiers. */
export function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Nombre de jours entre aujourd'hui et `deadline` (négatif si passée). */
export function daysUntil(deadline: string, now: Date): number | null {
  const target = dayKey(deadline);
  const today = dayKey(now);
  if (!target || !today) return null;
  return Math.round((keyToUtc(target) - keyToUtc(today)) / DAY_MS);
}

/** Texte sans accents ni majuscules, pour une recherche tolérante. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
