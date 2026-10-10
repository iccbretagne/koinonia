import type { AbsenceKind, Prisma } from "@/generated/prisma/client";
import { defaultDb, type DbClient } from "../availability/db";
import { PLANNED_STATUSES } from "../staffing-gaps";
import { loadWithdrawalContext } from "./context";
import { notifyWithdrawalCancelled, notifyWithdrawalsKept, notifyWithdrawnByAbsence, type AbsenceServiceLine } from "./notify";
import { resolveWithdrawalRecipients } from "./recipients";
import { cancelPendingWithdrawal } from "./resolve";
import { replaceable, withdrawable } from "./rules";
import { createWithdrawal, sendWithdrawalNotice } from "./withdraw";

/**
 * Désistements nés d'une période d'absence (spec 062) : une période qui couvre des services où
 * le STAR est planifié l'en désiste, avec les effets de « Je ne peux plus » (spec 061), et ces
 * désistements suivent la vie de la période (annulation, modification). Chacun porte
 * l'identifiant de l'absence : seuls ceux-là sont touchés quand elle change.
 */

/** Ciblage d'une absence, même forme que `AbsenceTargeting` (absence.service) sans en dépendre. */
export interface AbsenceWithdrawalTargeting {
  kind: AbsenceKind;
  startDate?: Date | null;
  endDate?: Date | null;
  eventIds?: string[];
  allDepartments: boolean;
  departmentIds?: string[];
}

export interface WithdrawableService {
  eventId: string;
  title: string;
  date: Date;
  departmentId: string;
  departmentName: string;
}

/** Même fenêtre et même filtre départemental que `findAbsenceConflicts`, un seul calendrier. */
function coverageWhere(t: AbsenceWithdrawalTargeting): { event: Prisma.EventWhereInput; departmentId?: Prisma.StringFilter } {
  const event: Prisma.EventWhereInput =
    t.kind === "EVENTS" ? { id: { in: t.eventIds ?? [] } } : { date: { gte: t.startDate!, lte: t.endDate! } };
  return t.allDepartments ? { event } : { event, departmentId: { in: t.departmentIds ?? [] } };
}

/**
 * Services que la période désisterait : planifiés (remplaçant compris), à venir, couverts, encore
 * désistables (échéance non passée) et sans désistement déjà en attente. En modification, ceux
 * que l'absence a déjà désistés sont exclus d'office : en attente, ou STAR plus planifié.
 */
