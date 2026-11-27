import { forbidden } from "next/navigation";

/**
 * Refus d'accès des gardes (`requireChurchPermission`, gardes de module…) : une seule erreur pour
 * deux lecteurs. Son message `FORBIDDEN` donne le 403 JSON des routes API (`errorResponse`) et
 * reste ce que testent les tests ; son `digest` est celui de `forbidden()` de Next.js, si bien
 * qu'une garde qui refuse dans une page rend `forbidden.tsx` au lieu de `error.tsx` (dont le
 * message est masqué en production).
 *
 * Hors de Next.js (tests, `experimental.authInterrupts` coupé), `forbidden()` refuse de
 * s'exécuter : l'erreur reste alors un simple `FORBIDDEN`.
 */
export function forbiddenError(): Error {
  const error: Error & { digest?: string } = new Error("FORBIDDEN");
  try {
    forbidden();
  } catch (interrupt) {
    const digest = (interrupt as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string") error.digest = digest;
  }
  return error;
}

/** Refus d'une garde, avec ou sans `digest`. */
export function isForbiddenError(error: unknown): boolean {
  return error instanceof Error && error.message === "FORBIDDEN";
}
