import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { sanitizeRow } from "@/lib/excel";
import {
  ASSIGNMENT_STATUS_LABELS,
  FILE_REQUEST_STATUS_LABELS,
  QUALIFIER_LABELS,
  ITEM_TYPE_LABELS,
  type DefinitionItem,
  type FileRequestStatus,
  type Qualifier,
  type ScalarItem,
} from "../schemas";
import { completeness, type StoredAnswer } from "./definition";
import { campaignChecks, storedItems, storedRules } from "./campaigns";

/**
 * Exports d'une campagne (spec 090, plan § Exports) : classeur XLSX (Réponses, Groupes, États,
 * Contrôles, Fichiers) ou CSV (feuille Réponses, `;`, UTF-8 avec BOM). Une ligne par code et par
 * destinataire ; les nombres restent des nombres. Toute chaîne passe par `sanitizeRow` (injection
 * de formules). Jamais le contenu d'un fichier, seulement ses métadonnées.
 */

export interface ExportOptions {
  format: "xlsx" | "csv";
  formKey?: string;
}

export interface ExportResult {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

type Cell = string | number | Date | null;

/** Valeur lisible : nombre resté nombre, Oui/Non, libellés des choix. */
export function displayCell(item: DefinitionItem | ScalarItem, value: unknown): Cell {
  if (value === null || value === undefined) return null;
  switch (item.type) {
    case "integer":
    case "decimal":
      return typeof value === "number" ? value : null;
    case "yesno":
      return value === true ? "Oui" : value === false ? "Non" : null;
    case "single":
      return item.choices.find((c) => c.key === value)?.label ?? String(value);
    case "multiple":
      return Array.isArray(value) ? value.map((k) => item.choices.find((c) => c.key === k)?.label ?? String(k)).join(", ") : null;
    case "group": {
      if ((value as { none?: unknown }).none === true) return item.noneLabel ?? "Aucune ligne";
      const rows = (value as { rows?: unknown[] }).rows;
      return Array.isArray(rows) ? `${rows.length} ligne(s)` : null;
    }
    case "file_request": {
      const status = (value as { status?: FileRequestStatus }).status;
      return status ? FILE_REQUEST_STATUS_LABELS[status] : null;
    }
    default:
      return typeof value === "string" ? value : JSON.stringify(value);
  }
}

const raw = (value: unknown) => (value === null || value === undefined ? null : typeof value === "string" ? value : JSON.stringify(value));

const RESPONSE_COLUMNS = [
  { header: "Campagne", key: "campaign", width: 24 },
  { header: "Questionnaire", key: "form", width: 22 },
  { header: "Destinataire", key: "assignment", width: 22 },
  { header: "Section", key: "section", width: 24 },
  { header: "Code", key: "code", width: 10 },
  { header: "Code F9", key: "reportCode", width: 10 },
  { header: "Libellé", key: "label", width: 50 },
  { header: "Type", key: "type", width: 16 },
  { header: "Valeur", key: "value", width: 18 },
  { header: "Valeur brute", key: "raw", width: 18 },
  { header: "Qualificatif", key: "qualifier", width: 14 },
  { header: "Précision", key: "note", width: 40 },
  { header: "Statut", key: "status", width: 18 },
  { header: "Soumis le", key: "submittedAt", width: 18 },
  { header: "Modifié le", key: "updatedAt", width: 18 },
] as const;

async function load(campaignId: string, formKey?: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      key: true,
      title: true,
      dueAt: true,
      rules: true,
      forms: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          key: true,
          title: true,
          definition: true,
          assignments: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              label: true,
              status: true,
              dueAt: true,
              submittedAt: true,
              submittedByName: true,
              validatedAt: true,
              pastoralValidated: true,
              answers: { select: { code: true, value: true, qualifier: true, note: true, updatedAt: true } },
              files: {
                orderBy: { uploadedAt: "asc" },
                select: { requestCode: true, name: true, mime: true, size: true, uploadedAt: true, uploadedByName: true, sha256: true },
              },
            },
          },
        },
      },
    },
  });
  if (!campaign) throw new ApiError(404, "Campagne introuvable");
  if (formKey && !campaign.forms.some((f) => f.key === formKey)) throw new ApiError(404, "Questionnaire introuvable");
  return campaign;
}

type Loaded = Awaited<ReturnType<typeof load>>;

