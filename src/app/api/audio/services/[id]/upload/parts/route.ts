/**
 * GET /api/audio/services/[id]/upload/parts?sourceId=...
 * Liste les parts déjà reçues côté S3 pour un upload multipart en cours — reprise après coupure.
 */
import { requireAudioAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getUploadedParts } from "@/modules/audio";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requireAudioAccess("audio:upload", service.churchId);

    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("sourceId");
    if (!sourceId) throw new ApiError(400, "sourceId requis");

    const parts = await getUploadedParts(sourceId, service.churchId);
    return successResponse(parts);
  } catch (error) {
    return errorResponse(error);
  }
}
