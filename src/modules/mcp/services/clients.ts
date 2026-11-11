import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { OAuthError } from "./errors";

/**
 * Enregistrement dynamique des clients (RFC 7591) : client public (pas de secret), PKCE
 * obligatoire. Les URI de redirection sont comparées à l'identique à l'autorisation.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_URIS = 10;

/** Une URI de redirection acceptable : https, ou http en boucle locale ; sans fragment. */
export function isAcceptableRedirectUri(uri: string): boolean {
  if (uri.length > 500) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

export interface RegisteredClient {
  clientId: string;
  name: string;
  redirectUris: string[];
}

export async function registerClient(input: { name?: string; redirectUris: string[] }): Promise<RegisteredClient> {
  const uris = [...new Set(input.redirectUris)];
  if (uris.length === 0 || uris.length > MAX_URIS) {
    throw new OAuthError("invalid_redirect_uri", "Entre 1 et 10 adresses de redirection sont attendues");
  }
  const bad = uris.find((u) => !isAcceptableRedirectUri(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", "Adresse de redirection refusée (https, ou boucle locale)");

  const name = (input.name ?? "").trim().slice(0, 200) || "Assistant IA";
  const clientId = `kmcp_${randomBytes(18).toString("base64url")}`;
  await prisma.mcpClient.create({ data: { clientId, name, redirectUris: uris } });
  return { clientId, name, redirectUris: uris };
}

export async function findClient(clientId: string): Promise<RegisteredClient | null> {
  const row = await prisma.mcpClient.findUnique({ where: { clientId } });
  if (!row) return null;
  return { clientId: row.clientId, name: row.name, redirectUris: row.redirectUris as string[] };
}
