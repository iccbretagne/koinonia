import type { Prisma, AbsenceKind } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";

type DbClient = Prisma.TransactionClient;

/**
 * Import différé du singleton Prisma — évite d'instancier un vrai client (driver adapter
 * MariaDB) au simple chargement du module `planning`, ce qui casserait les tests import ant
 * `@/modules/planning` sans mocker `@/lib/prisma` (même pattern que `absence.service.ts`).
 */
async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/**
 * Périmètre départemental d'un déclarant pour l'absence ciblée (spec 050) : reflète
 * `getUserDepartmentScope` — `{ scoped: false }` pour un rôle non restreint (Admin, Secrétaire…),
 * `{ scoped: true, departmentIds }` pour un Resp. département/Ministre.
 */
export interface DeclarerScope {
  scoped: boolean;
  departmentIds: string[];
}

export interface AbsenceCoverageShape {
  kind: AbsenceKind;
  startDate: Date | null;
  endDate: Date | null;
  allDepartments: boolean;
  targetDepartments: { departmentId: string }[];
  targetEvents: { eventId: string | null }[];
}

/**
 * Prédicat pur : l'absence couvre-t-elle ce couple (département, événement) ? Utilisé pour les
 * tests et l'enrichissement en mémoire — la forme filtre Prisma équivalente est
 * `absenceCoverageWhere`.
 *
 * `departmentId` omis = on ne teste que l'axe « quand » (utile pour l'ouverture/fermeture, qui
 * n'appartient à aucun département).
 */
export function absenceCovers(
  absence: AbsenceCoverageShape,
  target: { eventId?: string; eventDate: Date; departmentId?: string }
): boolean {
  const whenMatch =
    absence.kind === "EVENTS"
      ? target.eventId !== undefined && absence.targetEvents.some((e) => e.eventId === target.eventId)
      : absence.startDate !== null &&
        absence.endDate !== null &&
        absence.startDate <= target.eventDate &&
        absence.endDate >= target.eventDate;

  if (!whenMatch) return false;
  if (target.departmentId === undefined) return true;

  return absence.allDepartments || absence.targetDepartments.some((d) => d.departmentId === target.departmentId);
}

/**
 * Fragment `AbsenceWhereInput` équivalent à `absenceCovers`, pour filtrer côté base.
 * `departmentId` omis = pas de contrainte sur le ciblage départemental (axe « quand » seul).
 */
export function absenceCoverageWhere({
  eventId,
  eventDate,
  departmentId,
}: {
  eventId?: string;
  eventDate: Date;
  departmentId?: string;
}): Prisma.AbsenceWhereInput {
  const whenClause: Prisma.AbsenceWhereInput = eventId
    ? {
        OR: [
          { kind: "PERIOD", startDate: { lte: eventDate }, endDate: { gte: eventDate } },
          { kind: "EVENTS", targetEvents: { some: { eventId } } },
        ],
      }
    : { kind: "PERIOD", startDate: { lte: eventDate }, endDate: { gte: eventDate } };

  if (departmentId === undefined) return whenClause;

  return {
    AND: [whenClause, { OR: [{ allDepartments: true }, { targetDepartments: { some: { departmentId } } }] }],
  };
}

/**
 * Départements réellement couverts par l'absence, croisés avec l'appartenance courante du
 * membre : « tous départements » suit l'appartenance (y compris un département rejoint après
 * coup) ; un ciblage explicite ne s'étend jamais à un département non coché, et s'arrête de
 * s'appliquer si le membre quitte ce département (spec 050, aucune écriture nécessaire).
 */
export function effectiveDepartmentIds(
  absence: { allDepartments: boolean; targetDepartments: { departmentId: string }[] },
  memberDepartmentIds: string[]
): string[] {
  if (absence.allDepartments) return memberDepartmentIds;
  const targeted = new Set(absence.targetDepartments.map((d) => d.departmentId));
  return memberDepartmentIds.filter((id) => targeted.has(id));
}

/**
 * Dernière date à laquelle l'absence produit encore un effet — `endDate` pour une période, la
 * plus tardive des événements ciblés encore existants sinon. `null` si tous les événements
 * ciblés ont été supprimés (la déclaration reste dans l'historique, sans effet ni possibilité de
 * modification/annulation — cf. « événement supprimé »).
 */
