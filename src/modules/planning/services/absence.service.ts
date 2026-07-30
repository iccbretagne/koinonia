import type { Prisma, Absence, AbsenceBackupType } from "@/generated/prisma/client";
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

export interface BackupInput {
  type: AbsenceBackupType;
  memberId?: string;
  userChurchRoleId?: string;
}

interface DeclarerBackupScope {
  /** Départements couverts (comme Resp. département, ou tous ceux des ministères dirigés). */
  departmentIds: string[];
  /** Ministères dirigés (rôle Ministre uniquement). */
  ministryIds: string[];
  isDepartmentHead: boolean;
  isMinister: boolean;
}

/**
 * Périmètre de désignation de backup d'un utilisateur pour une église donnée : départements
 * couverts (comme Resp. département, ou via les ministères qu'il dirige comme Ministre) et
 * ministères dirigés. Périmètre vide si l'utilisateur n'a ni rôle Resp. département ni Ministre.
 */
export async function getDeclarerBackupScope(
  userId: string,
  churchId: string,
  db?: DbClient
): Promise<DeclarerBackupScope> {
  db ??= await defaultDb();
  const roles = await db.userChurchRole.findMany({
    where: { userId, churchId, role: { in: ["DEPARTMENT_HEAD", "MINISTER"] } },
    select: { role: true, ministryId: true, departments: { select: { departmentId: true } } },
  });

  const departmentHeadDeptIds = roles
    .filter((r) => r.role === "DEPARTMENT_HEAD")
    .flatMap((r) => r.departments.map((d) => d.departmentId));
  const ministryIds = roles
    .filter((r) => r.role === "MINISTER" && r.ministryId)
    .map((r) => r.ministryId!);

  let ministerDeptIds: string[] = [];
  if (ministryIds.length > 0) {
    const depts = await db.department.findMany({
      where: { ministryId: { in: ministryIds } },
      select: { id: true },
    });
    ministerDeptIds = depts.map((d) => d.id);
  }

  return {
    departmentIds: Array.from(new Set([...departmentHeadDeptIds, ...ministerDeptIds])),
    ministryIds,
    isDepartmentHead: departmentHeadDeptIds.length > 0,
    isMinister: ministryIds.length > 0,
  };
}

/**
 * Valide que chaque backup proposé est autorisé pour le périmètre du déclarant. Lève
 * `ApiError(403)` au premier backup non autorisé. Ne fait rien si `backups` est vide.
 *
 * Règles (cf. spec 013) :
 * - STAR : le membre doit appartenir au périmètre du déclarant (département couvert, ou
 *   n'importe quel département d'un ministère qu'il dirige).
 * - RESPONSIBLE : un Resp. département peut désigner le Ministre de son ministère ou un autre
 *   Resp. département du même ministère ; un Ministre peut désigner un autre Ministre de
 *   l'église (jamais lui-même).
 */
export async function validateBackupTargets(
  declarerUserId: string,
  churchId: string,
  backups: BackupInput[],
  db?: DbClient
): Promise<void> {
  if (backups.length === 0) return;
  db ??= await defaultDb();

  const scope = await getDeclarerBackupScope(declarerUserId, churchId, db);
  if (!scope.isDepartmentHead && !scope.isMinister) {
    throw new ApiError(403, "Seuls un Resp. département ou un Ministre peuvent désigner un backup");
  }

  for (const backup of backups) {
    if (backup.type === "STAR") {
      if (!backup.memberId) throw new ApiError(400, "memberId requis pour un backup STAR");
      const memberScope = await getMemberScope(backup.memberId, db);
      const allowed = memberScope?.departmentIds.some((id) => scope.departmentIds.includes(id)) ?? false;
      if (!allowed) throw new ApiError(403, "Ce backup STAR n'appartient pas à votre périmètre");
      continue;
    }

    if (!backup.userChurchRoleId) throw new ApiError(400, "userChurchRoleId requis pour un backup responsable");
    const target = await db.userChurchRole.findUnique({
      where: { id: backup.userChurchRoleId },
      select: {
        userId: true,
        role: true,
        churchId: true,
        ministryId: true,
        departments: { select: { department: { select: { ministryId: true } } } },
      },
    });
    if (!target || target.churchId !== churchId) throw new ApiError(403, "Backup introuvable");
    if (target.userId === declarerUserId) {
      throw new ApiError(403, "Vous ne pouvez pas vous désigner vous-même en backup");
    }

    if (target.role !== "MINISTER" && target.role !== "DEPARTMENT_HEAD") {
      throw new ApiError(403, "Ce backup n'appartient pas à votre périmètre");
    }

    // Ministre → uniquement un autre Ministre de l'église (déjà exclu : lui-même).
    if (target.role === "MINISTER" && scope.isMinister) continue;

    // Resp. département → le Ministre de son ministère, ou un autre Resp. département du même
    // ministère (comparaison via les départements couverts par le déclarant).
    if (scope.isDepartmentHead) {
      const declarerMinistries = await db.department.findMany({
        where: { id: { in: scope.departmentIds } },
        select: { ministryId: true },
      });
      const declarerMinistryIds = new Set(declarerMinistries.map((d) => d.ministryId));
      const targetMinistryIds =
        target.role === "MINISTER"
          ? [target.ministryId].filter((id): id is string => !!id)
          : target.departments.map((d) => d.department.ministryId);
      if (targetMinistryIds.some((id) => declarerMinistryIds.has(id))) continue;
    }

    throw new ApiError(403, "Ce backup n'appartient pas à votre périmètre");
  }
}

