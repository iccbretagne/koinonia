/** POST /api/mcp/oauth/revoke — révocation par le client (spec 081, RFC 7009). */
import { revokeByToken } from "@/modules/mcp";
import { CORS_HEADERS, oauthError, preflight, readParams } from "../_http";
import { revokeSchema } from "./contract";

export async function POST(request: Request) {
  try {
    const params = revokeSchema.parse(await readParams(request));
    await revokeByToken(params.token, params.client_id);
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  } catch (error) {
    return oauthError(error);
  }
}

export const OPTIONS = preflight;
