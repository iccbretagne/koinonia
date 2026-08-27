/**
 * Erreurs métier — volontairement sans dépendance à Next.js.
 *
 * `ApiError` vit ici plutôt que dans `api-utils.ts` (qui importe `next/server`) pour que le
 * code de domaine puisse la lever sans tirer le framework : le worker audio s'exécute hors
 * Next.js (ADR-0007) et son bundle échoue à charger `next/server` en ESM pur.
 * `api-utils.ts` la ré-exporte, les route handlers n'ont donc rien à changer.
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
