/**
 * Helpers de texte partagés.
 *
 * `normalizeText` centralise l'idiome de comparaison insensible à la casse et aux
 * accents recopié à la main dans plusieurs écrans (ReportsClient, DiscipleshipClient,
 * ChurchesClient…). La reprise de ces appels existants est hors périmètre — on
 * l'introduit ici pour la file Production audio (spec 023).
 */

/** Minuscule, accents retirés (NFD), espaces réduits. `null`/`undefined` → `""`. */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
