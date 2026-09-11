import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { canManageOpeningClosing } from "@/modules/planning";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        church: { select: { name: true } },
        welcomeDutyAssignments: {
          include: { welcomeDutyFamily: { select: { familyName: true } } },
          orderBy: { createdAt: "asc" },
        },
        openingClosingAssignments: {
          include: { member: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "asc" },
        },
        eventDepts: {
          include: {
            department: {
              include: {
                ministry: { select: { name: true } },
              },
            },
            plannings: {
              where: {
                status: {
                  in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"],
                },
              },
              include: {
                member: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new ApiError(404, "Event not found");
    }

    let totalStars = 0;

    const departments = event.eventDepts.map((ed) => {
      const members = ed.plannings.map((p) => ({
        id: p.member.id,
        firstName: p.member.firstName,
        lastName: p.member.lastName,
        status: p.status,
      }));
      totalStars += members.length;
      return {
        id: ed.department.id,
        name: ed.department.name,
        ministryName: ed.department.ministry.name,
        members,
      };
    });

    const welcomeFamilies = event.welcomeDutyAssignments.map(
      (a) => a.welcomeDutyFamily.familyName
    );

    // Lien croisé événement → audio : uniquement si un culte audio publié est rattaché
    // (spec §1 — le lien apparaît une fois la publication faite, pas avant). Pointe vers la
    // bibliothèque d'écoute interne (spec 021) plutôt que de fabriquer un token de partage à
    // chaque consultation d'événement.
    const audioService = await prisma.audioService.findUnique({
      where: { planningEventId: eventId },
      select: { id: true, status: true },
    });
    const audioLink =
      audioService?.status === "PUBLISHED" ? { url: `/audio/ecouter/${audioService.id}` } : null;

    const openingClosing = {
      opening: event.openingClosingAssignments
        .filter((a) => a.slot === "OPENING")
        .map((a) => ({ id: a.id, member: a.member })),
      closing: event.openingClosingAssignments
        .filter((a) => a.slot === "CLOSING")
        .map((a) => ({ id: a.id, member: a.member })),
      canManage: await canManageOpeningClosing(session, churchId),
    };

    return successResponse({
      event: {
        id: event.id,
        title: event.title,
        date: event.date.toISOString(),
        church: { name: event.church.name },
        welcomeDutyEnabled: event.welcomeDutyEnabled,
      },
      departments,
      totalStars,
      welcomeFamilies,
      audioLink,
      openingClosing,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
