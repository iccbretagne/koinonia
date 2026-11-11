import { prisma } from "@/lib/prisma";
import { OAuthError } from "./errors";
import { resourceUrl } from "./origin";
import { isMcpEnabled } from "./settings";
import { ACCESS_TTL_MS, REFRESH_TTL_MS, hashToken, newToken, verifyPkce } from "./tokens";

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

const invalidGrant = (d = "Autorisation invalide ou expirée") => new OAuthError("invalid_grant", d);

/** Révoque la connexion entière (rejeu détecté, révocation demandée). */
export async function revokeGrant(grantId: string, actorId: string | null = null): Promise<void> {
  await prisma.$transaction([
    prisma.mcpGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: actorId } }),
    prisma.mcpToken.deleteMany({ where: { grantId } }),
  ]);
}

async function issueTokens(grantId: string, scope: string): Promise<TokenResponse> {
  const access = newToken("kma");
  const refresh = newToken("kmr");
  const now = Date.now();
  await prisma.mcpToken.createMany({
    data: [
      { grantId, kind: "ACCESS", hash: hashToken(access), expiresAt: new Date(now + ACCESS_TTL_MS) },
      { grantId, kind: "REFRESH", hash: hashToken(refresh), expiresAt: new Date(now + REFRESH_TTL_MS) },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope };
}

/** Prend un jeton à usage unique de façon atomique : `false` s'il l'était déjà. */
async function consume(tokenId: string): Promise<boolean> {
  const { count } = await prisma.mcpToken.updateMany({ where: { id: tokenId, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1;
}

async function assertGrantUsable(grant: { id: string; userId: string; churchId: string; revokedAt: Date | null }) {
  if (grant.revokedAt) throw invalidGrant();
  if (!(await isMcpEnabled(grant.churchId))) throw invalidGrant("Fonction coupée pour cette église");
  const member = await prisma.userChurchRole.findFirst({ where: { userId: grant.userId, churchId: grant.churchId }, select: { id: true } });
  if (!member) throw invalidGrant("Compte sans rôle dans cette église");
}

/** `grant_type=authorization_code` (RFC 6749 §4.1.3 + PKCE). */
export async function exchangeCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  resource?: string;
}): Promise<TokenResponse> {
  if (input.resource && input.resource !== resourceUrl()) throw new OAuthError("invalid_target", "Ressource inconnue");
  const token = await prisma.mcpToken.findUnique({
    where: { hash: hashToken(input.code) },
    include: { grant: { include: { client: { select: { clientId: true } } } } },
  });
  if (!token || token.kind !== "CODE") throw invalidGrant();
  if (token.usedAt) {
    // Code rejoué : la connexion obtenue avec lui n'est plus sûre (RFC 6749 §4.1.2).
    await revokeGrant(token.grantId);
    throw invalidGrant();
  }
  if (token.expiresAt <= new Date()) throw invalidGrant();
  if (token.grant.client.clientId !== input.clientId || token.redirectUri !== input.redirectUri) throw invalidGrant();
  if (!token.codeChallenge || !verifyPkce(input.codeVerifier, token.codeChallenge)) throw invalidGrant("Vérification PKCE échouée");
  await assertGrantUsable(token.grant);
  if (!(await consume(token.id))) throw invalidGrant();
  return issueTokens(token.grantId, token.grant.scope);
}

/** `grant_type=refresh_token` avec rotation ; un refresh déjà utilisé révoque la connexion. */
export async function refreshTokens(input: { refreshToken: string; clientId: string }): Promise<TokenResponse> {
  const token = await prisma.mcpToken.findUnique({
    where: { hash: hashToken(input.refreshToken) },
    include: { grant: { include: { client: { select: { clientId: true } } } } },
  });
  if (!token || token.kind !== "REFRESH") throw invalidGrant();
  if (token.grant.client.clientId !== input.clientId) throw invalidGrant();
  if (token.usedAt) {
    await revokeGrant(token.grantId);
    throw invalidGrant();
  }
  if (token.expiresAt <= new Date()) throw invalidGrant();
  await assertGrantUsable(token.grant);
  if (!(await consume(token.id))) {
    await revokeGrant(token.grantId);
    throw invalidGrant();
  }
  return issueTokens(token.grantId, token.grant.scope);
}

/** RFC 7009 : révoque la connexion du jeton présenté ; répond toujours sans erreur. */
export async function revokeByToken(rawToken: string, clientId: string | undefined): Promise<void> {
  const token = await prisma.mcpToken.findUnique({
    where: { hash: hashToken(rawToken) },
    select: { grantId: true, grant: { select: { client: { select: { clientId: true } } } } },
  });
  if (!token) return;
  if (clientId && token.grant.client.clientId !== clientId) return;
  await revokeGrant(token.grantId);
}
