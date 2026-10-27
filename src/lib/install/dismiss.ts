/**
 * « Plus tard » sur la carte d'Accueil (spec 070) : masquage par appareil, pendant 30 jours.
 * Le stockage peut être indisponible (navigation privée stricte) : la carte reste alors visible.
 */

export const INSTALL_DISMISS_KEY = "koinonia-install-dismissed-until";
export const INSTALL_DISMISS_DAYS = 30;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function isInstallCardDismissed(now: Date, store: Storage | null = storage()): boolean {
  try {
    const until = Number(store?.getItem(INSTALL_DISMISS_KEY));
    return Number.isFinite(until) && until > now.getTime();
  } catch {
    return false;
  }
}

export function dismissInstallCard(now: Date, store: Storage | null = storage()): void {
  try {
    store?.setItem(INSTALL_DISMISS_KEY, String(now.getTime() + INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // Stockage indisponible : la carte reviendra au prochain affichage.
  }
}
