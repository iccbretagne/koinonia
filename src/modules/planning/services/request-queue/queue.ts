import type { Prisma, RequestStatus, RequestType } from "@/generated/prisma/client";
import { DEPT_FN, requestTypesForFunction } from "@/lib/department-functions";
import { defaultDb, type DbClient } from "../availability/db";
import type { QueueFunction } from "./access";
import { requestDeadline, type DeadlineKind } from "./deadline";
import { eventChangeSummary, type EventChangeLine } from "./event-change-summary";

/**
 * Chargement des files de traitement des demandes (spec 063) : la file ouverte (en attente, en
 * cours) en entier, et l'historique des demandes traitées par pages de 30, les 30 derniers jours
 * par défaut. Chaque demande est sérialisée avec son échéance calculée.
 */

export const DONE_PAGE_SIZE = 30;
export const DONE_WINDOW_DAYS = 30;

const OPEN: RequestStatus[] = ["EN_ATTENTE", "EN_COURS"];


const EVENT_TYPES = new Set<string>(["MODIFICATION_EVENEMENT", "ANNULATION_EVENEMENT", "MODIFICATION_PLANNING"]);

export interface QueueChild {
  readonly id: string;
  readonly type: RequestType;
  readonly status: RequestStatus;
  readonly deliveryLink: string | null;
}

export interface QueueItem {
  readonly id: string;
  readonly type: RequestType;
  readonly status: RequestStatus;
  readonly title: string;
  readonly payload: Record<string, unknown>;
  readonly submittedAt: string;
  readonly updatedAt: string;
  readonly author: string;
  readonly source: string | null;
  readonly reviewNotes: string | null;
  readonly reviewedBy: string | null;
  readonly executionError: string | null;
  readonly deadline: string | null;
  readonly deadlineKind: DeadlineKind;
  readonly announcement: {
    readonly id: string;
    readonly title: string;
    readonly content: string;
    readonly eventDate: string | null;
    readonly isSaveTheDate: boolean;
    readonly isUrgent: boolean;
    readonly targetEvents: readonly { readonly id: string; readonly title: string; readonly date: string }[];
  } | null;
  /** Canal de la demande parente (visuel demandé pour une diffusion ou une publication). */
  readonly parentType: RequestType | null;
  readonly children: readonly QueueChild[];
  /** Événement visé par une modification, une annulation ou une modification de planning. */
  readonly event: { readonly id: string; readonly title: string; readonly date: string } | null;
  readonly eventChanges: readonly EventChangeLine[] | null;
}

export interface DonePage {
  readonly items: QueueItem[];
  readonly nextCursor: string | null;
}

export interface RequestQueue {
  readonly open: QueueItem[];
  readonly done: DonePage;
  /** Demandes traitées sur les 30 derniers jours (compteur de l'onglet). */
  readonly doneCount: number;
}

const include = {
  submittedBy: { select: { name: true, displayName: true } },
  reviewedBy: { select: { name: true, displayName: true } },
  department: { select: { name: true } },
  ministry: { select: { name: true } },
  announcement: {
    select: {
      id: true,
      title: true,
      content: true,
      eventDate: true,
      isSaveTheDate: true,
      isUrgent: true,
      targetEvents: { select: { event: { select: { id: true, title: true, date: true } } } },
    },
  },
  parentRequest: { select: { type: true } },
  childRequests: { select: { id: true, type: true, status: true, payload: true } },
} satisfies Prisma.RequestInclude;

type Row = Prisma.RequestGetPayload<{ include: typeof include }>;
type EventRow = { id: string; title: string; type: string; date: Date; planningDeadline: Date | null };

/** Demandes routées vers la fonction (spec 046) : racines seulement pour le Secrétariat. */
function scopeWhere(churchId: string, fn: QueueFunction): Prisma.RequestWhereInput {
  switch (fn) {
    case "SECRETARIAT":
      return { churchId, type: { in: requestTypesForFunction(DEPT_FN.SECRETARIAT) }, parentRequestId: null };
    case "COMMUNICATION":
      return { churchId, type: "RESEAUX_SOCIAUX" };
    case "PRODUCTION_MEDIA":
      return { churchId, type: "VISUEL" };
  }
}

function searchWhere(q: string): Prisma.RequestWhereInput {
  return {
    OR: [
      { title: { contains: q } },
      { announcement: { title: { contains: q } } },
      { submittedBy: { name: { contains: q } } },
      { submittedBy: { displayName: { contains: q } } },
      { department: { name: { contains: q } } },
      { ministry: { name: { contains: q } } },
    ],
  };
}

