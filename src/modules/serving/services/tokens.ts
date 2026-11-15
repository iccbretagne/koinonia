import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Lien de rendez-vous du candidat (spec 082). Même principe que formulaires et billetterie : le
 * jeton est **dérivé** (HMAC-SHA256 avec `SERVING_TOKEN_SECRET`, à défaut `AUTH_SECRET`) et seule
 * son **empreinte SHA-256** est stockée. Il se re-dérive pour les emails (invitation, déplacement)
 * sans jamais être gardé en clair.
 */

function secret(): string {
  const value = process.env.SERVING_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error("SERVING_TOKEN_SECRET ou AUTH_SECRET requis");
  return value;
}

export const newSalt = () => randomBytes(16).toString("hex");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isTokenShape = (value: string) => /^[0-9a-f]{64}$/.test(value);

export function manageTokenPair(applicationId: string, salt: string) {
  const token = createHmac("sha256", secret()).update(`serving-interview:${applicationId}:${salt}`).digest("hex");
  return { token, hash: hashToken(token) };
}

export function matchesHash(token: string, hash: string): boolean {
  if (!isTokenShape(token) || !isTokenShape(hash)) return false;
  return timingSafeEqual(Buffer.from(hashToken(token), "hex"), Buffer.from(hash, "hex"));
}

/** Jeton du candidat : posé au besoin (candidatures antérieures à la spec 082), puis re-dérivé. */
export async function ensureManageToken(applicationId: string): Promise<string> {
  const app = await prisma.servingApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { manageSalt: true } });
  if (app.manageSalt) return manageTokenPair(applicationId, app.manageSalt).token;
  const salt = newSalt();
  const pair = manageTokenPair(applicationId, salt);
  await prisma.servingApplication.update({ where: { id: applicationId }, data: { manageSalt: salt, manageHash: pair.hash } });
  return pair.token;
}

/** Jeton déjà posé (null sinon) : pour un email, sans en créer. */
export function tokenOf(app: { id: string; manageSalt: string | null }): string | null {
  return app.manageSalt ? manageTokenPair(app.id, app.manageSalt).token : null;
}

/** Candidature d'un lien ; null pour toute raison (forme, empreinte inconnue, candidature effacée). */
export async function findApplicationIdByToken(token: string): Promise<{ id: string; churchId: string } | null> {
  if (!isTokenShape(token)) return null;
  const app = await prisma.servingApplication.findUnique({
    where: { manageHash: hashToken(token) },
    select: { id: true, churchId: true, manageHash: true },
  });
  if (!app?.manageHash || !matchesHash(token, app.manageHash)) return null;
  return { id: app.id, churchId: app.churchId };
}
