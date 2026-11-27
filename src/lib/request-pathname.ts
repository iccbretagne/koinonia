/**
 * En-tête posé par `src/proxy.ts` sur chaque requête de page : l'adresse demandée, que les
 * layouts ne reçoivent pas autrement. Toujours écrasé par le proxy (une valeur envoyée par le
 * navigateur n'arrive jamais). Il ne sert qu'à choisir la garde d'adresse de
 * `(auth)/page-gates.ts` ; il ne donne aucun droit.
 */
export const PATHNAME_HEADER = "x-koinonia-pathname";