function sectionsOf(definition: unknown): { title: string; items: DefinitionItem[] }[] {
  const items = storedItems(definition);
  const sections = (definition as { sections?: { title: string; items: { code: string }[] }[] } | null)?.sections ?? [];
  const byCode = new Map(items.map((i) => [i.code, i]));
  return sections.map((s) => ({ title: s.title, items: s.items.map((i) => byCode.get(i.code)).filter((i): i is DefinitionItem => !!i) }));
}

function responseRows(campaign: Loaded, formKey?: string): Record<string, Cell>[] {
  const rows: Record<string, Cell>[] = [];
  for (const form of campaign.forms) {
    if (formKey && form.key !== formKey) continue;
    const sections = sectionsOf(form.definition);
    for (const a of form.assignments) {
      const answers = new Map(a.answers.map((x) => [x.code, x]));
      for (const section of sections) {
        for (const item of section.items) {
          const answer = answers.get(item.code);
          rows.push({
            campaign: campaign.title,
            form: form.title,
            assignment: a.label,
            section: section.title,
            code: item.code,
            reportCode: item.reportCode ?? item.code,
            label: item.label,
            type: ITEM_TYPE_LABELS[item.type],
            value: displayCell(item, answer?.value),
            raw: raw(answer?.value),
            qualifier: answer ? QUALIFIER_LABELS[answer.qualifier as Qualifier] : null,
            note: answer?.note ?? null,
            status: ASSIGNMENT_STATUS_LABELS[a.status],
            submittedAt: a.submittedAt,
            updatedAt: answer?.updatedAt ?? null,
          });
        }
      }
    }
  }
  return rows;
}

// ── CSV ────────────────────────────────────────────────────────────────────────────────────────

const parisStamp = (d: Date) =>
  d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function csvCell(value: Cell): string {
  if (value === null) return "";
  // Nombres à la française (virgule décimale) : le séparateur `;` vise un tableur réglé en français.
  const text = value instanceof Date ? parisStamp(value) : typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: readonly { header: string; key: string }[], rows: readonly Record<string, Cell>[]): Buffer {
  const lines = [columns.map((c) => csvCell(c.header)).join(";")];
  for (const row of rows) {
    const safe = sanitizeRow(row) as Record<string, Cell>;
    lines.push(columns.map((c) => csvCell(safe[c.key] ?? null)).join(";"));
  }
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}

// ── Export ─────────────────────────────────────────────────────────────────────────────────────

