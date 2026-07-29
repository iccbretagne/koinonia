import type { Prisma, RoomReservation } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";

type DbClient = Prisma.TransactionClient;

/**
 * Import différé du singleton Prisma — évite d'instancier un vrai client
 * (driver adapter MariaDB) au simple chargement du module `rooms`.
 */
async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

const MAX_RECURRENCE_OCCURRENCES = 104; // ~2 ans hebdomadaires

/**
 * Génère les dates d'occurrence suivantes (hors la première) selon la règle donnée.
 * Dupliquée volontairement de `request-executor.ts` (cf. plan.md § Décisions) : fonction
 * pure non exportée publiquement par `planning`, créer une dépendance de module serait
 * disproportionné pour ~15 lignes.
 */
export function generateRoomRecurrenceDates(
  startDate: Date,
  rule: string,
  endDate: Date
): { dates: Date[]; truncated: boolean } {
  if (isNaN(endDate.getTime())) return { dates: [], truncated: false };
  const dates: Date[] = [];
  const current = new Date(startDate);
  while (dates.length < MAX_RECURRENCE_OCCURRENCES) {
    if (rule === "weekly") current.setDate(current.getDate() + 7);
    else if (rule === "biweekly") current.setDate(current.getDate() + 14);
    else if (rule === "monthly") current.setMonth(current.getMonth() + 1);
    else break;
    if (current > endDate) break;
    dates.push(new Date(current));
  }
  const truncated = dates.length === MAX_RECURRENCE_OCCURRENCES && current <= endDate;
  return { dates, truncated };
}

/**
 * Vrai si la salle est libre sur le créneau donné — chevauchement sur `RoomReservation`
 * `status: CONFIRMED` du même `roomId`, peu importe l'église réservatrice.
 */
