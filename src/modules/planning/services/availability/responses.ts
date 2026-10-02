import type { AvailabilityAnswer } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { absenceCovers } from "../absence-targeting";
import { resolveResponsibleUserIds } from "../absence.service";
import { defaultDb } from "./db";
import { monthStart, nextMonthStart, resolveAvailability, type AvailabilityState } from "./state";

/**
 * Réponses de disponibilité d'un STAR (spec 058) : lecture de son écran « Mes disponibilités »
 * et écriture, par lui ou par un responsable à sa place.
 */

export interface MemberAvailabilityDept {
  departmentId: string;
  name: string;
  state: AvailabilityState;
  overdue: boolean;
  source: "response" | "period" | "asked" | "none";
  answer: AvailabilityAnswer | null;
  /** Réponse saisie par quelqu'un d'autre que le STAR lui-même. */
  enteredByThirdParty: boolean;
}

export interface MemberAvailabilityEvent {
  id: string;
  title: string;
  date: Date;
  dueAt: Date | null;
  departments: MemberAvailabilityDept[];
}

export interface MemberAvailabilityMonth {
  month: Date;
  open: boolean;
  closesAt: Date | null;
}

export interface MemberAvailability {
  months: MemberAvailabilityMonth[];
  events: MemberAvailabilityEvent[];
}

/**
 * Mois proposés (collectes ouvertes + mois en cours) et événements du mois demandé où au moins un
 * département du STAR sert, avec l'état de disponibilité par département.
 */
export async function listMemberAvailability(
  memberId: string,
  churchId: string,
  month: Date,
  now: Date = new Date()
): Promise<MemberAvailability> {
  const db = await defaultDb();
  const from = monthStart(month);
  const to = nextMonthStart(from);

  const [memberDepts, link, collections] = await Promise.all([
    db.memberDepartment.findMany({ where: { memberId }, select: { departmentId: true } }),
    db.memberUserLink.findFirst({ where: { memberId, churchId }, select: { userId: true } }),
    db.availabilityCollection.findMany({
      where: { churchId, month: { gte: monthStart(now) } },
      select: { month: true, closesAt: true },
      orderBy: { month: "asc" },
    }),
  ]);
  const deptIds = memberDepts.map((d) => d.departmentId);

  const currentMonth = monthStart(now);
  const months: MemberAvailabilityMonth[] = collections.map((c) => ({ month: c.month, open: true, closesAt: c.closesAt }));
  if (!months.some((m) => m.month.getTime() === currentMonth.getTime())) {
    months.unshift({ month: currentMonth, open: false, closesAt: null });
  }

  if (deptIds.length === 0) return { months, events: [] };

  const events = await db.event.findMany({
    where: {
      churchId,
      isRecurrenceParent: false,
      date: { gte: from > now ? from : now, lt: to },
      eventDepts: { some: { departmentId: { in: deptIds } } },
    },
    select: {
      id: true,
      title: true,
      date: true,
      eventDepts: {
        where: { departmentId: { in: deptIds } },
        select: { departmentId: true, department: { select: { name: true } } },
      },
    },
    orderBy: { date: "asc" },
  });
  const eventIds = events.map((e) => e.id);

  const [responses, asks, collection, periods] = await Promise.all([
    db.availabilityResponse.findMany({
      where: { memberId, eventId: { in: eventIds } },
      select: { eventId: true, departmentId: true, answer: true, enteredById: true },
    }),
    db.availabilityAsk.findMany({
      where: { eventId: { in: eventIds }, departmentId: { in: deptIds } },
      select: { eventId: true, departmentId: true, dueAt: true },
    }),
    db.availabilityCollection.findUnique({
      where: { churchId_month: { churchId, month: from } },
      select: { closesAt: true },
    }),
    db.absence.findMany({
      where: { memberId, churchId, status: "ACTIVE", kind: "PERIOD", startDate: { lt: to }, endDate: { gte: from } },
      select: {
        kind: true,
        startDate: true,
        endDate: true,
        allDepartments: true,
        targetDepartments: { select: { departmentId: true } },
      },
    }),
  ]);

  const responseKey = (e: string, d: string) => `${e}:${d}`;
  const responseByKey = new Map(responses.map((r) => [responseKey(r.eventId, r.departmentId), r]));
  const askByKey = new Map(asks.map((a) => [responseKey(a.eventId, a.departmentId), a]));

  return {
    months,
    events: events.map((e) => {
      let dueAt: Date | null = null;
      const departments = e.eventDepts.map((ed) => {
        const response = responseByKey.get(responseKey(e.id, ed.departmentId));
        const ask = askByKey.get(responseKey(e.id, ed.departmentId));
        const askedDue = ask?.dueAt ?? collection?.closesAt ?? null;
        const resolved = resolveAvailability({
          answer: response?.answer,
          coveredByPeriod: periods.some((p) =>
            absenceCovers({ ...p, targetEvents: [] }, { eventDate: e.date, departmentId: ed.departmentId })
          ),
          asked: !!ask || !!collection,
          dueAt: askedDue,
          now,
        });
        if (askedDue && (!dueAt || askedDue < dueAt)) dueAt = askedDue;
        return {
          departmentId: ed.departmentId,
          name: ed.department.name,
          state: resolved.state,
          overdue: resolved.overdue,
          source: resolved.source,
          answer: response?.answer ?? null,
          enteredByThirdParty: !!response?.enteredById && response.enteredById !== link?.userId,
        };
      });
      return { id: e.id, title: e.title, date: e.date, dueAt, departments };
    }),
  };
}

