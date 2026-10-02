import type { AvailabilityAnswer } from "@/generated/prisma/client";
import { findActiveAbsencesForPlanning } from "../absence-targeting";
import { defaultDb, type DbClient } from "./db";
import { countsAsUnavailable, monthStart, resolveAvailability, type AvailabilityState } from "./state";

/**
 * Disponibilités affichées dans la grille de planning d'un événement et d'un département
 * (spec 058) : état par STAR, « déjà de service ailleurs » et compteurs.
 */

export interface GridMemberAvailability {
  state: AvailabilityState;
  overdue: boolean;
  source: "response" | "period" | "asked" | "none";
  answer: AvailabilityAnswer | null;
  enteredByThirdParty: boolean;
  /** Départements où le STAR est déjà planifié en service le même jour. */
  busyElsewhere: string[];
}

export interface GridAvailabilityCounts {
  available: number;
  ifNeeded: number;
  noResponse: number;
  unavailable: number;
}

export interface GridAvailability {
  members: Map<string, GridMemberAvailability>;
  counts: GridAvailabilityCounts;
  /** La disponibilité a été demandée pour cet événement et ce département. */
  asked: boolean;
  dueAt: Date | null;
}

const IN_SERVICE = ["EN_SERVICE", "EN_SERVICE_DEBRIEF"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getPlanningAvailability(
  churchId: string,
  event: { id: string; date: Date },
  departmentId: string,
  memberIds: string[],
  db?: DbClient,
  now: Date = new Date()
): Promise<GridAvailability> {
  db ??= await defaultDb();

  const dayStart = new Date(Date.UTC(event.date.getUTCFullYear(), event.date.getUTCMonth(), event.date.getUTCDate()));

  const [responses, ask, collection, periods, links, busy] = await Promise.all([
    db.availabilityResponse.findMany({
      where: { eventId: event.id, departmentId, memberId: { in: memberIds } },
      select: { memberId: true, answer: true, enteredById: true },
    }),
    db.availabilityAsk.findUnique({
      where: { eventId_departmentId: { eventId: event.id, departmentId } },
      select: { dueAt: true },
    }),
    db.availabilityCollection.findUnique({
      where: { churchId_month: { churchId, month: monthStart(event.date) } },
      select: { closesAt: true },
    }),
    findActiveAbsencesForPlanning(db, churchId, memberIds, { eventId: event.id, eventDate: event.date, departmentId }),
    db.memberUserLink.findMany({ where: { churchId, memberId: { in: memberIds } }, select: { memberId: true, userId: true } }),
    db.planning.findMany({
      where: {
        memberId: { in: memberIds },
        status: { in: [...IN_SERVICE] },
        eventDepartment: {
          departmentId: { not: departmentId },
          event: { churchId, date: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) } },
        },
      },
      select: { memberId: true, eventDepartment: { select: { department: { select: { name: true } } } } },
    }),
  ]);

  const responseByMember = new Map(responses.map((r) => [r.memberId, r]));
  const userByMember = new Map(links.map((l) => [l.memberId, l.userId]));
  const busyByMember = new Map<string, string[]>();
  for (const b of busy) {
    const list = busyByMember.get(b.memberId) ?? [];
    list.push(b.eventDepartment.department.name);
    busyByMember.set(b.memberId, list);
  }

  const asked = !!ask || !!collection;
  const dueAt = ask?.dueAt ?? collection?.closesAt ?? null;
  const counts: GridAvailabilityCounts = { available: 0, ifNeeded: 0, noResponse: 0, unavailable: 0 };
  const members = new Map<string, GridMemberAvailability>();

  for (const memberId of memberIds) {
    const response = responseByMember.get(memberId);
    const resolved = resolveAvailability({
      answer: response?.answer,
      coveredByPeriod: periods.has(memberId),
      asked,
      dueAt,
      now,
    });
    if (resolved.state === "AVAILABLE") counts.available++;
    else if (resolved.state === "IF_NEEDED") counts.ifNeeded++;
    else if (resolved.state === "NO_RESPONSE") counts.noResponse++;
    if (countsAsUnavailable(resolved) && resolved.state !== "NO_RESPONSE") counts.unavailable++;
    members.set(memberId, {
      ...resolved,
      answer: response?.answer ?? null,
      enteredByThirdParty: !!response?.enteredById && response.enteredById !== userByMember.get(memberId),
      busyElsewhere: busyByMember.get(memberId) ?? [],
    });
  }

  return { members, counts, asked, dueAt };
}
