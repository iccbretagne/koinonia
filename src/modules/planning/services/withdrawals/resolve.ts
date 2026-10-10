import type { ServiceStatus } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import type { DbClient } from "../availability/db";
import { loadWithdrawalContext } from "./context";
import { notifyWithdrawalCancelled, notifyWithdrawalClosed } from "./notify";
import { resolveWithdrawalRecipients } from "./recipients";
import { assertStillPending } from "./replace";
import { replaceable } from "./rules";

/**
 * Fins d'un désistement autres que le remplacement (spec 061) : annulation par le STAR, ou
 * « Ne pas remplacer » décidé par le responsable.
 */

async function audit(actorId: string, churchId: string, withdrawalId: string, status: string) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actorId,
    churchId,
    action: "UPDATE",
    entityType: "ServiceWithdrawal",
    entityId: withdrawalId,
    details: { status },
  });
}

/**
 * Cœur transactionnel de l'annulation d'un désistement `PENDING` : statut d'origine restauré et,
 * si `restoreResponse`, réponse revenue à « Disponible » (geste du STAR). Une annulation par la
 * période d'absence (spec 062) ne fabrique pas de réponse : la période fait foi. Lève 409 si le
 * désistement n'est plus en attente, 404 si le département ne sert plus l'événement.
 */
export async function cancelPendingWithdrawal(
  tx: DbClient,
  withdrawal: { id: string; churchId: string; eventId: string; departmentId: string; memberId: string; originalStatus: ServiceStatus },
  actorId: string,
  { restoreResponse }: { restoreResponse: boolean },
  now: Date = new Date()
): Promise<void> {
  const { id, churchId, eventId, departmentId, memberId } = withdrawal;
  const updated = await tx.serviceWithdrawal.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CANCELLED", resolvedById: actorId, resolvedAt: now },
  });
  if (updated.count === 0) await assertStillPending(tx, id);

  const eventDepartment = await tx.eventDepartment.findUnique({
    where: { eventId_departmentId: { eventId, departmentId } },
    select: { id: true },
  });
  if (!eventDepartment) throw new ApiError(404, "Ce département ne sert plus cet événement");
  await tx.planning.upsert({
    where: { eventDepartmentId_memberId: { eventDepartmentId: eventDepartment.id, memberId } },
    create: { eventDepartmentId: eventDepartment.id, memberId, status: withdrawal.originalStatus },
    update: { status: withdrawal.originalStatus },
  });
  if (restoreResponse) {
    await tx.availabilityResponse.upsert({
      where: { memberId_eventId_departmentId: { memberId, eventId, departmentId } },
      create: { churchId, memberId, eventId, departmentId, answer: "AVAILABLE", enteredById: actorId },
      update: { answer: "AVAILABLE", enteredById: actorId },
    });
  }
}

/**
 * Le STAR reprend son service tant qu'aucun remplaçant n'a été choisi : statut d'origine restauré,
 * réponse revenue à « Disponible », responsables prévenus.
 */
export async function cancelWithdrawal(
  { withdrawalId, actorId }: { withdrawalId: string; actorId: string },
  now: Date = new Date()
): Promise<{ id: string }> {
  const { prisma } = await import("@/lib/prisma");
  const withdrawal = await prisma.serviceWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      churchId: true,
      eventId: true,
      departmentId: true,
      memberId: true,
      originalStatus: true,
      event: { select: { date: true } },
    },
  });
  if (!withdrawal) throw new ApiError(404, "Désistement introuvable");
  if (!replaceable(withdrawal.event, now)) throw new ApiError(400, "L'événement a déjà commencé");
  const { churchId, departmentId, memberId } = withdrawal;

  await prisma.$transaction((tx) => cancelPendingWithdrawal(tx, withdrawal, actorId, { restoreResponse: true }, now));

  await audit(actorId, churchId, withdrawalId, "CANCELLED");
  try {
    const ctx = await loadWithdrawalContext(prisma, withdrawalId);
    if (ctx) {
      const recipients = await resolveWithdrawalRecipients(churchId, departmentId, memberId, prisma);
      await notifyWithdrawalCancelled(recipients, ctx.notice);
    }
  } catch (error) {
    console.error("[planning] notification d'annulation de désistement impossible", error);
  }
  return { id: withdrawalId };
}

/** « Ne pas remplacer » : le service n'est plus à remplacer et le STAR désisté en est informé. */
export async function closeWithdrawal(
  { withdrawalId, actorId }: { withdrawalId: string; actorId: string },
  now: Date = new Date()
): Promise<{ id: string }> {
  const { prisma } = await import("@/lib/prisma");
  const withdrawal = await prisma.serviceWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: { churchId: true },
  });
  if (!withdrawal) throw new ApiError(404, "Désistement introuvable");

  const updated = await prisma.serviceWithdrawal.updateMany({
    where: { id: withdrawalId, status: "PENDING" },
    data: { status: "CLOSED", resolvedById: actorId, resolvedAt: now },
  });
  if (updated.count === 0) await assertStillPending(prisma, withdrawalId);

  await audit(actorId, withdrawal.churchId, withdrawalId, "CLOSED");
  try {
    const ctx = await loadWithdrawalContext(prisma, withdrawalId);
    if (ctx) await notifyWithdrawalClosed(ctx.starUserIds, ctx.notice);
  } catch (error) {
    console.error("[planning] notification de clôture de désistement impossible", error);
  }
  return { id: withdrawalId };
}
