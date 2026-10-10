/**
 * POST /api/audio/services/[id]/upload/complete
 * Finalise un upload multipart S3 d'une AudioSource(kind: SEQUENCE) et programme son job PROBE.
 */
import { requireAudioAccess } from "@/modules/audio/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { completeSequenceUpload } from "@/modules/audio";
import { schema } from "./contract";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    await requireAudioAccess("audio:upload", service.churchId);

    const body = schema.parse(await request.json());

    const source = await completeSequenceUpload({
      serviceId: id,
      churchId: service.churchId,
      sourceId: body.sourceId,
      parts: body.parts,
    });

    return successResponse(source);
  } catch (error) {
    return errorResponse(error);
  }
}
