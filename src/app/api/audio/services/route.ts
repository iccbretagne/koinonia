/**
 * GET  /api/audio/services — file d'attente des cultes audio de l'église, filtrable par statut.
 * POST /api/audio/services — crée un culte audio en DRAFT.
 */
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAudioAccess } from "@/modules/audio/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createAudioService } from "@/modules/audio";
import type { AudioServiceStatus } from "@/generated/prisma/client";
import { createSchema } from "./contract";

const STATUSES = new Set<string>(["DRAFT", "PENDING_REVIEW", "READY", "PUBLISHED", "UNPUBLISHED"] satisfies AudioServiceStatus[]);

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireAudioAccess("audio:view", churchId);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    if (status && !STATUSES.has(status)) {
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
      series: body.series,
      type: body.type,
    });

    return successResponse(service, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