export function lastEffectiveDate(absence: {
  kind: AbsenceKind;
  endDate: Date | null;
  targetEvents: { eventId: string | null; eventDate: Date }[];
}): Date | null {
  if (absence.kind === "PERIOD") return absence.endDate;
  const live = absence.targetEvents.filter((e) => e.eventId !== null);
  if (live.length === 0) return null;
  return live.reduce((max, e) => (e.eventDate > max ? e.eventDate : max), live[0].eventDate);
}

export interface TargetEventSnapshot {
  eventId: string;
  title: string;
  date: Date;
}

interface ValidateTargetingParams {
  churchId: string;
  memberId: string;
  kind: AbsenceKind;
  eventIds: string[];
  allDepartments: boolean;
  departmentIds: string[];
  declarerScope: DeclarerScope;
}

/**
 * Valide le ciblage d'une déclaration/modification d'absence : départements dans le périmètre du
 * STAR (et du déclarant s'il est restreint), événements de la même église, à venir, et attendant
 * au moins un des départements visés. Renvoie l'instantané (titre, date) des événements à
 * persister sur `AbsenceEvent`.
 */
export async function validateTargeting(
  db: DbClient,
  params: ValidateTargetingParams
): Promise<{ events: TargetEventSnapshot[] }> {
  const { churchId, memberId, kind, eventIds, allDepartments, departmentIds, declarerScope } = params;

  const memberDepartmentIds = (
    await db.memberDepartment.findMany({ where: { memberId }, select: { departmentId: true } })
  ).map((d) => d.departmentId);

  if (!allDepartments) {
    if (departmentIds.length === 0) {
      throw new ApiError(400, "Au moins un département doit être ciblé");
    }
    const notOwned = departmentIds.filter((id) => !memberDepartmentIds.includes(id));
    if (notOwned.length > 0) {
      throw new ApiError(400, "Un département ciblé n'appartient pas à ce STAR");
    }
    if (declarerScope.scoped) {
      const outOfScope = departmentIds.some((id) => !declarerScope.departmentIds.includes(id));
      if (outOfScope) throw new ApiError(403, "Un département ciblé est hors de votre périmètre");
    }
  }

  if (kind !== "EVENTS") return { events: [] };

  if (eventIds.length === 0) {
    throw new ApiError(400, "Au moins un événement doit être ciblé");
  }

  const events = await db.event.findMany({
    where: { id: { in: eventIds }, churchId, isRecurrenceParent: false },
    select: { id: true, title: true, date: true, eventDepts: { select: { departmentId: true } } },
  });
  if (events.length !== eventIds.length) {
    throw new ApiError(400, "Un événement ciblé est invalide ou hors périmètre");
  }

  const effectiveIds = allDepartments ? memberDepartmentIds : departmentIds;
  const now = new Date();
  for (const event of events) {
    if (event.date < now) {
      throw new ApiError(400, `L'événement « ${event.title} » est déjà passé`);
    }
    const attended = new Set(event.eventDepts.map((d) => d.departmentId));
    if (!effectiveIds.some((id) => attended.has(id))) {
      throw new ApiError(400, `Aucun département visé n'est attendu sur « ${event.title} »`);
    }
  }

  return { events: events.map((e) => ({ eventId: e.id, title: e.title, date: e.date })) };
}

export interface TargetOptionDepartment {
  id: string;
  name: string;
  selectable: boolean;
}

export interface TargetOptionEvent {
  id: string;
  title: string;
  date: Date;
  departmentIds: string[];
}

/**
 * Alimente le formulaire de déclaration : départements du STAR (avec `selectable` selon le
 * périmètre du déclarant), et événements à venir où au moins un de ces départements est attendu.
 */
