/**
 * POST /api/audio/services/[id]/upload/complete
 * Finalise un upload multipart S3 d'une AudioSource(kind: SEQUENCE) et programme son job PROBE.
 */
import { z } from "zod";
import { requireAudioAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { completeSequenceUpload } from "@/modules/audio";

const schema = z.object({
  sourceId: z.string().min(1),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1) })).min(1),
});

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
