import type { Prisma, Absence, AbsenceBackupType, AbsenceKind } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { isAbsencePast } from "@/lib/absence-lock";
import { planningBus } from "../bus";
import {
  validateTargeting,
  lastEffectiveDate,
  type DeclarerScope,
  type TargetEventSnapshot,
} from "./absence-targeting";

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

/** Ciblage effectif d'une absence, tel que persisté — utilisé par les conflits et les notifications. */
export interface AbsenceTargeting {
  kind: AbsenceKind;
  startDate?: Date | null;
  endDate?: Date | null;
  eventIds?: string[];
  allDepartments: boolean;
  departmentIds?: string[];
}

function formatPeriod(startDate: Date, endDate: Date): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmt.format(startDate)} au ${fmt.format(endDate)}`;
}

/** Texte « quand » utilisé dans les notifications, pour une période ou une liste d'événements. */
function formatWhen(targeting: AbsenceTargeting, events: TargetEventSnapshot[]): string {
  if (targeting.kind === "PERIOD" && targeting.startDate && targeting.endDate) {
    return `du ${formatPeriod(targeting.startDate, targeting.endDate)}`;
  }
  if (events.length === 1) {
    const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `sur « ${events[0].title} » (${fmt.format(events[0].date)})`;
  }
  return `sur ${events.length} événements`;
}

/**
 * Cherche les services déjà planifiés (EN_SERVICE / EN_SERVICE_DEBRIEF) du membre couverts par
 * le ciblage de l'absence (période ou événements précis, tous départements ou une liste). Jamais
 * persisté : recalculé à chaque appel.
 */
export async function findAbsenceConflicts(
  memberId: string,
  churchId: string,
  targeting: AbsenceTargeting,
  db?: DbClient
): Promise<AbsenceConflict[]> {
  db ??= await defaultDb();

  const eventWhere: Prisma.EventWhereInput =
    targeting.kind === "EVENTS"
      ? { id: { in: targeting.eventIds ?? [] } }
      : { date: { gte: targeting.startDate!, lte: targeting.endDate! } };

  const plannings = await db.planning.findMany({
    where: {
      memberId,
      status: { in: ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] },
      eventDepartment: {
        event: { churchId, ...eventWhere },
        ...(targeting.allDepartments ? {} : { departmentId: { in: targeting.departmentIds ?? [] } }),
      },
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

/**
 * Union dédupliquée des Resp. département + Ministres couvrant les départements du membre.
 * `departmentIds` restreint la recherche à ce sous-ensemble (absence ciblée) ; par défaut, tous
 * les départements du membre (absence « tous départements »).
 */
export async function resolveResponsibleUserIds(
  memberId: string,
  churchId: string,
  db?: DbClient,
  departmentIds?: string[]
): Promise<string[]> {
  db ??= await defaultDb();
  const memberDepts = await db.memberDepartment.findMany({
    where: { memberId, ...(departmentIds ? { departmentId: { in: departmentIds } } : {}) },
    select: { department: { select: { id: true, ministryId: true } } },
  });

  const scopedDepartmentIds = memberDepts.map((d) => d.department.id);
  if (scopedDepartmentIds.length === 0) return [];

  const ministryIds = Array.from(new Set(memberDepts.map((d) => d.department.ministryId)));

  const deptHeads = await db.userDepartment.findMany({
    where: { departmentId: { in: scopedDepartmentIds }, userChurchRole: { churchId, role: "DEPARTMENT_HEAD" } },
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

/** `userId` du compte lié à cette fiche STAR dans cette église, ou `null` si aucun lien. */
export async function resolveSubjectUserId(
  memberId: string,
  churchId: string,
  db?: DbClient
): Promise<string | null> {
  db ??= await defaultDb();
  const link = await db.memberUserLink.findFirst({ where: { memberId, churchId }, select: { userId: true } });
  return link?.userId ?? null;
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

export interface BackupOption {
  value: string;
  label: string;
}

/**
 * Liste les backups possibles pour l'absence de `subjectUserId` (la personne absente — soi-même
 * en auto-déclaration, ou le compte lié au STAR ciblé quand un tiers déclare pour lui). Retourne
 * `eligible: false` (options vides) si cette personne n'a ni rôle Resp. département ni Ministre —
 * cohérent avec la règle « pas de backup sur l'absence d'un STAR simple ».
 */
export async function listBackupOptions(
  subjectUserId: string,
  churchId: string,
  db?: DbClient
): Promise<{ eligible: boolean; options: BackupOption[] }> {
  db ??= await defaultDb();
  const scope = await getDeclarerBackupScope(subjectUserId, churchId, db);
  if (!scope.isDepartmentHead && !scope.isMinister) {
    return { eligible: false, options: [] };
  }

  const starMembers = await db.member.findMany({
    where: { departments: { some: { departmentId: { in: scope.departmentIds } } } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const starOptions: BackupOption[] = starMembers.map((m) => ({
    value: `STAR:${m.id}`,
    label: `${m.firstName} ${m.lastName} (STAR)`,
  }));

  const responsibleRoles: { id: string; role: string; user: { name: string | null; displayName: string | null } }[] = [];
  if (scope.isMinister) {
    const ministers = await db.userChurchRole.findMany({
      where: { churchId, role: "MINISTER", userId: { not: subjectUserId } },
      select: { id: true, role: true, user: { select: { name: true, displayName: true } } },
    });
    responsibleRoles.push(...ministers);
  }
  if (scope.isDepartmentHead) {
    const depts = await db.department.findMany({
      where: { id: { in: scope.departmentIds } },
      select: { ministryId: true },
    });
    const ministryIds = Array.from(new Set(depts.map((d) => d.ministryId)));
    const peers = await db.userChurchRole.findMany({
      where: {
        churchId,
        userId: { not: subjectUserId },
        OR: [
          { role: "MINISTER", ministryId: { in: ministryIds } },
          { role: "DEPARTMENT_HEAD", departments: { some: { department: { ministryId: { in: ministryIds } } } } },
        ],
      },
      select: { id: true, role: true, user: { select: { name: true, displayName: true } } },
    });
    responsibleRoles.push(...peers);
  }

  const responsibleOptions: BackupOption[] = Array.from(
    new Map(responsibleRoles.map((r) => [r.id, r])).values()
  ).map((r) => ({
    value: `RESPONSIBLE:${r.id}`,
    label: `${r.user.displayName ?? r.user.name} (${r.role === "MINISTER" ? "Ministre" : "Resp. département"})`,
  }));

  return { eligible: true, options: [...starOptions, ...responsibleOptions] };
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
  createdById: string;
  kind?: AbsenceKind;
  startDate?: Date;
  endDate?: Date;
  eventIds?: string[];
  allDepartments?: boolean;
  departmentIds?: string[];
  reason?: string | null;
  backups?: BackupInput[];
  /** Périmètre départemental du déclarant — restreint les départements ciblables (spec 050). */
  declarerScope?: DeclarerScope;
}

/**
 * Déclare une absence (période ou événements précis, tous départements ou une liste), calcule
 * les conflits avec le planning existant, notifie les responsables des départements effectivement
 * couverts (et le STAR en cas de conflit), puis émet l'événement bus.
 *
 * L'autorisation (auto-déclaration ou périmètre resp./ministre) est vérifiée par
 * la route appelante avant d'invoquer ce service.
 */
export async function declareAbsence(params: DeclareAbsenceParams): Promise<Absence> {
  const {
    churchId,
    memberId,
    createdById,
    kind = "PERIOD",
    startDate,
    endDate,
    eventIds = [],
    allDepartments = true,
    departmentIds = [],
    reason,
    backups = [],
    declarerScope = { scoped: false, departmentIds: [] },
  } = params;
  const { prisma } = await import("@/lib/prisma");

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true },
  });
  if (!member) throw new ApiError(404, "Fiche STAR introuvable");

  return prisma.$transaction(async (tx) => {
    const { events } = await validateTargeting(tx, {
      churchId,
      memberId,
      kind,
      eventIds,
      allDepartments,
      departmentIds,
      declarerScope,
    });

    const absence = await tx.absence.create({
      data: {
        churchId,
        memberId,
        kind,
        startDate: kind === "PERIOD" ? startDate! : null,
        endDate: kind === "PERIOD" ? endDate! : null,
        allDepartments,
        reason: reason ?? null,
        createdById,
        ...(allDepartments
          ? {}
          : { targetDepartments: { createMany: { data: departmentIds.map((departmentId) => ({ departmentId })) } } }),
        ...(kind === "EVENTS"
          ? {
              targetEvents: {
                createMany: { data: events.map((e) => ({ eventId: e.eventId, eventTitle: e.title, eventDate: e.date })) },
              },
            }
          : {}),
      },
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

    const targeting: AbsenceTargeting = {
      kind,
      startDate: absence.startDate,
      endDate: absence.endDate,
      eventIds,
      allDepartments,
      departmentIds,
    };

    const conflicts = await findAbsenceConflicts(memberId, churchId, targeting, tx);
    const hasConflict = conflicts.length > 0;
    const responsibleUserIds = await resolveResponsibleUserIds(
      memberId,
      churchId,
      tx,
      allDepartments ? undefined : departmentIds
    );

    const memberName = `${member.firstName} ${member.lastName}`;
    const when = formatWhen(targeting, events);
    const { notifyUsers } = await import("@/lib/notifications");

    await notifyUsers(
      responsibleUserIds,
      {
        domain: "planning",
        type: "ABSENCE_DECLARED",
        title: "Absence déclarée",
        message: `${memberName} a déclaré une absence ${when}.`,
        link: "/absences",
      },
      { tx }
    );

    if (hasConflict) {
      const recipients = new Set(responsibleUserIds);
      const links = await tx.memberUserLink.findMany({ where: { memberId, churchId }, select: { userId: true } });
      for (const l of links) recipients.add(l.userId);

      const plural = conflicts.length > 1;
      await notifyUsers(
        Array.from(recipients),
        {
          domain: "planning",
          type: "ABSENCE_CONFLICT",
          title: "Conflit planning / absence",
          message: `L'absence de ${memberName} (${when}) chevauche ${plural ? "des services" : "un service"} déjà planifié${plural ? "s" : ""}.`,
          link: "/absences",
        },
        { tx }
      );
    }

    if (backups.length > 0) {
      const backupRecipients = new Set(await resolveBackupRecipients(backups.map((b) => ({
        type: b.type,
        memberId: b.type === "STAR" ? b.memberId ?? null : null,
        userChurchRoleId: b.type === "RESPONSIBLE" ? b.userChurchRoleId ?? null : null,
      })), churchId, tx));
      await notifyUsers(
        Array.from(backupRecipients),
        {
          domain: "planning",
          type: "ABSENCE_BACKUP_ASSIGNED",
          title: "Désigné en backup",
          message: `Vous avez été désigné en backup de ${memberName} pour son absence ${when}.`,
          link: "/absences",
        },
        { tx }
      );
    }

    await planningBus.emit(
      "planning:absence:declared",
      { tx, churchId, userId: createdById },
      {
        absenceId: absence.id,
        churchId,
        memberId,
        kind,
        startDate: absence.startDate ? absence.startDate.toISOString() : null,
        endDate: absence.endDate ? absence.endDate.toISOString() : null,
        allDepartments,
        departmentIds,
        eventIds,
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
        targetDepartments: { select: { departmentId: true } },
        targetEvents: { select: { eventId: true, eventTitle: true, eventDate: true } },
      },
    });
    if (!absence) throw new ApiError(404, "Absence introuvable");
    if (absence.churchId !== churchId) throw new ApiError(403, "Absence hors périmètre");
    if (absence.status === "CANCELLED") throw new ApiError(409, "Absence déjà annulée");

    const lastDate = lastEffectiveDate(absence);
    if (lastDate === null || isAbsencePast(lastDate)) {
      throw new ApiError(409, "Absence déjà passée, non annulable");
    }

    const departmentIds = absence.targetDepartments.map((d) => d.departmentId);
    const eventIds = absence.targetEvents.map((e) => e.eventId).filter((id): id is string => id !== null);
    const targeting: AbsenceTargeting = {
      kind: absence.kind,
      startDate: absence.startDate,
      endDate: absence.endDate,
      eventIds,
      allDepartments: absence.allDepartments,
      departmentIds,
    };

    const conflictsBefore = await findAbsenceConflicts(absence.memberId, churchId, targeting, tx);
    const hadConflict = conflictsBefore.length > 0;

    const updated = await tx.absence.update({
      where: { id: absenceId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById },
    });

    const responsibleUserIds = await resolveResponsibleUserIds(
      absence.memberId,
      churchId,
      tx,
      absence.allDepartments ? undefined : departmentIds
    );
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
    const when = formatWhen(
      targeting,
      absence.targetEvents.map((e) => ({ eventId: e.eventId ?? "", title: e.eventTitle, date: e.eventDate }))
    );

    const { notifyUsers } = await import("@/lib/notifications");
    await notifyUsers(
      Array.from(recipients),
      {
        domain: "planning",
        type: "ABSENCE_CANCELLED",
        title: "Absence annulée",
        message: `L'absence de ${memberName} (${when}) a été annulée.`,
        link: "/absences",
      },
      { tx }
    );

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
  kind?: AbsenceKind;
  startDate?: Date;
  endDate?: Date;
  eventIds?: string[];
  allDepartments?: boolean;
  departmentIds?: string[];
  reason?: string | null;
  /** Remplace intégralement les backups si fourni ; laisse inchangé si `undefined`. */
  backups?: BackupInput[];
  /** Périmètre départemental du déclarant — restreint les départements ciblables (spec 050). */
  declarerScope?: DeclarerScope;
}

