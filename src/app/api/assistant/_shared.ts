import type { Session } from "next-auth";
import type { AssistantDataParams, AssistantViewer, DataResult } from "@/core/assistant";
import { ApiError } from "@/lib/api-utils";
import { getCurrentChurchId, requireAuth, requireSuperAdmin } from "@/lib/auth";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { isAssistantEnabled } from "@/modules/assistant";
import { dataCatalog } from "./_data-questions";
import { buildViewer } from "./_viewer";

/**
 * Accès à l'assistant (spec 075) : compte connecté, église courante, assistant actif pour
 * cette église (module, instance, église). Sinon 404, comme une fonction absente.
 */
export async function currentAssistant() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId || !(await isAssistantEnabled(churchId))) throw new ApiError(404, "Assistant indisponible");
  const viewer = await buildViewer(session, churchId);
  return { session, churchId, viewer };
}

/** Exécute une question de données des modules actifs ; `null` si elle n'existe pas. */
export function dataRunner(session: Session, churchId: string, viewer: AssistantViewer) {
  const catalog = dataCatalog();
  return async (key: string, params: AssistantDataParams): Promise<DataResult | null> => {
    const question = catalog.get(key);
    if (!question) return null;
    return question.run({ session, churchId, viewer, params: question.params.parse(params) });
  };
}

/** 30 questions par minute et par compte. */
export function limitQuestions(request: Request, userId: string) {
  requireRateLimit(request, { prefix: `assistant:${userId}`, ...RATE_LIMIT_MUTATION });
}

/** Administration de la base : Super Admin seulement (plateforme). */
export async function assistantAdmin() {
  const session = await requireSuperAdmin();
  return { session, actor: { id: session.user.id! } };
}

/** Paramètres de requête d'une URL, validés par un schéma Zod. */
export function queryOf<T>(request: Request, schema: { parse: (v: unknown) => T }): T {
  return schema.parse(Object.fromEntries(new URL(request.url).searchParams));
}
