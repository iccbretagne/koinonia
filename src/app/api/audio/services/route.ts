/**
 * GET  /api/audio/services — file d'attente des cultes audio de l'église, filtrable par statut.
 * POST /api/audio/services — crée un culte audio en DRAFT.
 */
import { z } from "zod";
import { requireAuth, requireAudioAccess, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createAudioService } from "@/modules/audio";
import type { AudioServiceStatus } from "@/generated/prisma/client";

const STATUSES: AudioServiceStatus[] = ["DRAFT", "PENDING_REVIEW", "READY", "PUBLISHED", "UNPUBLISHED"];

const createSchema = z.object({
  planningEventId: z.string().optional(),
  serviceDate: z.string().datetime().optional(),
  title: z.string().optional(),
  speaker: z.string().optional(),
  // Même contrainte que Event.type : EVENT_TYPES est une contrainte d'interface, pas serveur.
  type: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireAudioAccess("audio:view", churchId);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    if (status && !STATUSES.includes(status as AudioServiceStatus)) {
      throw new ApiError(400, `Statut invalide : ${status}`);
    }

    const services = await prisma.audioService.findMany({
      where: { churchId, ...(status ? { status: status as AudioServiceStatus } : {}) },
      include: {
        planningEvent: { select: { id: true, title: true, date: true } },
        _count: { select: { segments: true } },
      },
      orderBy: { serviceDate: "desc" },
    });

    return successResponse(services);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireAudioAccess("audio:upload", churchId);

    const body = createSchema.parse(await request.json());

    const service = await createAudioService({
      churchId,
      planningEventId: body.planningEventId,
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : undefined,
      title: body.title,
      speaker: body.speaker,
      type: body.type,
    });

    return successResponse(service, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
