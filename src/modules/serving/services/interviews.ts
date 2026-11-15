import type { Prisma, ServingInterview, ServingSchedulingReason } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { CANDIDATE_CHANGE_HOURS } from "../schemas";
import { ensureManageToken, tokenOf } from "./tokens";
import {
  emailInterviewLink,
  emailSlotsInvitation,
  notifyInterviewBooked,
  notifyInterviewCancelled,
  type CandidateInfo,
  type InterviewInfo,
} from "./notifications";

/**
 * Rendez-vous d'entretien (spec 082). Un créneau ne porte qu'un rendez-vous actif : la réservation
 * le **prend** par une mise à jour conditionnelle (`bookedAt` nul), dans la transaction qui crée
 * le rendez-vous. Le rendez-vous copie l'horaire, le lieu et la personne qui reçoit : l'historique
 * reste juste si le créneau change ou disparaît. « À compléter » et « deux absences d'affilée »
 * sont calculés, jamais stockés ; le repère « À planifier » est stocké avec sa raison.
 */

type Tx = Prisma.TransactionClient;
const HOUR_MS = 3_600_000;

export type InterviewDisplayStatus = "BOOKED" | "TO_COMPLETE" | "DONE" | "NO_SHOW" | "EXCUSED" | "CANCELLED";

export const interviewEnd = (i: { startsAt: Date; durationMinutes: number }) => new Date(i.startsAt.getTime() + i.durationMinutes * 60_000);

/** Statut affiché : un rendez-vous réservé dont la fin est passée est « À compléter ». */
export function displayStatus(i: { status: ServingInterview["status"]; startsAt: Date; durationMinutes: number }, now: Date): InterviewDisplayStatus {
  if (i.status === "BOOKED" && interviewEnd(i) <= now) return "TO_COMPLETE";
  return i.status;
}

/** Le candidat change ou annule au plus tard 24 h avant. */
export const candidateCanChange = (i: { startsAt: Date }, now: Date) => i.startsAt.getTime() - now.getTime() >= CANDIDATE_CHANGE_HOURS * HOUR_MS;

/** Deux derniers essais aboutis en « absent » (du plus récent au plus ancien, annulés ignorés). */
export function hasRepeatedNoShow(interviews: readonly { status: ServingInterview["status"]; startsAt: Date }[]): boolean {
  const ended = [...interviews].filter((i) => i.status !== "CANCELLED" && i.status !== "BOOKED").sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return ended.length >= 2 && ended[0].status === "NO_SHOW" && ended[1].status === "NO_SHOW";
}

export const toInfo = (i: Pick<ServingInterview, "id" | "startsAt" | "durationMinutes" | "location" | "visioUrl" | "interviewerId">): InterviewInfo => ({
  id: i.id,
  startsAt: i.startsAt,
  durationMinutes: i.durationMinutes,
  location: i.location,
  visioUrl: i.visioUrl,
  interviewerId: i.interviewerId,
});

/** Repère « À planifier » : une raison (et sa date), ou null quand un rendez-vous est réservé ou réalisé. */
export async function setScheduling(db: Tx, applicationId: string, reason: ServingSchedulingReason | null, now: Date) {
  await db.servingApplication.update({
    where: { id: applicationId },
    data: reason ? { schedulingReason: reason, schedulingSince: now, schedulingRemindedAt: null } : { schedulingReason: null, schedulingSince: null, schedulingRemindedAt: null },
  });
}

export async function releaseSlot(db: Tx, slotId: string | null) {
  if (slotId) await db.servingInterviewSlot.updateMany({ where: { id: slotId }, data: { bookedAt: null } });
}

export async function loadCandidate(applicationId: string, db: Tx = prisma): Promise<CandidateInfo> {
  const app = await db.servingApplication.findUniqueOrThrow({
    where: { id: applicationId },
    select: { id: true, churchId: true, firstName: true, lastName: true, email: true, manageSalt: true },
  });
  return { applicationId: app.id, churchId: app.churchId, firstName: app.firstName, lastName: app.lastName, email: app.email, token: tokenOf(app) };
}

const activeInterview = (db: Tx, applicationId: string) =>
  db.servingInterview.findFirst({ where: { applicationId, status: "BOOKED" }, orderBy: { startsAt: "desc" } });

