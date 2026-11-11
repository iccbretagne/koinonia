import type { Session } from "next-auth";
import { z } from "zod";
import { isDataRefusal, pageAnswer, type AssistantViewer, type DataAnswer, type DataResult } from "@/core/assistant";
import { BUILTIN_ENTRIES, getEngine, inAudience, loadKnowledge } from "@/modules/assistant";
import { publicOrigin } from "@/modules/mcp";
import { dataCatalog } from "../assistant/_data-questions";

/**
 * Outils MCP du lot 1 (spec 081) : les questions de données de l'assistant, en lecture seule,
 * filtrées par une **liste blanche** (jamais la trésorerie — la spec exclut les comptes de
 * trésorerie — ni le suivi pastoral, qui n'a aucune question) et par l'audience du compte.
 * Chaque question revérifie en plus le droit de son écran au moment de l'appel.
 */

/** Clé de question → audience de repli quand aucune fiche de l'assistant ne la décrit. */
export const MCP_TOOLS: Readonly<Record<string, { permissions?: string[] } | null>> = {
  "planning.myNextService": null,
  "planning.myServicesMonth": null,
  "planning.myUnavailabilities": null,
  "planning.myCollection": null,
  "planning.myReplacements": null,
  "planning.instructions": null,
  "planning.myTeamEvents": null,
  "planning.myPendingRequests": null,
  "planning.servingOnDay": null,
  "planning.unavailableOnDay": null,
  "planning.toReplace": null,
  "planning.teamUnavailabilities": null,
  "planning.eventsThisWeek": null,
  "planning.secretariatPending": null,
  "planning.missingReports": null,
  "accounting.myRequests": null,
  "accounting.toValidate": null,
  "accounting.awaitingPayment": null,
  "rooms.myReservations": null,
  "ticketing.myAssignments": null,
  "shuttle.balance": null,
  "audio.recentSermons": { permissions: ["audio:listen"] },
  "reports.recent": { permissions: ["reports:view"] },
  "reports.get": { permissions: ["reports:view"] },
};

/** Nom d'outil MCP d'une clé de question : « planning.myNextService » → « planning_myNextService ». */
export const toolName = (key: string) => key.replace(".", "_");

export const GUIDE_TOOL = "guide_search";

/** Lignes par appel : 50 par défaut, 100 au plus. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

/** Paramètres communs exposés aux assistants (les questions ignorent ceux qui ne les concernent pas). */
export const toolInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Jour visé, AAAA-MM-JJ (heure de Paris)"),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe("Mois visé, AAAA-MM"),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Nombre de lignes, ${DEFAULT_LIMIT} par défaut, ${MAX_LIMIT} au plus`),
  offset: z.number().int().min(0).optional().describe("Lignes à sauter, pour la suite d'une liste (nextOffset du résultat précédent)"),
});

export const guideInput = z.object({
  question: z.string().trim().min(3).max(300).describe("Question sur l'utilisation de Koinonia, en français"),
});

export interface McpToolDef {
  name: string;
  key: string;
  description: string;
}

/** Un outil est visible si une fiche de l'assistant qui l'utilise est dans l'audience du compte. */
function visibleFor(key: string, viewer: AssistantViewer): boolean {
  const entries = BUILTIN_ENTRIES.filter((e) => e.kind === "data" && e.dataQuestion === key);
  if (entries.length > 0) return entries.some((e) => inAudience(e.audience, viewer));
  const fallback = MCP_TOOLS[key];
  return !!fallback?.permissions?.some((p) => viewer.permissions.includes(p));
}

/** Outils de données proposés à ce compte, parmi la liste blanche et les modules actifs. */
export function toolsFor(viewer: AssistantViewer, isActive?: (module: string) => boolean): McpToolDef[] {
  const catalog = dataCatalog(isActive);
  return Object.keys(MCP_TOOLS)
    .filter((key) => catalog.has(key) && visibleFor(key, viewer))
    .map((key) => ({ name: toolName(key), key, description: catalog.get(key)!.description }));
}

export const NO_DATA = "Aucune donnée disponible pour ce compte.";

/**
 * Résultat d'une question en texte lisible + données structurées, une page à la fois (`offset`,
 * `limit`) avec toujours le total. Refus = même réponse qu'une absence.
 */
export function renderResult(
  result: DataResult | null,
  page: { offset?: number; limit?: number } = {}
): { text: string; structured: Record<string, unknown> } {
  if (!result || isDataRefusal(result)) return { text: NO_DATA, structured: { items: [], total: 0 } };
  const offset = page.offset ?? 0;
  const answer: DataAnswer = pageAnswer(result as DataAnswer, { offset, limit: page.limit ?? DEFAULT_LIMIT });
  const link = `${publicOrigin()}${answer.href}`;
  const end = offset + answer.items.length;
  const nextOffset = end < answer.total ? end : null;
  const lines = answer.items.map((i) => `- ${i.label}${i.detail ? ` — ${i.detail}` : ""}`);
  const partial = answer.items.length > 0 && (offset > 0 || nextOffset !== null);
  const suite = nextOffset === null ? "." : ` ; suite avec offset=${nextOffset}.`;
  const range = partial ? `\nLignes ${offset + 1} à ${end} sur ${answer.total}${suite}` : "";
  let body: string;
  if (lines.length > 0) body = lines.join("\n") + range;
  else if (offset > 0 && answer.total > 0) body = `Plus de ligne après la ${answer.total}e (total : ${answer.total}).`;
  else body = answer.empty ?? "Rien à afficher.";
  return {
    text: `${answer.title}\n${body}\nVoir dans Koinonia : ${link}`,
    structured: {
      title: answer.title,
      items: answer.items.map((i) => ({ label: i.label, detail: i.detail ?? null })),
      total: answer.total,
      offset,
      nextOffset,
      link,
    },
  };
}

/** Exécute une question de la liste blanche pour ce compte ; `null` si l'outil n'existe pas pour lui. */
export async function runTool(
  key: string,
  params: z.infer<typeof toolInput>,
  ctx: { session: Session; churchId: string; viewer: AssistantViewer }
): Promise<DataResult | null> {
  if (!(key in MCP_TOOLS) || !visibleFor(key, ctx.viewer)) return null;
  const question = dataCatalog().get(key);
  if (!question) return null;
  const { day, month } = params;
  return question.run({ ...ctx, params: question.params.parse({ day, month }) });
}

/** Recherche dans le guide : fiches de l'assistant filtrées par audience, sans statistique. */
export async function searchGuide(question: string, viewer: AssistantViewer): Promise<string> {
  const knowledge = await loadKnowledge();
  const answer = await getEngine().answer({ question, viewer, entries: knowledge.entries });
  const origin = publicOrigin();
  switch (answer.kind) {
    case "howto":
      return `${answer.title}\n${answer.text}${answer.href ? `\nVoir : ${origin}${answer.href}` : ""}`;
    case "fixed":
    case "refused":
      return `${answer.title}\n${answer.text}`;
    case "data":
      return `${answer.title}\nUtilisez l'outil ${toolName(answer.dataQuestion)} pour obtenir cette information.`;
    default:
      return answer.suggestions.length > 0
        ? `Pas de réponse précise. Sujets proches :\n${answer.suggestions.map((s) => `- ${s.title}`).join("\n")}`
        : `Pas de réponse dans le guide. Le guide complet : ${origin}/guide`;
  }
}
