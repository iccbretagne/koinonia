import { buttonBaseClasses, sizeClasses } from "@/components/ui/button-classes";

/**
 * Bouton discret de suppression (texte `danger`, fond `danger-soft` au survol), pour les actions
 * de ligne. `Button variant="ghost"` impose `text-brand-text` : lui ajouter `text-danger` mettrait
 * deux couleurs en concurrence, départagées par l'ordre de la feuille générée.
 */
export const ghostDangerClasses = `${buttonBaseClasses} ${sizeClasses.sm} border-transparent bg-transparent text-danger hover:bg-danger-soft`;
