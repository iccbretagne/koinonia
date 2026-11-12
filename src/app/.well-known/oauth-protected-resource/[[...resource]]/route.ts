/** Métadonnées de la ressource protégée : le serveur MCP de Koinonia (RFC 9728, spec 081). */
import { publicOrigin, resourceUrl } from "@/modules/mcp";
import { oauthJson, preflight } from "@/app/api/mcp/oauth/_http";

export function GET() {
  return oauthJson({
    resource: resourceUrl(),
    authorization_servers: [publicOrigin()],
    scopes_supported: ["read"],
    bearer_methods_supported: ["header"],
    resource_name: "Koinonia",
  });
}

export const OPTIONS = preflight;
