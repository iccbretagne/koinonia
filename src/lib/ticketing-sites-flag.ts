/**
 * Drapeau d'instance des sites d'événement (spec 084) : **coupé par défaut**. Actif si
 * `NEXT_PUBLIC_TICKETING_SITES_ENABLED=true` (posé au build par le déploiement de recette) ou
 * `TICKETING_SITES_ENABLED=true` (fichier `.env` du serveur, pour l'activer plus tard sans
 * reconstruire). Coupé : ni onglet Site, ni outils MCP du site, ni site servi, ni carte
 * d'activation dans l'église. Actif : l'activation par l'Admin d'église décide ensuite de la
 * diffusion publique.
 */
export function ticketingSitesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TICKETING_SITES_ENABLED === "true" || process.env.TICKETING_SITES_ENABLED === "true";
}
