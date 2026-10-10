import { z } from "zod";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { listDoneRequests, resolveRequestQueueAccess } from "@/modules/planning";

const querySchema = z.object({
  churchId: z.string().min(1),
  fn: z.enum(["SECRETARIAT", "COMMUNICATION", "PRODUCTION_MEDIA"]),
  cursor: z.string().max(200).optional(),
  q: z.string().max(100).optional(),
});

/**
 * Demandes traitées d'une file d'équipe (spec 063) : « Voir plus » et recherche dans tout
 * l'historique de l'onglet « Traitées ». Même contrôle d'accès que les pages de traitement.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(searchParams));
    const session = await requireChurchPermission("planning:view", query.churchId);

    const access = await resolveRequestQueueAccess(session, query.churchId, query.fn);
    if (!access.allowed) throw new ApiError(403, "Accès refusé");
    if (!access.configured) return successResponse({ items: [], nextCursor: null });

    return successResponse(await listDoneRequests(query.churchId, query.fn, { cursor: query.cursor, q: query.q }));
  } catch (error) {
    return errorResponse(error);
  }
}
