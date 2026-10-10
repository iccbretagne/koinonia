import { ApiError } from "@/lib/api-utils";
import { recordPlanningChanges } from "../planning-change-notices";
import type { DbClient } from "../availability/db";
import { listReplacementCandidates } from "./candidates";
import { loadWithdrawalContext } from "./context";
import { notifyWithdrawalReplaced } from "./notify";
import { replaceable } from "./rules";

/**
 * Choix d'un remplaçant par le responsable (spec 061). Possible après la date limite de
 * planification, jusqu'au début de l'événement. Le premier choix l'emporte : la mise à jour est
 * conditionnelle au statut `PENDING`.
 */

const fullName = (m: { firstName: string; lastName: string } | null | undefined) =>
  m ? `${m.firstName} ${m.lastName}` : "un autre membre";

/** Lève 409 si le désistement n'est plus en attente, avec le nom du remplaçant s'il a été pourvu. */
export async function assertStillPending(db: DbClient, withdrawalId: string): Promise<never> {
  const current = await db.serviceWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: { status: true, replacementMember: { select: { firstName: true, lastName: true } } },
  });
  if (current?.status === "REPLACED") {
    throw new ApiError(409, `Ce service a déjà été pourvu par ${fullName(current.replacementMember)}`);
  }
  if (current?.status === "CANCELLED") throw new ApiError(409, "Ce désistement a été annulé");
  throw new ApiError(409, "Ce service n'est plus à remplacer");
}

export async function replaceWithdrawal(
  { withdrawalId, memberId, actorId }: { withdrawalId: string; memberId: string; actorId: string },
  now: Date = new Date()
): Promise<{ id: string; replacementName: string }> {
  const { prisma } = await import("@/lib/prisma");

  const withdrawal = await prisma.serviceWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      churchId: true,
      eventId: true,
      departmentId: true,
      memberId: true,
      originalStatus: true,
      event: { select: { id: true, date: true } },
    },
  });
  if (!withdrawal) throw new ApiError(404, "Désistement introuvable");
  if (!replaceable(withdrawal.event, now)) throw new ApiError(400, "L'événement a déjà commencé");

  const replacementName = await prisma.$transaction(async (tx) => {
    const updated = await tx.serviceWithdrawal.updateMany({
      where: { id: withdrawalId, status: "PENDING" },
      data: { status: "REPLACED", replacementMemberId: memberId, resolvedById: actorId, resolvedAt: now },
    });
    if (updated.count === 0) await assertStillPending(tx, withdrawalId);

    const candidates = await listReplacementCandidates(withdrawal, tx, now);
    const candidate = candidates.find((c) => c.memberId === memberId);
    if (!candidate) {
      const member = await tx.member.findUnique({ where: { id: memberId }, select: { firstName: true, lastName: true } });
      throw new ApiError(422, `${fullName(member)} n'est plus un remplaçant possible pour ce service`);
    }

    const eventDepartment = await tx.eventDepartment.findUnique({
      where: { eventId_departmentId: { eventId: withdrawal.eventId, departmentId: withdrawal.departmentId } },
      select: { id: true },
    });
    if (!eventDepartment) throw new ApiError(404, "Ce département ne sert plus cet événement");

    if (withdrawal.originalStatus === "EN_SERVICE_DEBRIEF") {
      const debrief = await tx.planning.findFirst({
        where: { eventDepartmentId: eventDepartment.id, status: "EN_SERVICE_DEBRIEF", memberId: { not: memberId } },
        select: { id: true },
      });
      if (debrief) {
        throw new ApiError(422, "Un autre membre est déjà « en service + débrief » sur ce service : modifie la grille d'abord");
      }
    }

    const previous = await tx.planning.findUnique({
      where: { eventDepartmentId_memberId: { eventDepartmentId: eventDepartment.id, memberId } },
      select: { status: true },
    });
    await tx.planning.upsert({
      where: { eventDepartmentId_memberId: { eventDepartmentId: eventDepartment.id, memberId } },
      create: { eventDepartmentId: eventDepartment.id, memberId, status: withdrawal.originalStatus },
      update: { status: withdrawal.originalStatus },
    });
    // Le remplaçant est prévenu par le récapitulatif habituel (spec 060).
    await recordPlanningChanges(
      tx,
      withdrawal.churchId,
      [{ memberId, eventId: withdrawal.eventId, departmentId: withdrawal.departmentId, previousStatus: previous?.status ?? null }],
      { actorId, now }
    );
    return `${candidate.firstName} ${candidate.lastName}`;
  });

  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actorId,
    churchId: withdrawal.churchId,
    action: "UPDATE",
    entityType: "ServiceWithdrawal",
    entityId: withdrawalId,
    details: { status: "REPLACED", replacementMemberId: memberId },
  });
  await sendReplacedConfirmation(prisma, withdrawalId, replacementName);
  return { id: withdrawalId, replacementName };
}

/** Confirmation au STAR désisté (« Léa te remplace le dimanche 12 »), hors transaction. */
export async function sendReplacedConfirmation(db: DbClient, withdrawalId: string, replacementName: string): Promise<void> {
  try {
    const ctx = await loadWithdrawalContext(db, withdrawalId);
    if (ctx) await notifyWithdrawalReplaced(ctx.starUserIds, { ...ctx.notice, replacementName });
  } catch (error) {
    console.error("[planning] confirmation de remplacement impossible", error);
  }
}
