import { DEPT_FN } from "@/lib/department-functions";
import type { AccountView } from "./accounts";
import { getSystemCategory } from "./categories";
import { db, toIsoDate } from "./common";
import type { RawLine } from "./ledger";

/**
 * Mouvements repris dans le registre, sans ressaisie (spec 076, ADR-0027) : ils sont **lus** à
 * leur origine à chaque affichage, en lecture seule, et ne se modifient qu'à l'origine.
 *   - paiements de notes de frais et d'avances versés depuis un compte de trésorerie ;
 *   - abondements de la navette remis depuis un compte de trésorerie, seulement si le module
 *     navette est actif (lecture de la table, sans import du module, qui peut être désactivé).
 */

async function paymentLines(churchId: string, names: Map<string, string>): Promise<RawLine[]> {
  const { listTreasuryPayments } = await import("@/modules/accounting");
  const payments = await listTreasuryPayments(churchId);
  if (payments.length === 0) return [];
  const [expenses, shuttle] = await Promise.all([
    getSystemCategory(churchId, "EXPENSE_REPORTS"),
    getSystemCategory(churchId, "SHUTTLE"),
  ]);
  return payments.flatMap((p) => {
    const accountId = p.treasuryAccountId;
    if (!accountId || !p.releasedAt || !names.has(accountId)) return [];
    const category = p.request.department?.function === DEPT_FN.NAVETTE ? shuttle : expenses;
    const kindLabel = p.request.type === "BUDGET_ADVANCE" ? "Avance de budget" : "Note de frais";
    return [
      {
        id: `payment:${p.id}`,
        source: "accounting" as const,
        kind: "STANDARD" as const,
        accountId,
        accountName: names.get(accountId) ?? "",
        direction: "OUT" as const,
        categoryId: category.id,
        categoryName: category.name,
        categorySystem: category.system,
        purposeId: null,
        purposeName: null,
        method: "CASH" as const,
        amount: Number(p.releasedAmount ?? p.amount),
        date: toIsoDate(p.releasedAt),
        label: `${kindLabel} · ${p.request.label}`,
        thirdParty: null,
        depositRef: null,
        collectionId: null,
        transferGroupId: null,
        hasReceipt: false,
        link: `/accounting/requests/${p.request.id}`,
        createdAt: p.releasedAt.toISOString(),
      },
    ];
  });
}

async function shuttleLines(churchId: string, names: Map<string, string>): Promise<RawLine[]> {
  const { registry } = await import("@/lib/registry");
  if (!registry.has("shuttle")) return [];
  const prisma = await db();
  const rows = await prisma.shuttleEntry.findMany({
    where: { churchId, kind: "FUNDING", deletedAt: null, treasuryAccountId: { not: null } },
    select: { id: true, treasuryAccountId: true, amount: true, date: true, label: true, paymentMethod: true, createdAt: true },
  });
  if (rows.length === 0) return [];
  const category = await getSystemCategory(churchId, "SHUTTLE");
  return rows.flatMap((r) => {
    const accountId = r.treasuryAccountId;
    if (!accountId || !names.has(accountId)) return [];
    return [
      {
        id: `shuttle:${r.id}`,
        source: "shuttle" as const,
        kind: "STANDARD" as const,
        accountId,
        accountName: names.get(accountId) ?? "",
        direction: "OUT" as const,
        categoryId: category.id,
        categoryName: category.name,
        categorySystem: category.system,
        purposeId: null,
        purposeName: null,
        method: methodOf(r.paymentMethod),
        amount: Math.abs(Number(r.amount)),
        date: toIsoDate(r.date),
        label: r.label ? `Abondement de la navette · ${r.label}` : "Abondement de la navette",
        thirdParty: null,
        depositRef: null,
        collectionId: null,
        transferGroupId: null,
        hasReceipt: false,
        link: `/accounting/navette?ligne=${r.id}`,
        createdAt: r.createdAt.toISOString(),
      },
    ];
  });
}

function methodOf(m: string | null) {
  if (m === "CHEQUE") return "CHEQUE" as const;
  if (m === "TRANSFER") return "TRANSFER" as const;
  if (m === "CHURCH_CARD") return "CARD" as const;
  return "CASH" as const;
}

export async function loadRepriseLines(churchId: string, accounts: AccountView[]): Promise<RawLine[]> {
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const [payments, shuttle] = await Promise.all([paymentLines(churchId, names), shuttleLines(churchId, names)]);
  return [...payments, ...shuttle];
}
