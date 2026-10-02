import { ApiError } from "@/lib/api-utils";
import { absenceCovers } from "../absence-targeting";
import { defaultDb, type DbClient } from "./db";
import { recordReminders } from "./reminders";
import {
  collectionWindow,
  monthStart,
  nextMonthStart,
  shouldRelance,
} from "./state";
import {
  DEFAULT_AVAILABILITY_SETTINGS,
  listAvailabilitySettingsByChurch,
  type AvailabilitySettingsValues,
} from "./settings";

/**
 * Cycle automatique de la collecte (spec 058), exécuté par l'orchestrateur horaire `/api/cron` :
 * ouverture des mois cibles, notification d'ouverture, envoi des demandes ciblées, relances.
 * Idempotent : chaque étape est protégée par un horodatage (`notifiedAt`, `relanceSentAt`) ou par
 * le journal des relances.
 */

interface EventRow {
  id: string;
  title: string;
  date: Date;
  eventDepts: { departmentId: string }[];
}

export interface AvailabilityTasksResult {
  opened: number;
  openingNotified: number;
  asksSent: number;
  relances: number;
}

const EVENT_SELECT = {
  id: true,
  title: true,
  date: true,
  eventDepts: { select: { departmentId: true } },
} as const;

async function upcomingMonthEvents(db: DbClient, churchId: string, month: Date, now: Date): Promise<EventRow[]> {
  return db.event.findMany({
    where: {
      churchId,
      isRecurrenceParent: false,
      date: { gte: month > now ? month : now, lt: nextMonthStart(month) },
      eventDepts: { some: {} },
    },
    select: EVENT_SELECT,
    orderBy: { date: "asc" },
  });
}

/** STAR liés à un compte qui n'ont pas répondu (ni n'ont de période qui couvre) pour au moins un de ces événements. */
async function computeUnanswered(
  db: DbClient,
  churchId: string,
  events: EventRow[]
): Promise<{ memberId: string; userId: string; eventIds: string[] }[]> {
  if (events.length === 0) return [];
  const deptIds = Array.from(new Set(events.flatMap((e) => e.eventDepts.map((d) => d.departmentId))));
  const memberDepts = await db.memberDepartment.findMany({
    where: { departmentId: { in: deptIds } },
    select: {
      memberId: true,
      departmentId: true,
      member: { select: { userLinks: { where: { churchId }, select: { userId: true } } } },
    },
  });
  const linked = memberDepts.filter((m) => m.member.userLinks[0]);
  const memberIds = Array.from(new Set(linked.map((m) => m.memberId)));
  if (memberIds.length === 0) return [];

  const dates = events.map((e) => e.date.getTime());
  const [responses, periods] = await Promise.all([
    db.availabilityResponse.findMany({
      where: { eventId: { in: events.map((e) => e.id) }, memberId: { in: memberIds } },
      select: { memberId: true, eventId: true, departmentId: true },
    }),
    db.absence.findMany({
      where: {
        churchId,
        status: "ACTIVE",
        kind: "PERIOD",
        memberId: { in: memberIds },
        startDate: { lte: new Date(Math.max(...dates)) },
        endDate: { gte: new Date(Math.min(...dates)) },
      },
      select: {
        memberId: true,
        kind: true,
        startDate: true,
        endDate: true,
        allDepartments: true,
        targetDepartments: { select: { departmentId: true } },
      },
    }),
  ]);
  const answered = new Set(responses.map((r) => `${r.memberId}:${r.eventId}:${r.departmentId}`));

  const result = new Map<string, { memberId: string; userId: string; eventIds: Set<string> }>();
  for (const md of linked) {
    for (const event of events) {
      if (!event.eventDepts.some((d) => d.departmentId === md.departmentId)) continue;
      if (answered.has(`${md.memberId}:${event.id}:${md.departmentId}`)) continue;
      const covered = periods.some(
        (p) =>
          p.memberId === md.memberId &&
          absenceCovers({ ...p, targetEvents: [] }, { eventDate: event.date, departmentId: md.departmentId })
      );
      if (covered) continue;
      const entry = result.get(md.memberId) ?? {
        memberId: md.memberId,
        userId: md.member.userLinks[0].userId,
        eventIds: new Set<string>(),
      };
      entry.eventIds.add(event.id);
      result.set(md.memberId, entry);
    }
  }
  return Array.from(result.values()).map((r) => ({ ...r, eventIds: Array.from(r.eventIds) }));
}

