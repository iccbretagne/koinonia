import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { parisDateTime, parisParts } from "@/lib/paris-time";
import type { SeriesInput, SlotInput } from "../schemas";
import { getPvsDepartmentIds } from "../auth";
import { notifyInterviewMoved, pvsRecipientIds } from "./notifications";
import { cancelInterview, interviewEnd, loadCandidate, toInfo } from "./interviews";

/**
 * Créneaux d'entretien du PVS (spec 082) : créés un par un ou en série, à l'heure de Paris. La
 * personne qui reçoit est un membre de l'équipe PVS ; un même membre n'a jamais deux créneaux qui
 * se chevauchent. Toute création ouvre une vague d'invitation des candidatures « À planifier ».
 */

type Planned = { day: string; time: string; durationMinutes: number; location?: string | null; visioUrl?: string | null; interviewerId: string };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Série → créneaux : chaque jour, de `from` à `to` par pas de la durée (dernier créneau fini avant `to`). */
export function expandSeries(series: SeriesInput): Planned[] {
  const from = toMinutes(series.from);
  const to = toMinutes(series.to);
  if (to <= from) throw new ApiError(400, "L'heure de fin doit suivre l'heure de début");
  const slots: Planned[] = [];
  for (const day of [...new Set(series.days)].sort((a, b) => a.localeCompare(b))) {
    for (let start = from; start + series.durationMinutes <= to; start += series.durationMinutes) {
      slots.push({ day, time: toHhmm(start), durationMinutes: series.durationMinutes, location: series.location, visioUrl: series.visioUrl, interviewerId: series.interviewerId });
    }
  }
  if (slots.length === 0) throw new ApiError(400, "La plage est plus courte qu'un créneau");
  return slots;
}

