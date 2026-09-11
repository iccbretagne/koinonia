import type { PrismaClient } from "@/generated/prisma/client";
import { generateRecurrenceDates } from "./recurrence";

/**
 * Contrairement aux autres services du module (`db?: Prisma.TransactionClient`), ce service
 * type son client sur `PrismaClient` complet : `createTeamEvent` a besoin de `$transaction`
 * pour créer une série atomiquement, et aucun appelant n'a besoin d'y injecter une transaction
 * déjà ouverte (ni `request-executor`, ni le bus planning).
 */
type DbClient = PrismaClient;

async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export type RecurrenceRule = "weekly" | "biweekly" | "monthly";
export type TeamEventUpdateScope = "occurrence" | "following";

export interface TeamEventDTO {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  description: string | null;
  recurrenceRule: string | null;
  seriesId: string | null;
  department: { id: string; name: string };
}

const DEPARTMENT_SELECT = { select: { id: true, name: true } } as const;

export interface TeamEventScopeInfo {
  id: string;
  churchId: string;
  departmentId: string;
  startsAt: Date;
  seriesId: string | null;
}

/** Liste les événements d'équipe d'un département, à venir (asc) ou passés (desc). */
export async function listDepartmentTeamEvents(
  departmentId: string,
  period: "upcoming" | "past" = "upcoming",
  db?: DbClient
): Promise<TeamEventDTO[]> {
  const client = db ?? (await defaultDb());
  const now = new Date();

  return client.teamEvent.findMany({
    where:
      period === "upcoming"
        ? { departmentId, startsAt: { gte: now } }
        : { departmentId, startsAt: { lt: now } },
    include: { department: DEPARTMENT_SELECT },
    orderBy: { startsAt: period === "upcoming" ? "asc" : "desc" },
  });
}

/** Église, département et série d'un événement d'équipe — utilisé par les gardes de périmètre. */
export async function getTeamEventScopeInfo(
  id: string,
  db?: DbClient
): Promise<TeamEventScopeInfo | null> {
  const client = db ?? (await defaultDb());
  return client.teamEvent.findUnique({
    where: { id },
    select: { id: true, churchId: true, departmentId: true, startsAt: true, seriesId: true },
  });
}

export interface CreateTeamEventInput {
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  description?: string | null;
  recurrence?: { rule: RecurrenceRule; until: Date } | null;
}

export interface CreateTeamEventResult {
  created: number;
  truncated: boolean;
}

/**
 * Crée un événement d'équipe, éventuellement récurrent. Toutes les occurrences d'une série
 * (la première comprise) partagent `seriesId = <id de la première>`, fixé par une mise à jour
 * juste après sa création — son id n'est connu qu'une fois insérée.
 */
export async function createTeamEvent(
  params: { churchId: string; departmentId: string; userId: string; input: CreateTeamEventInput },
  db?: DbClient
): Promise<CreateTeamEventResult> {
  const client = db ?? (await defaultDb());
  const { churchId, departmentId, userId, input } = params;
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();

  const baseData = {
    churchId,
    departmentId,
    title: input.title,
    location: input.location ?? null,
    description: input.description ?? null,
    createdById: userId,
  };

  if (!input.recurrence) {
    await client.teamEvent.create({
      data: { ...baseData, startsAt: input.startsAt, endsAt: input.endsAt },
    });
    return { created: 1, truncated: false };
  }

  const { rule, until } = input.recurrence;
  const { dates, truncated } = generateRecurrenceDates(input.startsAt, rule, until);

  const created = await client.$transaction(async (tx) => {
    const first = await tx.teamEvent.create({
      data: {
        ...baseData,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        recurrenceRule: rule,
      },
    });
    await tx.teamEvent.update({ where: { id: first.id }, data: { seriesId: first.id } });

    if (dates.length > 0) {
      await tx.teamEvent.createMany({
        data: dates.map((occurrenceStart) => ({
          ...baseData,
          startsAt: occurrenceStart,
          endsAt: new Date(occurrenceStart.getTime() + durationMs),
          recurrenceRule: rule,
          seriesId: first.id,
        })),
      });
    }

    return 1 + dates.length;
  });

  return { created, truncated };
}