export async function exportCampaign(campaignId: string, options: ExportOptions): Promise<ExportResult> {
  const campaign = await load(campaignId, options.formKey);
  const base = `${campaign.key}${options.formKey ? `-${options.formKey}` : ""}`;
  const responses = responseRows(campaign, options.formKey);

  if (options.format === "csv") {
    return { buffer: toCsv(RESPONSE_COLUMNS, responses), fileName: `${base}-reponses.csv`, contentType: "text/csv; charset=utf-8" };
  }

  const forms = campaign.forms.filter((f) => !options.formKey || f.key === options.formKey);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const add = (name: string, columns: readonly { header: string; key: string; width: number }[], rows: readonly Record<string, unknown>[]) => {
    const sheet = wb.addWorksheet(name);
    sheet.columns = columns.map((c) => ({ ...c }));
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) sheet.addRow(sanitizeRow(row));
    return sheet;
  };

  add("Réponses", RESPONSE_COLUMNS, responses);

  // Groupes répétables : une ligne par champ de chaque ligne saisie.
  const groupRows: Record<string, unknown>[] = [];
  for (const form of forms) {
    const items = storedItems(form.definition);
    for (const a of form.assignments) {
      for (const item of items) {
        if (item.type !== "group") continue;
        const rows = (a.answers.find((x) => x.code === item.code)?.value as { rows?: Record<string, unknown>[] } | null)?.rows;
        if (!Array.isArray(rows)) continue;
        rows.forEach((row, i) => {
          for (const field of item.fields) {
            groupRows.push({ assignment: a.label, group: item.code, row: i + 1, field: field.code, value: displayCell(field, row[field.code]) });
          }
        });
      }
    }
  }
  add(
    "Groupes",
    [
      { header: "Destinataire", key: "assignment", width: 22 },
      { header: "Code du groupe", key: "group", width: 14 },
      { header: "N° de ligne", key: "row", width: 10 },
      { header: "Code du champ", key: "field", width: 14 },
      { header: "Valeur", key: "value", width: 30 },
    ],
    groupRows
  );

  // États par destinataire.
  const stateRows: Record<string, unknown>[] = [];
  for (const form of forms) {
    const items = storedItems(form.definition);
    for (const a of form.assignments) {
      const answers = new Map<string, StoredAnswer>(a.answers.map((x) => [x.code, { value: x.value, qualifier: x.qualifier as Qualifier, note: x.note }]));
      const files = new Map<string, number>();
      for (const f of a.files) files.set(f.requestCode, (files.get(f.requestCode) ?? 0) + 1);
      const c = completeness(items, answers, files);
      stateRows.push({
        form: form.title,
        assignment: a.label,
        status: ASSIGNMENT_STATUS_LABELS[a.status],
        missing: c.missing.length,
        estimates: c.estimates.length,
        toResearch: c.toResearch.length,
        filesExpected: c.filesExpected,
        filesReceived: c.filesReceived,
        dueAt: a.dueAt ?? campaign.dueAt,
        submittedAt: a.submittedAt,
        submittedBy: a.submittedByName,
        validated: a.validatedAt ? "Oui" : "Non",
        pastoral: a.pastoralValidated ? "Oui" : "Non",
      });
    }
  }
  add(
    "États",
    [
      { header: "Questionnaire", key: "form", width: 22 },
      { header: "Destinataire", key: "assignment", width: 22 },
      { header: "État", key: "status", width: 18 },
      { header: "Obligatoires manquantes", key: "missing", width: 12 },
      { header: "Estimations", key: "estimates", width: 12 },
      { header: "À rechercher", key: "toResearch", width: 12 },
      { header: "Fichiers attendus", key: "filesExpected", width: 12 },
      { header: "Fichiers reçus", key: "filesReceived", width: 12 },
      { header: "Échéance", key: "dueAt", width: 18 },
      { header: "Soumis le", key: "submittedAt", width: 18 },
      { header: "Soumis par", key: "submittedBy", width: 22 },
      { header: "Validé", key: "validated", width: 10 },
      { header: "Validation Pasteure", key: "pastoral", width: 12 },
    ],
    stateRows
  );

  // Contrôles : sur toute la campagne (les règles croisées ont besoin de tous les questionnaires).
  const checks = campaignChecks(
    storedRules(campaign.rules),
    campaign.forms.map((f) => ({ key: f.key, items: storedItems(f.definition), assignments: f.assignments })),
    campaign.forms.flatMap((f) =>
      f.assignments.flatMap((a) => a.answers.map((x) => ({ assignmentId: a.id, code: x.code, value: x.value, qualifier: x.qualifier as Qualifier, note: x.note })))
    )
  ).filter((c) => !options.formKey || c.formKey === options.formKey || c.scope === "cross");
  const RESULT = { ok: "Conforme", violated: "Incohérence", skipped: "Non évaluée" } as const;
  add(
    "Contrôles",
    [
      { header: "Règle", key: "rule", width: 26 },
      { header: "Message", key: "message", width: 50 },
      { header: "Destinataire", key: "assignment", width: 22 },
      { header: "Résultat", key: "result", width: 14 },
      { header: "Valeurs", key: "values", width: 40 },
    ],
    checks.map((c) => ({
      rule: c.key,
      message: c.message,
      assignment: c.assignmentLabel ?? "Toute la campagne",
      result: RESULT[c.result],
      values: Object.entries(c.values)
        .map(([code, v]) => `${code} = ${v === null ? "—" : typeof v === "boolean" ? (v ? "Oui" : "Non") : String(v)}`)
        .join(", "),
    }))
  );

  add(
    "Fichiers",
    [
      { header: "Destinataire", key: "assignment", width: 22 },
      { header: "Demande", key: "request", width: 12 },
      { header: "Nom", key: "name", width: 36 },
      { header: "Type", key: "mime", width: 24 },
      { header: "Taille (octets)", key: "size", width: 14 },
      { header: "Déposé le", key: "uploadedAt", width: 18 },
      { header: "Déposé par", key: "uploadedBy", width: 22 },
      { header: "SHA-256", key: "sha256", width: 66 },
    ],
    forms.flatMap((f) =>
      f.assignments.flatMap((a) =>
        a.files.map((file) => ({
          assignment: a.label,
          request: file.requestCode,
          name: file.name,
          mime: file.mime,
          size: file.size,
          uploadedAt: file.uploadedAt,
          uploadedBy: file.uploadedByName,
          sha256: file.sha256,
        }))
      )
    )
  );

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    fileName: `${base}-reponses.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
