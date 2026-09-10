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
