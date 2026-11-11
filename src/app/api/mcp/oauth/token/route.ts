/** POST /api/mcp/oauth/token — échange de code et rafraîchissement (spec 081). */
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { OAuthError, exchangeCode, refreshTokens } from "@/modules/mcp";
import { oauthError, oauthJson, preflight, readParams } from "../_http";
import { tokenSchema } from "./contract";

export async function POST(request: Request) {
  try {
    if (!rateLimit(`mcp-token:${getClientIp(request)}`, { windowMs: 60_000, max: 60 }).success) {
      throw new OAuthError("slow_down", "Trop de requêtes, réessayez plus tard", 429);
    }
    const params = tokenSchema.parse(await readParams(request));
    const tokens =
      params.grant_type === "authorization_code"
        ? await exchangeCode({
            code: params.code,
            codeVerifier: params.code_verifier,
            redirectUri: params.redirect_uri,
            clientId: params.client_id,
            resource: params.resource,
          })
        : await refreshTokens({ refreshToken: params.refresh_token, clientId: params.client_id });
    return oauthJson(tokens);
  } catch (error) {
    return oauthError(error);
  }
}

export const OPTIONS = preflight;
