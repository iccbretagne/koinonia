import { ApiError } from "@/lib/api-utils";
import { audit, db, monthLabel, monthOf, type TreasuryActor } from "./common";

/**
 * Clôture mensuelle (spec 076) : un mois clôturé n'accepte plus aucune écriture, ce qui fige ses
 * soldes (ils sont calculés, jamais stockés). Rouvrir supprime la clôture, avec un motif
 * conservé dans l'historique.
 */

/** Mois clôturés de l'église, du plus récent au plus ancien. */
export async function listClosures(churchId: string) {
  const prisma = await db();
  const rows = await prisma.treasuryClosure.findMany({ where: { churchId }, orderBy: { month: "desc" } });
  return rows.map((r) => ({ month: r.month, closedAt: r.closedAt.toISOString(), closedById: r.closedById }));
}

/** Refuse une écriture datée d'un mois clôturé. `dates` au format AAAA-MM-JJ. */
export async function assertOpen(churchId: string, ...dates: string[]): Promise<void> {
  const months = [...new Set(dates.map(monthOf))];
  const prisma = await db();
  const closed = await prisma.treasuryClosure.findFirst({
    where: { churchId, month: { in: months } },
    select: { month: true },
  });
  if (closed) {
    throw new ApiError(400, `${monthLabel(closed.month).replace(/^./, (c) => c.toUpperCase())} est clôturé : aucune écriture n'est possible dans ce mois.`);
  }
}

/** Variante pour les routes de reprise (paiements, navette) : accepte des `Date`. */
export async function assertTreasuryDateOpen(churchId: string, ...dates: Date[]): Promise<void> {
  await assertOpen(churchId, ...dates.map((d) => d.toISOString().slice(0, 10)));
}

/** Clôture un mois terminé. */
export async function closeMonth(churchId: string, month: string, actor: TreasuryActor, now = new Date()) {
  if (month >= now.toISOString().slice(0, 7)) {
    throw new ApiError(400, "Seul un mois terminé peut être clôturé.");
  }
  const prisma = await db();
  const existing = await prisma.treasuryClosure.findUnique({ where: { churchId_month: { churchId, month } } });
  if (existing) throw new ApiError(409, "Ce mois est déjà clôturé.");
  await prisma.treasuryClosure.create({ data: { churchId, month, closedById: actor.id } });
  await audit(churchId, actor, "CREATE", "TreasuryClosure", `${churchId}:${month}`, { month });
}

/** Rouvre un mois clôturé ; le motif est conservé dans l'historique. */
export async function reopenMonth(churchId: string, month: string, reason: string, actor: TreasuryActor) {
  const prisma = await db();
  const existing = await prisma.treasuryClosure.findUnique({ where: { churchId_month: { churchId, month } } });
  if (!existing) throw new ApiError(404, "Ce mois n'est pas clôturé.");
  await prisma.treasuryClosure.delete({ where: { churchId_month: { churchId, month } } });
  await audit(churchId, actor, "DELETE", "TreasuryClosure", `${churchId}:${month}`, {
    month,
    reason,
    closedAt: existing.closedAt.toISOString(),
  });
}

/** Réouvertures passées (motif, auteur, date), pour l'écran de clôture. */
export async function listReopenings(churchId: string) {
  const prisma = await db();
  const logs = await prisma.auditLog.findMany({
    where: { churchId, entityType: "TreasuryClosure", action: "DELETE" },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return logs.map((l) => {
    const d = (l.details ?? {}) as { month?: string; reason?: string };
    return { month: d.month ?? "", reason: d.reason ?? "", at: l.createdAt.toISOString(), by: l.user?.name ?? l.user?.email ?? "—" };
  });
}
