import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Durées (spec 081 : connexion inutilisée 90 jours = expirée). */
export const CODE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Jeton opaque : 256 bits d'aléa, préfixé pour être reconnaissable dans un journal. */
export function newToken(prefix: "kmc" | "kma" | "kmr" | "kmx"): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

/** Empreinte stockée en base (jamais le jeton lui-même). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** PKCE S256 (RFC 7636) : base64url(SHA-256(verifier)) doit égaler le défi. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}
