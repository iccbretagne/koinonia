import { z } from "zod";
import { hasChurchPermission } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { EVENT_TYPES, getEventTypeLabel } from "@/lib/event-types";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import { checkRoomAvailability, isRoomAuthorizedForChurch } from "@/modules/rooms";
import { createEvent } from "@/app/api/events/_core";
import { addEventDepartment } from "@/app/api/events/[eventId]/departments/_core";
import { reserveRoom } from "@/app/api/room-reservations/_core";
import { formatDay, formatTime } from "../../assistant/_data/common";
import {
  EXPIRED,
  confirmInput,
  day,
  hhmm,
  parisDateTime,
  previewText,
  refusal,
  type ActionContext,
  type ActionResult,
  type McpActionDef,
} from "./common";

/**
 * Événements et salles (spec 081, lot 3c) : créer 1 à 12 événements (`events:manage`) avec
 * leurs départements, voir les salles libres et en réserver une (`rooms:reserve`). Exécution
 * par le code des écrans (`createEvent`, `addEventDepartment`, `reserveRoom`).
 */

const MAX_EVENTS = 12;
const NOT_ALLOWED = "Vous n'avez pas ce droit dans Koinonia pour cette église.";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const can = (permission: string) => (viewer: ActionContext["viewer"]) => viewer.permissions.includes(permission);
const allowed = (ctx: ActionContext, permission: string) => hasChurchPermission(ctx.session, permission, ctx.churchId);

// ─── Créer des événements ────────────────────────────────────────────────────

export const createEventsInput = z.object({
  title: z.string().trim().min(1).max(200).describe("Titre de l'événement"),
  type: z.enum(EVENT_TYPES).describe("CULTE, PRIERE, REUNION, FORMATION ou AUTRE"),
  occurrences: z
    .array(z.object({ day: day.describe("AAAA-MM-JJ"), time: hhmm.describe("HH:MM, heure de Paris") }))
    .min(1)
    .max(MAX_EVENTS)
    .describe(`Dates et heures, ${MAX_EVENTS} au plus par confirmation (ex. tous les dimanches de décembre)`),
  departments: z.array(z.string().trim().min(1).max(100)).max(30).optional().describe("Noms des départements en service"),
  planningDeadline: z
    .string()
    .regex(/^\d+[hd]$/)
    .optional()
    .describe("Date limite de planification avant chaque événement : « 48h », « 3d »…"),
});

type EventsPayload = { title: string; type: string; dates: string[]; departmentIds: string[]; deadlineOffset: string | null };

async function resolveDepartments(churchId: string, names: string[] = []) {
  if (names.length === 0) return { departments: [] as { id: string; name: string }[], unknown: [] as string[] };
  const all = await prisma.department.findMany({ where: { ministry: { churchId } }, select: { id: true, name: true } });
  const departments: { id: string; name: string }[] = [];
  const unknown: string[] = [];
  for (const n of names) {
    const d = all.find((x) => norm(x.name) === norm(n));
    if (d) {
      if (!departments.some((x) => x.id === d.id)) departments.push(d);
    } else unknown.push(n);
  }
  return { departments, unknown };
}

