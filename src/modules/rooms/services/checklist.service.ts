import type { Prisma, RoomChecklist } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";

type DbClient = Prisma.TransactionClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/** Vrai si l'un des départements donnés a la fonction SECURITE ou ENTRETIEN (équipe dédiée). */
export async function isControlTeamMember(departmentIds: string[], db?: DbClient): Promise<boolean> {
  if (departmentIds.length === 0) return false;
  db ??= await defaultDb();
  const count = await db.department.count({
    where: { id: { in: departmentIds }, function: { in: ["SECURITE", "ENTRETIEN"] } },
  });
  return count > 0;
}

async function getReservationOwnership(reservationId: string, db: DbClient) {
  const reservation = await db.roomReservation.findUnique({
    where: { id: reservationId },
    select: { id: true, churchId: true, title: true, createdById: true, checklist: { select: { id: true, status: true } } },
  });
  if (!reservation) throw new ApiError(404, "Réservation introuvable");
  if (!reservation.checklist) throw new ApiError(404, "Main courante introuvable");
  return { ...reservation, checklist: reservation.checklist };
}

interface DeclareOpeningParams {
  reservationId: string;
  userId: string;
  keyReceivedFromId?: string | null;
  keyReceivedFromName?: string | null;
  notes?: string | null;
}

/** Déclare l'ouverture (prise en main) d'une réservation. Ownership : `userId === reservation.createdById`. */
export async function declareOpening(params: DeclareOpeningParams): Promise<RoomChecklist> {
  const { reservationId, userId, keyReceivedFromId, keyReceivedFromName, notes } = params;
  const { prisma } = await import("@/lib/prisma");

  const reservation = await getReservationOwnership(reservationId, prisma);
  if (reservation.createdById !== userId) {
    throw new ApiError(403, "Seul le créateur de la réservation peut déclarer l'ouverture");
  }

  return prisma.roomChecklist.update({
    where: { reservationId },
    data: {
      status: "OPENED",
      openedById: userId,
      openedAt: new Date(),
      keyReceivedFromId: keyReceivedFromId ?? null,
      keyReceivedFromName: keyReceivedFromName ?? null,
      openingNotes: notes ?? null,
    },
  });
}

interface DeclareClosingParams {
  reservationId: string;
  userId: string;
  closedProperly: boolean;
  cleaned: boolean;
  keyReturnedToId?: string | null;
  keyReturnedToName?: string | null;
  notes?: string | null;
}

/** Déclare la fermeture d'une réservation. Ownership : `userId === reservation.createdById`. */
export async function declareClosing(params: DeclareClosingParams): Promise<RoomChecklist> {
  const { reservationId, userId, closedProperly, cleaned, keyReturnedToId, keyReturnedToName, notes } = params;
  const { prisma } = await import("@/lib/prisma");

  const reservation = await getReservationOwnership(reservationId, prisma);
  if (reservation.createdById !== userId) {
    throw new ApiError(403, "Seul le créateur de la réservation peut déclarer la fermeture");
  }

  return prisma.roomChecklist.update({
    where: { reservationId },
    data: {
      status: "CLOSED_DECLARED",
      closedById: userId,
      closedAt: new Date(),
      closedProperly,
      cleaned,
      keyReturnedToId: keyReturnedToId ?? null,
      keyReturnedToName: keyReturnedToName ?? null,
      closingNotes: notes ?? null,
    },
  });
}

interface ValidateChecklistParams {
  reservationId: string;
  validatorId: string;
  validatedClosedProperly: boolean;
  validatedCleaned: boolean;
  incidentNotes?: string | null;
}

/**
 * Contrôle une main courante déclarée fermée. Concordance avec la déclaration → `VALIDATED` ;
 * écart (ou `incidentNotes` renseigné) → `ISSUE_REPORTED`, avec notification du créateur.
 */
export async function validateChecklist(params: ValidateChecklistParams): Promise<RoomChecklist> {
  const { reservationId, validatorId, validatedClosedProperly, validatedCleaned, incidentNotes } = params;
  const { prisma } = await import("@/lib/prisma");

  return prisma.$transaction(async (tx) => {
    const reservation = await getReservationOwnership(reservationId, tx);
    if (reservation.checklist.status !== "CLOSED_DECLARED") {
      throw new ApiError(409, "Cette main courante n'a pas encore de fermeture déclarée");
    }

    const declared = await tx.roomChecklist.findUnique({
      where: { reservationId },
      select: { closedProperly: true, cleaned: true },
    });

    const matches =
      declared?.closedProperly === validatedClosedProperly && declared?.cleaned === validatedCleaned;
    const hasIssue = !matches || !!incidentNotes;

    const updated = await tx.roomChecklist.update({
      where: { reservationId },
      data: {
        status: hasIssue ? "ISSUE_REPORTED" : "VALIDATED",
        validatedById: validatorId,
        validatedAt: new Date(),
        validatedClosedProperly,
        validatedCleaned,
        incidentNotes: incidentNotes ?? null,
      },
    });

    if (hasIssue) {
      await tx.notification.create({
        data: {
          userId: reservation.createdById,
          type: "ROOM_CHECKLIST_ISSUE",
          title: "Écart constaté sur une salle",
          message: `Un écart a été constaté par l'équipe de contrôle sur la réservation « ${reservation.title} ».`,
          link: "/rooms",
        },
      });
    }

    return updated;
  });
}
