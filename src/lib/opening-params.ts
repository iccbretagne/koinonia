/**
 * Paramètres d'ouverture (spec 092, lot 2) : une liste **fermée** de valeurs qui ouvrent un
 * formulaire ou un filtre déjà présent sur l'écran. Toute autre valeur est ignorée — l'écran
 * s'affiche alors comme sans paramètre. Aucun de ces paramètres ne donne un droit : l'écran
 * vérifie toujours les siens avant d'ouvrir quoi que ce soit.
 */

type SearchValue = string | string[] | undefined;

const first = (v: SearchValue): string | undefined => (Array.isArray(v) ? v[0] : v);

/** `?declarer=1`, `?nouveau=1`, `?saisie=1`, `?a-valider=1` : seule la valeur `1` ouvre. */
export function isOpenFlag(value: SearchValue): boolean {
  return first(value) === "1";
}

/** `?etat=soumis` sur le suivi d'une campagne : filtre « Soumis » de l'onglet Suivi. */
export function trackingStatusFromParam(value: SearchValue): "SUBMITTED" | "" {
  return first(value) === "soumis" ? "SUBMITTED" : "";
}

/** `?a-traiter=reglements` sur la billetterie : événements avec des règlements à confirmer. */
export function ticketingTodoFromParam(value: SearchValue): "reglements" | null {
  return first(value) === "reglements" ? "reglements" : null;
}

/** `?filtre=justifier` sur les demandes comptables : filtre « Justificatifs ». */
export function accountingFilterFromParam(value: SearchValue): "JUSTIFY" | "" {
  return first(value) === "justifier" ? "JUSTIFY" : "";
}