function monthLabel(month: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);
}

function monthParam(month: Date): string {
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
}

function describeEvents(events: { title: string; date: Date }[]): string {
  if (events.length === 1) {
    const when = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(events[0].date);
    return `« ${events[0].title} » (${when})`;
  }
  return `${events.length} événements`;
}

async function notifyOne(
  userId: string,
  n: { type: string; title: string; message: string; link: string; entityType: string; entityId: string }
): Promise<void> {
  const { notifyUsers } = await import("@/lib/notifications");
  await notifyUsers([userId], { domain: "planning", ...n });
}

/** Ouvre les collectes des mois cibles dont la fenêtre est atteinte, même tardivement (spec 058). */
async function openCollections(
  db: DbClient,
  churchId: string,
  settings: AvailabilitySettingsValues,
  now: Date
): Promise<number> {
  let opened = 0;
  const current = monthStart(now);
  for (let k = 0; k <= settings.openMonthsBefore; k++) {
    const month = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + k, 1));
    if (await db.availabilityCollection.findUnique({ where: { churchId_month: { churchId, month } }, select: { id: true } })) continue;

    const upcoming = await upcomingMonthEvents(db, churchId, month, now);
    if (upcoming.length === 0) continue;
    const first = await db.event.findFirst({
      where: { churchId, isRecurrenceParent: false, date: { gte: month, lt: nextMonthStart(month) }, eventDepts: { some: {} } },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    const { closesAt } = collectionWindow(settings, month, (first ?? upcoming[0]).date);
    await db.availabilityCollection.create({ data: { churchId, month, closesAt, openedAt: now } });
    opened++;
  }
  return opened;
}

async function notifyOpenings(db: DbClient, now: Date, onlyId?: string): Promise<number> {
  const pending = await db.availabilityCollection.findMany({ where: { notifiedAt: null, ...(onlyId ? { id: onlyId } : {}) } });
  let sent = 0;
  for (const c of pending) {
    const events = await upcomingMonthEvents(db, c.churchId, c.month, now);
    const deptIds = Array.from(new Set(events.flatMap((e) => e.eventDepts.map((d) => d.departmentId))));
    const members = await db.memberDepartment.findMany({
      where: { departmentId: { in: deptIds } },
      select: { member: { select: { userLinks: { where: { churchId: c.churchId }, select: { userId: true } } } } },
    });
    const userIds = Array.from(new Set(members.flatMap((m) => m.member.userLinks.map((l) => l.userId))));
    const late = c.closesAt.getTime() < now.getTime();
    const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long" });
    for (const userId of userIds) {
      await notifyOne(userId, {
        type: "AVAILABILITY_COLLECTION_OPENED",
        title: `Indique tes disponibilités pour ${monthLabel(c.month)}`,
        message: late
          ? `La collecte de ${monthLabel(c.month)} est ouverte : merci de répondre au plus vite.`
          : `Réponds avant le ${fmt.format(c.closesAt)} pour les événements de ${monthLabel(c.month)}.`,
        link: `/disponibilites?month=${monthParam(c.month)}`,
        entityType: "AvailabilityCollection",
        entityId: c.id,
      });
      sent++;
    }
    await db.availabilityCollection.update({ where: { id: c.id }, data: { notifiedAt: now } });
  }
  return sent;
}

