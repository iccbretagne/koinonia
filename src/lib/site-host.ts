/**
 * Hôtes des sites d'événement (spec 084, ADR-0031). Module pur : le proxy s'exécute à chaque
 * requête et n'interroge jamais la base.
 */

/** Sous-domaines qui ne désignent jamais un site. */
export const RESERVED_SITE_SLUGS = ["www", "app", "api", "admin", "mail", "recette", "staging", "static", "assets", "cdn"] as const;

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** `<slug>.<baseDomain>` → `<slug>` ; `null` pour tout autre hôte (dont `base` lui-même, un réservé, ou plusieurs niveaux). */
export function siteSlugFromHost(host: string, baseDomain: string | undefined): string | null {
  const base = normalizeHost(baseDomain);
  const h = normalizeHost(host);
  if (!base || !h.endsWith(`.${base}`)) return null;
  const label = h.slice(0, -(base.length + 1));
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return null;
  return (RESERVED_SITE_SLUGS as readonly string[]).includes(label) ? null : label;
}

/**
 * Domaine dédié approuvé. Lot 1b : aucun — le lot 3 branchera un cache des domaines `APPROVED`
 * (jamais une requête base dans le proxy).
 */
export function isApprovedSiteHost(_host: string): boolean {
  return false;
}
