import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Jetons secrets de la billetterie (spec 074).
 *
 * Chaque jeton est **dérivé** : HMAC-SHA256 de `<portée>:<id>:<sel>` avec un secret serveur
 * (`TICKETING_TOKEN_SECRET`, à défaut `AUTH_SECRET`). On ne stocke que son **empreinte SHA-256**,
 * ce qui permet :
 *   - de retrouver un objet à partir d'un jeton présenté (empreinte indexée) ;
 *   - de réafficher un billet ou un lien sans jamais conserver le jeton (re-dérivation) ;
 *   - de valider un QR hors ligne en comparant des empreintes, sans aucun jeton sur l'appareil.
 *
 * Une fuite de la base ne permet donc pas de forger un billet. Changer le sel révoque les liens.
 *
 * Portées : gestion de la réservation, code de réservation (scan), billet, badge, étiquette.
 */
export type TokenScope = "manage" | "scan" | "ticket" | "badge" | "label";
export { QR_PREFIX, parseScannedCode } from "../schemas";

function secret(): string {
  const value = process.env.TICKETING_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error("TICKETING_TOKEN_SECRET ou AUTH_SECRET requis");
  return value;
}

/** Nouveau sel (32 caractères hexadécimaux). */
export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Jeton de 64 caractères hexadécimaux, dérivé de la portée, de l'objet et de son sel. */
export function deriveToken(scope: TokenScope, id: string, salt: string): string {
  return createHmac("sha256", secret()).update(`${scope}:${id}:${salt}`).digest("hex");
}

/** Empreinte stockée en base (SHA-256 hexadécimal). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Jeton et empreinte d'un coup. */
export function tokenPair(scope: TokenScope, id: string, salt: string) {
  const token = deriveToken(scope, id, salt);
  return { token, hash: hashToken(token) };
}

/** Forme attendue d'un jeton : rejet immédiat de tout le reste (pas de requête). */
export function isTokenShape(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** Comparaison à temps constant d'un jeton à une empreinte. */
export function matchesHash(token: string, hash: string): boolean {
  if (!isTokenShape(token) || !/^[0-9a-f]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashToken(token), "hex"), Buffer.from(hash, "hex"));
}
