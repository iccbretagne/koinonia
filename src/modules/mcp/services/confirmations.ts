import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hashToken, newToken } from "./tokens";

/** Durée de validité d'un jeton de confirmation (spec 081, lot 2). */
export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/** Portée ajoutée à la connexion quand la personne autorise les actions confirmées. */
export const WRITE_SCOPE = "write";

export const canWrite = (scope: string) => scope.split(/\s+/).includes(WRITE_SCOPE);

/**
 * Aperçu d'une action : fige ce qui sera exécuté (`payload`) et renvoie un jeton à usage unique,
 * lié à la connexion et à l'action. Seule son empreinte est stockée.
 */
export async function createConfirmation(
  grantId: string,
  action: string,
  payload: Prisma.InputJsonValue,
  now = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken("kmx");
  const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS);
  await prisma.mcpConfirmation.create({ data: { grantId, action, hash: hashToken(token), payload, expiresAt } });
  return { token, expiresAt };
}

/**
 * Consomme un jeton : même connexion, même action, non expiré, jamais utilisé. La prise est
 * atomique (`updateMany` conditionnel) : deux confirmations simultanées n'exécutent qu'une fois.
 * `null` sinon, sans dire pourquoi.
 */
export async function consumeConfirmation(
  grantId: string,
  action: string,
  token: string,
  now = new Date()
): Promise<Prisma.JsonValue | null> {
  if (!token.startsWith("kmx_")) return null;
  const hash = hashToken(token);
  const taken = await prisma.mcpConfirmation.updateMany({
    where: { hash, grantId, action, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (taken.count !== 1) return null;
  const row = await prisma.mcpConfirmation.findUnique({ where: { hash }, select: { payload: true } });
  return row?.payload ?? null;
}
