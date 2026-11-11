/** Origine publique de l'instance (même source que les liens des emails). */
export function publicOrigin(): string {
  const raw = process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return new URL(raw).origin;
}

/** Adresse de la ressource protégée : le serveur MCP (RFC 8707). */
export const resourceUrl = () => `${publicOrigin()}/api/mcp/server`;
