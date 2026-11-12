import type { Session } from "next-auth";
import type { z } from "zod";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createReservation } from "@/modules/rooms";
import type { createSchema } from "./contract";

/**
 * Réserve une salle (une fois ou en série) ; aucun créneau libre ⇒ 409. Même code pour l'écran
 * et l'assistant IA (spec 081, lot 3c) ; l'appelant a déjà vérifié `rooms:reserve` dans l'église.
 */
export async function reserveRoom(session: Session, data: z.infer<typeof createSchema>, details: Record<string, unknown> = {}) {
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
    details: { roomId: data.roomId, title: data.title, occurrences: result.reservations.length, ...details },
  });

  return result;
}
