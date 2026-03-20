import { prisma } from "@/lib/prisma";
import { requirePermission, getDiscipleshipScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({
  eventId: z.string(),
  // liste des memberId présents (les autres = absents)
  presentMemberIds: z.array(z.string()),
});

// Enregistre la liste des présents pour un événement
export async function PUT(request: Request) {
  try {
    const session = await requirePermission("discipleship:manage");

    const { eventId, presentMemberIds } = schema.parse(await request.json());

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, trackedForDiscipleship: true, churchId: true },
    });
    if (!event) throw new ApiError(404, "Événement introuvable");
    if (!event.trackedForDiscipleship) throw new ApiError(400, "Cet événement n'est pas suivi pour le discipolat");

    const scope = await getDiscipleshipScope(session, event.churchId);

    if (scope.scoped) {
      // DISCIPLE_MAKER : ne met à jour que ses propres disciples
      const ownDiscipleships = await prisma.discipleship.findMany({
        where: { churchId: event.churchId, discipleMakerId: scope.memberId ?? "" },
        select: { discipleId: true },
      });
      const ownDiscipleIds = ownDiscipleships.map((d) => d.discipleId);

      await prisma.$transaction(
        ownDiscipleIds.map((memberId) =>
          prisma.discipleshipAttendance.upsert({
            where: { memberId_eventId: { memberId, eventId } },
            update: { present: presentMemberIds.includes(memberId) },
            create: { memberId, eventId, present: presentMemberIds.includes(memberId) },
          })
        )
      );
    } else {
      // Admin / Secrétaire : remplace toutes les présences de l'événement
      const allDiscipleIds = (
        await prisma.discipleship.findMany({
          where: { churchId: event.churchId },
          select: { discipleId: true },
        })
      ).map((d) => d.discipleId);

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
    }

    return successResponse({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("discipleship:view");

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "eventId requis");

    // Résoudre l'église via l'événement pour appliquer le scope
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { churchId: true },
    });
    if (!event) throw new ApiError(404, "Événement introuvable");

    const scope = await getDiscipleshipScope(session, event.churchId);

    let whereScope = {};
    if (scope.scoped) {
      const ownDiscipleIds = (
        await prisma.discipleship.findMany({
          where: { churchId: event.churchId, discipleMakerId: scope.memberId ?? "" },
          select: { discipleId: true },
        })
      ).map((d) => d.discipleId);
      whereScope = { memberId: { in: ownDiscipleIds } };
    }

    const attendances = await prisma.discipleshipAttendance.findMany({
      where: { eventId, ...whereScope },
      select: { memberId: true, present: true },
    });

    return successResponse(attendances);
  } catch (error) {
    return errorResponse(error);
  }
}
