"use client";

import { useToast } from "@/components/ui";

/**
 * Copie dans le presse-papiers avec retour (toast). Presse-papiers indisponible (contexte non
 * sécurisé, refus du navigateur) : le champ `fieldId` est sélectionné pour une copie à la main.
 */
export function useCopy() {
  const toast = useToast();
  return async function copy(text: string, success: string, fieldId?: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard");
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      const field = fieldId ? document.getElementById(fieldId) : null;
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
        field.focus();
        field.select();
      }
      toast.error("Copie automatique impossible : le texte est sélectionné, copiez-le à la main.");
    }
  };
}