export interface TeamEventWriteInput {
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  description?: string | null;
}

/**
 * `following` déplace chaque occurrence de la série (à partir de la courante, passé exclu par
 * construction puisqu'on part de `courante.startsAt`) sur la nouvelle heure/durée soumise, en
 * gardant le jour de chacune — même principe que `PUT /api/events/[eventId]` (`applyToSeries`).
 * Sans série (`seriesId` nul), `following` retombe sur `occurrence`.
 */
export async function updateTeamEvent(
  id: string,
  input: TeamEventWriteInput,
  scope: TeamEventUpdateScope,
  db?: DbClient
): Promise<{ updated: number }> {
  const client = db ?? (await defaultDb());
  const writeData = {
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: input.location ?? null,
    description: input.description ?? null,
  };

  if (scope === "occurrence") {
    await client.teamEvent.update({ where: { id }, data: writeData });
    return { updated: 1 };
  }

  const current = await client.teamEvent.findUnique({
    where: { id },
    select: { seriesId: true, startsAt: true },
  });
  if (!current) throw new Error("TeamEvent not found");

  if (!current.seriesId) {
    await client.teamEvent.update({ where: { id }, data: writeData });
    return { updated: 1 };
  }

  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();
  const newHours = input.startsAt.getHours();
  const newMinutes = input.startsAt.getMinutes();

  const occurrences = await client.teamEvent.findMany({
    where: { seriesId: current.seriesId, startsAt: { gte: current.startsAt } },
    select: { id: true, startsAt: true },
  });

  await client.$transaction(
    occurrences.map((occ) => {
      const newStart = new Date(occ.startsAt);
      newStart.setHours(newHours, newMinutes, 0, 0);
      return client.teamEvent.update({
        where: { id: occ.id },
        data: { ...writeData, startsAt: newStart, endsAt: new Date(newStart.getTime() + durationMs) },
      });
    })
  );

  return { updated: occurrences.length };
}

/** `following` supprime la courante et toutes les occurrences à venir de sa série ; le passé n'est jamais touché. */
export async function deleteTeamEvent(
  id: string,
  scope: TeamEventUpdateScope,
  db?: DbClient
): Promise<{ deleted: number }> {
  const client = db ?? (await defaultDb());

  if (scope === "occurrence") {
    await client.teamEvent.delete({ where: { id } });
    return { deleted: 1 };
  }

  const current = await client.teamEvent.findUnique({
    where: { id },
    select: { seriesId: true, startsAt: true },
  });
  if (!current) throw new Error("TeamEvent not found");

  if (!current.seriesId) {
    await client.teamEvent.delete({ where: { id } });
    return { deleted: 1 };
  }

  const result = await client.teamEvent.deleteMany({
    where: { seriesId: current.seriesId, startsAt: { gte: current.startsAt } },
  });
  return { deleted: result.count };
}

/**
 * Seul point d'entrée du périmètre d'**appartenance** (ADR-0013, distinct du périmètre de
 * responsabilité d'ADR-0009) : filtre par appartenance au département (`member_departments`),
 * jamais par rôle. Calculé à chaque lecture — un retrait de département est donc effectif
 * immédiatement, sans invalidation à gérer.
 */
export async function listTeamEventsForMember(
  churchId: string,
  memberId: string,
  db?: DbClient
): Promise<TeamEventDTO[]> {
  const client = db ?? (await defaultDb());
  return client.teamEvent.findMany({
    where: { churchId, department: { memberDepts: { some: { memberId } } } },
    include: { department: DEPARTMENT_SELECT },
    orderBy: { startsAt: "asc" },
  });
}
