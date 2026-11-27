/**
 * Onglets de la trésorerie (spec 076), partagés par la page serveur et le composant client. Dans
 * un module neutre : une valeur exportée d'un fichier « use client » n'est, côté serveur, qu'une
 * référence vers le client, pas le tableau lui-même.
 */
export const TREASURY_TABS = ["tableau", "registre", "collecte", "remise", "budget", "rapports", "cloture", "reglages"] as const;
export type TreasuryTab = (typeof TREASURY_TABS)[number];
