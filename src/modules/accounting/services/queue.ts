import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Files de la comptabilité (spec 092) : mêmes règles que les indicateurs du tableau de bord des
 * demandes (`accounting/requests/page.tsx`) vu avec `accounting:manage`, c'est-à-dire sur toute
 * l'église. Le droit (`accounting:manage`) est vérifié par l'appelant, avant d'appeler.
 */

/** Demandes à valider : soumises ou en cours de traitement. */
export function toValidateWhere(churchId: string): Prisma.FinancialRequestWhereInput {
  return { churchId, status: { in: ["SUBMITTED", "PROCESSING"] } };
}

/** Tranches pas encore versées, quel que soit l'état de la demande (indicateur « Paiements en attente »). */
export function toPayWhere(churchId: string): Prisma.FinancialPaymentWhereInput {
  return { releasedAt: null, request: { churchId } };
}

/** Demandes dont le justificatif après la remise n'est pas soldé (spec 078, filtre « Justificatifs »). */
export function toJustifyWhere(churchId: string): Prisma.FinancialRequestWhereInput {
  return { churchId, justification: { is: { status: { not: "SETTLED" } } } };
}

export interface AccountingQueueCounts {
  submitted: number;
  processing: number;
  toPay: number;
  toJustify: number;
}

export async function accountingQueueCounts(churchId: string): Promise<AccountingQueueCounts> {
  const [byStatus, toPay, toJustify] = await Promise.all([
    prisma.financialRequest.groupBy({ by: ["status"], where: toValidateWhere(churchId), _count: { _all: true } }),
    prisma.financialPayment.count({ where: toPayWhere(churchId) }),
    prisma.financialRequest.count({ where: toJustifyWhere(churchId) }),
  ]);
  const of = (status: string) => byStatus.find((r) => r.status === status)?._count._all ?? 0;
  return { submitted: of("SUBMITTED"), processing: of("PROCESSING"), toPay, toJustify };
}
