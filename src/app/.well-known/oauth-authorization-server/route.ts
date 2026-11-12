/** Métadonnées du serveur d'autorisation de Koinonia (RFC 8414, spec 081). */
import { publicOrigin } from "@/modules/mcp";
import { oauthJson, preflight } from "@/app/api/mcp/oauth/_http";

export function GET() {
  const origin = publicOrigin();
  return oauthJson({
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read"],
    authorization_response_iss_parameter_supported: true,
  });
}

export const OPTIONS = preflight;
