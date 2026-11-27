export interface ClickLike {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

export interface AnchorLike {
  /** Adresse absolue, comme `HTMLAnchorElement.href`. */
  readonly href: string;
  getAttribute(name: string): string | null;
}

/**
 * Ce clic quitte-t-il l'écran dans le même onglet (spec 067) ? Seuls les clics gauches simples
 * sur un lien interne vers un autre chemin sont gardés : un nouvel onglet, un téléchargement ou un
 * lien externe ne font pas perdre le brouillon (le dernier passe par `beforeunload`).
 */
export function isGuardedNavigation(
  event: ClickLike,
  anchor: AnchorLike,
  location: { readonly origin: string; readonly pathname: string }
): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = anchor.getAttribute("target");
  if ((target && target !== "_self") || anchor.getAttribute("download") !== null) return false;
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return false;
  }
  return url.origin === location.origin && url.pathname !== location.pathname;
}
