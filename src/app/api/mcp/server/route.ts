/**
 * Serveur MCP de Koinonia (spec 081, ADR-0029) — transport « Streamable HTTP », sans état.
 * Authentifié par jeton porteur OAuth (jamais par la session du navigateur) : un jeton = un
 * compte + une église. Chaque appel reconstruit la session et revérifie les droits.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildSessionForUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { publicOrigin, recordMcpCall, verifyAccessToken, type McpCaller } from "@/modules/mcp";
import { buildViewer } from "../../assistant/_viewer";
import { GUIDE_TOOL, NO_DATA, guideInput, renderResult, runTool, searchGuide, toolInput, toolsFor } from "../_tools";

export const runtime = "nodejs";

const INSTRUCTIONS =
  "Koinonia est l'outil de gestion d'une église (planning de service, événements, demandes, comptabilité). " +
  "Les outils renvoient uniquement ce que la personne connectée voit déjà dans l'application, pour l'église choisie à la connexion. " +
  "Réponds en français ; les dates et heures sont à l'heure de Paris. " +
  `Quand un outil répond « ${NO_DATA} », dis-le simplement : n'invente jamais une donnée absente.`;

/** Débit par compte : 60 appels par minute. */
const RATE = { windowMs: 60_000, max: 60 };

function unauthorized(): Response {
  const metadata = `${publicOrigin()}/.well-known/oauth-protected-resource/api/mcp/server`;
  return Response.json(
    { error: "invalid_token", error_description: "Connexion à Koinonia requise" },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${metadata}"` } }
  );
}

async function authenticate(request: Request): Promise<McpCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return null;
  return verifyAccessToken(match[1]);
}

/** Construit le serveur MCP du compte : ses outils seulement. */
async function buildServer(caller: McpCaller) {
  const session = await buildSessionForUser(caller.userId);
  if (!session) return null;
  const viewer = await buildViewer(session, caller.churchId);
  const ctx = { session, churchId: caller.churchId, viewer };
  const log = (tool: string, outcome: "answered" | "refused" | "error") =>
    recordMcpCall({ grantId: caller.grantId, userId: caller.userId, churchId: caller.churchId, tool, outcome });

  const server = new McpServer({ name: "koinonia", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  for (const tool of toolsFor(viewer)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: toolInput, annotations: { readOnlyHint: true, openWorldHint: false } },
      async (args) => {
        try {
          const result = await runTool(tool.key, args, ctx);
          const rendered = renderResult(result);
          await log(tool.name, rendered.text === NO_DATA ? "refused" : "answered");
          return { content: [{ type: "text" as const, text: rendered.text }], structuredContent: rendered.structured };
        } catch {
          await log(tool.name, "error");
          return { content: [{ type: "text" as const, text: "Koinonia n'a pas pu répondre. Réessayez plus tard." }], isError: true };
        }
      }
    );
  }

  server.registerTool(
    GUIDE_TOOL,
    {
      description: "Cherche dans le guide de Koinonia comment faire quelque chose (fiches adaptées au rôle de la personne).",
      inputSchema: guideInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ question }) => {
      try {
        const text = await searchGuide(question, viewer);
        await log(GUIDE_TOOL, "answered");
        return { content: [{ type: "text" as const, text }] };
      } catch {
        await log(GUIDE_TOOL, "error");
        return { content: [{ type: "text" as const, text: "Le guide est indisponible pour l'instant." }], isError: true };
      }
    }
  );
  return server;
}

export async function POST(request: Request) {
  const caller = await authenticate(request);
  if (!caller) return unauthorized();

  if (!rateLimit(`mcp:${caller.userId}`, RATE).success) {
    await recordMcpCall({ grantId: caller.grantId, userId: caller.userId, churchId: caller.churchId, tool: "*", outcome: "limited" });
    return Response.json({ error: "Trop de requêtes. Réessayez dans une minute." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const server = await buildServer(caller);
  if (!server) return unauthorized();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

/** Serveur sans état : pas de flux d'événements ni de session de transport à fermer. */
function methodNotAllowed() {
  return Response.json({ error: "Méthode non prise en charge" }, { status: 405, headers: { Allow: "POST" } });
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
