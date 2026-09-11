import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import {
  canManageOpeningClosing,
  findActiveAbsenceForMember,
  notifyAssignment,
} from "@/modules/planning";
import { z } from "zod";

const createSchema = z.object({
  slot: z.enum(["OPENING", "CLOSING"]),
  memberId: z.string().min(1),
  note: z.string().max(500).optional(),
});

const SLOT_LABELS: Record<string, string> = {
  OPENING: "Ouverture",
  CLOSING: "Fermeture",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    await requireChurchPermission("planning:view", churchId);

    const assignments = await prisma.openingClosingAssignment.findMany({
      where: { eventId, churchId },
      include: { member: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });

    return successResponse({
      opening: assignments.filter((a) => a.slot === "OPENING"),
      closing: assignments.filter((a) => a.slot === "CLOSING"),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const churchId = await resolveChurchId("event", eventId);
    const session = await requireChurchPermission("planning:view", churchId);

    if (!(await canManageOpeningClosing(session, churchId))) {
      throw new ApiError(403, "Droit insuffisant pour désigner ce service");
    }

    const body = createSchema.parse(await request.json());

    const event = await prisma.event.findFirst({ where: { id: eventId, churchId } });
    if (!event) throw new ApiError(404, "Événement introuvable");

    const member = await prisma.member.findFirst({
      where: { id: body.memberId, departments: { some: { department: { ministry: { churchId } } } } },
    });
    if (!member) throw new ApiError(404, "Membre introuvable dans cette église");

    const assignment = await prisma.openingClosingAssignment.create({
      data: {
        churchId,
        eventId,
        slot: body.slot,
        memberId: body.memberId,
        note: body.note,
        createdById: session.user.id,
      },
      include: { member: { select: { id: true, firstName: true, lastName: true } } },
    });

    const absence = await findActiveAbsenceForMember(churchId, body.memberId, event.date);
    await notifyAssignment(churchId, body.memberId, event.title, SLOT_LABELS[body.slot]);

    return successResponse({ assignment, absenceWarning: absence !== null }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
