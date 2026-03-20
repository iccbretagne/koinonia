import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({
  eventId: z.string(),
  // liste des memberId présents (les autres = absents)
  presentMemberIds: z.array(z.string()),
});

// Enregistre la liste des présents pour un événement (remplace les enregistrements existants)
export async function PUT(request: Request) {
  try {
    await requirePermission("discipleship:manage");

    const { eventId, presentMemberIds } = schema.parse(await request.json());

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, trackedForDiscipleship: true, churchId: true },
    });
    if (!event) throw new ApiError(404, "Événement introuvable");
    if (!event.trackedForDiscipleship) throw new ApiError(400, "Cet événement n'est pas suivi pour le discipolat");

    // Tous les disciples de l'église pour cet événement
    const discipleships = await prisma.discipleship.findMany({
      where: { churchId: event.churchId },
      select: { discipleId: true },
    });
    const allDiscipleIds = discipleships.map((d) => d.discipleId);

    await prisma.$transaction([
      prisma.discipleshipAttendance.deleteMany({ where: { eventId } }),
      prisma.discipleshipAttendance.createMany({
        data: allDiscipleIds.map((memberId) => ({
          memberId,
          eventId,
          present: presentMemberIds.includes(memberId),
        })),
      }),
    ]);

    return successResponse({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    await requirePermission("discipleship:view");

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "eventId requis");

    const attendances = await prisma.discipleshipAttendance.findMany({
      where: { eventId },
      select: { memberId: true, present: true },
    });

    return successResponse(attendances);
  } catch (error) {
    return errorResponse(error);
  }
}