/**
 * Modifie une absence active tant qu'elle n'est pas passée (dernier jour de la période, ou
 * dernier événement ciblé encore existant), recalcule les conflits sur le nouveau ciblage et
 * notifie l'union des destinataires — anciens et nouveaux responsables concernés, et backups.
 *
 * L'autorisation (créateur, membre lui-même, resp./ministre scopé, ou manager global) est
 * vérifiée par la route appelante avant d'invoquer ce service.
 */
export async function updateAbsence(params: UpdateAbsenceParams): Promise<Absence> {
  const {
    absenceId,
    churchId,
    updatedById,
    kind,
    startDate,
    endDate,
    eventIds,
    allDepartments,
    departmentIds,
    reason,
    backups,
    declarerScope = { scoped: false, departmentIds: [] },
  } = params;
  const { prisma } = await import("@/lib/prisma");

  return prisma.$transaction(async (tx) => {
    const absence = await tx.absence.findUnique({
      where: { id: absenceId },
      include: {
        member: { select: { firstName: true, lastName: true } },
        backups: { select: { type: true, memberId: true, userChurchRoleId: true } },
        targetDepartments: { select: { departmentId: true } },
        targetEvents: { select: { eventId: true, eventTitle: true, eventDate: true } },
      },
    });
    if (!absence) throw new ApiError(404, "Absence introuvable");
    if (absence.churchId !== churchId) throw new ApiError(403, "Absence hors périmètre");
    if (absence.status === "CANCELLED") throw new ApiError(409, "Absence annulée, non modifiable");

    const now = new Date();
    const lastDateBefore = lastEffectiveDate(absence);
    if (lastDateBefore === null || isAbsencePast(lastDateBefore, now)) {
      throw new ApiError(409, "Absence déjà passée, non modifiable");
    }

    const targetingChanged =
      kind !== undefined ||
      startDate !== undefined ||
      endDate !== undefined ||
      eventIds !== undefined ||
      allDepartments !== undefined ||
      departmentIds !== undefined;

    const newKind = kind ?? absence.kind;
    const newStartDate = startDate ?? absence.startDate ?? undefined;
    const newEndDate = endDate ?? absence.endDate ?? undefined;
    const newAllDepartments = allDepartments ?? absence.allDepartments;
    const newDepartmentIds = departmentIds ?? absence.targetDepartments.map((d) => d.departmentId);
    const newEventIds =
      eventIds ?? absence.targetEvents.map((e) => e.eventId).filter((id): id is string => id !== null);

    if (
      newKind === "PERIOD" &&
      startDate &&
      absence.kind === "PERIOD" &&
      absence.startDate &&
      absence.startDate <= now &&
      startDate < absence.startDate
    ) {
      throw new ApiError(400, "La date de début d'une absence déjà commencée ne peut pas être reculée");
    }

    const priorDepartmentIds = absence.targetDepartments.map((d) => d.departmentId);
    const priorEventIds = absence.targetEvents.map((e) => e.eventId).filter((id): id is string => id !== null);
    const targetingBefore: AbsenceTargeting = {
      kind: absence.kind,
      startDate: absence.startDate,
      endDate: absence.endDate,
      eventIds: priorEventIds,
      allDepartments: absence.allDepartments,
      departmentIds: priorDepartmentIds,
    };
    const conflictsBefore = await findAbsenceConflicts(absence.memberId, churchId, targetingBefore, tx);
    const hadConflictBefore = conflictsBefore.length > 0;

    let newEventSnapshots: TargetEventSnapshot[] = absence.targetEvents.map((e) => ({
      eventId: e.eventId ?? "",
      title: e.eventTitle,
      date: e.eventDate,
    }));

    if (targetingChanged) {
      const validated = await validateTargeting(tx, {
        churchId,
        memberId: absence.memberId,
        kind: newKind,
        eventIds: newEventIds,
        allDepartments: newAllDepartments,
        departmentIds: newDepartmentIds,
        declarerScope,
      });
      newEventSnapshots = validated.events;

      await tx.absenceDepartment.deleteMany({ where: { absenceId } });
      if (!newAllDepartments) {
        await tx.absenceDepartment.createMany({
          data: newDepartmentIds.map((departmentId) => ({ absenceId, departmentId })),
        });
      }

      await tx.absenceEvent.deleteMany({ where: { absenceId } });
      if (newKind === "EVENTS") {
        await tx.absenceEvent.createMany({
          data: newEventSnapshots.map((e) => ({ absenceId, eventId: e.eventId, eventTitle: e.title, eventDate: e.date })),
        });
      }
    }

    const updated = await tx.absence.update({
      where: { id: absenceId },
      data: {
        kind: newKind,
        startDate: newKind === "PERIOD" ? (newStartDate ?? null) : null,
        endDate: newKind === "PERIOD" ? (newEndDate ?? null) : null,
        allDepartments: newAllDepartments,
        ...(reason !== undefined ? { reason: reason ?? null } : {}),
      },
    });

    const targetingAfter: AbsenceTargeting = {
      kind: newKind,
      startDate: updated.startDate,
      endDate: updated.endDate,
      eventIds: newEventIds,
      allDepartments: newAllDepartments,
      departmentIds: newDepartmentIds,
    };
    const conflictsAfter = await findAbsenceConflicts(absence.memberId, churchId, targetingAfter, tx);
    const hasConflictAfter = conflictsAfter.length > 0;

    const responsibleUserIdsBefore = await resolveResponsibleUserIds(
      absence.memberId,
      churchId,
      tx,
      absence.allDepartments ? undefined : priorDepartmentIds
    );
    const responsibleUserIdsAfter = await resolveResponsibleUserIds(
      absence.memberId,
      churchId,
      tx,
      newAllDepartments ? undefined : newDepartmentIds
    );
    const responsibleUserIds = Array.from(new Set([...responsibleUserIdsBefore, ...responsibleUserIdsAfter]));

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
    const when = formatWhen(targetingAfter, newEventSnapshots);

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

    const { notifyUsers } = await import("@/lib/notifications");
    await notifyUsers(
      Array.from(updateRecipients),
      {
        domain: "planning",
        type: "ABSENCE_UPDATED",
        title: "Absence modifiée",
        message: `L'absence de ${memberName} a été modifiée (${when}).`,
        link: "/absences",
      },
      { tx }
    );

    if (hasConflictAfter && !hadConflictBefore) {
      const plural = conflictsAfter.length > 1;
      const conflictRecipients = new Set([...responsibleUserIdsAfter, ...memberLinkedUserIds]);
      await notifyUsers(
        Array.from(conflictRecipients),
        {
          domain: "planning",
          type: "ABSENCE_CONFLICT",
          title: "Conflit planning / absence",
          message: `L'absence de ${memberName} (${when}) chevauche ${plural ? "des services" : "un service"} déjà planifié${plural ? "s" : ""}.`,
          link: "/absences",
        },
        { tx }
      );
    }

    await planningBus.emit(
      "planning:absence:updated",
      { tx, churchId, userId: updatedById },
      {
        absenceId,
        churchId,
        memberId: absence.memberId,
        updatedById,
        kind: newKind,
        startDate: updated.startDate ? updated.startDate.toISOString() : null,
        endDate: updated.endDate ? updated.endDate.toISOString() : null,
        allDepartments: newAllDepartments,
        departmentIds: newDepartmentIds,
        eventIds: newEventIds,
        hasConflict: hasConflictAfter,
      }
    );

    return updated;
  });
}