/**
 * Réserve un créneau pour une candidature (le candidat par son lien, ou le PVS). L'éventuel
 * rendez-vous en cours est annulé et son créneau libéré dans la même transaction.
 */
export async function bookSlot(applicationId: string, slotId: string, opts: { byCandidate: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const { created, previous, unchanged } = await prisma.$transaction(async (tx) => {
    const app = await tx.servingApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { churchId: true, status: true } });
    if (app.status === "REJECTED") throw new ApiError(409, "Cette candidature n'est plus à l'étude");
    const slot = await tx.servingInterviewSlot.findUnique({ where: { id: slotId } });
    if (!slot || slot.churchId !== app.churchId) throw new ApiError(404, "Créneau introuvable");
    if (slot.startsAt <= now) throw new ApiError(409, "Ce créneau est passé");
    if (!slot.interviewerId) throw new ApiError(409, "Ce créneau n'a plus de personne pour vous recevoir");
    const current = await activeInterview(tx, applicationId);
    if (current?.slotId === slotId) return { created: current, previous: null, unchanged: true };
    if (opts.byCandidate && current && !candidateCanChange(current, now)) {
      throw new ApiError(409, "Votre rendez-vous est dans moins de 24 heures : contactez l'équipe pour le changer");
    }
    const claim = await tx.servingInterviewSlot.updateMany({ where: { id: slotId, bookedAt: null, startsAt: { gt: now } }, data: { bookedAt: now } });
    if (claim.count === 0) throw new ApiError(409, "Ce créneau vient d'être pris : choisissez-en un autre");
    if (current) {
      await tx.servingInterview.update({ where: { id: current.id }, data: { status: "CANCELLED", cancelReason: opts.byCandidate ? "CANDIDATE" : "PVS" } });
      if (current.slotId) await releaseSlot(tx, current.slotId);
    }
    const created = await tx.servingInterview.create({
      data: {
        applicationId,
        slotId,
        startsAt: slot.startsAt,
        durationMinutes: slot.durationMinutes,
        location: slot.location,
        visioUrl: slot.visioUrl,
        interviewerId: slot.interviewerId,
      },
    });
    await setScheduling(tx, applicationId, null, now);
    return { created, previous: current, unchanged: false };
  });
  if (unchanged) return created; // déjà réservé sur ce créneau : rien à notifier
  await ensureManageToken(applicationId);
  await notifyInterviewBooked(await loadCandidate(applicationId), toInfo(created), opts.byCandidate, previous ? toInfo(previous) : null);
  return created;
}

export type CancelReason = "CANDIDATE" | "PVS" | "SLOT_REMOVED" | "REJECTED";

const SCHEDULING_AFTER_CANCEL: Record<CancelReason, ServingSchedulingReason | null> = {
  CANDIDATE: "CANDIDATE_CANCELLED",
  PVS: "SLOT_REMOVED",
  SLOT_REMOVED: "SLOT_REMOVED",
  REJECTED: null,
};

/** Annule le rendez-vous en cours ; null s'il n'y en a pas (sauf demande explicite : 409). */
export async function cancelInterview(applicationId: string, reason: CancelReason, opts: { now?: Date; required?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const cancelled = await prisma.$transaction(async (tx) => {
    const current = await activeInterview(tx, applicationId);
    if (!current) {
      if (opts.required) throw new ApiError(409, "Aucun rendez-vous à annuler");
      return null;
    }
    if (reason === "CANDIDATE" && !candidateCanChange(current, now)) {
      throw new ApiError(409, "Votre rendez-vous est dans moins de 24 heures : contactez l'équipe pour l'annuler");
    }
    const updated = await tx.servingInterview.update({ where: { id: current.id }, data: { status: "CANCELLED", cancelReason: reason } });
    await releaseSlot(tx, current.slotId);
    const next = SCHEDULING_AFTER_CANCEL[reason];
    if (next) await setScheduling(tx, applicationId, next, now);
    return updated;
  });
  if (cancelled) await notifyInterviewCancelled(await loadCandidate(applicationId), toInfo(cancelled), reason);
  return cancelled;
}

/** « Aucun créneau ne me convient » : la candidature reste à planifier. */
export async function declineSlots(applicationId: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    if (await activeInterview(tx, applicationId)) throw new ApiError(409, "Un rendez-vous est déjà réservé : annulez-le d'abord");
    await setScheduling(tx, applicationId, "DECLINED", now);
  });
}