/** Résout les utilisateurs à notifier pour une liste de backups (STAR via lien compte, sinon direct). */
async function resolveBackupRecipients(
  backups: { type: AbsenceBackupType; memberId: string | null; userChurchRoleId: string | null }[],
  churchId: string,
  db: DbClient
): Promise<string[]> {
  const recipients: string[] = [];
  for (const b of backups) {
    if (b.type === "STAR" && b.memberId) {
      const links = await db.memberUserLink.findMany({
        where: { memberId: b.memberId, churchId },
        select: { userId: true },
      });
      recipients.push(...links.map((l) => l.userId));
    } else if (b.type === "RESPONSIBLE" && b.userChurchRoleId) {
      const role = await db.userChurchRole.findUnique({
        where: { id: b.userChurchRoleId },
        select: { userId: true },
      });
      if (role) recipients.push(role.userId);
    }
  }
  return recipients;
}

interface DeclareAbsenceParams {
  churchId: string;
  memberId: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
  createdById: string;
  backups?: BackupInput[];
}

/**
 * Déclare une absence, calcule les conflits avec le planning existant, notifie
 * les responsables (et le STAR en cas de conflit), puis émet l'événement bus.
 *
 * L'autorisation (auto-déclaration ou périmètre resp./ministre) est vérifiée par
 * la route appelante avant d'invoquer ce service.
 */