/** Envoie les demandes ciblées en attente, une seule notification par STAR (série d'événements = un message). */
async function sendPendingAsks(db: DbClient, now: Date): Promise<number> {
  const asks = await db.availabilityAsk.findMany({
    where: { notifiedAt: null },
    select: { id: true, churchId: true, eventId: true, departmentId: true, event: { select: EVENT_SELECT } },
  });
  const byUser = new Map<string, Map<string, { title: string; date: Date }>>();
  for (const ask of asks) {
    if (ask.event.date.getTime() < now.getTime()) continue;
    const targets = await computeUnanswered(db, ask.churchId, [
      { ...ask.event, eventDepts: [{ departmentId: ask.departmentId }] },
    ]);
    for (const t of targets) {
      const events = byUser.get(t.userId) ?? new Map();
      events.set(ask.event.id, { title: ask.event.title, date: ask.event.date });
      byUser.set(t.userId, events);
    }
  }
  for (const [userId, events] of byUser) {
    const list = Array.from(events.entries());
    await notifyOne(userId, {
      type: "AVAILABILITY_ASKED",
      title: "Indique ta disponibilité",
      message: `Es-tu disponible pour ${describeEvents(list.map(([, e]) => e))} ?`,
      link: list.length === 1 ? `/disponibilites?event=${list[0][0]}` : "/disponibilites",
      entityType: "Event",
      entityId: list[0][0],
    });
  }
  if (asks.length > 0) {
    await db.availabilityAsk.updateMany({ where: { id: { in: asks.map((a) => a.id) } }, data: { notifiedAt: now } });
  }
  return byUser.size;
}

async function sendRelances(
  db: DbClient,
  settingsByChurch: Map<string, AvailabilitySettingsValues>,
  now: Date
): Promise<number> {
  const settingsOf = (churchId: string) => settingsByChurch.get(churchId) ?? DEFAULT_AVAILABILITY_SETTINGS;
  const pending = new Map<string, { memberId: string; eventIds: Set<string> }>();
  const add = (t: { memberId: string; userId: string; eventIds: string[] }) => {
    const entry = pending.get(t.userId) ?? { memberId: t.memberId, eventIds: new Set<string>() };
    t.eventIds.forEach((id) => entry.eventIds.add(id));
    pending.set(t.userId, entry);
  };
  const eventInfo = new Map<string, { title: string; date: Date }>();

  const collections = await db.availabilityCollection.findMany({ where: { relanceSentAt: null } });
  const dueCollections = collections.filter((c) =>
    shouldRelance({
      dueAt: c.closesAt,
      relanceDaysBefore: settingsOf(c.churchId).relanceDaysBefore,
      openedAt: c.openedAt,
      now,
    })
  );
  for (const c of dueCollections) {
    const events = await upcomingMonthEvents(db, c.churchId, c.month, now);
    events.forEach((e) => eventInfo.set(e.id, e));
    (await computeUnanswered(db, c.churchId, events)).forEach(add);
  }

  const asks = await db.availabilityAsk.findMany({
    where: { relanceSentAt: null, notifiedAt: { not: null } },
    select: { id: true, churchId: true, departmentId: true, dueAt: true, updatedAt: true, event: { select: EVENT_SELECT } },
  });
  const dueAsks = asks.filter((a) =>
    shouldRelance({
      dueAt: a.dueAt,
      relanceDaysBefore: settingsOf(a.churchId).relanceDaysBefore,
      openedAt: a.updatedAt,
      now,
    })
  );
  for (const a of dueAsks) {
    eventInfo.set(a.event.id, a.event);
    (await computeUnanswered(db, a.churchId, [{ ...a.event, eventDepts: [{ departmentId: a.departmentId }] }])).forEach(add);
  }

  // Un STAR ne reçoit jamais deux relances pour le même événement le même jour.
  const pairs = Array.from(pending.values()).flatMap((p) => Array.from(p.eventIds).map((eventId) => ({ memberId: p.memberId, eventId })));
  const fresh = new Set((await recordReminders(db, pairs, now)).map((p) => `${p.memberId}:${p.eventId}`));
  let sent = 0;
  for (const [userId, entry] of pending) {
    const eventIds = Array.from(entry.eventIds).filter((id) => fresh.has(`${entry.memberId}:${id}`));
    if (eventIds.length === 0) continue;
    await notifyOne(userId, {
      type: "AVAILABILITY_RELANCE",
      title: "Rappel : indique tes disponibilités",
      message: `Il te reste à répondre pour ${describeEvents(eventIds.map((id) => eventInfo.get(id)!))}.`,
      link: eventIds.length === 1 ? `/disponibilites?event=${eventIds[0]}` : "/disponibilites",
      entityType: "Event",
      entityId: eventIds[0],
    });
    sent++;
  }

  if (dueCollections.length > 0) {
    await db.availabilityCollection.updateMany({ where: { id: { in: dueCollections.map((c) => c.id) } }, data: { relanceSentAt: now } });
  }
  if (dueAsks.length > 0) {
    await db.availabilityAsk.updateMany({ where: { id: { in: dueAsks.map((a) => a.id) } }, data: { relanceSentAt: now } });
  }
  return sent;
}

