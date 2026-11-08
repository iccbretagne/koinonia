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
