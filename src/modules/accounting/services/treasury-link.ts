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
