import { ApiError } from "@/lib/api-utils";
import { defaultDb, type DbClient } from "../availability/db";
import { listReplacementCandidates } from "./candidates";
import { loadWithdrawalContext } from "./context";
import { notifyWithdrawal } from "./notify";
import { resolveWithdrawalRecipients } from "./recipients";
import { isPlannedStatus, withdrawable } from "./rules";

/**
 * Désistement d'un STAR planifié (spec 061) : il sort du planning, son service devient « à
 * remplacer » et ses responsables sont prévenus immédiatement.
 */

export interface WithdrawalInput {
  churchId: string;
  eventId: string;
  departmentId: string;
  memberId: string;
  actorId: string;
  message?: string | null;
}

export interface CreateWithdrawalOptions {
  /** Période d'absence à l'origine du désistement (spec 062). */
  absenceId?: string;
  /**
   * Écrire la réponse « Pas disponible » (défaut). Faux pour un désistement né d'une période :
   * la période fait foi et la spec 058 supprime les réponses qu'elle couvre.
   */
  recordResponse?: boolean;
}

/**
 * À appeler dans une transaction. Refuse un service non planifié, une échéance passée ou un
 * désistement déjà en attente. Retire le STAR du planning en gardant son statut d'origine, passe
 * sa réponse à « Pas disponible » et supprime un éventuel récapitulatif 060 en attente pour ce
 * service (il contredirait la confirmation à venir). Renvoie l'identifiant du désistement.
 */
export async function createWithdrawal(
  input: WithdrawalInput,
  tx: DbClient,
  now: Date = new Date(),
  { absenceId, recordResponse = true }: CreateWithdrawalOptions = {}
): Promise<string> {
  const { churchId, eventId, departmentId, memberId, actorId } = input;

  const event = await tx.event.findFirst({
    where: { id: eventId, churchId },
    select: { date: true, planningDeadline: true },
  });
  if (!event) throw new ApiError(404, "Événement introuvable");
  if (!withdrawable(event, now)) {
    throw new ApiError(400, "La date limite de planification est passée : contacte ton responsable");
  }

  const planning = await tx.planning.findFirst({
    where: { memberId, eventDepartment: { eventId, departmentId } },
    select: { id: true, status: true },
  });
  if (!planning || !isPlannedStatus(planning.status)) {
    throw new ApiError(400, "Tu n'es pas planifié(e) sur ce service");
  }

  const pending = await tx.serviceWithdrawal.findFirst({
    where: { memberId, eventId, departmentId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) throw new ApiError(409, "Un désistement est déjà en attente pour ce service");

  const withdrawal = await tx.serviceWithdrawal.create({
    data: {
      churchId,
      eventId,
      departmentId,
      memberId,
      originalStatus: planning.status,
      message: input.message?.trim() || null,
      createdById: actorId,
      absenceId: absenceId ?? null,
    },
    select: { id: true },
  });
  await tx.planning.update({ where: { id: planning.id }, data: { status: null } });
  if (recordResponse) {
    await tx.availabilityResponse.upsert({
      where: { memberId_eventId_departmentId: { memberId, eventId, departmentId } },
      create: { churchId, memberId, eventId, departmentId, answer: "UNAVAILABLE", enteredById: actorId },
      update: { answer: "UNAVAILABLE", enteredById: actorId },
    });
  }
  await tx.planningChangeNotice.deleteMany({ where: { memberId, eventId, departmentId } });
  return withdrawal.id;
}

/** Prévient les responsables d'un désistement déjà validé (hors transaction). */
export async function sendWithdrawalNotice(withdrawalId: string, db?: DbClient, now: Date = new Date()): Promise<void> {
  db ??= await defaultDb();
  const ctx = await loadWithdrawalContext(db, withdrawalId);
  if (!ctx) return;
  const [recipients, candidates, w] = await Promise.all([
    resolveWithdrawalRecipients(ctx.churchId, ctx.departmentId, ctx.memberId, db),
    listReplacementCandidates(ctx, db, now),
    db.serviceWithdrawal.findUnique({ where: { id: withdrawalId }, select: { message: true } }),
  ]);
  await notifyWithdrawal(recipients, { ...ctx.notice, candidateCount: candidates.length, message: w?.message ?? null });
}

/** « Je ne peux plus » : transaction, journal, puis notification immédiate des responsables. */
export async function withdrawService(input: WithdrawalInput, now: Date = new Date()): Promise<{ id: string }> {
  const { prisma } = await import("@/lib/prisma");
  const id = await prisma.$transaction((tx) => createWithdrawal(input, tx, now));

  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: input.actorId,
    churchId: input.churchId,
    action: "CREATE",
    entityType: "ServiceWithdrawal",
    entityId: id,
    details: { eventId: input.eventId, departmentId: input.departmentId, memberId: input.memberId },
  });
  try {
    await sendWithdrawalNotice(id, prisma, now);
  } catch (error) {
    console.error("[planning] notification du désistement impossible", error);
  }
  return { id };
}

/**
 * Fiche STAR du compte concernée par un service : parmi ses fiches liées et validées dans
 * l'église, celle qui appartient au département. Un STAR sans compte relié ne se désiste pas
 * lui-même (son responsable passe par la grille).
 */
export async function resolveOwnMemberForDepartment(
  userId: string,
  churchId: string,
  departmentId: string,
  db?: DbClient
): Promise<string> {
  db ??= await defaultDb();
  const link = await db.memberUserLink.findFirst({
    where: { userId, churchId, validatedAt: { not: null }, member: { departments: { some: { departmentId } } } },
    select: { memberId: true },
  });
  if (!link) throw new ApiError(403, "Aucune fiche STAR liée à votre compte dans ce département");
  return link.memberId;
}
