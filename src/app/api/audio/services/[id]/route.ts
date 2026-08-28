/**
 * GET    /api/audio/services/[id] — détail d'un culte audio, sources et segments inclus.
 * PATCH  /api/audio/services/[id] — titre, orateur, date, rattachement événement, couverture.
 * DELETE /api/audio/services/[id] — supprime le culte (tant qu'il n'est pas publié).
 */
import { z } from "zod";
import { requireAudioAccess, requireAudioUnpublishAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  updateAudioService,
  deleteAudioService,
  toJsonSafeAudioSource,
  getOrCreatePrimaryShareToken,
  buildPublicAudioUrl,
} from "@/modules/audio";

const updateSchema = z.object({
  title: z.string().nullable().optional(),
  speaker: z.string().optional(),
  serviceDate: z.string().datetime().optional(),
  planningEventId: z.string().nullable().optional(),
  coverKey: z.string().nullable().optional(),
  series: z.string().min(1).nullable().optional(),
  // Même contrainte que Event.type (src/app/api/events/route.ts) : EVENT_TYPES est une
  // contrainte d'interface (le Select), pas une contrainte serveur.
  type: z.string().min(1).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({
      where: { id },
      include: {
        planningEvent: { select: { id: true, title: true, date: true } },
        sources: true,
        segments: { orderBy: { order: "asc" }, include: { rendition: true, source: true } },
      },
    });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requireAudioAccess("audio:view", service.churchId);

    const shareUrl =
      service.status === "PUBLISHED"
        ? buildPublicAudioUrl((await getOrCreatePrimaryShareToken(service.id, service.churchId)).token)
        : null;

    return successResponse({
      ...service,
      sources: service.sources.map(toJsonSafeAudioSource),
      shareUrl,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requireAudioAccess("audio:review", service.churchId);

    const body = updateSchema.parse(await request.json());
    const updated = await updateAudioService(id, service.churchId, {
      ...body,
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : undefined,
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    // Même niveau d'accès que la dépublication : supprimer un culte est au moins aussi
    // engageant que le dépublier.
    await requireAudioUnpublishAccess(service.churchId);

    await deleteAudioService(id, service.churchId);

    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