export async function previewCreateEvents(input: z.infer<typeof createEventsInput>, ctx: ActionContext): Promise<ActionResult> {
  if (!(await allowed(ctx, "events:manage"))) return refusal(NOT_ALLOWED);
  const dates = input.occurrences.map((o) => parisDateTime(o.day, o.time));
  if (dates.some((d) => d.getTime() < Date.now())) return refusal("Une des dates est déjà passée : aucun événement n'est créé.");
  if (new Set(dates.map((d) => d.getTime())).size !== dates.length) return refusal("La même date apparaît deux fois.");
  const { departments, unknown } = await resolveDepartments(ctx.churchId, input.departments);
  if (unknown.length > 0) return refusal(`Département inconnu dans cette église : ${unknown.join(", ")}.`);

  // Doublons possibles : un événement du même titre le même jour.
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const existing = await prisma.event.findMany({
    where: {
      churchId: ctx.churchId,
      isRecurrenceParent: false,
      date: { gte: new Date(sorted[0].getTime() - 86_400_000), lte: new Date(sorted.at(-1)!.getTime() + 86_400_000) },
    },
    select: { title: true, date: true },
  });
  const dayOf = (d: Date) => formatDay(d);
  const duplicates = sorted.filter((d) => existing.some((e) => norm(e.title) === norm(input.title) && dayOf(e.date) === dayOf(d)));

  const payload: EventsPayload = {
    title: input.title,
    type: input.type,
    dates: sorted.map((d) => d.toISOString()),
    departmentIds: departments.map((d) => d.id),
    deadlineOffset: input.planningDeadline ?? null,
  };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "create_events", payload);
  const lines = [
    `${sorted.length} événement(s) « ${input.title} » (${getEventTypeLabel(input.type)}) :`,
    ...sorted.map((d) => `- ${formatDay(d)} ${formatTime(d)}${duplicates.includes(d) ? " ⚠ un événement de même titre existe déjà ce jour-là" : ""}`),
    departments.length > 0 ? `Départements en service : ${departments.map((d) => d.name).join(", ")}.` : "Aucun département en service pour l'instant.",
    input.planningDeadline ? `Date limite de planification : ${input.planningDeadline} avant chaque événement.` : "Sans date limite de planification.",
  ];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "create_events", count: sorted.length, duplicates: duplicates.length, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmCreateEvents(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "create_events", input.confirmation)) as EventsPayload | null;
  if (!payload) return refusal(EXPIRED);
  if (!(await allowed(ctx, "events:manage"))) return refusal(NOT_ALLOWED);
  if (payload.dates.some((d) => new Date(d).getTime() < Date.now())) return refusal("Une des dates est passée entre-temps : refaites l'aperçu.");
  const ids: string[] = [];
  try {
    for (const date of payload.dates) {
      const event = await createEvent(
        ctx.session,
        { title: payload.title, type: payload.type, date, churchId: ctx.churchId, deadlineOffset: payload.deadlineOffset },
        { via: "mcp" }
      );
      const eventId = event?.id;
      if (!eventId) throw new ApiError(500, "Création de l'événement impossible");
      ids.push(eventId);
      for (const departmentId of payload.departmentIds) await addEventDepartment(ctx.session, ctx.churchId, eventId, departmentId);
    }
  } catch (error) {
    if (error instanceof ApiError) return refusal(`${error.message} (${ids.length} événement(s) créé(s) avant l'erreur).`);
    throw error;
  }
  const link = `${publicOrigin()}/events`;
  return {
    text: `${ids.length} événement(s) créé(s).\nVoir dans Koinonia : ${link}`,
    structured: { done: true, action: "create_events", eventIds: ids, link },
  };
}

// ─── Salles ──────────────────────────────────────────────────────────────────

export const slotInput = z.object({
  day: day.describe("AAAA-MM-JJ"),
  start: hhmm.describe("Début, HH:MM (heure de Paris)"),
  end: hhmm.describe("Fin, HH:MM (heure de Paris)"),
});

function slot(input: z.infer<typeof slotInput>) {
  const startAt = parisDateTime(input.day, input.start);
  const endAt = parisDateTime(input.day, input.end);
  return endAt > startAt ? { startAt, endAt } : null;
}

export async function roomsAvailable(input: z.infer<typeof slotInput>, ctx: ActionContext): Promise<ActionResult> {
  if (!(await allowed(ctx, "rooms:reserve"))) return refusal(NOT_ALLOWED);
  const s = slot(input);
  if (!s) return refusal("L'heure de fin doit suivre l'heure de début.");
  const rooms = await prisma.room.findMany({
    where: { isActive: true, OR: [{ churchId: ctx.churchId }, { sharedWith: { some: { churchId: ctx.churchId } } }] },
    select: { id: true, name: true, capacity: true },
    orderBy: { name: "asc" },
  });
  const free = [];
  for (const r of rooms) if (await checkRoomAvailability(r.id, s.startAt, s.endAt)) free.push(r);
  const when = `${formatDay(s.startAt)} ${formatTime(s.startAt)}–${formatTime(s.endAt)}`;
  return {
    text:
      free.length > 0
        ? `Salles libres ${when} :\n${free.map((r) => `- ${r.name}${r.capacity ? ` (${r.capacity} places)` : ""} [roomId ${r.id}]`).join("\n")}`
        : `Aucune salle libre ${when}.`,
    structured: { rooms: free.map((r) => ({ roomId: r.id, name: r.name, capacity: r.capacity })) },
  };
}

