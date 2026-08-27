/**
 * GET /api/audio/services/events?date=YYYY-MM-DD — événements de l'église ce jour-là, pour
 * proposer un rattachement à la dépose d'un culte audio (spec §1 : « la liste des événements
 * de la journée lui est proposée »). Signale ceux ayant déjà un culte audio pour éviter un
 * doublon avant même de tenter la création.
 */
import { z } from "zod";
import { requireAudioAccess, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

const querySchema = z.object({ date: z.string().min(1) });

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
    await requireAudioAccess("audio:upload", churchId);

    const { searchParams } = new URL(request.url);
    const { date } = querySchema.parse({ date: searchParams.get("date") });

    const start = new Date(date);
    if (Number.isNaN(start.getTime())) throw new ApiError(400, "Date invalide");
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const events = await prisma.event.findMany({
      where: { churchId, date: { gte: start, lt: end } },
      select: { id: true, title: true, date: true, audioService: { select: { id: true } } },
      orderBy: { date: "asc" },
    });

    return successResponse(
      events.map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date,
        hasAudioService: e.audioService !== null,
      }))
    );
  } catch (error) {
    return errorResponse(error);
  }
}
