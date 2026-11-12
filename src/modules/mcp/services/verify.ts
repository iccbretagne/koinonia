import { prisma } from "@/lib/prisma";
import { isMcpEnabled } from "./settings";
import { hashToken } from "./tokens";

export interface McpCaller {
  grantId: string;
  userId: string;
  churchId: string;
  scope: string;
}

const TOUCH_EVERY_MS = 60 * 1000;

/**
 * Jeton d'accès présenté au serveur MCP : valide, connexion non révoquée, fonction active et
 * compte toujours membre de l'église. `null` sinon (le serveur répond 401, sans dire pourquoi).
 */
export async function verifyAccessToken(rawToken: string, now = new Date()): Promise<McpCaller | null> {
  if (!rawToken.startsWith("kma_")) return null;
  const token = await prisma.mcpToken.findUnique({
    where: { hash: hashToken(rawToken) },
    select: { kind: true, expiresAt: true, grant: { select: { id: true, userId: true, churchId: true, scope: true, revokedAt: true, lastUsedAt: true } } },
  });
  if (!token || token.kind !== "ACCESS" || token.expiresAt <= now) return null;
  const grant = token.grant;
  if (grant.revokedAt) return null;
  if (!(await isMcpEnabled(grant.churchId))) return null;
  const member = await prisma.userChurchRole.findFirst({ where: { userId: grant.userId, churchId: grant.churchId }, select: { id: true } });
  if (!member) return null;

  if (!grant.lastUsedAt || now.getTime() - grant.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.mcpGrant.update({ where: { id: grant.id }, data: { lastUsedAt: now } });
  }
  return { grantId: grant.id, userId: grant.userId, churchId: grant.churchId, scope: grant.scope };
}
