/**
 * PUT /api/audio/services/[id]/sequences
 * Applique le nommage/ordre des séquences déjà déposées (chemin P1 — dépôt de séquences).
 */
import { z } from "zod";
import { requireAudioAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { applySequences } from "@/modules/audio";

const schema = z.object({
  sequences: z.array(
    z.object({
      sourceId: z.string().min(1),
      order: z.number().int().nonnegative(),
      title: z.string().min(1),
    })
  ),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requireAudioAccess("audio:review", service.churchId);

    const body = schema.parse(await request.json());
    const segments = await applySequences(id, service.churchId, body.sequences);

    return successResponse(segments);
  } catch (error) {
    return errorResponse(error);
  }
}
