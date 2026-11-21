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

// ─── Domaines dédiés : cache mémoire du proxy ────────────────────────────────

/**
 * Le proxy ne lit jamais la base (règle `proxy-only-module-routes`, et il tourne à chaque
 * requête) : il interroge l'adresse interne `/api/internal/site-hosts` (boucle locale + jeton)
 * au plus une fois par minute, sans attendre la réponse — une requête arrivée avant le premier
 * chargement répond 404 plutôt que de bloquer.
 */
export const SITE_HOSTS_REFRESH_MS = 60_000;
let cache: Map<string, string> | null = null;
let attemptedAt = 0;
let loading = false;

/** Domaine dédié ouvert : la fonctionnalité n'existe que si le jeton interne est configuré. */
export const dedicatedDomainsEnabled = () => !!process.env.TRAEFIK_PROVIDER_TOKEN;

/** Adresse du site pour un domaine dédié approuvé, selon le cache ; `null` sinon (ou cache vide). */
export function approvedSiteSlug(host: string): string | null {
  return cache?.get(normalizeHost(host)) ?? null;
}

/** Hôtes que sert l'application elle-même : jamais traités comme un domaine étranger. */
function isAppHost(host: string): boolean {
  const h = normalizeHost(host);
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1") return true;
  for (const url of [process.env.APP_URL, process.env.AUTH_URL, process.env.NEXTAUTH_URL]) {
    try {
      if (url && normalizeHost(new URL(url).host) === h) return true;
    } catch {
      // URL mal formée : ignorée
    }
  }
  return false;
}

/**
 * Hôte étranger à l'application et au domaine des sites (donc candidat à un domaine dédié). Avec
 * les domaines dédiés ouverts, il ne reçoit **jamais** l'application : site approuvé ou 404.
 */
export function isForeignHost(host: string, baseDomain: string | undefined): boolean {
  if (!dedicatedDomainsEnabled() || isAppHost(host)) return false;
  const base = normalizeHost(baseDomain);
  const h = normalizeHost(host);
  return !(base && (h === base || h.endsWith(`.${base}`)));
}

/** Recharge le cache si besoin, en arrière-plan. `fetchImpl` : injectable pour les tests. */
export function refreshSiteHosts(now = Date.now(), fetchImpl: typeof fetch = fetch): void {
  const token = process.env.TRAEFIK_PROVIDER_TOKEN;
  if (!token || loading || now - attemptedAt < SITE_HOSTS_REFRESH_MS) return;
  loading = true;
  attemptedAt = now;
  void (async () => {
    try {
      const res = await fetchImpl(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/internal/site-hosts`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) cache = new Map(Object.entries((await res.json()) as Record<string, string>));
    } catch {
      // On garde l'ancien cache ; nouvelle tentative dans la minute
    } finally {
      loading = false;
    }
  })();
}

/** Tests : état initial. */
export function resetSiteHostsCache(map: Record<string, string> | null = null): void {
  cache = map ? new Map(Object.entries(map)) : null;
  attemptedAt = 0;
  loading = false;
}
