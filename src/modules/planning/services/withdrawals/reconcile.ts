import type { ServiceStatus } from "@/generated/prisma/client";
import type { DbClient } from "../availability/db";
import { isPlannedStatus } from "./rules";

/**
 * Pourvoir un désistement directement depuis la grille (spec 061), sans geste supplémentaire :
 * - le STAR désisté replacé par le responsable → son désistement est annulé (le responsable a
 *   tranché) ;
 * - un membre nouvellement planifié → le plus ancien désistement en attente du service est pourvu
 *   par lui (un désistement par membre ajouté).
 * Idempotent : un membre déjà planifié avant l'écriture ne compte pas comme ajouté. À appeler dans
 * le traitement de la grille, après l'écriture des plannings.
 */
export async function reconcileWithdrawalsAfterGridEdit(
  db: DbClient,
  {
    eventId,
    departmentId,
    before,
    after,
    actorId,
    now = new Date(),
  }: {
    eventId: string;
    departmentId: string;
    /** Statut de chaque membre écrit, avant l'écriture (absent = pas de ligne). */
    before: Map<string, ServiceStatus | null>;
    after: { memberId: string; status: ServiceStatus | null }[];
    actorId: string;
    now?: Date;
  }
): Promise<{ withdrawalId: string; replacementName: string }[]> {
  const pending = await db.serviceWithdrawal.findMany({
    where: { eventId, departmentId, status: "PENDING" },
    select: { id: true, memberId: true },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return [];

  const planned = after.filter((p) => isPlannedStatus(p.status));
  const withdrawnIds = new Set(pending.map((w) => w.memberId));
  const resolved = { resolvedById: actorId, resolvedAt: now };

  const cancelled = new Set<string>();
  for (const p of planned) {
    if (!withdrawnIds.has(p.memberId)) continue;
    for (const w of pending.filter((x) => x.memberId === p.memberId)) {
      await db.serviceWithdrawal.updateMany({ where: { id: w.id, status: "PENDING" }, data: { status: "CANCELLED", ...resolved } });
      cancelled.add(w.id);
    }
  }

  const added = planned.filter((p) => !withdrawnIds.has(p.memberId) && !isPlannedStatus(before.get(p.memberId)));
  const queue = pending.filter((w) => !cancelled.has(w.id));
  const filled: { withdrawalId: string; memberId: string }[] = [];
  for (const p of added) {
    const w = queue.shift();
    if (!w) break;
    const updated = await db.serviceWithdrawal.updateMany({
      where: { id: w.id, status: "PENDING" },
      data: { status: "REPLACED", replacementMemberId: p.memberId, ...resolved },
    });
    if (updated.count > 0) filled.push({ withdrawalId: w.id, memberId: p.memberId });
  }
  if (filled.length === 0) return [];

  const members = await db.member.findMany({
    where: { id: { in: filled.map((f) => f.memberId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
  return filled.map((f) => ({ withdrawalId: f.withdrawalId, replacementName: nameById.get(f.memberId) ?? "" }));
}
