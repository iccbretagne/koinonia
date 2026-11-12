/** POST /api/mcp/oauth/register — enregistrement dynamique d'un client (spec 081, RFC 7591). */
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { OAuthError, registerClient } from "@/modules/mcp";
import { oauthError, oauthJson, preflight } from "../_http";
import { registerSchema } from "./contract";

export async function POST(request: Request) {
  try {
    if (!rateLimit(`mcp-register:${getClientIp(request)}`, { windowMs: 60_000, max: 10 }).success) {
      throw new OAuthError("slow_down", "Trop d'enregistrements, réessayez plus tard", 429);
    }
    const body = registerSchema.parse(await request.json().catch(() => ({})));
    if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
      throw new OAuthError("invalid_client_metadata", "Client public uniquement (token_endpoint_auth_method=none)");
    }
    const client = await registerClient({ name: body.client_name, redirectUris: body.redirect_uris });
    return oauthJson(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201
    );
  } catch (error) {
    return oauthError(error);
  }
}

export const OPTIONS = preflight;