export const reserveInput = slotInput.extend({
  roomId: z.string().min(1).max(40).describe("Salle (identifiant de rooms_available)"),
  title: z.string().trim().min(1).max(200).describe("Objet de la réservation (répétition, réunion…)"),
});

type ReservePayload = { roomId: string; title: string; startAt: string; endAt: string };

export async function previewReserve(input: z.infer<typeof reserveInput>, ctx: ActionContext): Promise<ActionResult> {
  if (!(await allowed(ctx, "rooms:reserve"))) return refusal(NOT_ALLOWED);
  const s = slot(input);
  if (!s) return refusal("L'heure de fin doit suivre l'heure de début.");
  if (s.startAt.getTime() < Date.now()) return refusal("Ce créneau est déjà passé.");
  if (!(await isRoomAuthorizedForChurch(input.roomId, ctx.churchId))) return refusal("Cette salle n'est pas ouverte à votre église.");
  if (!(await checkRoomAvailability(input.roomId, s.startAt, s.endAt))) return refusal("Cette salle est déjà réservée sur ce créneau.");
  const room = await prisma.room.findUnique({ where: { id: input.roomId }, select: { name: true } });

  const payload: ReservePayload = { roomId: input.roomId, title: input.title, startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "reserve_room", payload);
  const lines = [`Réservation de ${room?.name ?? "la salle"} le ${formatDay(s.startAt)} de ${formatTime(s.startAt)} à ${formatTime(s.endAt)} : « ${input.title} ».`];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "reserve_room", confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmReserve(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "reserve_room", input.confirmation)) as ReservePayload | null;
  if (!payload) return refusal(EXPIRED);
  if (!(await allowed(ctx, "rooms:reserve"))) return refusal(NOT_ALLOWED);
  try {
    // Le code de l'écran revérifie la salle et le créneau : réservée entre-temps ⇒ 409.
    await reserveRoom(ctx.session, { churchId: ctx.churchId, ...payload }, { via: "mcp" });
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  const link = `${publicOrigin()}/rooms`;
  return { text: `Salle réservée.\nVoir dans Koinonia : ${link}`, structured: { done: true, action: "reserve_room", link } };
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

const ASK_FIRST = "Montrez le résumé et attendez l'accord explicite de la personne avant";

export const EVENT_ACTIONS: McpActionDef[] = [
  {
    name: "create_events_preview",
    action: "create_events",
    kind: "preview",
    description: `Prépare la création de 1 à ${MAX_EVENTS} événements (même titre et type, dates et heures données, départements en service). N'enregistre rien : liste des dates, doublons possibles signalés, et un jeton. ${ASK_FIRST} create_events_confirm.`,
    input: createEventsInput,
    available: can("events:manage"),
    run: previewCreateEvents as McpActionDef["run"],
  },
  {
    name: "create_events_confirm",
    action: "create_events",
    kind: "confirm",
    description: "Crée les événements préparés par create_events_preview, avec son jeton.",
    input: confirmInput,
    available: can("events:manage"),
    run: confirmCreateEvents as McpActionDef["run"],
  },
  {
    name: "rooms_available",
    action: "rooms_available",
    kind: "read",
    description: "Salles de l'église (ou partagées avec elle) libres sur un créneau, avec leur identifiant (roomId).",
    input: slotInput,
    available: can("rooms:reserve"),
    run: roomsAvailable as McpActionDef["run"],
  },
  {
    name: "reserve_room_preview",
    action: "reserve_room",
    kind: "preview",
    description: `Prépare la réservation d'une salle sur un créneau. N'enregistre rien : salle, créneau, objet, et un jeton. ${ASK_FIRST} reserve_room_confirm.`,
    input: reserveInput,
    available: can("rooms:reserve"),
    run: previewReserve as McpActionDef["run"],
  },
  {
    name: "reserve_room_confirm",
    action: "reserve_room",
    kind: "confirm",
    description: "Réserve la salle préparée par reserve_room_preview, avec son jeton. Refusé si la salle a été prise entre-temps.",
    input: confirmInput,
    available: can("rooms:reserve"),
    run: confirmReserve as McpActionDef["run"],
  },
];
