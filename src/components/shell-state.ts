"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * État d'affichage de la coquille, côté client uniquement : préférence de la sidebar (dépliée ou
 * rail, mémorisée en localStorage — confort par personne, jamais une donnée à partager) et
 * gabarit de l'écran (mobile < 768px, tablette < 1024px, desktop).
 */

export type SidebarPref = "expanded" | "rail";
export type Viewport = "mobile" | "tablet" | "desktop";

const SIDEBAR_KEY = "koinonia-sidebar";
const SIDEBAR_EVENT = "koinonia-sidebar-change";

function readPref(): SidebarPref {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "rail" ? "rail" : "expanded";
  } catch {
    return "expanded";
  }
}

function subscribePref(onChange: () => void) {
  window.addEventListener(SIDEBAR_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Préférence de la sidebar desktop ; « dépliée » au rendu serveur. */
export function useSidebarPref(): [SidebarPref, (pref: SidebarPref) => void] {
  const pref = useSyncExternalStore(subscribePref, readPref, () => "expanded" as const);
  const setPref = useCallback((next: SidebarPref) => {
    try {
      localStorage.setItem(SIDEBAR_KEY, next);
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la page courante seulement.
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }, []);
  return [pref, setPref];
}

const TABLET_QUERY = "(min-width: 768px)";
const DESKTOP_QUERY = "(min-width: 1024px)";

function readViewport(): Viewport {
  if (window.matchMedia(DESKTOP_QUERY).matches) return "desktop";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "mobile";
}

function subscribeViewport(onChange: () => void) {
  const queries = [window.matchMedia(TABLET_QUERY), window.matchMedia(DESKTOP_QUERY)];
  queries.forEach((q) => q.addEventListener("change", onChange));
  return () => queries.forEach((q) => q.removeEventListener("change", onChange));
}

/** Gabarit courant ; `null` au rendu serveur et pendant l'hydratation. */
export function useViewport(): Viewport | null {
  return useSyncExternalStore(subscribeViewport, readViewport, () => null);
}

const MAC_QUERY = /Mac|iPhone|iPad/;

function noopSubscribe() {
  return () => {};
}

/** Raccourci de la palette affiché selon la plateforme (« ⌘K » sur Apple, « Ctrl K » ailleurs). */
export function useShortcutLabel(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => (MAC_QUERY.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "⌘K"
  );
}
