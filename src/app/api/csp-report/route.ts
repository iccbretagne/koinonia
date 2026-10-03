import { logger } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const MAX_BODY = 16 * 1024;

type Violation = {
  directive: string | undefined;
  blocked: string | undefined;
  document: string | undefined;
  source: string | undefined;
};

/** Ne garde que l'origine et le chemin : la query d'une URL peut porter un jeton. */
function stripQuery(url: unknown): string | undefined {
  if (typeof url !== "string" || url === "") return undefined;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.slice(0, 200); // "inline", "eval", "data"…
  }
}

/** Formats `report-uri` (`{ "csp-report": {…} }`) et Reporting API (`[{ type, body }]`). */
function parseViolations(payload: unknown): Violation[] {
  const reports = Array.isArray(payload)
    ? payload.filter((r) => r?.type === "csp-violation").map((r) => r.body ?? {})
    : [((payload as Record<string, unknown>)?.["csp-report"] ?? {}) as Record<string, unknown>];

  return reports.slice(0, 20).map((r: Record<string, unknown>) => ({
    directive: (r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"]) as string | undefined,
    blocked: stripQuery(r["blocked-uri"] ?? r.blockedURL),
    document: stripQuery(r["document-uri"] ?? r.documentURL),
    source: stripQuery(r["source-file"] ?? r.sourceFile),
  }));
}

/**
 * Collecte des violations CSP (ADR-0022) — publique par nature (le navigateur l'appelle sans
 * session garantie), bornée en débit par IP et en taille, et sans réponse exploitable : les
 * violations sont journalisées (`journalctl -u koinonia | grep csp`), jamais stockées.
 */
export async function POST(request: Request) {
  if (!rateLimit(`csp:${getClientIp(request)}`, { windowMs: 60_000, max: 30 }).success) {
    return new Response(null, { status: 429 });
  }
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return new Response(null, { status: 413 });
    for (const violation of parseViolations(JSON.parse(text))) {
      logger.warn({ csp: violation }, "csp: violation");
    }
  } catch {
    // Corps illisible : ignoré, le navigateur n'attend rien.
  }
  return new Response(null, { status: 204 });
}
