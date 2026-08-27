/**
 * POST /api/audio/services/[id]/upload/sign
 * Crée une AudioSource(kind: SEQUENCE) et signe toutes les URLs de parts d'un upload
 * multipart S3. P1 : uniquement kind SEQUENCE — kind MIX (P1.5, mix à découper) rejeté.
 */
import { z } from "zod";
import { requireAudioAccess } from "@/lib/auth";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { signSequenceUpload } from "@/modules/audio";

const schema = z.object({
  kind: z.enum(["SEQUENCE", "MIX"]),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const service = await prisma.audioService.findUnique({ where: { id }, select: { churchId: true } });
    if (!service) throw new ApiError(404, "Culte audio introuvable");

    const session = await requireAudioAccess("audio:upload", service.churchId);
    requireRateLimit(request, { prefix: `audio:upload:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const body = schema.parse(await request.json());
    if (body.kind === "MIX") {
      throw new ApiError(400, "Le dépôt d'un mix entier à découper n'est pas disponible (P1.5).");
    }

    const signed = await signSequenceUpload({
      serviceId: id,
      churchId: service.churchId,
      filename: body.filename,
      contentType: body.contentType,
      size: body.size,
    });

    return successResponse(signed, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
