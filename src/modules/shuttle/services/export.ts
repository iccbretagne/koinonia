import { PassThrough } from "node:stream";
import { ENTRY_KIND_LABEL, EXPENSE_CATEGORY_LABEL, PAYMENT_METHOD_LABEL, type LedgerQuery } from "../schemas";
import { getLedger, type LedgerLine, type LedgerSummary } from "./ledger-read";
import { readReceipt } from "./receipts";

/**
 * Export d'une période (spec 073) : un ZIP qui contient `releve.xlsx` (relevé avec solde courant,
 * synthèse par type et par mois) et les justificatifs des lignes de la période.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

const kindLabel = (l: LedgerLine) => (l.kind === "BUDGET_ADVANCE" ? "Avance de budget versée" : ENTRY_KIND_LABEL[l.kind]);

function receiptFileName(l: LedgerLine, ext: string) {
  const type = (l.category ? EXPENSE_CATEGORY_LABEL[l.category] : kindLabel(l)).replace(/[^\p{L}\p{N}]+/gu, "-");
  return `${l.date}_${type}_${Math.abs(l.amount).toFixed(2)}_${l.id.slice(-6)}.${ext}`;
}

type Workbook = import("exceljs").Workbook;

const extensionOf = (mime: string | null) =>
  mime === "application/pdf" ? "pdf" : (mime?.split("/")[1] ?? "bin").replace("jpeg", "jpg");

/** Feuille « Relevé » ; renvoie les justificatifs à joindre, avec leur nom dans l'archive. */
function addStatementSheet(wb: Workbook, ledger: LedgerSummary) {
  const sheet = wb.addWorksheet("Relevé");
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Nature", key: "kind", width: 24 },
    { header: "Type", key: "category", width: 26 },
    { header: "Libellé", key: "label", width: 36 },
    { header: "Fournisseur", key: "vendor", width: 20 },
    { header: "Mode", key: "method", width: 16 },
    { header: "Montant (€)", key: "amount", width: 14 },
    { header: "Solde (€)", key: "balance", width: 14 },
    { header: "Avance perso", key: "advance", width: 13 },
    { header: "Location", key: "rental", width: 30 },
    { header: "Auteur", key: "author", width: 22 },
    { header: "Signalement", key: "flag", width: 30 },
    { header: "Justificatif", key: "receipt", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };

  const receipts: { line: LedgerLine; file: string }[] = [];
  for (const l of ledger.entries) {
    const file = l.hasReceipt ? `justificatifs/${receiptFileName(l, extensionOf(l.receiptMime))}` : "";
    if (file) receipts.push({ line: l, file });
    sheet.addRow({
      date: l.date,
      kind: kindLabel(l),
      category: l.category ? EXPENSE_CATEGORY_LABEL[l.category] : "",
      label: l.label ?? "",
      vendor: l.vendor ?? "",
      method: l.paymentMethod ? PAYMENT_METHOD_LABEL[l.paymentMethod] : "",
      amount: l.amount,
      balance: l.runningBalance,
      advance: l.personalAdvance ? "oui" : "",
      rental: l.rental?.label ?? "",
      author: l.createdBy?.name ?? (l.source === "accounting" ? "Comptabilité" : ""),
      flag: l.flagNote ?? "",
      receipt: file,
    });
  }
  for (const key of ["amount", "balance"]) sheet.getColumn(key).numFmt = "#,##0.00";
  return receipts;
}

/** Feuille « Synthèse » : totaux de la période, sorties par type, mois. */
function addSummarySheet(wb: Workbook, ledger: LedgerSummary) {
  const summary = wb.addWorksheet("Synthèse");
  const p = ledger.period;
  summary.addRows([
    ["Période", `${p.from ?? "début"} → ${p.to ?? "aujourd'hui"}`],
    ["Solde de début", p.openingBalance],
    ["Entrées", p.inflows],
    ["Sorties", p.outflows],
    ["Solde de fin", p.closingBalance],
    ["Solde à date", ledger.balanceToDate],
    [],
    ["Sorties par type"],
    ...ledger.byCategory.map((c) => [EXPENSE_CATEGORY_LABEL[c.category], c.total]),
    [],
    ["Mois", "Entrées", "Sorties"],
    ...ledger.byMonth.map((m) => [m.month, m.inflows, m.outflows]),
  ]);
  summary.getColumn(1).width = 30;
  summary.getColumn(2).width = 18;
}

/** Contenu des justificatifs, lus en parallèle (clés relues en base, jamais transmises au client). */
async function loadReceiptFiles(churchId: string, receipts: { line: LedgerLine; file: string }[]) {
  if (receipts.length === 0) return [];
  const prisma = await db();
  const keys = await prisma.shuttleEntry.findMany({
    where: { id: { in: receipts.map((r) => r.line.id) }, churchId },
    select: { id: true, receiptKey: true },
  });
  const keyById = new Map(keys.map((k) => [k.id, k.receiptKey]));
  const files = await Promise.all(
    receipts.map(async (r) => {
      const key = keyById.get(r.line.id);
      const bytes = key ? await readReceipt(key) : null;
      return bytes ? { name: r.file, bytes } : null;
    })
  );
  return files.filter((f): f is { name: string; bytes: Buffer } => f !== null);
}

export async function buildShuttleExport(churchId: string, period: Pick<LedgerQuery, "from" | "to">): Promise<Buffer> {
  const ledger = await getLedger(churchId, { from: period.from, to: period.to }, { userId: "", manager: false });
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const receipts = addStatementSheet(wb, ledger);
  addSummarySheet(wb, ledger);
  const files = await loadReceiptFiles(churchId, receipts);

  const archiver = (await import("archiver")).default;
  const archive = archiver("zip", { zlib: { level: 6 } });
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    out.on("end", resolve);
    archive.on("error", reject);
  });
  archive.pipe(out);
  archive.append(Buffer.from(await wb.xlsx.writeBuffer()), { name: "releve.xlsx" });
  for (const f of files) archive.append(f.bytes, { name: f.name });
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}
