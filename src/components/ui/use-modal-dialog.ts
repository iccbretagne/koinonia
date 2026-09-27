"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Ouvre un `<dialog>` natif en modal (focus piégé, Échap, voile `::backdrop`, couche supérieure)
 * tant que le composant est monté ouvert, et rend le focus au déclencheur à la fermeture.
 *
 * Les composants qui l'utilisent ne rendent rien quand `open` est faux : le `<dialog>` est retiré
 * du DOM sans passer par `close()`, et le navigateur ne restaure alors pas le focus lui-même — d'où
 * la mémorisation de l'élément actif à l'ouverture.
 *
 * Focus initial : le navigateur prend le premier élément focalisable, c'est-à-dire le bouton
 * Fermer de l'en-tête. On lui préfère, dans l'ordre : un élément déjà focalisé par `autoFocus`
 * (React le focalise avant `showModal()`), puis le premier contrôle du corps
 * (`[data-dialog-body]` : champ d'un formulaire, « Annuler » d'une confirmation).
 */
export function useModalDialog(open: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const autoFocused = active && dialog.contains(active) ? active : null;
    // Avec `autoFocus`, l'élément actif est déjà dans le dialogue : le déclencheur est perdu.
    const trigger = autoFocused ? null : active;

    if (!dialog.open) dialog.showModal();
    if (autoFocused) {
      autoFocused.focus();
    } else if (!dialog.querySelector("[autofocus]")) {
      dialog.querySelector<HTMLElement>(`[data-dialog-body] :is(${FOCUSABLE})`)?.focus();
    }

    return () => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);

  return dialogRef;
}
