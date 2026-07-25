import type { Prisma, Absence } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { planningBus } from "../bus";

type DbClient = Prisma.TransactionClient;

/**
 * Import différé du singleton Prisma — évite d'instancier un vrai client
 * (driver adapter MariaDB) au simple chargement du module `planning`, ce qui
 * casserait les tests import ant `@/modules/planning` sans mocker `@/lib/prisma`.
 */
async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export interface AbsenceConflict {
  eventId: string;
  title: string;
  date: Date;
  departmentId: string;
}

function formatPeriod(startDate: Date, endDate: Date): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmt.format(startDate)} au ${fmt.format(endDate)}`;
}

/**
 * Cherche les services déjà planifiés (EN_SERVICE / EN_SERVICE_DEBRIEF) du membre
 * dont la date chevauche la période donnée. Jamais persisté : recalculé à chaque appel.
 */
export async function findAbsenceConflicts(
  memberId: string,
  churchId: string,
  startDate: Date,
  endDate: Date,
  db?: DbClient
): Promise<AbsenceConflict[]> {
  db ??= await defaultDb();
  const plannings = await db.planning.findMany({
    where: {
      memberId,
      status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] },
      eventDepartment: { event: { churchId, date: { gte: startDate, lte: endDate } } },
    },
    select: {
      eventDepartment: {
        select: {
          departmentId: true,
          event: { select: { id: true, title: true, date: true } },
        },
      },
    },
  });

  return plannings.map((p) => ({
    eventId: p.eventDepartment.event.id,
    title: p.eventDepartment.event.title,
    date: p.eventDepartment.event.date,
    departmentId: p.eventDepartment.departmentId,
  }));
}

/** Union dédupliquée des Resp. département + Ministres couvrant tous les départements du membre. */
export async function resolveResponsibleUserIds(
  memberId: string,
  churchId: string,
  db?: DbClient
): Promise<string[]> {
  db ??= await defaultDb();
  const memberDepts = await db.memberDepartment.findMany({
    where: { memberId },
    select: { department: { select: { id: true, ministryId: true } } },
  });

  const departmentIds = memberDepts.map((d) => d.department.id);
  if (departmentIds.length === 0) return [];

  const ministryIds = Array.from(new Set(memberDepts.map((d) => d.department.ministryId)));

  const deptHeads = await db.userDepartment.findMany({
    where: { departmentId: { in: departmentIds }, userChurchRole: { churchId, role: "DEPARTMENT_HEAD" } },
    select: { userChurchRole: { select: { userId: true } } },
  });

  const ministers = await db.userChurchRole.findMany({
    where: { churchId, role: "MINISTER", ministryId: { in: ministryIds } },
    select: { userId: true },
  });

  return Array.from(
    new Set([...deptHeads.map((d) => d.userChurchRole.userId), ...ministers.map((m) => m.userId)])
  );
}

/** Vrai si `userId` a une fiche STAR (`memberId`) liée dans cette église. */
export async function isMemberLinkedToUser(
  memberId: string,
  userId: string,
  churchId: string,
  db?: DbClient
): Promise<boolean> {
  db ??= await defaultDb();
  const link = await db.memberUserLink.findFirst({ where: { memberId, userId, churchId } });
  return !!link;
}

/** Église et départements du membre, pour vérifier l'appartenance et le périmètre. */
export async function getMemberScope(
  memberId: string,
  db?: DbClient
): Promise<{ churchId: string | null; departmentIds: string[] } | null> {
  db ??= await defaultDb();
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: {
      departments: { select: { department: { select: { id: true, ministry: { select: { churchId: true } } } } } },
    },
  });
  if (!member) return null;

  const departmentIds = member.departments.map((d) => d.department.id);
  const churchIds = new Set(member.departments.map((d) => d.department.ministry.churchId));
  return { churchId: churchIds.size === 1 ? [...churchIds][0] : null, departmentIds };
}

interface DeclareAbsenceParams {
  churchId: string;
  memberId: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
  createdById: string;
}

/**
 * Déclare une absence, calcule les conflits avec le planning existant, notifie
 * les responsables (et le STAR en cas de conflit), puis émet l'événement bus.
 *
 * L'autorisation (auto-déclaration ou périmètre resp./ministre) est vérifiée par
 * la route appelante avant d'invoquer ce service.
 */
export async function declareAbsence(params: DeclareAbsenceParams): Promise<Absence> {
  const { churchId, memberId, startDate, endDate, reason, createdById } = params;
  const { prisma } = await import("@/lib/prisma");

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true },
  });
  if (!member) throw new ApiError(404, "Fiche STAR introuvable");

  return prisma.$transaction(async (tx) => {
    const absence = await tx.absence.create({
      data: { churchId, memberId, startDate, endDate, reason: reason ?? null, createdById },
    });

    const conflicts = await findAbsenceConflicts(memberId, churchId, startDate, endDate, tx);
    const hasConflict = conflicts.length > 0;
    const responsibleUserIds = await resolveResponsibleUserIds(memberId, churchId, tx);

    const memberName = `${member.firstName} ${member.lastName}`;
    const period = formatPeriod(startDate, endDate);

    for (const userId of responsibleUserIds) {
      await tx.notification.create({
        data: {
          userId,
          type: "ABSENCE_DECLARED",
          title: "Absence déclarée",
          message: `${memberName} a déclaré une absence du ${period}.`,
          link: "/absences",
        },
      });
    }

    if (hasConflict) {
      const recipients = new Set(responsibleUserIds);
      const links = await tx.memberUserLink.findMany({ where: { memberId, churchId }, select: { userId: true } });
      for (const l of links) recipients.add(l.userId);

      const plural = conflicts.length > 1;
      for (const userId of recipients) {
        await tx.notification.create({
          data: {
            userId,
            type: "ABSENCE_CONFLICT",
            title: "Conflit planning / absence",
            message: `L'absence de ${memberName} (${period}) chevauche ${plural ? "des services" : "un service"} déjà planifié${plural ? "s" : ""}.`,
            link: "/absences",
          },
        });
      }
    }

    await planningBus.emit(
      "planning:absence:declared",
      { tx, churchId, userId: createdById },
      {
        absenceId: absence.id,
        churchId,
        memberId,
        startDate: absence.startDate.toISOString(),
        endDate: absence.endDate.toISOString(),
        createdById,
        hasConflict,
      }
    );

    return absence;
  });
}

