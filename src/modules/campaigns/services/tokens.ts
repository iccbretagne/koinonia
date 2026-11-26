import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Liens personnels des répondants sans compte (spec 090). Même principe que les formulaires et la
 * billetterie : le jeton est **dérivé** (HMAC-SHA256 avec `CAMPAIGNS_TOKEN_SECRET`, à défaut
 * `AUTH_SECRET`) et seule son **empreinte SHA-256** est stockée. Il peut donc être recalculé pour
 * une relance sans jamais être lisible en base ; régénérer le sel révoque l'ancien lien.
 */

function secret(): string {
  const value = process.env.CAMPAIGNS_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error("CAMPAIGNS_TOKEN_SECRET ou AUTH_SECRET requis");
  return value;
}

export const newSalt = () => randomBytes(16).toString("hex");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Jeton d'un répondant (64 caractères hexadécimaux) et son empreinte. */
export function respondentTokenPair(respondentId: string, salt: string) {
  const token = createHmac("sha256", secret()).update(`campaign-respondent:${respondentId}:${salt}`).digest("hex");
  return { token, hash: hashToken(token) };
}

export const isTokenShape = (value: string) => /^[0-9a-f]{64}$/.test(value);

/** Comparaison à temps constant d'un jeton présenté à une empreinte stockée. */
export function matchesHash(token: string, hash: string): boolean {
  if (!isTokenShape(token) || !isTokenShape(hash)) return false;
  return timingSafeEqual(Buffer.from(hashToken(token), "hex"), Buffer.from(hash, "hex"));
}