export async function runAvailabilityTasks(now: Date = new Date()): Promise<AvailabilityTasksResult> {
  const db = await defaultDb();
  const settingsByChurch = await listAvailabilitySettingsByChurch(db);
  const churches = await db.church.findMany({ select: { id: true } });

  let opened = 0;
  for (const { id } of churches) {
    const settings = settingsByChurch.get(id) ?? DEFAULT_AVAILABILITY_SETTINGS;
    if (!settings.enabled) continue;
    opened += await openCollections(db, id, settings, now);
  }
  const openingNotified = await notifyOpenings(db, now);
  const asksSent = await sendPendingAsks(db, now);
  const relances = await sendRelances(db, settingsByChurch, now);
  return { opened, openingNotified, asksSent, relances };
}

export interface CollectionMonth {
  month: Date;
  eventCount: number;
  open: boolean;
  closesAt: Date | null;
}

/** Mois en cours et les `horizon` suivants, avec l'état de leur collecte (écran de réglage). */
export async function listCollectionMonths(churchId: string, now: Date = new Date(), horizon = 6): Promise<CollectionMonth[]> {
  const db = await defaultDb();
  const current = monthStart(now);
  const months = Array.from({ length: horizon + 1 }, (_, k) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + k, 1)));
  const collections = await db.availabilityCollection.findMany({
    where: { churchId, month: { in: months } },
    select: { month: true, closesAt: true },
  });
  const byMonth = new Map(collections.map((c) => [c.month.getTime(), c]));
  return Promise.all(
    months.map(async (month) => {
      const eventCount = (await upcomingMonthEvents(db, churchId, month, now)).length;
      const c = byMonth.get(month.getTime());
      return { month, eventCount, open: !!c, closesAt: c?.closesAt ?? null };
    })
  );
}

/**
 * Ouvre à la demande la collecte d'un mois, sans attendre la fenêtre automatique (spec 058) :
 * mois en cours ou à venir, au moins un événement à venir, collecte pas déjà ouverte. L'église
 * n'a pas besoin d'avoir activé la collecte automatique. Les STAR sont notifiés aussitôt.
 */
export async function openCollectionNow(
  churchId: string,
  month: Date,
  now: Date = new Date()
): Promise<{ closesAt: Date; notified: number }> {
  const db = await defaultDb();
  const target = monthStart(month);
  if (target < monthStart(now)) throw new ApiError(400, "Ce mois est déjà passé");
  if (await db.availabilityCollection.findUnique({ where: { churchId_month: { churchId, month: target } }, select: { id: true } })) {
    throw new ApiError(409, "La collecte de ce mois est déjà ouverte");
  }
  const upcoming = await upcomingMonthEvents(db, churchId, target, now);
  if (upcoming.length === 0) throw new ApiError(400, "Aucun événement à venir ce mois-là");

  const settings = (await listAvailabilitySettingsByChurch(db)).get(churchId) ?? DEFAULT_AVAILABILITY_SETTINGS;
  const { closesAt } = collectionWindow(settings, target, upcoming[0].date);
  const created = await db.availabilityCollection.create({ data: { churchId, month: target, closesAt, openedAt: now } });
  const notified = await notifyOpenings(db, now, created.id);
  return { closesAt, notified };
}
