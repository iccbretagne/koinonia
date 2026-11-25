/**
 * Paiements de demandes sortis d'un compte de trésorerie (spec 076), lus par la trésorerie pour
 * les reprendre dans son registre sans les recopier (ADR-0027). La comptabilité n'importe pas la
 * trésorerie : elle porte seulement la référence `treasuryAccountId` sur la tranche versée.
 */
export async function listTreasuryPayments(churchId: string) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.financialPayment.findMany({
    where: { releasedAt: { not: null }, treasuryAccountId: { not: null }, request: { churchId } },
    select: {
      id: true,
      treasuryAccountId: true,
      releasedAt: true,
      releasedAmount: true,
      amount: true,
      request: {
        select: { id: true, label: true, type: true, department: { select: { function: true } } },
      },
    },
    orderBy: { releasedAt: "asc" },
  });
}

/**
 * Reliquats d'avances rendus sur un compte de trésorerie (spec 078), lus par la trésorerie comme
 * entrées de son registre (ADR-0027), au même titre que les paiements ci-dessus.
 */
export async function listTreasuryReturns(churchId: string) {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.financialJustification.findMany({
    where: { churchId, returnedAt: { not: null }, returnTreasuryAccountId: { not: null } },
    select: {
      id: true,
      returnTreasuryAccountId: true,
      returnedAt: true,
      returnedAmount: true,
      period: true,
      requests: { select: { id: true, label: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
    orderBy: { returnedAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    treasuryAccountId: r.returnTreasuryAccountId,
    returnedAt: r.returnedAt,
    amount: Number(r.returnedAmount ?? 0),
    requestId: r.requests[0]?.id ?? null,
    label: `${r.requests[0]?.label ?? "Avance de budget"}${r.period ? ` (${r.period})` : ""}`,
  }));
}

/**
 * Change le compte d'où est partie une tranche déjà remise (spec 089) : une caisse, ou `null` pour
 * le compte commun. La validation du compte et des mois (ancien et nouveau compte) est injectée
 * par la couche `src/app`, seule à connaître la trésorerie (ADR-0027) ; journalisé.
 */
export async function setPaymentTreasuryAccount(
  paymentId: string,
  accountId: string | null,
  actor: { id: string; churchId: string },
  validate: (input: { releasedAt: Date; previous: string | null; next: string | null }) => Promise<string | null>
) {
  const { prisma } = await import("@/lib/prisma");
  const { ApiError } = await import("@/lib/api-utils");
  const payment = await prisma.financialPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, releasedAt: true, treasuryAccountId: true, requestId: true, request: { select: { churchId: true } } },
  });
  if (payment?.request.churchId !== actor.churchId) throw new ApiError(404, "Paiement introuvable");
  if (!payment.releasedAt) throw new ApiError(400, "Ce paiement n'a pas encore été remis");
  if ((payment.treasuryAccountId ?? null) === accountId) return { id: payment.id, treasuryAccountId: accountId };

  const next = await validate({ releasedAt: payment.releasedAt, previous: payment.treasuryAccountId, next: accountId });
  const updated = await prisma.financialPayment.update({
    where: { id: paymentId },
    data: { treasuryAccountId: next },
    select: { id: true, treasuryAccountId: true },
  });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actor.id,
    churchId: actor.churchId,
    action: "UPDATE",
    entityType: "FinancialRequest",
    entityId: payment.requestId,
    details: { action: "paymentTreasuryAccount", paymentId, before: payment.treasuryAccountId, after: next },
  });
  return updated;
}
