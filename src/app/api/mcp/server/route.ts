/**
 * Serveur MCP de Koinonia (spec 081, ADR-0029) — transport « Streamable HTTP », sans état.
 * Authentifié par jeton porteur OAuth (jamais par la session du navigateur) : un jeton = un
 * compte + une église. Chaque appel reconstruit la session et revérifie les droits.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildSessionForUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { canWrite, publicOrigin, recordMcpCall, verifyAccessToken, type McpCaller } from "@/modules/mcp";
import { buildViewer } from "../../assistant/_viewer";
import { actionsFor } from "../_actions";
import { GUIDE_TOOL, NO_DATA, guideInput, renderResult, runTool, searchGuide, toolInput, toolsFor } from "../_tools";

export const runtime = "nodejs";

const BASE_INSTRUCTIONS =
  "Koinonia est l'outil de gestion d'une église (planning de service, événements, demandes, comptabilité). " +
  "Les outils renvoient uniquement ce que la personne connectée voit déjà dans l'application, pour l'église choisie à la connexion. " +
  "Les listes sont paginées : chaque résultat donne le total, et nextOffset s'il reste des lignes (à repasser en offset). " +
  "Réponds en français ; les dates et heures sont à l'heure de Paris. " +
  `Quand un outil répond « ${NO_DATA} », dis-le simplement : n'invente jamais une donnée absente.`;

const READ_ONLY =
  " Tous les outils sont en lecture seule : aucun ne modifie Koinonia (déclarer une absence, répondre à un service ou faire une demande se fait dans l'application).";

const WITH_ACTIONS =
  " Les outils de lecture ne modifient rien. Seules deux actions modifient Koinonia, pour la personne elle-même : déclarer une absence et répondre à une demande de disponibilité. " +
  "Chacune se fait en deux temps : l'outil …_preview n'enregistre rien et renvoie un résumé et un jeton ; montre ce résumé, attends l'accord explicite de la personne, " +
  "puis appelle …_confirm avec ce jeton. N'appelle jamais …_confirm sans cet accord.";

/** Instructions selon la connexion : lecture seule, ou actions confirmées autorisées par la personne. */
const instructionsFor = (actions: boolean) => BASE_INSTRUCTIONS + (actions ? WITH_ACTIONS : READ_ONLY);

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

  const actions = actionsFor(viewer, canWrite(caller.scope));
  const server = new McpServer({ name: "koinonia", version: "1.0.0" }, { instructions: instructionsFor(actions.length > 0) });

  for (const tool of toolsFor(viewer)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: toolInput, annotations: { readOnlyHint: true, openWorldHint: false } },
      async (args) => {
        try {
          const result = await runTool(tool.key, args, ctx);
          const rendered = renderResult(result, args);
          await log(tool.name, rendered.text === NO_DATA ? "refused" : "answered");
          return { content: [{ type: "text" as const, text: rendered.text }], structuredContent: rendered.structured };
        } catch {
          await log(tool.name, "error");
          return { content: [{ type: "text" as const, text: "Koinonia n'a pas pu répondre. Réessayez plus tard." }], isError: true };
        }
      }
    );
  }

  // Lot 2 : aperçu (ne modifie rien) puis confirmation (modifie, après accord de la personne).
  const actionCtx = { ...ctx, grantId: caller.grantId };
  for (const action of actions) {
    const confirm = action.kind === "confirm";
    server.registerTool(
      action.name,
      {
        description: action.description,
        inputSchema: action.input,
        annotations: { readOnlyHint: !confirm, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          const result = await action.run(args as never, actionCtx);
          await log(action.name, result.structured.reason ? "refused" : "answered");
          return { content: [{ type: "text" as const, text: result.text }], structuredContent: result.structured };
        } catch {
          await log(action.name, "error");
          return { content: [{ type: "text" as const, text: "Koinonia n'a pas pu enregistrer cette action. Réessayez plus tard." }], isError: true };
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
