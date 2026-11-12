import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Jetons des formulaires (spec 079) : lien de gestion d'une réponse et empreinte d'anonymat.
 *
 * Même principe que la billetterie : le jeton est **dérivé** (HMAC-SHA256 avec un secret serveur,
 * `FORMS_TOKEN_SECRET`, à défaut `AUTH_SECRET`) et seule son **empreinte SHA-256** est stockée.
 * Une fuite de la base ne donne donc aucun lien de gestion utilisable.
 */

function secret(): string {
  const value = process.env.FORMS_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error("FORMS_TOKEN_SECRET ou AUTH_SECRET requis");
  return value;
}

export const newSalt = () => randomBytes(16).toString("hex");

const hmac = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Jeton de gestion d'une réponse (64 caractères hexadécimaux) et son empreinte. */
export function manageTokenPair(responseId: string, salt: string) {
  const token = hmac(`form-response:${responseId}:${salt}`);
  return { token, hash: hashToken(token) };
}

export const isTokenShape = (value: string) => /^[0-9a-f]{64}$/.test(value);

/** Comparaison à temps constant d'un jeton présenté à une empreinte stockée. */
export function matchesHash(token: string, hash: string): boolean {
  if (!isTokenShape(token) || !isTokenShape(hash)) return false;
  return timingSafeEqual(Buffer.from(hashToken(token), "hex"), Buffer.from(hash, "hex"));
}

/** Empreinte « ce compte a répondu à ce formulaire » d'un sondage anonyme, sans lien vers la réponse. */
export const anonymousReceiptKey = (formId: string, userId: string) => hmac(`form-receipt:${formId}:${userId}`);

/** Empreinte d'une adresse email normalisée, pour repérer les doublons. */
export const contactKey = (formId: string, email: string) => hmac(`form-contact:${formId}:${email.trim().toLowerCase()}`);