/** Issue d'un entretien, notée par une personne, une fois l'heure passée. */
export async function recordOutcome(applicationId: string, status: "DONE" | "NO_SHOW" | "EXCUSED", byUserId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.servingInterview.findFirst({
      where: { applicationId, status: "BOOKED", startsAt: { lte: now } },
      orderBy: { startsAt: "desc" },
    });
    if (!current) throw new ApiError(409, "Aucun entretien passé à compléter");
    const updated = await tx.servingInterview.update({ where: { id: current.id }, data: { status, outcomeAt: now, outcomeById: byUserId } });
    await setScheduling(tx, applicationId, status === "DONE" ? null : status, now);
    return updated;
  });
}

/** Invitation à choisir un créneau (PVS) : lien envoyé à l'adresse de la fiche. */
export async function inviteToBook(applicationId: string, now = new Date()) {
  await ensureManageToken(applicationId);
  const candidate = await loadCandidate(applicationId);
  if (!candidate.email) throw new ApiError(409, "Pas d'email sur la fiche : contactez la personne par téléphone");
  await emailSlotsInvitation(candidate);
  await prisma.servingApplication.update({ where: { id: applicationId }, data: { slotsInvitedAt: now } });
}

/** « Retrouver mon rendez-vous » : rien n'indique à l'appelant si l'adresse est connue. */
export async function resendInterviewLink(churchId: string, email: string) {
  const apps = await prisma.servingApplication.findMany({
    where: { churchId, email, status: { not: "REJECTED" } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  if (apps.length === 0) return;
  await ensureManageToken(apps[0].id);
  await emailInterviewLink(await loadCandidate(apps[0].id));
}

/** Rendez-vous d'une candidature, du plus récent au plus ancien. */
export function listInterviews(applicationId: string) {
  return prisma.servingInterview.findMany({ where: { applicationId }, orderBy: { startsAt: "desc" } });
}

/**
 * Ce que voit le candidat sur son lien : son prénom, son rendez-vous en cours (avec le nom de la
 * personne qui le reçoit), s'il peut encore le changer, les créneaux libres et l'adresse du PVS.
 */
export async function publicInterviewView(applicationId: string, now = new Date()) {
  const app = await prisma.servingApplication.findUniqueOrThrow({
    where: { id: applicationId },
    select: { firstName: true, status: true, churchId: true, church: { select: { name: true, slug: true } } },
  });
  const current = await prisma.servingInterview.findFirst({ where: { applicationId, status: "BOOKED" }, orderBy: { startsAt: "desc" } });
  const { listFreeSlots } = await import("./slots");
  const { getPvsDepartmentIds } = await import("../auth");
  const [free, pvs, interviewer] = await Promise.all([
    app.status === "REJECTED" ? Promise.resolve([]) : listFreeSlots(app.churchId, now),
    prisma.department.findMany({ where: { id: { in: await getPvsDepartmentIds(app.churchId) }, contactEmail: { not: null } }, select: { contactEmail: true }, take: 1 }),
    current?.interviewerId ? prisma.user.findUnique({ where: { id: current.interviewerId }, select: { name: true, displayName: true } }) : Promise.resolve(null),
  ]);
  return {
    church: app.church,
    firstName: app.firstName,
    open: app.status !== "REJECTED",
    interview: current
      ? {
          startsAt: current.startsAt.toISOString(),
          durationMinutes: current.durationMinutes,
          location: current.location,
          visioUrl: current.visioUrl,
          interviewerName: interviewer?.displayName ?? interviewer?.name ?? null,
          past: current.startsAt <= now,
          canChange: candidateCanChange(current, now),
        }
      : null,
    freeSlots: free,
    pvsEmail: pvs[0]?.contactEmail ?? null,
  };
}

export type PublicInterviewView = Awaited<ReturnType<typeof publicInterviewView>>;

/** Entretiens « À compléter » de l'église (réservés, fin passée, issue non notée). */
export async function countToComplete(churchId: string, now = new Date()): Promise<number> {
  const rows = await prisma.servingInterview.findMany({
    where: { status: "BOOKED", startsAt: { lt: now }, application: { churchId } },
    select: { startsAt: true, durationMinutes: true },
  });
  return rows.filter((r) => interviewEnd(r) <= now).length;
}
