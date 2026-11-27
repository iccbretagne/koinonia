"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isGuardedNavigation } from "./leave-guard";

/**
 * Prévient avant de quitter l'écran avec des modifications non enregistrées (spec 067) :
 * fermeture ou rechargement (`beforeunload`), et clic sur un lien interne. Le clic est intercepté
 * en capture sur `document`, avant `next/link` (racine React) : l'App Router n'offre pas de
 * blocage global de la navigation. Non couverts : bouton « Précédent » et palette ⌘K.
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isGuardedNavigation(e, anchor, window.location)) return;
      e.preventDefault();
      e.stopPropagation();
      const url = new URL(anchor.href);
      setPendingHref(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return {
    pendingHref,
    stay: () => setPendingHref(null),
    leave: () => {
      const href = pendingHref;
      setPendingHref(null);
      if (href) router.push(href);
    },
  };
}