function payloadOf(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function personName(user: { name: string | null; displayName: string | null } | null): string | null {
  return user ? (user.displayName ?? user.name ?? null) : null;
}

async function loadEvents(db: DbClient, churchId: string, rows: Row[]): Promise<Map<string, EventRow>> {
  const ids = new Set<string>();
  for (const row of rows) {
    const eventId = payloadOf(row.payload).eventId;
    if (EVENT_TYPES.has(row.type) && typeof eventId === "string") ids.add(eventId);
  }
  if (ids.size === 0) return new Map();
  const events = await db.event.findMany({
    where: { id: { in: [...ids] }, churchId },
    select: { id: true, title: true, type: true, date: true, planningDeadline: true },
  });
  return new Map(events.map((e) => [e.id, e]));
}

function toItem(row: Row, events: Map<string, EventRow>, now: Date): QueueItem {
  const payload = payloadOf(row.payload);
  const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
  const event = eventId && EVENT_TYPES.has(row.type) ? (events.get(eventId) ?? null) : null;
  const targetEvents = (row.announcement?.targetEvents ?? [])
    .map((t) => t.event)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const deadline = requestDeadline(
    {
      type: row.type,
      payload,
      announcement: row.announcement ? { eventDate: row.announcement.eventDate, targetEvents } : null,
      event,
    },
    now
  );

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    payload,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: personName(row.submittedBy) ?? "—",
    source: row.department?.name ?? row.ministry?.name ?? null,
    reviewNotes: row.reviewNotes,
    reviewedBy: personName(row.reviewedBy),
    executionError: row.executionError,
    deadline: deadline.date,
    deadlineKind: deadline.kind,
    announcement: row.announcement
      ? {
          id: row.announcement.id,
          title: row.announcement.title,
          content: row.announcement.content,
          eventDate: row.announcement.eventDate?.toISOString() ?? null,
          isSaveTheDate: row.announcement.isSaveTheDate,
          isUrgent: row.announcement.isUrgent,
          targetEvents: targetEvents.map((e) => ({ id: e.id, title: e.title, date: e.date.toISOString() })),
        }
      : null,
    parentType: row.parentRequest?.type ?? null,
    children: row.childRequests.map((c) => {
      const link = payloadOf(c.payload).deliveryLink;
      return { id: c.id, type: c.type, status: c.status, deliveryLink: typeof link === "string" && link ? link : null };
    }),
    event: event ? { id: event.id, title: event.title, date: event.date.toISOString() } : null,
    eventChanges: row.type === "MODIFICATION_EVENEMENT" ? eventChangeSummary(payload.changes, event) : null,
  };
}

async function serialize(db: DbClient, churchId: string, rows: Row[], now: Date): Promise<QueueItem[]> {
  const events = await loadEvents(db, churchId, rows);
  return rows.map((row) => toItem(row, events, now));
}

/** Curseur opaque d'une demande traitée : `updatedAt` ISO + `id` (départage stable). */
function encodeCursor(row: { updatedAt: Date; id: string }): string {
  return `${row.updatedAt.toISOString()}_${row.id}`;
}

function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
  const sep = cursor.indexOf("_");
  if (sep < 0) return null;
  const updatedAt = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  return Number.isNaN(updatedAt.getTime()) || !id ? null : { updatedAt, id };
}

function windowStart(now: Date): Date {
  return new Date(now.getTime() - DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Page de demandes traitées, des plus récentes aux plus anciennes. Avec `q`, la recherche porte
 * sur tout l'historique ; sans, la page suit le curseur.
 */
export async function listDoneRequests(
  churchId: string,
  fn: QueueFunction,
  options: { cursor?: string | null; q?: string | null } = {},
  db?: DbClient,
  now: Date = new Date()
): Promise<DonePage> {
  db ??= await defaultDb();
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;
  const q = options.q?.trim();
  const and: Prisma.RequestWhereInput[] = [scopeWhere(churchId, fn), { status: { notIn: OPEN } }];
  if (q) and.push(searchWhere(q));
  if (cursor) {
    and.push({
      OR: [
        { updatedAt: { lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
      ],
    });
  }
  const rows = await db.request.findMany({
    where: { AND: and },
    include,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: DONE_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, DONE_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: await serialize(db, churchId, page, now),
    nextCursor: rows.length > DONE_PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

/**
 * File complète d'une équipe pour le premier affichage : demandes ouvertes, et demandes traitées
 * des 30 derniers jours (au plus une page ; « Voir plus » continue au-delà, même plus anciennes).
 */
export async function loadRequestQueue(
  churchId: string,
  fn: QueueFunction,
  db?: DbClient,
  now: Date = new Date()
): Promise<RequestQueue> {
  db ??= await defaultDb();
  const scope = scopeWhere(churchId, fn);
  const doneWhere: Prisma.RequestWhereInput = { AND: [scope, { status: { notIn: OPEN } }] };
  const since = windowStart(now);

  const [openRows, recentRows, doneCount] = await Promise.all([
    db.request.findMany({ where: { AND: [scope, { status: { in: OPEN } }] }, include, orderBy: { submittedAt: "asc" } }),
    db.request.findMany({
      where: { AND: [doneWhere, { updatedAt: { gte: since } }] },
      include,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: DONE_PAGE_SIZE,
    }),
    db.request.count({ where: { AND: [doneWhere, { updatedAt: { gte: since } }] } }),
  ]);

  // Au-delà de la première page ou de la fenêtre de 30 jours, « Voir plus » reste proposé.
  const last = recentRows.at(-1);
  let hasMore = recentRows.length === DONE_PAGE_SIZE;
  if (!hasMore) {
    const older = await db.request.findFirst({
      where: { AND: [doneWhere, { updatedAt: { lt: since } }] },
      select: { id: true },
    });
    hasMore = older !== null;
  }
  // Fenêtre vide mais historique plus ancien : curseur placé au bord de la fenêtre (« ~ » trie
  // après tout identifiant cuid, donc la page suivante reprend juste avant `since`).
  const nextCursor = hasMore ? (last ? encodeCursor(last) : encodeCursor({ updatedAt: since, id: "~" })) : null;

  const [open, done] = await Promise.all([
    serialize(db, churchId, openRows, now),
    serialize(db, churchId, recentRows, now),
  ]);
  return { open, done: { items: done, nextCursor }, doneCount };
}
