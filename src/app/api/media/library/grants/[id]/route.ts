/**
 * PATCH/DELETE /api/media/library/grants/[id] — accès nominatif à la galerie (spec 080).
 */
import { requireAuth, getCurrentChurchId, requireMediaGalleryGrantAccess } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { updateGalleryGrant, deleteGalleryGrant } from "@/modules/media";
import { updateGrantSchema } from "./contract";

async function resolveChurch() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
  const actor = await requireMediaGalleryGrantAccess(churchId);
  return { churchId, actorId: actor.user.id };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = updateGrantSchema.parse(await request.json());
    const { churchId, actorId } = await resolveChurch();
    return successResponse(await updateGalleryGrant(churchId, actorId, id, data.expiresAt ? new Date(data.expiresAt) : null));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { churchId, actorId } = await resolveChurch();
    await deleteGalleryGrant(churchId, actorId, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