export async function declareAbsence(params: DeclareAbsenceParams): Promise<Absence> {
  const { churchId, memberId, startDate, endDate, reason, createdById, backups = [] } = params;
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

    if (backups.length > 0) {
      await tx.absenceBackup.createMany({
        data: backups.map((b) => ({
          absenceId: absence.id,
          type: b.type,
          memberId: b.type === "STAR" ? b.memberId : null,
          userChurchRoleId: b.type === "RESPONSIBLE" ? b.userChurchRoleId : null,
        })),
      });
    }

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

    if (backups.length > 0) {
      const backupRecipients = new Set(await resolveBackupRecipients(backups.map((b) => ({
        type: b.type,
        memberId: b.type === "STAR" ? b.memberId ?? null : null,
        userChurchRoleId: b.type === "RESPONSIBLE" ? b.userChurchRoleId ?? null : null,
      })), churchId, tx));
      for (const userId of backupRecipients) {
        await tx.notification.create({
          data: {
            userId,
            type: "ABSENCE_BACKUP_ASSIGNED",
            title: "Désigné en backup",
            message: `Vous avez été désigné en backup de ${memberName} pour son absence du ${period}.`,
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
      include: {
        member: { select: { firstName: true, lastName: true } },
        backups: { select: { type: true, memberId: true, userChurchRoleId: true } },
      },
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
    for (const userId of await resolveBackupRecipients(absence.backups, churchId, tx)) {
      recipients.add(userId);
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

interface UpdateAbsenceParams {
  absenceId: string;
  churchId: string;
  updatedById: string;
  startDate?: Date;
  endDate?: Date;
  reason?: string | null;
  /** Remplace intégralement les backups si fourni ; laisse inchangé si `undefined`. */
  backups?: BackupInput[];
}

/**
 * Modifie une absence active tant que sa date de fin n'est pas passée, recalcule les conflits
 * sur la nouvelle période et notifie l'union des destinataires (anciens + nouveaux backups).
 *
 * L'autorisation (créateur, membre lui-même, resp./ministre scopé, ou manager global) est
 * vérifiée par la route appelante avant d'invoquer ce service.
 */
export async function updateAbsence(params: UpdateAbsenceParams): Promise<Absence> {
  const { absenceId, churchId, updatedById, startDate, endDate, reason, backups } = params;
  const { prisma } = await import("@/lib/prisma");

  return prisma.$transaction(async (tx) => {
    const absence = await tx.absence.findUnique({
      where: { id: absenceId },
      include: {
        member: { select: { firstName: true, lastName: true } },
        backups: { select: { type: true, memberId: true, userChurchRoleId: true } },
      },
    });
    if (!absence) throw new ApiError(404, "Absence introuvable");
    if (absence.churchId !== churchId) throw new ApiError(403, "Absence hors périmètre");
    if (absence.status === "CANCELLED") throw new ApiError(409, "Absence annulée, non modifiable");

    const now = new Date();
    if (absence.endDate < now) throw new ApiError(409, "Absence déjà passée, non modifiable");

    const newStartDate = startDate ?? absence.startDate;
    const newEndDate = endDate ?? absence.endDate;

    if (startDate && absence.startDate <= now && startDate < absence.startDate) {
      throw new ApiError(400, "La date de début d'une absence déjà commencée ne peut pas être reculée");
    }

    const conflictsBefore = await findAbsenceConflicts(
      absence.memberId,
      churchId,
      absence.startDate,
      absence.endDate,
      tx
    );
    const hadConflictBefore = conflictsBefore.length > 0;

    const updated = await tx.absence.update({
      where: { id: absenceId },
      data: {
        startDate: newStartDate,
        endDate: newEndDate,
        ...(reason !== undefined ? { reason: reason ?? null } : {}),
      },
    });

    const conflictsAfter = await findAbsenceConflicts(absence.memberId, churchId, newStartDate, newEndDate, tx);
    const hasConflictAfter = conflictsAfter.length > 0;

    const responsibleUserIds = await resolveResponsibleUserIds(absence.memberId, churchId, tx);
    const priorBackupRecipients = await resolveBackupRecipients(absence.backups, churchId, tx);

    let newBackupRecipients: string[] = [];
    if (backups !== undefined) {
      await tx.absenceBackup.deleteMany({ where: { absenceId } });
      if (backups.length > 0) {
        await tx.absenceBackup.createMany({
          data: backups.map((b) => ({
            absenceId,
            type: b.type,
            memberId: b.type === "STAR" ? b.memberId : null,
            userChurchRoleId: b.type === "RESPONSIBLE" ? b.userChurchRoleId : null,
          })),
        });
      }
      newBackupRecipients = await resolveBackupRecipients(
        backups.map((b) => ({
          type: b.type,
          memberId: b.type === "STAR" ? (b.memberId ?? null) : null,
          userChurchRoleId: b.type === "RESPONSIBLE" ? (b.userChurchRoleId ?? null) : null,
        })),
        churchId,
        tx
      );
    }

    const memberName = `${absence.member.firstName} ${absence.member.lastName}`;
    const period = formatPeriod(newStartDate, newEndDate);

    const memberLinkedUserIds =
      hadConflictBefore || hasConflictAfter
        ? (
            await tx.memberUserLink.findMany({
              where: { memberId: absence.memberId, churchId },
              select: { userId: true },
            })
          ).map((l) => l.userId)
        : [];

    const updateRecipients = new Set([
      ...responsibleUserIds,
      ...priorBackupRecipients,
      ...newBackupRecipients,
      ...memberLinkedUserIds,
    ]);

    for (const userId of updateRecipients) {
      await tx.notification.create({
        data: {
          userId,
          type: "ABSENCE_UPDATED",
          title: "Absence modifiée",
          message: `L'absence de ${memberName} a été modifiée (période : ${period}).`,
          link: "/absences",
        },
      });
    }

    if (hasConflictAfter && !hadConflictBefore) {
      const plural = conflictsAfter.length > 1;
      const conflictRecipients = new Set([...responsibleUserIds, ...memberLinkedUserIds]);
      for (const userId of conflictRecipients) {
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
      "planning:absence:updated",
      { tx, churchId, userId: updatedById },
      {
        absenceId,
        churchId,
        memberId: absence.memberId,
        updatedById,
        startDate: newStartDate.toISOString(),
        endDate: newEndDate.toISOString(),
        hasConflict: hasConflictAfter,
      }
    );

    return updated;
  });
}