/** Comptes qui peuvent recevoir : l'équipe PVS de l'église. */
export async function listInterviewers(churchId: string): Promise<{ id: string; name: string }[]> {
  const ids = await pvsRecipientIds(churchId, await getPvsDepartmentIds(churchId));
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, displayName: true, email: true } });
  return users.map((u) => ({ id: u.id, name: u.displayName ?? u.name ?? u.email })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

async function assertNoOverlap(churchId: string, planned: { interviewerId: string; start: Date; end: Date; excludeId?: string }[]) {
  const byInterviewer = new Map<string, { start: number; end: number }[]>();
  for (const p of planned) {
    const mine = byInterviewer.get(p.interviewerId) ?? [];
    const range = { start: p.start.getTime(), end: p.end.getTime() };
    if (mine.some((m) => overlaps(m, range))) throw new ApiError(400, "Deux créneaux de la même personne se chevauchent");
    mine.push(range);
    byInterviewer.set(p.interviewerId, mine);
  }
  for (const [interviewerId, ranges] of byInterviewer) {
    const min = Math.min(...ranges.map((r) => r.start));
    const max = Math.max(...ranges.map((r) => r.end));
    const existing = await prisma.servingInterviewSlot.findMany({
      where: {
        churchId,
        interviewerId,
        startsAt: { lt: new Date(max), gte: new Date(min - 24 * 3_600_000) },
        ...(planned[0]?.excludeId ? { id: { not: planned[0].excludeId } } : {}),
      },
      select: { startsAt: true, durationMinutes: true },
    });
    for (const e of existing) {
      const range = { start: e.startsAt.getTime(), end: interviewEnd(e).getTime() };
      if (ranges.some((r) => overlaps(r, range))) throw new ApiError(409, "Cette personne a déjà un créneau à ce moment-là");
    }
  }
}

/**
 * Créneaux prêts à créer, toutes règles vérifiées (équipe PVS, pas de créneau passé, lieu ou
 * visio, aucun chevauchement) sans rien écrire : partagé par la création et l'aperçu de
 * l'assistant IA.
 */
export async function planSlots(churchId: string, input: { slots: SlotInput[] } | { series: SeriesInput }, now = new Date()) {
  const planned: Planned[] = "series" in input ? expandSeries(input.series) : input.slots;
  if (planned.length > 200) throw new ApiError(400, "200 créneaux au plus par saisie");
  const interviewers = new Set((await listInterviewers(churchId)).map((i) => i.id));
  const rows = planned.map((p) => {
    if (!interviewers.has(p.interviewerId)) throw new ApiError(400, "La personne qui reçoit doit faire partie de l'équipe Vie des STAR");
    if (p.location && p.visioUrl) throw new ApiError(400, "Un lieu ou un lien de visio, pas les deux");
    const start = parisDateTime(p.day, p.time);
    if (start <= now) throw new ApiError(400, `Le créneau du ${p.day} à ${p.time} est passé`);
    return { ...p, start, end: new Date(start.getTime() + p.durationMinutes * 60_000) };
  });
  await assertNoOverlap(churchId, rows);
  return rows;
}

/** Crée des créneaux (liste ou série). Renvoie le nombre de créneaux créés. */
export async function createSlots(
  churchId: string,
  input: { slots: SlotInput[] } | { series: SeriesInput },
  createdById: string,
  now = new Date()
): Promise<number> {
  const rows = await planSlots(churchId, input, now);
  const seriesId = "series" in input ? randomUUID() : null;
  const result = await prisma.servingInterviewSlot.createMany({
    data: rows.map((r) => ({
      churchId,
      startsAt: r.start,
      durationMinutes: r.durationMinutes,
      location: r.location || null,
      visioUrl: r.visioUrl || null,
      interviewerId: r.interviewerId,
      seriesId,
      createdById,
    })),
  });
  await prisma.servingSettings.upsert({ where: { churchId }, create: { churchId, slotsOpenedAt: now }, update: { slotsOpenedAt: now } });
  return result.count;
}

export type SlotUpdate = { day?: string; time?: string; durationMinutes?: number; location?: string | null; visioUrl?: string | null; interviewerId?: string };

/** Église d'un créneau, ou 404. */
export async function slotChurchId(slotId: string): Promise<string> {
  const slot = await prisma.servingInterviewSlot.findUnique({ where: { id: slotId }, select: { churchId: true } });
  if (!slot) throw new ApiError(404, "Créneau introuvable");
  return slot.churchId;
}

/** Modifie un créneau à venir ; un rendez-vous réservé suit, le candidat est prévenu. */
export async function updateSlot(slotId: string, input: SlotUpdate, now = new Date()) {
  const slot = await prisma.servingInterviewSlot.findUniqueOrThrow({ where: { id: slotId } });
  if (slot.startsAt <= now) throw new ApiError(409, "Un créneau passé ne se modifie plus");
  const current = parisParts(slot.startsAt);
  const start = input.day || input.time ? parisDateTime(input.day ?? current.day, input.time ?? current.time) : slot.startsAt;
  if (start <= now) throw new ApiError(400, "Le nouvel horaire est passé");
  const durationMinutes = input.durationMinutes ?? slot.durationMinutes;
  const interviewerId = input.interviewerId ?? slot.interviewerId;
  if (input.interviewerId) {
    const interviewers = new Set((await listInterviewers(slot.churchId)).map((i) => i.id));
    if (!interviewers.has(input.interviewerId)) throw new ApiError(400, "La personne qui reçoit doit faire partie de l'équipe Vie des STAR");
  }
  const location = input.location === undefined ? slot.location : input.location || null;
  const visioUrl = input.visioUrl === undefined ? slot.visioUrl : input.visioUrl || null;
  if (location && visioUrl) throw new ApiError(400, "Un lieu ou un lien de visio, pas les deux");
  if (interviewerId) {
    await assertNoOverlap(slot.churchId, [{ interviewerId, start, end: new Date(start.getTime() + durationMinutes * 60_000), excludeId: slotId }]);
  }
  const data = { startsAt: start, durationMinutes, location, visioUrl, interviewerId };
  const { before, after } = await prisma.$transaction(async (tx) => {
    await tx.servingInterviewSlot.update({ where: { id: slotId }, data });
    const booked = await tx.servingInterview.findFirst({ where: { slotId, status: "BOOKED" } });
    if (!booked) return { before: null, after: null };
    const after = await tx.servingInterview.update({ where: { id: booked.id }, data });
    return { before: booked, after };
  });
  if (before && after) {
    const changed =
      before.startsAt.getTime() !== after.startsAt.getTime() ||
      before.durationMinutes !== after.durationMinutes ||
      before.location !== after.location ||
      before.visioUrl !== after.visioUrl ||
      before.interviewerId !== after.interviewerId;
    if (changed) await notifyInterviewMoved(await loadCandidate(after.applicationId), toInfo(before), toInfo(after));
  }
}

/** Retire un créneau : un rendez-vous réservé est annulé (candidat invité à en choisir un autre). */
export async function deleteSlot(slotId: string, now = new Date()) {
  const booked = await prisma.servingInterview.findFirst({ where: { slotId, status: "BOOKED" }, select: { applicationId: true } });
  if (booked) await cancelInterview(booked.applicationId, "SLOT_REMOVED", { now });
  await prisma.servingInterviewSlot.delete({ where: { id: slotId } });
}

/** Créneaux de l'église (gestion PVS), avec le candidat d'un créneau réservé. */
export async function listSlots(churchId: string, range: { from?: Date; to?: Date }, now = new Date()) {
  const [slots, interviewers] = await Promise.all([
    prisma.servingInterviewSlot.findMany({
      where: { churchId, startsAt: { gte: range.from ?? new Date(now.getTime() - 7 * 86_400_000), ...(range.to ? { lt: range.to } : {}) } },
      include: {
        interviewer: { select: { id: true, name: true, displayName: true, email: true } },
        interviews: { where: { status: "BOOKED" }, select: { application: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { startsAt: "asc" },
      take: 500,
    }),
    listInterviewers(churchId),
  ]);
  const team = new Set(interviewers.map((i) => i.id));
  return slots.map((s) => ({
    id: s.id,
    startsAt: s.startsAt.toISOString(),
    durationMinutes: s.durationMinutes,
    location: s.location,
    visioUrl: s.visioUrl,
    seriesId: s.seriesId,
    interviewer: s.interviewer ? { id: s.interviewer.id, name: s.interviewer.displayName ?? s.interviewer.name ?? s.interviewer.email } : null,
    /** Personne qui reçoit absente ou sortie de l'équipe PVS. */
    toReassign: !s.interviewerId || !team.has(s.interviewerId),
    past: s.startsAt <= now,
    candidate: s.interviews[0]?.application ?? null,
  }));
}

export type SlotView = Awaited<ReturnType<typeof listSlots>>[number];

/** Créneaux libres à venir proposés au candidat (personne qui reçoit encore dans l'équipe). */
export async function listFreeSlots(churchId: string, now = new Date()) {
  const [slots, interviewers] = await Promise.all([
    prisma.servingInterviewSlot.findMany({
      where: { churchId, bookedAt: null, startsAt: { gt: now }, interviewerId: { not: null } },
      include: { interviewer: { select: { name: true, displayName: true } } },
      orderBy: { startsAt: "asc" },
      take: 300,
    }),
    listInterviewers(churchId),
  ]);
  const team = new Set(interviewers.map((i) => i.id));
  return slots
    .filter((s) => s.interviewerId && team.has(s.interviewerId))
    .map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      durationMinutes: s.durationMinutes,
      location: s.location,
      visioUrl: !!s.visioUrl,
      interviewerName: s.interviewer?.displayName ?? s.interviewer?.name ?? null,
    }));
}

export type FreeSlot = Awaited<ReturnType<typeof listFreeSlots>>[number];
