/**
 * GET/POST /api/mcp/oauth/authorize — autorisation d'un assistant IA (spec 081, ADR-0029).
 * GET renvoie vers l'écran Koinonia ; POST reçoit la décision de la personne connectée.
 */
import { auth } from "@/lib/auth";
import {
  OAuthError,
  UntrustedRedirectError,
  createAuthorization,
  publicOrigin,
  redirectWith,
  validateAuthorizationRequest,
} from "@/modules/mcp";
import { readParams } from "../_http";
import { decisionSchema } from "./contract";

const SCREEN = "/mcp/autoriser";

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { Location: location, "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const screen = `${SCREEN}?${url.searchParams.toString()}`;
  const session = await auth();
  // Sans session : connexion puis retour à l'écran (adresse relative, vérifiée par la page de connexion).
  if (!session?.user) return redirect(`${publicOrigin()}/?next=${encodeURIComponent(screen)}`);
  return redirect(`${publicOrigin()}${screen}`);
}

/**
 * Décision de la personne, envoyée en arrière-plan par l'écran Koinonia : réponse JSON avec
 * l'adresse de retour (la page y navigue elle-même — une redirection de formulaire vers une autre
 * origine serait bloquée par la règle CSP `form-action`).
 */
export async function POST(request: Request) {
  // Écran Koinonia uniquement : même origine (en plus du cookie SameSite=Lax).
  const origin = request.headers.get("origin");
  if (origin !== publicOrigin()) return Response.json({ error: "Origine refusée" }, { status: 403 });

  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = decisionSchema.safeParse(await readParams(request));
  if (!parsed.success) return Response.json({ error: "Demande invalide" }, { status: 400 });
  const p = parsed.data;
  const back = (location: string) => Response.json({ redirectTo: location }, { headers: { "Cache-Control": "no-store" } });

  let req;
  try {
    req = await validateAuthorizationRequest({
      clientId: p.client_id,
      redirectUri: p.redirect_uri,
      responseType: p.response_type,
      codeChallenge: p.code_challenge,
      codeChallengeMethod: p.code_challenge_method,
      state: p.state,
      scope: p.scope,
      resource: p.resource,
    });
  } catch (error) {
    if (error instanceof UntrustedRedirectError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof OAuthError) return back(redirectWith(p.redirect_uri, { error: error.error, state: p.state }));
    throw error;
  }

  if (p.decision === "deny" || !p.church_id) return back(redirectWith(req.redirectUri, { error: "access_denied", state: req.state }));
  try {
    const code = await createAuthorization(session.user.id, p.church_id, req, p.allow_write === "on");
    return back(redirectWith(req.redirectUri, { code, state: req.state, iss: publicOrigin() }));
  } catch (error) {
    if (error instanceof OAuthError) return back(redirectWith(req.redirectUri, { error: error.error, state: req.state }));
    throw error;
  }
}
