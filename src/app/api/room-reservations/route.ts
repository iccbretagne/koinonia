import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { createReservation, isRoomAuthorizedForChurch } from "@/modules/rooms";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const createSchema = z
  .object({
    churchId: z.string().min(1),
    roomId: z.string().min(1),
    eventId: z.string().min(1).optional(),
    title: z.string().min(1).max(200),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    recurrenceRule: z.enum(["weekly", "biweekly", "monthly"]).optional(),
    recurrenceEnd: z.string().datetime().optional(),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: "endAt doit être postérieure à startAt",
    path: ["endAt"],
  })
  .refine((d) => !d.recurrenceRule || d.recurrenceEnd, {
    message: "recurrenceEnd requis avec recurrenceRule",
    path: ["recurrenceEnd"],
  });

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
        checklist: { select: { status: true } },
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

    const result = await createReservation({
      churchId: data.churchId,
      roomId: data.roomId,
      eventId: data.eventId ?? null,
      title: data.title,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      recurrenceRule: data.recurrenceRule ?? null,
      recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd) : null,
      createdById: session.user.id,
    });

    if (result.reservations.length === 0) {
      throw new ApiError(409, "Salle déjà réservée sur ce créneau");
    }

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "RoomReservation",
      entityId: result.reservations[0].id,
      details: { roomId: data.roomId, title: data.title, occurrences: result.reservations.length },
    });

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
