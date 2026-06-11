import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const createSchema = z.object({
  eventId:            z.string().min(1),
  welcomeDutyFamilyId: z.string().min(1),
  note:               z.string().max(500).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requirePermission("events:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const from   = searchParams.get("from");
    const to     = searchParams.get("to");

    if (!eventId && !from) throw new ApiError(400, "eventId ou from requis");

    const assignments = await prisma.welcomeDutyAssignment.findMany({
      where: {
        churchId,
        ...(eventId ? { eventId } : {}),
        ...(from || to ? {
          event: {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to   ? { lte: new Date(to)   } : {}),
            },
          },
        } : {}),
      },
      include: { welcomeDutyFamily: true },
      orderBy: { createdAt: "asc" },
    });

    return successResponse(assignments);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("events:manage");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const body = createSchema.parse(await request.json());

    // Verify event belongs to this church
    const event = await prisma.event.findFirst({ where: { id: body.eventId, churchId } });
    if (!event) throw new ApiError(404, "Événement introuvable");

    // Verify family is in pool for this church
    const family = await prisma.welcomeDutyFamily.findFirst({
      where: { id: body.welcomeDutyFamilyId, churchId, active: true },
    });
    if (!family) throw new ApiError(404, "Famille introuvable dans le pool");

    const assignment = await prisma.welcomeDutyAssignment.create({
      data: {
        churchId,
        eventId: body.eventId,
        welcomeDutyFamilyId: body.welcomeDutyFamilyId,
        note: body.note,
      },
      include: { welcomeDutyFamily: true },
    });

    return successResponse(assignment, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
