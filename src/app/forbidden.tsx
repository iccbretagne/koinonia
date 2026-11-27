import ForbiddenNotice from "@/components/ForbiddenNotice";

/**
 * Refus rendu par `forbidden()` hors de la coquille authentifiée — en particulier par la garde
 * d'adresse de `(auth)/layout.tsx`, qui s'exécute avant le début du flux et donne un vrai 403
 * (voir `src/app/(auth)/page-gates.ts`).
 */
export default function Forbidden() {
  return <ForbiddenNotice fullPage />;
}