export interface AnswerInput {
  eventId: string;
  answer: AvailabilityAnswer;
  /** Restreint la réponse à certains départements ; absent = tous ceux du STAR qui servent l'événement. */
  departmentIds?: string[];
}

const PLANNED_STATUSES = ["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"] as const;

/**
 * Enregistre les réponses d'un STAR. « Tous mes départements » est déplié ici sur les
 * départements du STAR qui servent l'événement. Quand un STAR déjà planifié passe « Pas
 * disponible », le responsable de son département est prévenu (après validation).
 */
export async function saveResponses({
  memberId,
  churchId,
  answers,
  actorId,
  now = new Date(),
}: {
  memberId: string;
  churchId: string;
  answers: AnswerInput[];
  actorId: string;
  now?: Date;
}): Promise<{ updated: number; alerts: number }> {
  const db = await defaultDb();
  const { prisma } = await import("@/lib/prisma");

  const planned: { eventId: string; eventTitle: string; departmentId: string }[] = [];
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    const memberDepts = await tx.memberDepartment.findMany({ where: { memberId }, select: { departmentId: true } });
    const memberDeptIds = new Set(memberDepts.map((d) => d.departmentId));

    const events = await tx.event.findMany({
      where: { id: { in: answers.map((a) => a.eventId) }, churchId },
      select: { id: true, title: true, date: true, eventDepts: { select: { departmentId: true } } },
    });
    const eventById = new Map(events.map((e) => [e.id, e]));

    for (const a of answers) {
      const event = eventById.get(a.eventId);
      if (!event) throw new ApiError(400, "Événement introuvable dans cette église");
      if (event.date.getTime() < now.getTime()) throw new ApiError(400, "Cet événement est déjà passé");

      const serving = event.eventDepts.map((d) => d.departmentId).filter((id) => memberDeptIds.has(id));
      if (serving.length === 0) throw new ApiError(400, "Aucun de vos départements ne sert cet événement");

      const targets = a.departmentIds ?? serving;
      if (targets.length === 0 || targets.some((id) => !serving.includes(id))) {
        throw new ApiError(400, "Département invalide pour cet événement");
      }

      for (const departmentId of targets) {
        await tx.availabilityResponse.upsert({
          where: { memberId_eventId_departmentId: { memberId, eventId: event.id, departmentId } },
          create: { churchId, memberId, eventId: event.id, departmentId, answer: a.answer, enteredById: actorId },
          update: { answer: a.answer, enteredById: actorId },
        });
        updated++;
      }

      if (a.answer === "UNAVAILABLE") {
        const rows = await tx.planning.findMany({
          where: {
            memberId,
            status: { in: [...PLANNED_STATUSES] },
            eventDepartment: { eventId: event.id, departmentId: { in: targets } },
          },
          select: { eventDepartment: { select: { departmentId: true } } },
        });
        for (const r of rows) {
          planned.push({ eventId: event.id, eventTitle: event.title, departmentId: r.eventDepartment.departmentId });
        }
      }
    }
  });

  if (planned.length > 0) await notifyPlannedUnavailable(db, memberId, churchId, planned);
  return { updated, alerts: planned.length };
}

async function notifyPlannedUnavailable(
  db: Awaited<ReturnType<typeof defaultDb>>,
  memberId: string,
  churchId: string,
  planned: { eventId: string; eventTitle: string; departmentId: string }[]
): Promise<void> {
  const member = await db.member.findUnique({ where: { id: memberId }, select: { firstName: true, lastName: true } });
  if (!member) return;
  const { notifyUsers } = await import("@/lib/notifications");

  for (const p of planned) {
    const userIds = await resolveResponsibleUserIds(memberId, churchId, db, [p.departmentId]);
    await notifyUsers(userIds, {
      domain: "planning",
      type: "AVAILABILITY_PLANNED_UNAVAILABLE",
      title: "STAR planifié devenu indisponible",
      message: `${member.firstName} ${member.lastName} est planifié(e) sur « ${p.eventTitle} » mais a répondu « Pas disponible ».`,
      link: "/dashboard",
      entityType: "Event",
      entityId: p.eventId,
    });
  }
}
