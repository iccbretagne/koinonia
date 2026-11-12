import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { isRoomAuthorizedForChurch } from "@/modules/rooms";
import { createSchema } from "./contract";
import { reserveRoom } from "./_core";

/**
 * GET /api/room-reservations?churchId=...&roomId?=&from?=&to?=
 *
 * Sans `roomId` : historique des réservations de l'église appelante.
 * Avec `roomId` : occupation de la salle tous établissements confondus (pour la
 * disponibilité), avec les détails masqués pour les réservations d'une autre église.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const roomId = searchParams.get("roomId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireChurchPermission("rooms:view", churchId);

    const dateFilter = {
      ...(from ? { endAt: { gte: new Date(from) } } : {}),
      ...(to ? { startAt: { lte: new Date(to) } } : {}),
    };

    if (roomId) {
      const authorized = await isRoomAuthorizedForChurch(roomId, churchId);
      if (!authorized) throw new ApiError(403, "Votre église n'est pas autorisée sur cette salle");

      const reservations = await prisma.roomReservation.findMany({
        where: { roomId, status: "CONFIRMED", ...dateFilter },
        include: { createdBy: { select: { id: true, name: true, displayName: true } } },
        orderBy: { startAt: "asc" },
      });

      return successResponse({
        reservations: reservations.map((r) => ({
          id: r.id,
          startAt: r.startAt,
          endAt: r.endAt,
          mine: r.churchId === churchId,
          title: r.churchId === churchId ? r.title : "Réservé",
          createdBy: r.churchId === churchId ? { id: r.createdBy.id, name: r.createdBy.displayName ?? r.createdBy.name } : null,
        })),
      });
    }

    const reservations = await prisma.roomReservation.findMany({
      where: { churchId, ...dateFilter },
      include: {
        room: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, displayName: true } },
        checklist: {
          select: {
            status: true,
            openedAt: true,
            keyReceivedFromName: true,
            openingNotes: true,
            closedAt: true,
            closedProperly: true,
            cleaned: true,
            equipmentOk: true,
            equipmentNotes: true,
            keyReturnedToName: true,
            closingNotes: true,
            incidentNotes: true,
            closedWithoutDeclaration: true,
            validatedAt: true,
            validatedClosedProperly: true,
            validatedCleaned: true,
            validatedEquipmentOk: true,
          },
        },
      },
      orderBy: { startAt: "desc" },
    });

    return successResponse({
      reservations: reservations.map((r) => ({
        id: r.id,
        room: r.room,
        title: r.title,
        startAt: r.startAt,
        endAt: r.endAt,
        status: r.status,
        seriesId: r.seriesId,
        isRecurrenceParent: r.isRecurrenceParent,
        createdBy: { id: r.createdBy.id, name: r.createdBy.displayName ?? r.createdBy.name },
        checklistStatus: r.checklist?.status ?? "PENDING",
        checklist: r.checklist,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/room-reservations — réserve une salle (occurrence unique ou série). */
export async function POST(request: Request) {
  try {
    const data = createSchema.parse(await request.json());
    const session = await requireChurchPermission("rooms:reserve", data.churchId);

    const result = await reserveRoom(session, data);

    return successResponse(
      {
        reservations: result.reservations,
        conflicts: result.conflicts,
        truncated: result.truncated,
      },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
