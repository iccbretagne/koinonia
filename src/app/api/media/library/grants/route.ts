/**
 * GET/POST /api/media/library/grants — accès nominatifs à la galerie (spec 080).
 */
import { requireAuth, getCurrentChurchId, requireMediaGalleryGrantAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { listGalleryGrants, upsertGalleryGrant } from "@/modules/media";
import { createGrantSchema } from "./contract";

async function resolveChurch() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
  const actor = await requireMediaGalleryGrantAccess(churchId);
  return { churchId, actorId: actor.user.id };
}

export async function GET() {
  try {
    const { churchId } = await resolveChurch();
    return successResponse(await listGalleryGrants(churchId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const data = createGrantSchema.parse(await request.json());
    const { churchId, actorId } = await resolveChurch();
    const grant = await upsertGalleryGrant(churchId, actorId, {
      userId: data.userId,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    });
    return successResponse(grant, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
