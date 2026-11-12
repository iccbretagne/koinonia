import { sanitizeRow } from "@/lib/excel";
import { displayValue } from "./engine";
import { getForm } from "./builder";
import { listResponses } from "./responses";

/**
 * Export des réponses d'un formulaire (spec 079) : une ligne par réponse, une colonne par
 * question. Valeurs neutralisées contre l'injection de formules (`sanitizeRow`) : une partie des
 * réponses vient d'un formulaire public. Un sondage anonyme n'a aucune colonne d'identité.
 */

export const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmée",
  WAITLISTED: "Liste d'attente",
  OFFERED: "Place proposée",
  CANCELLED: "Annulée",
  DECLINED: "Déclinée",
  EXPIRED: "Proposition expirée",
};

const dateFr = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

export async function exportResponses(formId: string): Promise<{ buffer: Buffer; fileName: string; count: number }> {
  const form = await getForm(formId);
  if (!form) throw new Error("Formulaire introuvable");
  const responses = await listResponses(formId);

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Réponses");
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Statut", key: "status", width: 18 },
    ...(form.anonymous ? [] : [{ header: "Compte", key: "account", width: 26 }]),
    ...form.questions.map((q) => ({ header: q.label, key: q.id, width: Math.min(40, Math.max(14, q.label.length)) })),
  ];
  sheet.getRow(1).font = { bold: true };
  for (const r of responses) {
    const answers = new Map(r.answers.map((a) => [a.questionId, a.value]));
    const row: Record<string, unknown> = {
      date: dateFr(r.submittedOn),
      status: STATUS_LABEL[r.status] ?? r.status,
      ...(form.anonymous ? {} : { account: r.user ? (r.user.displayName ?? r.user.name ?? r.user.email) : "" }),
    };
    for (const q of form.questions) row[q.id] = displayValue(q, answers.get(q.id));
    sheet.addRow(sanitizeRow(row));
  }
  const fileName = `${form.slug}-reponses.xlsx`;
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), fileName, count: responses.length };
}
