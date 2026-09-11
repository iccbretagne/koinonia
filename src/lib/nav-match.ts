/**
 * Correspondance d'un lien de navigation avec l'URL courante, par segment : `/agenda/request`
 * ne correspond pas à `/agenda/requests`. La query string du lien (`?dept=…`) est ignorée.
 */
export function matchesPath(pathname: string, href: string): boolean {
  const path = href.split("?")[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Parmi des liens frères, seul le plus spécifique est actif — `/admin/departments/functions`
 * n'allume pas aussi `/admin/departments`, `/planning/events` n'allume pas `/planning`.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (matchesPath(pathname, href) && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

export interface NavLinkMatch {
  href: string;
  /** Préfixes supplémentaires qui allument ce lien (spec 043 : `/media` couvre aussi
   * `/communication`, deux préfixes de routes pour un seul lien de menu). */
  matchPrefixes?: string[];
}

/**
 * Variante de `activeHref` pour des liens dont un seul peut couvrir plusieurs préfixes de
 * routes distincts (`matchPrefixes`) — retourne le `href` du lien le plus spécifique.
 */
export function activeLinkHref(pathname: string, links: readonly NavLinkMatch[]): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const link of links) {
    const candidates = link.matchPrefixes && link.matchPrefixes.length > 0 ? link.matchPrefixes : [link.href];
    for (const candidate of candidates) {
      if (matchesPath(pathname, candidate) && candidate.length > bestLen) {
        best = link.href;
        bestLen = candidate.length;
      }
    }
  }
  return best;
}