export async function checkRoomAvailability(
  roomId: string,
  startAt: Date,
  endAt: Date,
  excludeReservationId?: string,
  db?: DbClient
): Promise<boolean> {
  db ??= await defaultDb();
  const overlap = await db.roomReservation.findFirst({
    where: {
      roomId,
      status: "CONFIRMED",
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
  return !overlap;
}

/** Vrai si `churchId` est propriétaire de la salle ou dans sa liste blanche `RoomAccess`. */
export async function isRoomAuthorizedForChurch(
  roomId: string,
  churchId: string,
  db?: DbClient
): Promise<boolean> {
  db ??= await defaultDb();
  const room = await db.room.findUnique({
    where: { id: roomId },
    select: { churchId: true, sharedWith: { select: { churchId: true } } },
  });
  if (!room) return false;
  return room.churchId === churchId || room.sharedWith.some((a) => a.churchId === churchId);
}

interface Occurrence {
  startAt: Date;
  endAt: Date;
}

interface CreateReservationParams {
  churchId: string;
  roomId: string;
  eventId?: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  recurrenceRule?: string | null;
  recurrenceEnd?: Date | null;
  createdById: string;
}

export interface CreateReservationResult {
  reservations: RoomReservation[];
  conflicts: Occurrence[];
  truncated: boolean;
}

/**
 * Crée une réservation (occurrence unique, série liée à un événement récurrent, ou
 * série autonome). Chaque occurrence est vérifiée et écrite indépendamment : une
 * occurrence en conflit est omise sans faire échouer les autres (signalée dans
 * `conflicts`).
 */
export async function createReservation(params: CreateReservationParams): Promise<CreateReservationResult> {
  const { churchId, roomId, eventId, title, startAt, endAt, recurrenceRule, recurrenceEnd, createdById } = params;
  const { prisma } = await import("@/lib/prisma");

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, isActive: true, churchId: true, sharedWith: { select: { churchId: true } } },
  });
  if (!room) throw new ApiError(404, "Salle introuvable");
  if (!room.isActive) throw new ApiError(403, "Cette salle n'est plus active");
  const authorized = room.churchId === churchId || room.sharedWith.some((a) => a.churchId === churchId);
  if (!authorized) throw new ApiError(403, "Votre église n'est pas autorisée à réserver cette salle");

  const durationMs = endAt.getTime() - startAt.getTime();
  let occurrences: Occurrence[] = [{ startAt, endAt }];
  let truncated = false;

  if (eventId) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, churchId: true, isRecurrenceParent: true },
    });
    if (!event) throw new ApiError(404, "Événement introuvable");
    if (event.churchId !== churchId) throw new ApiError(403, "Événement hors périmètre");

    if (event.isRecurrenceParent) {
      const children = await prisma.event.findMany({
        where: { seriesId: event.id },
        select: { date: true },
        orderBy: { date: "asc" },
      });
      occurrences = [
        { startAt, endAt },
        ...children.map((c) => {
          const occStart = new Date(c.date);
          occStart.setHours(startAt.getHours(), startAt.getMinutes(), startAt.getSeconds(), 0);
          return { startAt: occStart, endAt: new Date(occStart.getTime() + durationMs) };
        }),
      ];
    }
  } else if (recurrenceRule && recurrenceEnd) {
    const generated = generateRoomRecurrenceDates(startAt, recurrenceRule, recurrenceEnd);
    truncated = generated.truncated;
    occurrences = [
      { startAt, endAt },
      ...generated.dates.map((d) => ({ startAt: d, endAt: new Date(d.getTime() + durationMs) })),
    ];
  }

  const isSeries = occurrences.length > 1;
  const created: RoomReservation[] = [];
  const conflicts: Occurrence[] = [];
  let parentId: string | null = null;

  for (const [index, occ] of occurrences.entries()) {
    const isParent = isSeries && index === 0;
    const reservation = await prisma.$transaction(async (tx) => {
      const available = await checkRoomAvailability(roomId, occ.startAt, occ.endAt, undefined, tx);
      if (!available) return null;

      const res = await tx.roomReservation.create({
        data: {
          roomId,
          churchId,
          eventId: eventId ?? null,
          title,
          startAt: occ.startAt,
          endAt: occ.endAt,
          recurrenceRule: !eventId && isSeries ? recurrenceRule : null,
          seriesId: isSeries && !isParent ? parentId : null,
          isRecurrenceParent: isParent,
          createdById,
        },
      });
      await tx.roomChecklist.create({ data: { reservationId: res.id, status: "PENDING" } });
      return res;
    });

    if (!reservation) {
      conflicts.push(occ);
      continue;
    }
    if (isParent) parentId = reservation.id;
    created.push(reservation);
  }

  return { reservations: created, conflicts, truncated };
}

interface CancelReservationParams {
  id: string;
  churchId: string;
  cancelledById: string;
  scope: "occurrence" | "series";
}

/**
 * Annule une réservation. `scope: "occurrence"` n'annule que la ligne ciblée ;
 * `scope: "series"` annule toutes les occurrences confirmées et non encore passées
 * de la même série (racine incluse).
 */
export async function cancelReservation(params: CancelReservationParams): Promise<{ cancelledIds: string[] }> {
  const { id, churchId, cancelledById, scope } = params;
  const { prisma } = await import("@/lib/prisma");

  const reservation = await prisma.roomReservation.findUnique({ where: { id } });
  if (!reservation) throw new ApiError(404, "Réservation introuvable");
  if (reservation.churchId !== churchId) throw new ApiError(403, "Réservation hors périmètre");
  if (reservation.status === "CANCELLED") throw new ApiError(409, "Réservation déjà annulée");

  const seriesRootId = reservation.isRecurrenceParent ? reservation.id : reservation.seriesId;

  if (scope === "occurrence" || !seriesRootId) {
    await prisma.roomReservation.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById },
    });
    return { cancelledIds: [id] };
  }

  const members = await prisma.roomReservation.findMany({
    where: {
      status: "CONFIRMED",
      endAt: { gte: new Date() },
      OR: [{ id: seriesRootId }, { seriesId: seriesRootId }],
    },
    select: { id: true },
  });
  const memberIds = members.map((m) => m.id);
  if (!memberIds.includes(id)) memberIds.push(id);

  await prisma.roomReservation.updateMany({
    where: { id: { in: memberIds } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById },
  });

  return { cancelledIds: memberIds };
}
