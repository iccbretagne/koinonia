/**
 * Politique de sécurité du contenu (CSP) — ADR-0022.
 *
 * Construite par requête dans `src/proxy.ts` : un nonce neuf autorise les scripts de Next.js
 * et le script de thème du layout racine ; `'strict-dynamic'` étend cette confiance aux
 * scripts qu'ils chargent (Turnstile). Publiée en `Content-Security-Policy-Report-Only` tant que
 * `CSP_ENFORCE` n'est pas à `true` : le navigateur signale les violations à `/api/csp-report`
 * sans rien bloquer, le temps de valider la politique en recette puis en production.
 *
 * Module volontairement léger (aucun import) : le proxy s'exécute sur chaque requête.
 */

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const GOOGLE_AVATARS_ORIGIN = "https://lh3.googleusercontent.com";
const ADDRESS_API_ORIGIN = "https://api-adresse.data.gouv.fr";
/** Après le POST du formulaire de connexion, NextAuth redirige vers Google (form-action). */
const GOOGLE_OAUTH_ORIGIN = "https://accounts.google.com";

export const CSP_REPORT_PATH = "/api/csp-report";

/** Origines des stockages S3 (URL présignées en style « path ») : médias, audio, comptabilité. */
export function storageOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const origins = new Set<string>();
  for (const key of ["MEDIA_S3_ENDPOINT", "ACCOUNTING_S3_ENDPOINT", "BACKUP_S3_ENDPOINT"]) {
    const value = env[key];
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Endpoint mal formé : ignoré ici, le client S3 échouera de lui-même.
    }
  }
  return [...origins];
}

export function buildCsp({
  nonce,
  isDev,
  storage,
}: {
  readonly nonce: string;
  readonly isDev: boolean;
  readonly storage: readonly string[];
}): string {
  const s3 = storage.join(" ");
  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' en développement seulement : React s'en sert pour reconstruire les piles.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Attributs style="" (couleur d'église, positionnements) : non couverts par un nonce.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${GOOGLE_AVATARS_ORIGIN} ${s3}`,
    `media-src 'self' blob: ${s3}`,
    "font-src 'self' data:",
    `connect-src 'self' ${TURNSTILE_ORIGIN} ${ADDRESS_API_ORIGIN} ${s3}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${GOOGLE_OAUTH_ORIGIN}`,
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ];
  return directives.map((d) => d.replace(/\s+/g, " ").trim()).join("; ");
}

/** En-tête de réponse : bloquant seulement si `CSP_ENFORCE=true`. */
export function cspHeaderName(env: Record<string, string | undefined> = process.env): string {
  return env.CSP_ENFORCE === "true" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
