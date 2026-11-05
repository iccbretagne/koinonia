import { PassThrough } from "node:stream";
import { DIRECTION_LABEL, METHOD_LABEL } from "../schemas";
import { db } from "./common";
import { getLedger, type LedgerLine } from "./ledger";
import { readReceipt, RECEIPT_EXTENSION } from "./receipts";
import { getReports } from "./reports";

/**
 * Export d'une période (spec 076) : un ZIP avec `tresorerie.xlsx` (registre avec soldes, totaux
 * par catégorie, par moyen et par mois) et les justificatifs des lignes de la période.
 */

type Workbook = import("exceljs").Workbook;

const SOURCE_LABEL = { treasury: "", accounting: "Repris de la comptabilité", shuttle: "Repris de la navette" } as const;

function receiptFileName(l: LedgerLine, ext: string) {
  const account = l.accountName.replace(/[^\p{L}\p{N}]+/gu, "-");
  return `justificatifs/${l.date}_${account}_${l.amount.toFixed(2)}_${l.id.slice(-6)}.${ext}`;
}

async function receiptKeys(churchId: string, lines: LedgerLine[]) {
  const ids = lines.filter((l) => l.source === "treasury" && l.hasReceipt).map((l) => l.id);
  if (ids.length === 0) return new Map<string, { key: string; mime: string | null }>();
  const prisma = await db();
  const rows = await prisma.treasuryEntry.findMany({
    where: { id: { in: ids }, churchId },
    select: { id: true, receiptKey: true, receiptMime: true },
  });
  return new Map(rows.flatMap((r) => (r.receiptKey ? [[r.id, { key: r.receiptKey, mime: r.receiptMime }] as const] : [])));
}

function addLedgerSheet(wb: Workbook, lines: LedgerLine[], keys: Map<string, { key: string; mime: string | null }>) {
  const sheet = wb.addWorksheet("Registre");
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Compte", key: "account", width: 22 },
    { header: "Sens", key: "direction", width: 9 },
    { header: "Catégorie", key: "category", width: 28 },
    { header: "Objet", key: "purpose", width: 20 },
    { header: "Moyen", key: "method", width: 12 },
    { header: "Libellé", key: "label", width: 40 },
    { header: "Tiers", key: "thirdParty", width: 20 },
    { header: "Entrée (€)", key: "in", width: 13 },
    { header: "Sortie (€)", key: "out", width: 13 },
    { header: "Solde (€)", key: "balance", width: 13 },
    { header: "Origine", key: "source", width: 26 },
    { header: "Justificatif", key: "receipt", width: 44 },
  ];
  sheet.getRow(1).font = { bold: true };
  const files: { key: string; name: string }[] = [];
  for (const l of lines) {
    const stored = keys.get(l.id);
    const name = stored ? receiptFileName(l, RECEIPT_EXTENSION[stored.mime ?? ""] ?? "bin") : "";
    if (stored) files.push({ key: stored.key, name });
    sheet.addRow({
      date: l.date,
      account: l.accountName,
      direction: DIRECTION_LABEL[l.direction],
      category: l.kind === "TRANSFER" ? "Transfert" : (l.categoryName ?? ""),
      purpose: l.purposeName ?? "",
      method: METHOD_LABEL[l.method],
      label: l.label,
      thirdParty: l.thirdParty ?? "",
      in: l.direction === "IN" ? l.amount : null,
      out: l.direction === "OUT" ? l.amount : null,
      balance: l.runningBalance,
      source: SOURCE_LABEL[l.source],
      receipt: name,
    });
  }
  for (const key of ["in", "out", "balance"]) sheet.getColumn(key).numFmt = "#,##0.00";
  return files;
}

export async function buildTreasuryExport(churchId: string, from?: string, to?: string): Promise<Buffer> {
  const [ledger, reports] = await Promise.all([getLedger(churchId, { from, to }), getReports(churchId, from, to)]);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const keys = await receiptKeys(churchId, ledger.lines);
  const files = addLedgerSheet(wb, ledger.lines, keys);

  const summary = wb.addWorksheet("Synthèse");
  const p = ledger.period;
  summary.addRows([
    ["Période", `${from ?? "début"} → ${to ?? "aujourd'hui"}`],
    ["Solde d'ouverture", p.opening],
    ["Entrées", p.inflows],
    ["Sorties", p.outflows],
    ["Solde de clôture", p.closing],
    [],
    ["Compte", "Solde à date"],
    ...ledger.accounts.map((a) => [a.name, a.balance]),
  ]);
  const byCategory = wb.addWorksheet("Par catégorie");
  byCategory.addRows([
    ["Sens", "Catégorie", "Total (€)"],
    ...reports.byCategory.map((c) => [DIRECTION_LABEL[c.direction], c.name, c.total]),
    [],
    ["Offrandes spéciales par objet", "", ""],
    ...reports.byPurpose.map((x) => ["", x.name, x.total]),
  ]);
  const byMethod = wb.addWorksheet("Par moyen");
  byMethod.addRows([["Moyen", "Entrées (€)", "Sorties (€)"], ...reports.byMethod.map((m) => [METHOD_LABEL[m.method], m.inflows, m.outflows])]);
  const byMonth = wb.addWorksheet("Par mois");
  byMonth.addRows([["Mois", "Entrées (€)", "Sorties (€)"], ...reports.byMonth.map((m) => [m.month, m.inflows, m.outflows])]);
  for (const s of [summary, byCategory, byMethod, byMonth]) {
    s.getRow(1).font = { bold: true };
    s.columns.forEach((c) => (c.width = 30));
  }

  const contents = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await readReceipt(f.key) })));

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
  archive.append(Buffer.from(await wb.xlsx.writeBuffer()), { name: "tresorerie.xlsx" });
  for (const f of contents) if (f.bytes) archive.append(f.bytes, { name: f.name });
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}
