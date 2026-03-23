import { prisma } from "@/lib/prisma";
import { requireChurchPermission, getDiscipleshipScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

// Stats de participation aux événements trackés sur une période glissante
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("discipleship:view", churchId);

    // Période glissante : mois calendaire courant par défaut
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : defaultFrom;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : defaultTo;

    const scope = await getDiscipleshipScope(session, churchId);
    const whereScope = scope.scoped
      ? { discipleMakerId: scope.memberId ?? "" }
      : {};

    // Événements trackés sur la période
    const trackedEvents = await prisma.event.findMany({
      where: {
        churchId,
        trackedForDiscipleship: true,
        date: { gte: from, lte: to },
      },
      select: { id: true, title: true, date: true },
      orderBy: { date: "asc" },
    });

    const eventIds = trackedEvents.map((e) => e.id);

    // Disciples selon la portée
    const discipleships = await prisma.discipleship.findMany({
      where: { churchId, ...whereScope },
      select: {
        id: true,
        discipleId: true,
        discipleMakerId: true,
        firstMakerId: true,
        disciple: { select: { id: true, firstName: true, lastName: true, departments: { where: { isPrimary: true }, select: { department: { select: { name: true, ministry: { select: { name: true } } } } } } } },
        discipleMaker: { select: { id: true, firstName: true, lastName: true } },
        firstMaker: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Présences enregistrées
    const attendances = eventIds.length > 0
      ? await prisma.discipleshipAttendance.findMany({
          where: {
            eventId: { in: eventIds },
            present: true,
          },
          select: { memberId: true, eventId: true },
        })
      : [];

    // Map memberId -> set d'eventIds présents
    const presenceMap = new Map<string, Set<string>>();
    for (const a of attendances) {
      if (!presenceMap.has(a.memberId)) presenceMap.set(a.memberId, new Set());
      presenceMap.get(a.memberId)!.add(a.eventId);
    }

    const stats = discipleships.map((d) => {
      const present = presenceMap.get(d.discipleId)?.size ?? 0;
      return {
        discipleshipId: d.id,
        disciple: d.disciple,
        discipleMaker: d.discipleMaker,
        firstMaker: d.firstMaker,
        stats: {
          totalEvents: trackedEvents.length,
          present,
          absent: trackedEvents.length - present,
          rate: trackedEvents.length > 0 ? Math.round((present / trackedEvents.length) * 100) : null,
        },
      };
    });

    return successResponse({
      period: { from: from.toISOString(), to: to.toISOString() },
      trackedEvents,
      stats,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