interface CancelAbsenceParams {
  absenceId: string;
  churchId: string;
  cancelledById: string;
}

/**
 * Annule une absence active et notifie systématiquement les responsables notifiés
 * à la déclaration (et le STAR si un conflit avait été signalé).
 *
 * L'autorisation (créateur, membre lui-même, resp./ministre scopé, ou manager
 * global) est vérifiée par la route appelante avant d'invoquer ce service.
 */
export async function cancelAbsence(params: CancelAbsenceParams): Promise<Absence> {
  const { absenceId, churchId, cancelledById } = params;
  const { prisma } = await import("@/lib/prisma");

  return prisma.$transaction(async (tx) => {
    const absence = await tx.absence.findUnique({
      where: { id: absenceId },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    if (!absence) throw new ApiError(404, "Absence introuvable");
    if (absence.churchId !== churchId) throw new ApiError(403, "Absence hors périmètre");
    if (absence.status === "CANCELLED") throw new ApiError(409, "Absence déjà annulée");

    const conflictsBefore = await findAbsenceConflicts(
      absence.memberId,
      churchId,
      absence.startDate,
      absence.endDate,
      tx
    );
    const hadConflict = conflictsBefore.length > 0;

    const updated = await tx.absence.update({
      where: { id: absenceId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById },
    });

    const responsibleUserIds = await resolveResponsibleUserIds(absence.memberId, churchId, tx);
    const recipients = new Set(responsibleUserIds);
    if (hadConflict) {
      const links = await tx.memberUserLink.findMany({
        where: { memberId: absence.memberId, churchId },
        select: { userId: true },
      });
      for (const l of links) recipients.add(l.userId);
    }

    const memberName = `${absence.member.firstName} ${absence.member.lastName}`;
    const period = formatPeriod(absence.startDate, absence.endDate);

    for (const userId of recipients) {
      await tx.notification.create({
        data: {
          userId,
          type: "ABSENCE_CANCELLED",
          title: "Absence annulée",
          message: `L'absence de ${memberName} (${period}) a été annulée.`,
          link: "/absences",
        },
      });
    }

    await planningBus.emit(
      "planning:absence:cancelled",
      { tx, churchId, userId: cancelledById },
      { absenceId, churchId, memberId: absence.memberId, cancelledById, hadConflict }
    );

    return updated;
  });
}
