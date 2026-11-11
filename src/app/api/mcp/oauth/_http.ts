import { ZodError } from "zod";
import { OAuthError } from "@/modules/mcp";

/**
 * Réponses des points d'entrée OAuth (spec 081) : JSON au format OAuth, jamais mis en cache,
 * ouverts aux clients web (CORS sans cookie : ces adresses n'utilisent pas la session).
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version",
} as const;

export function oauthJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache" } });
}

export function oauthError(error: unknown): Response {
  if (error instanceof OAuthError) return oauthJson({ error: error.error, error_description: error.description }, error.status);
  if (error instanceof ZodError) {
    return oauthJson({ error: "invalid_request", error_description: error.issues[0]?.message ?? "Requête invalide" }, 400);
  }
  return oauthJson({ error: "server_error", error_description: "Erreur interne" }, 500);
}

/** Corps `application/x-www-form-urlencoded` (norme OAuth) ou JSON, en objet de chaînes. */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  const form = new URLSearchParams(await request.text());
  return Object.fromEntries(form.entries());
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