export async function listTargetOptions(
  db: DbClient | undefined,
  churchId: string,
  memberId: string,
  declarerScope: DeclarerScope,
  range: { from?: Date; to?: Date } = {}
): Promise<{ departments: TargetOptionDepartment[]; events: TargetOptionEvent[] }> {
  db ??= await defaultDb();
  const memberDepts = await db.memberDepartment.findMany({
    where: { memberId },
    select: { department: { select: { id: true, name: true } } },
  });
  const departments: TargetOptionDepartment[] = memberDepts.map((d) => ({
    id: d.department.id,
    name: d.department.name,
    selectable: !declarerScope.scoped || declarerScope.departmentIds.includes(d.department.id),
  }));
  const departmentIds = departments.map((d) => d.id);

  if (departmentIds.length === 0) return { departments, events: [] };

  const from = range.from ?? new Date();
  const to = range.to ?? new Date(from.getTime() + 1000 * 60 * 60 * 24 * 30 * 6);

  const events = await db.event.findMany({
    where: {
      churchId,
      isRecurrenceParent: false,
      date: { gte: from, lte: to },
      eventDepts: { some: { departmentId: { in: departmentIds } } },
    },
    select: { id: true, title: true, date: true, eventDepts: { select: { departmentId: true } } },
    orderBy: { date: "asc" },
  });

  return {
    departments,
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      departmentIds: e.eventDepts.map((d) => d.departmentId).filter((id) => departmentIds.includes(id)),
    })),
  };
}

/**
 * Filtre de visibilité (spec 050) : un Resp. département/Ministre au périmètre restreint voit
 * une absence « tous départements » d'un membre de son périmètre, ou une absence ciblée touchant
 * au moins un de ses départements — jamais une absence ciblée uniquement hors de son périmètre.
 */
export function absenceVisibilityWhere(departmentIds: string[]): Prisma.AbsenceWhereInput {
  return {
    OR: [
      { allDepartments: true, member: { departments: { some: { departmentId: { in: departmentIds } } } } },
      { allDepartments: false, targetDepartments: { some: { departmentId: { in: departmentIds } } } },
    ],
  };
}

/**
 * Filtre « ministère/département » de la liste des absences (spec 050) : respecte le ciblage —
 * filtrer sur un département ne remonte pas une absence ciblée sur un autre département.
 */
export function absenceDepartmentFilterWhere(filter: {
  departmentId?: string | null;
  ministryId?: string | null;
}): Prisma.AbsenceWhereInput | null {
  if (!filter.departmentId && !filter.ministryId) return null;

  const memberMatch: Prisma.AbsenceWhereInput = {
    member: {
      departments: {
        some: {
          department: {
            ...(filter.departmentId ? { id: filter.departmentId } : {}),
            ...(filter.ministryId ? { ministryId: filter.ministryId } : {}),
          },
        },
      },
    },
  };

  const targetMatch: Prisma.AbsenceWhereInput = {
    allDepartments: false,
    targetDepartments: {
      some: {
        department: {
          ...(filter.departmentId ? { id: filter.departmentId } : {}),
          ...(filter.ministryId ? { ministryId: filter.ministryId } : {}),
        },
      },
    },
  };

  return { OR: [{ allDepartments: true, ...memberMatch }, targetMatch] };
}

export interface ActivePlanningAbsence {
  id: string;
  kind: AbsenceKind;
  startDate: Date | null;
  endDate: Date | null;
  eventCount: number;
}

/**
 * Absences actives couvrant ce couple (événement, département), par membre — alimente le badge
 * de la grille de planning. Une seule absence par membre est retenue si plusieurs se
 * chevauchent (spec 050 : le badge s'affiche une seule fois).
 */
export async function findActiveAbsencesForPlanning(
  db: DbClient,
  churchId: string,
  memberIds: string[],
  target: { eventId: string; eventDate: Date; departmentId: string }
): Promise<Map<string, ActivePlanningAbsence>> {
  if (memberIds.length === 0) return new Map();

  const absences = await db.absence.findMany({
    where: {
      churchId,
      status: "ACTIVE",
      memberId: { in: memberIds },
      ...absenceCoverageWhere(target),
    },
    select: {
      id: true,
      memberId: true,
      kind: true,
      startDate: true,
      endDate: true,
      targetEvents: { select: { eventId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byMember = new Map<string, ActivePlanningAbsence>();
  for (const a of absences) {
    if (byMember.has(a.memberId)) continue;
    byMember.set(a.memberId, {
      id: a.id,
      kind: a.kind,
      startDate: a.startDate,
      endDate: a.endDate,
      eventCount: a.targetEvents.length,
    });
  }
  return byMember;
}
