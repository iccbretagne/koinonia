import { prisma } from "@/lib/prisma";
import { RETENTION_MONTHS } from "../schemas";
import { signalNewResponses } from "./notify";

/**
 * Tâches planifiées des formulaires (spec 079), appelées par `/api/cron` :
 * - `runFormTasks` (toutes les 15 min) : clôture à la fin des réponses, signal regroupé des
 *   nouvelles réponses ;
 * - `runFormPurge` (une fois par jour) : au terme de la conservation, totaux calculés puis
 *   réponses nominatives effacées.
 */

/** Clôture automatique des formulaires publiés dont la fin des réponses est passée. */
export async function closeEndedForms(now = new Date()): Promise<number> {
  const result = await prisma.form.updateMany({
    where: { status: "PUBLISHED", deletedAt: null, closesAt: { lte: now } },
    data: { status: "CLOSED", closedAt: now },
  });
  return result.count;
}

export async function runFormTasks(now = new Date()) {
  const closed = await closeEndedForms(now);
  const signalled = await signalNewResponses();
  return { closed, signalled };
}

/** Date de purge : clôture + durée de conservation (bornée à 24 mois). */
export function purgeDate(closedAt: Date, retentionMonths: number): Date {
  const months = Math.min(Math.max(1, retentionMonths), RETENTION_MONTHS.max);
  const d = new Date(closedAt);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Totaux conservés après la purge : réponses par statut et par choix. */
export async function computeTotals(formId: string) {
  const [byStatus, byChoice] = await Promise.all([
    prisma.formResponse.groupBy({ by: ["status"], where: { formId }, _count: { _all: true } }),
    prisma.formResponseChoice.groupBy({
      by: ["choiceId"],
      where: { response: { formId, status: { in: ["CONFIRMED", "OFFERED"] } } },
      _count: { _all: true },
    }),
  ]);
  const choices = await prisma.formChoice.findMany({
    where: { id: { in: byChoice.map((c) => c.choiceId) } },
    select: { id: true, label: true, question: { select: { label: true } } },
  });
  const label = new Map(choices.map((c) => [c.id, { question: c.question.label, choice: c.label }]));
  const statuses = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  return {
    responses: byStatus.reduce((sum, s) => sum + s._count._all, 0),
    byStatus: statuses,
    byChoice: byChoice.map((c) => ({ ...(label.get(c.choiceId) ?? { question: "", choice: "" }), count: c._count._all })),
  };
}

export async function runFormPurge(now = new Date()): Promise<number> {
  const candidates = await prisma.form.findMany({
    where: { status: "CLOSED", purgedAt: null, closedAt: { not: null } },
    select: { id: true, closedAt: true, retentionMonths: true },
  });
  const due = candidates.filter((f) => purgeDate(f.closedAt!, f.retentionMonths) <= now);
  for (const form of due) {
    const totals = await computeTotals(form.id);
    await prisma.$transaction([
      prisma.formResponse.deleteMany({ where: { formId: form.id } }),
      prisma.formAnonymousReceipt.deleteMany({ where: { formId: form.id } }),
      prisma.form.update({ where: { id: form.id }, data: { purgedAt: now, totals } }),
    ]);
  }
  return due.length;
}
