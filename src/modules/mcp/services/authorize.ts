import { prisma } from "@/lib/prisma";
import { OAuthError } from "./errors";
import { findClient, type RegisteredClient } from "./clients";
import { isMcpEnabled } from "./settings";
import { resourceUrl } from "./origin";
import { CODE_TTL_MS, hashToken, newToken } from "./tokens";

/** Portées du lot 1 : lecture seule. */
export const SUPPORTED_SCOPES = ["read"] as const;

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  scope?: string;
  resource?: string;
}

export interface ValidatedRequest {
  client: RegisteredClient;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scope: string;
}

/**
 * Erreurs de client ou d'adresse de redirection : jamais renvoyées vers le client (RFC 6749
 * §4.1.2.1), affichées à la personne. Les autres erreurs repartent vers `redirect_uri`.
 */
export class UntrustedRedirectError extends Error {}

export async function validateAuthorizationRequest(req: AuthorizationRequest): Promise<ValidatedRequest> {
  const client = await findClient(req.clientId);
  if (!client) throw new UntrustedRedirectError("Assistant inconnu : reconnectez-le depuis votre assistant IA.");
  if (!client.redirectUris.includes(req.redirectUri)) {
    throw new UntrustedRedirectError("Adresse de retour non reconnue pour cet assistant.");
  }
  if (req.responseType !== "code") throw new OAuthError("unsupported_response_type", "response_type=code attendu");
  if (req.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9\-_]{43}$/.test(req.codeChallenge)) {
    throw new OAuthError("invalid_request", "PKCE S256 obligatoire");
  }
  if (req.resource && req.resource !== resourceUrl()) throw new OAuthError("invalid_target", "Ressource inconnue");
  const requested = (req.scope ?? "read").split(/\s+/).filter(Boolean);
  if (requested.some((s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s))) {
    throw new OAuthError("invalid_scope", "Portée non prise en charge");
  }
  return { client, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge, state: req.state, scope: "read" };
}

/**
 * La personne autorise : connexion (réutilisée si elle existe déjà pour ce compte, cette église et
 * ce client) et code d'autorisation à usage unique.
 */
export async function createAuthorization(userId: string, churchId: string, req: ValidatedRequest): Promise<string> {
  if (!(await isMcpEnabled(churchId))) throw new OAuthError("access_denied", "Fonction coupée pour cette église", 403);
  const member = await prisma.userChurchRole.findFirst({ where: { userId, churchId }, select: { id: true } });
  if (!member) throw new OAuthError("access_denied", "Aucun rôle dans cette église", 403);

  const clientRow = await prisma.mcpClient.findUniqueOrThrow({ where: { clientId: req.client.clientId }, select: { id: true } });
  const existing = await prisma.mcpGrant.findFirst({
    where: { userId, churchId, clientId: clientRow.id, revokedAt: null },
    select: { id: true },
  });
  const grant =
    existing ?? (await prisma.mcpGrant.create({ data: { userId, churchId, clientId: clientRow.id, scope: req.scope }, select: { id: true } }));

  const code = newToken("kmc");
  await prisma.mcpToken.create({
    data: {
      grantId: grant.id,
      kind: "CODE",
      hash: hashToken(code),
      codeChallenge: req.codeChallenge,
      redirectUri: req.redirectUri,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

/** Adresse de retour vers le client, avec `code` (ou `error`) et `state`. */
export function redirectWith(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}
