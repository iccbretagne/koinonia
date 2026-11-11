import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { revokeGrant } from "./token-exchange";

export interface McpConnectionView {
  id: string;
  client: string;
  churchId: string;
  churchName: string;
  user: { id: string; name: string | null; email: string | null };
  createdAt: string;
  lastUsedAt: string | null;
}

/** Une connexion active : non révoquée et avec un jeton de rafraîchissement encore valable. */
const activeWhere = (now: Date) => ({
  revokedAt: null,
  tokens: { some: { kind: "REFRESH" as const, usedAt: null, expiresAt: { gt: now } } },
});

const select = {
  id: true,
  churchId: true,
  createdAt: true,
  lastUsedAt: true,
  client: { select: { name: true } },
  church: { select: { name: true } },
  user: { select: { id: true, name: true, displayName: true, email: true } },
} as const;

type Row = {
  id: string;
  churchId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  client: { name: string };
  church: { name: string };
  user: { id: string; name: string | null; displayName: string | null; email: string | null };
};

const toView = (g: Row): McpConnectionView => ({
  id: g.id,
  client: g.client.name,
  churchId: g.churchId,
  churchName: g.church.name,
  user: { id: g.user.id, name: g.user.displayName ?? g.user.name, email: g.user.email },
  createdAt: g.createdAt.toISOString(),
  lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
});

export async function listUserConnections(userId: string, now = new Date()): Promise<McpConnectionView[]> {
  const rows = await prisma.mcpGrant.findMany({ where: { userId, ...activeWhere(now) }, orderBy: { createdAt: "desc" }, select });
  return rows.map(toView);
}

export async function listChurchConnections(churchId: string, now = new Date()): Promise<McpConnectionView[]> {
  const rows = await prisma.mcpGrant.findMany({ where: { churchId, ...activeWhere(now) }, orderBy: { createdAt: "desc" }, select });
  return rows.map(toView);
}

/**
 * Révoque une connexion : par son propriétaire, ou par un administrateur de son église
 * (`canManageChurch` décide, côté route). Autre cas : 404, comme une connexion absente.
 */
export async function revokeConnection(
  id: string,
  actorId: string,
  canManageChurch: (churchId: string) => Promise<boolean>
): Promise<void> {
  const grant = await prisma.mcpGrant.findUnique({ where: { id }, select: { id: true, userId: true, churchId: true, revokedAt: true } });
  if (!grant || grant.revokedAt) throw new ApiError(404, "Connexion introuvable");
  if (grant.userId !== actorId && !(await canManageChurch(grant.churchId))) throw new ApiError(404, "Connexion introuvable");
  await revokeGrant(grant.id, actorId);
  await logAudit({
    userId: actorId,
    churchId: grant.churchId,
    action: "DELETE",
    entityType: "McpGrant",
    entityId: grant.id,
    details: { owner: grant.userId, byOwner: grant.userId === actorId },
  });
}
