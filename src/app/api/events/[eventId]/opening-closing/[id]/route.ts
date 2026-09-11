import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  canManageOpeningClosing,
  notifyRemoval,
} from "@/modules/planning";

const SLOT_LABELS: Record<string, string> = {
  OPENING: "Ouverture",
  CLOSING: "Fermeture",
};

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; id: string }> }
) {
  try {
    const { eventId, id } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);

    if (!(await canManageOpeningClosing(session, churchId))) {
      throw new ApiError(403, "Droit insuffisant pour retirer cette désignation");
    }

    const assignment = await prisma.openingClosingAssignment.findFirst({
      where: { id, eventId, churchId },
      include: { event: { select: { title: true } } },
    });
    if (!assignment) throw new ApiError(404, "Désignation introuvable");

    await prisma.openingClosingAssignment.delete({ where: { id } });

    await notifyRemoval(churchId, assignment.memberId, assignment.event.title, SLOT_LABELS[assignment.slot]);

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
