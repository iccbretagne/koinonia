import { ApiError } from "@/lib/api-utils";
import type { AvailabilityAskReason } from "@/generated/prisma/client";
import { defaultDb, type DbClient } from "./db";
import { askDueAt, monthStart } from "./state";
import { getAvailabilitySettings } from "./settings";
import { recordReminders, startOfDay } from "./reminders";

/**
 * Demandes ciblées de disponibilité (spec 058) : événement ajouté ou déplacé après l'ouverture,
 * demande ponctuelle d'un responsable, relance manuelle.
 */

/**
 * Crée (ou réarme) la demande d'un événement pour chacun de ses départements. L'envoi est
 * différé au cron (`notifiedAt = null`) : les abonnés du bus tournent dans la transaction de
 * l'émetteur, où l'email n'est pas envoyé.
 */
export async function createAsks(
  db: DbClient,
  {
    eventId,
    departmentIds,
    reason,
    createdById,
    now = new Date(),
  }: { eventId: string; departmentIds: string[]; reason: AvailabilityAskReason; createdById?: string | null; now?: Date }
): Promise<number> {
  if (departmentIds.length === 0) return 0;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { churchId: true, date: true } });
  if (!event || event.date.getTime() < now.getTime()) return 0;

  const [collection, settings] = await Promise.all([
    db.availabilityCollection.findUnique({
      where: { churchId_month: { churchId: event.churchId, month: monthStart(event.date) } },
      select: { closesAt: true },
    }),
    getAvailabilitySettings(event.churchId, db),
  ]);
  const dueAt = askDueAt({
    eventDate: event.date,
    collectionClosesAt: collection?.closesAt,
    now,
    daysBefore: settings.closeDaysBefore,
  });

  for (const departmentId of departmentIds) {
    await db.availabilityAsk.upsert({
      where: { eventId_departmentId: { eventId, departmentId } },
      create: { churchId: event.churchId, eventId, departmentId, reason, dueAt, createdById: createdById ?? null },
      update: { reason, dueAt, notifiedAt: null, relanceSentAt: null, createdById: createdById ?? null },
    });
  }
  return departmentIds.length;
}

/** Membres liés à un compte, d'un département, qui sont « Sans réponse » pour cet événement. */
async function unansweredUserIds(
  db: DbClient,
  churchId: string,
  eventId: string,
  departmentId: string
): Promise<{ memberId: string; userId: string }[]> {
  const members = await db.memberDepartment.findMany({
    where: { departmentId },
    select: { memberId: true, member: { select: { userLinks: { where: { churchId }, select: { userId: true } } } } },
  });
  const answered = await db.availabilityResponse.findMany({
    where: { eventId, departmentId, memberId: { in: members.map((m) => m.memberId) } },
    select: { memberId: true },
  });
  const answeredIds = new Set(answered.map((a) => a.memberId));
  return members
    .filter((m) => !answeredIds.has(m.memberId) && m.member.userLinks[0])
    .map((m) => ({ memberId: m.memberId, userId: m.member.userLinks[0].userId }));
}

async function loadEvent(db: DbClient, eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, churchId: true, date: true } });
  if (!event) throw new ApiError(404, "Événement introuvable");
  return event;
}

/**
 * « Interroger l'équipe » : demande ponctuelle d'un responsable sur un événement. Notifie tout de
 * suite les membres du département qui n'ont pas répondu.
 */
export async function askTeam({
  eventId,
  departmentId,
  actorId,
  now = new Date(),
}: {
  eventId: string;
  departmentId: string;
  actorId: string;
  now?: Date;
}): Promise<{ notified: number }> {
  const db = await defaultDb();
  const event = await loadEvent(db, eventId);
  if (event.date.getTime() < now.getTime()) throw new ApiError(400, "Cet événement est déjà passé");

  await createAsks(db, { eventId, departmentIds: [departmentId], reason: "LEADER", createdById: actorId, now });
  const targets = await unansweredUserIds(db, event.churchId, eventId, departmentId);
  await sendAsk(targets.map((t) => t.userId), event, "AVAILABILITY_ASKED");
  await db.availabilityAsk.update({
    where: { eventId_departmentId: { eventId, departmentId } },
    data: { notifiedAt: now },
  });
  return { notified: targets.length };
}

/** Relance manuelle des « Sans réponse » du département, une fois par jour et par événement au plus. */
export async function manualRelance({
  eventId,
  departmentId,
  now = new Date(),
}: {
  eventId: string;
  departmentId: string;
  now?: Date;
}): Promise<{ notified: number }> {
  const db = await defaultDb();
  const event = await loadEvent(db, eventId);
  const ask = await db.availabilityAsk.findUnique({
    where: { eventId_departmentId: { eventId, departmentId } },
    select: { manualRelanceAt: true },
  });
  if (ask?.manualRelanceAt && startOfDay(ask.manualRelanceAt).getTime() === startOfDay(now).getTime()) {
    throw new ApiError(409, "Les sans-réponse ont déjà été relancés aujourd'hui");
  }

  const targets = await unansweredUserIds(db, event.churchId, eventId, departmentId);
  const fresh = await recordReminders(
    db,
    targets.map((t) => ({ memberId: t.memberId, eventId })),
    now
  );
  const freshMembers = new Set(fresh.map((f) => f.memberId));
  await sendAsk(
    targets.filter((t) => freshMembers.has(t.memberId)).map((t) => t.userId),
    event,
    "AVAILABILITY_RELANCE"
  );
  if (ask) {
    await db.availabilityAsk.update({ where: { eventId_departmentId: { eventId, departmentId } }, data: { manualRelanceAt: now } });
  } else {
    await createAsks(db, { eventId, departmentIds: [departmentId], reason: "LEADER", now });
    await db.availabilityAsk.update({
      where: { eventId_departmentId: { eventId, departmentId } },
      data: { manualRelanceAt: now, notifiedAt: now },
    });
  }
  return { notified: freshMembers.size };
}

async function sendAsk(
  userIds: string[],
  event: { id: string; title: string; date: Date },
  type: "AVAILABILITY_ASKED" | "AVAILABILITY_RELANCE"
): Promise<void> {
  if (userIds.length === 0) return;
  const { notifyUsers } = await import("@/lib/notifications");
  const when = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(event.date);
  await notifyUsers(userIds, {
    domain: "planning",
    type,
    title: type === "AVAILABILITY_ASKED" ? "Indique ta disponibilité" : "Rappel : indique ta disponibilité",
    message: `Es-tu disponible pour « ${event.title} » le ${when} ?`,
    link: `/disponibilites?event=${event.id}`,
    entityType: "Event",
    entityId: event.id,
  });
}
