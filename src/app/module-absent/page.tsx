import { notFound } from "next/navigation";

/**
 * Cible de la réécriture interne du proxy pour une page appartenant à un module
 * désactivé (spec 038). `notFound()` produit un vrai statut HTTP 404 avec l'habillage de
 * l'application (`src/app/not-found.tsx`), sans changer l'URL affichée au visiteur.
 */
export default function ModuleAbsentPage(): never {
  notFound();
}