export async function findWithdrawableServicesForAbsence(
  db: DbClient | undefined,
  p: { memberId: string; churchId: string; targeting: AbsenceWithdrawalTargeting },
  now: Date = new Date()
): Promise<WithdrawableService[]> {
  db ??= await defaultDb();
  const { event: eventWhere, departmentId } = coverageWhere(p.targeting);
  const plannings = await db.planning.findMany({
    where: {
      memberId: p.memberId,
      status: { in: [...PLANNED_STATUSES] },
      eventDepartment: {
        ...(departmentId ? { departmentId } : {}),
        event: { AND: [{ churchId: p.churchId, date: { gt: now } }, eventWhere] },
      },
    },
    select: {
      eventDepartment: {
        select: {
          departmentId: true,
          department: { select: { name: true } },
          event: { select: { id: true, title: true, date: true, planningDeadline: true } },
        },
      },
    },
  });
  const candidates = plannings
    .map((pl) => pl.eventDepartment)
    .filter((ed) => withdrawable(ed.event, now));
  if (candidates.length === 0) return [];

  const pending = await db.serviceWithdrawal.findMany({
    where: { memberId: p.memberId, status: "PENDING", eventId: { in: candidates.map((ed) => ed.event.id) } },
    select: { eventId: true, departmentId: true },
  });
  const pendingKeys = new Set(pending.map((w) => `${w.eventId}_${w.departmentId}`));

  return candidates
    .filter((ed) => !pendingKeys.has(`${ed.event.id}_${ed.departmentId}`))
    .map((ed) => ({
      eventId: ed.event.id,
      title: ed.event.title,
      date: ed.event.date,
      departmentId: ed.departmentId,
      departmentName: ed.department.name,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** À appeler dans la transaction de l'absence. Renvoie les identifiants des désistements créés. */
export async function withdrawForAbsence(
  tx: DbClient,
  p: { absenceId: string; churchId: string; memberId: string; actorId: string; targeting: AbsenceWithdrawalTargeting },
  now: Date = new Date()
): Promise<string[]> {
  const services = await findWithdrawableServicesForAbsence(tx, p, now);
  const ids: string[] = [];
  for (const s of services) {
    ids.push(
      await createWithdrawal(
        { churchId: p.churchId, eventId: s.eventId, departmentId: s.departmentId, memberId: p.memberId, actorId: p.actorId },
        tx,
        now,
        { absenceId: p.absenceId, recordResponse: false }
      )
    );
  }
  return ids;
}

/**
 * À appeler dans la transaction de l'absence (annulation ou modification). Les désistements encore
 * en attente que `keep` ne retient pas sont annulés — STAR replacé, sans réponse fabriquée ; ceux
 * déjà pourvus ou clos sont rapportés pour informer le STAR. Les événements commencés sont ignorés.
 */
export async function cancelAbsenceWithdrawals(
  tx: DbClient,
  p: { absenceId: string; actorId: string; keep?: (w: { eventId: string; eventDate: Date; departmentId: string }) => boolean },
  now: Date = new Date()
): Promise<{ cancelled: string[]; kept: AbsenceServiceLine[] }> {
  const rows = await tx.serviceWithdrawal.findMany({
    where: { absenceId: p.absenceId, status: { in: ["PENDING", "REPLACED", "CLOSED"] } },
    select: {
      id: true,
      churchId: true,
      eventId: true,
      departmentId: true,
      memberId: true,
      originalStatus: true,
      status: true,
      event: { select: { date: true } },
      department: { select: { name: true } },
      replacementMember: { select: { firstName: true, lastName: true } },
    },
  });

  const cancelled: string[] = [];
  const kept: AbsenceServiceLine[] = [];
  for (const w of rows) {
    if (!replaceable(w.event, now)) continue;
    if (p.keep?.({ eventId: w.eventId, eventDate: w.event.date, departmentId: w.departmentId })) continue;
    if (w.status === "PENDING") {
      await cancelPendingWithdrawal(tx, w, p.actorId, { restoreResponse: false }, now);
      cancelled.push(w.id);
    } else {
      kept.push({
        eventDate: w.event.date,
        departmentName: w.department.name,
        replacementName: w.replacementMember ? `${w.replacementMember.firstName} ${w.replacementMember.lastName}` : null,
      });
    }
  }
  return { cancelled, kept };
}

/**
 * Après la transaction : journal des désistements créés, notification de chacun aux responsables
 * (avec les remplaçants possibles), annulations aux responsables, et au STAR la liste de ses
 * services retirés (période déclarée par un tiers) ou non replacés. N'échoue jamais.
 */
export async function sendAbsenceWithdrawalNotices(
  p: {
    absenceId: string;
    churchId: string;
    memberId: string;
    actorId: string;
    created: string[];
    cancelled?: string[];
    kept?: AbsenceServiceLine[];
    thirdParty: boolean;
  },
  db?: DbClient,
  now: Date = new Date()
): Promise<void> {
  try {
    db ??= await defaultDb();
    const { logAudit } = await import("@/lib/audit");
    const removed: AbsenceServiceLine[] = [];
    for (const id of p.created) {
      await logAudit({
        userId: p.actorId,
        churchId: p.churchId,
        action: "CREATE",
        entityType: "ServiceWithdrawal",
        entityId: id,
        details: { memberId: p.memberId, absenceId: p.absenceId, source: "absence" },
      });
      await sendWithdrawalNotice(id, db, now);
      const ctx = await loadWithdrawalContext(db, id);
      if (ctx) removed.push({ eventDate: ctx.notice.eventDate, departmentName: ctx.notice.departmentName });
    }
    for (const id of p.cancelled ?? []) {
      await logAudit({ userId: p.actorId, churchId: p.churchId, action: "UPDATE", entityType: "ServiceWithdrawal", entityId: id, details: { status: "CANCELLED", absenceId: p.absenceId } });
      const ctx = await loadWithdrawalContext(db, id);
      if (!ctx) continue;
      const recipients = await resolveWithdrawalRecipients(ctx.churchId, ctx.departmentId, ctx.memberId, db);
      await notifyWithdrawalCancelled(recipients, ctx.notice);
    }

    const needStar = (p.thirdParty && removed.length > 0) || (p.kept?.length ?? 0) > 0;
    if (!needStar) return;
    const links = await db.memberUserLink.findMany({ where: { memberId: p.memberId, churchId: p.churchId }, select: { userId: true } });
    const starUserIds = links.map((l) => l.userId);
    if (p.thirdParty && removed.length > 0) await notifyWithdrawnByAbsence(starUserIds, p.absenceId, removed);
    if (p.kept && p.kept.length > 0) await notifyWithdrawalsKept(starUserIds, p.absenceId, p.kept);
  } catch (error) {
    console.error("[planning] notifications des désistements d'une absence impossibles", error);
  }
}
