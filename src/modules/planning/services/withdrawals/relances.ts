import { defaultDb } from "../availability/db";
import { listReplacementCandidates } from "./candidates";
import { loadWithdrawalContext } from "./context";
import { notifyWithdrawalRelance } from "./notify";
import { resolveWithdrawalRecipients } from "./recipients";

const RELANCE_BEFORE_MS = 48 * 60 * 60 * 1000;

/**
 * Relance unique des responsables 48 h avant l'événement pour un service encore à remplacer
 * (spec 061). Pas de relance pour un désistement survenu lui-même dans les 48 h : la notification
 * initiale vient de partir.
 */
export async function runWithdrawalRelances(now: Date = new Date()): Promise<{ relanced: number }> {
  const db = await defaultDb();
  const due = await db.serviceWithdrawal.findMany({
    where: {
      status: "PENDING",
      relanceSentAt: null,
      event: { date: { gt: now, lte: new Date(now.getTime() + RELANCE_BEFORE_MS) } },
    },
    select: { id: true, createdAt: true, event: { select: { date: true } } },
  });

  let relanced = 0;
  for (const w of due) {
    if (w.createdAt.getTime() >= w.event.date.getTime() - RELANCE_BEFORE_MS) continue;
    const claimed = await db.serviceWithdrawal.updateMany({
      where: { id: w.id, status: "PENDING", relanceSentAt: null },
      data: { relanceSentAt: now },
    });
    if (claimed.count === 0) continue;
    try {
      const ctx = await loadWithdrawalContext(db, w.id);
      if (!ctx) continue;
      const [recipients, candidates] = await Promise.all([
        resolveWithdrawalRecipients(ctx.churchId, ctx.departmentId, ctx.memberId, db),
        listReplacementCandidates(ctx, db, now),
      ]);
      await notifyWithdrawalRelance(recipients, { ...ctx.notice, candidateCount: candidates.length });
      relanced++;
    } catch (error) {
      console.error("[planning] relance de désistement impossible", w.id, error);
    }
  }
  return { relanced };
}
