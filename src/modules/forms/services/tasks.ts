import { prisma } from "@/lib/prisma";
import { RETENTION_MONTHS } from "../schemas";
import { signalNewResponses } from "./notify";
import { expireOffers } from "./responses";

/**
 * Tâches planifiées des formulaires (spec 079), appelées par `/api/cron` :
 * - `runFormTasks` (toutes les 15 min) : clôture à la fin des réponses, signal regroupé des
 *   nouvelles réponses ;
 * - `runFormPurge` (une fois par jour) : au terme de la conservation, totaux calculés puis
 *   réponses nominatives effacées.
 */

/** Fin de la dernière session : le lendemain de son dernier jour, à 0 h (UTC). */
export function sessionsEnd(sessions: readonly { startDate: Date; days: number }[]): Date | null {
  if (sessions.length === 0) return null;
  return new Date(Math.max(...sessions.map((s) => s.startDate.getTime() + s.days * 86_400_000)));
}

/**
 * Clôture automatique. Sans session : à la fin des réponses. Inscription à sessions : le lendemain
 * de la dernière session (les intervenants y font l'appel jusque-là), les réponses s'arrêtant
 * toujours à leur date de fin.
 */
export async function closeEndedForms(now = new Date()): Promise<number> {
  const plain = await prisma.form.updateMany({
    where: { status: "PUBLISHED", deletedAt: null, closesAt: { lte: now }, sessions: { none: {} } },
    data: { status: "CLOSED", closedAt: now },
  });
  const withSessions = await prisma.form.findMany({
    where: { status: "PUBLISHED", deletedAt: null, sessions: { some: {} } },
    select: { id: true, sessions: { select: { startDate: true, days: true } } },
  });
  const ended = withSessions.filter((f) => sessionsEnd(f.sessions)! <= now).map((f) => f.id);
  const sessioned = ended.length
    ? await prisma.form.updateMany({ where: { id: { in: ended }, status: "PUBLISHED" }, data: { status: "CLOSED", closedAt: now } })
    : { count: 0 };
  return plain.count + sessioned.count;
}

export async function runFormTasks(now = new Date()) {
  const expired = await expireOffers(now);
  const closed = await closeEndedForms(now);
  const signalled = await signalNewResponses();
  return { expired, closed, signalled };
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
  const [byStatus, byChoice, byLevel] = await Promise.all([
    prisma.formResponse.groupBy({ by: ["status"], where: { formId }, _count: { _all: true } }),
    prisma.formResponseChoice.groupBy({
      by: ["choiceId"],
      where: { response: { formId, status: { in: ["CONFIRMED", "OFFERED"] } } },
      _count: { _all: true },
    }),
    prisma.formResponse.groupBy({
      by: ["levelId"],
      where: { formId, levelId: { not: null }, status: { in: ["CONFIRMED", "OFFERED"] } },
      _count: { _all: true },
    }),
  ]);
  const levels = await prisma.formLevel.findMany({
    where: { id: { in: byLevel.map((l) => l.levelId!) } },
    select: { id: true, code: true, session: { select: { label: true } } },
  });
  const levelLabel = new Map(levels.map((l) => [l.id, { session: l.session.label, level: l.code }]));
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
    byLevel: byLevel.map((l) => ({ ...(levelLabel.get(l.levelId!) ?? { session: "", level: "" }), count: l._count._all })),
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
