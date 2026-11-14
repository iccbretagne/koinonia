import { sanitizeRow } from "@/lib/excel";
import { displayValue } from "./engine";
import { getForm } from "./builder";
import { listResponses } from "./responses";
import { aggregate } from "./results";

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

  // Présence (inscription à sessions) : une colonne par demi-journée de la plus longue session.
  const maxDays = Math.max(0, ...form.sessions.map((x) => x.days));
  const presenceColumns = Array.from({ length: maxDays }, (_, i) =>
    (["AM", "PM"] as const).map((half) => ({ day: i + 1, half, key: `presence-${i + 1}-${half}`, header: `Jour ${i + 1} ${half === "AM" ? "matin" : "après-midi"}` }))
  ).flat();
  const ctx = { sessions: form.sessions };

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Réponses");
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Statut", key: "status", width: 18 },
    ...(form.anonymous ? [] : [{ header: "Compte", key: "account", width: 26 }]),
    ...form.questions.map((q) => ({ header: q.label, key: q.id, width: Math.min(40, Math.max(14, q.label.length)) })),
    ...presenceColumns.map((c) => ({ header: c.header, key: c.key, width: 14 })),
  ];
  sheet.getRow(1).font = { bold: true };
  for (const r of responses) {
    const answers = new Map(r.answers.map((a) => [a.questionId, a.value]));
    const row: Record<string, unknown> = {
      date: dateFr(r.submittedOn),
      status: STATUS_LABEL[r.status] ?? r.status,
      ...(form.anonymous ? {} : { account: r.user ? (r.user.displayName ?? r.user.name ?? r.user.email) : "" }),
    };
    for (const q of form.questions) row[q.id] = displayValue(q, answers.get(q.id), ctx);
    for (const c of presenceColumns) {
      const cell = r.attendance.find((a) => a.day === c.day && a.half === c.half);
      row[c.key] = cell ? (cell.present ? "Présent" : "Absent") : "";
    }
    sheet.addRow(sanitizeRow(row));
  }
  // Résultats regroupés (lot 3) : mêmes agrégats que l'onglet Résultats, sans identité.
  const results = aggregate(
    form,
    responses.filter((r) => r.status === "CONFIRMED")
  );
  const summary = wb.addWorksheet("Résultats");
  summary.columns = [
    { header: "Question", key: "question", width: 40 },
    { header: "Réponse", key: "item", width: 40 },
    { header: "Nombre", key: "count", width: 12 },
    { header: "Part", key: "share", width: 10 },
  ];
  summary.getRow(1).font = { bold: true };
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : "");
  if (results.participation) {
    const p = results.participation;
    for (const [item, count] of [
      ["Personnes qui viennent", p.attending],
      ["Accompagnants", p.companions],
      ["Total des participants", p.total],
      ["Ne viennent pas", p.notAttending],
    ] as const) {
      summary.addRow(sanitizeRow({ question: "Participation", item, count, share: "" }));
    }
  }
  for (const q of results.questions) {
    if (q.kind === "choices") for (const i of q.items) summary.addRow(sanitizeRow({ question: q.label, item: i.label, count: i.count, share: pct(i.count, q.answered) }));
    else if (q.kind === "rating") {
      q.distribution.forEach((count, i) => summary.addRow(sanitizeRow({ question: q.label, item: `${i + 1} / 5`, count, share: pct(count, q.answered) })));
      summary.addRow(sanitizeRow({ question: q.label, item: "Moyenne", count: q.average ?? "", share: "" }));
    } else if (q.kind === "number") {
      summary.addRow(sanitizeRow({ question: q.label, item: "Somme", count: q.sum, share: "" }));
      summary.addRow(sanitizeRow({ question: q.label, item: "Moyenne", count: q.average ?? "", share: "" }));
    } else if (q.kind === "texts") for (const t of q.texts) summary.addRow(sanitizeRow({ question: q.label, item: t, count: "", share: "" }));
    else summary.addRow(sanitizeRow({ question: q.label, item: "Réponses", count: q.answered, share: "" }));
  }

  const fileName = `${form.slug}-reponses.xlsx`;
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), fileName, count: responses.length };
}
