import { z } from "zod";
import { hasChurchPermission } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { normalizeSectionLabel as norm, reportSectionType, reportStatFields } from "@/lib/report-stats";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import { saveReport, type ReportInput } from "@/app/api/events/[eventId]/report/_core";
import { dayWindow, formatDay, isOnDay } from "../../assistant/_data/common";
import {
  CHANGED,
  EXPIRED,
  confirmInput,
  day,
  fingerprint,
  previewText,
  refusal,
  type ActionContext,
  type ActionResult,
  type McpActionDef,
} from "./common";

/**
 * Remplir le compte rendu d'un événement (spec 081, lot 3) comme l'écran de saisie :
 * `reports:edit` ou `events:manage` dans l'église, comptes rendus activés. Sections des
 * départements de l'événement proposées d'office (comme l'écran pour un nouveau compte rendu),
 * sections libres, renommage, suppression, statistiques par type de section (Accueil,
 * Sainte-Cène, Intégration, Navette — `@/lib/report-stats`) si l'événement les active. Les
 * rubriques et statistiques non fournies gardent leur valeur. Exécution par le code de l'écran
 * (`saveReport`).
 */

const NOT_ALLOWED = "Vous ne pouvez pas saisir de compte rendu pour cet événement dans Koinonia.";
const text = (max: number) => z.string().trim().max(max).nullable().optional();

const eventRef = {
  eventId: z.string().min(1).max(40).optional().describe("Événement (lien de reports_get, reports_recent ou planning_missingReports) ; sinon le jour"),
  day: day.optional().describe("Jour de l'événement, AAAA-MM-JJ, si l'identifiant n'est pas connu"),
};

export const reportFormInput = z.object(eventRef);

export const reportInput = z.object({
  ...eventRef,
  speaker: text(200).describe("Orateur ; null pour effacer"),
  messageTitle: text(300).describe("Titre du message ; null pour effacer"),
  notes: text(5000).describe("Observations générales ; null pour effacer"),
  decisions: text(5000).describe("Décisions / actions ; null pour effacer"),
  sections: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(100).describe("Libellé d'une section existante (voir report_form) ou nom d'un département de l'église"),
        free: z.boolean().optional().describe("true : crée une section libre (sans département) si aucune section ni département ne porte ce libellé"),
        rename: z.string().trim().min(1).max(100).optional().describe("Nouveau libellé de la section"),
        remove: z.boolean().optional().describe("true : supprime la section"),
        stats: z
          .record(z.string(), z.number().int().min(0).max(100_000).nullable())
          .optional()
          .describe("Statistiques à saisir (clés données par report_form) ; null efface une valeur ; les clés non fournies sont gardées"),
        notes: text(2000).describe("Observations de la section ; null pour effacer"),
      })
    )
    .max(30)
    .optional(),
});

type ReportPayload = { eventId: string; data: ReportInput; fp: string };
type Section = ReportInput["sections"][number] & { stats: Record<string, number | null> | null };

const canWriteReport = (viewer: ActionContext["viewer"]) =>
  viewer.permissions.includes("reports:edit") || viewer.permissions.includes("events:manage");

async function allowed(ctx: ActionContext): Promise<boolean> {
  return (
    (await hasChurchPermission(ctx.session, "reports:edit", ctx.churchId)) ||
    (await hasChurchPermission(ctx.session, "events:manage", ctx.churchId))
  );
}

const eventSelect = { id: true, churchId: true, title: true, date: true, reportEnabled: true, statsEnabled: true } as const;

/** L'événement visé, par identifiant ou par jour (un seul événement aux comptes rendus activés). */
async function findEvent(ctx: ActionContext, input: { eventId?: string; day?: string }) {
  if (input.eventId) {
    const e = await prisma.event.findUnique({ where: { id: input.eventId }, select: eventSelect });
    return e?.churchId === ctx.churchId ? { event: e } : { error: "Événement introuvable." };
  }
  if (!input.day) return { error: "Indiquez l'événement (eventId) ou son jour (day)." };
  const { from, to } = dayWindow(input.day);
  const candidates = (
    await prisma.event.findMany({
      where: { churchId: ctx.churchId, reportEnabled: true, isRecurrenceParent: false, date: { gte: from, lt: to } },
      select: eventSelect,
    })
  ).filter((e) => isOnDay(e.date, input.day!));
  if (candidates.length === 1) return { event: candidates[0] };
  if (candidates.length === 0) return { error: "Aucun événement ouvert aux comptes rendus ce jour-là." };
  return { error: `Plusieurs événements ce jour-là, précisez eventId : ${candidates.map((e) => `${e.title.trim()} [eventId ${e.id}]`).join(" ; ")}` };
}

/** L'événement, s'il est permis au compte et ouvert aux comptes rendus ; sinon le refus. */
async function loadEvent(ctx: ActionContext, input: { eventId?: string; day?: string }) {
  if (!(await allowed(ctx))) return { error: NOT_ALLOWED };
  const found = await findEvent(ctx, input);
  if (!found.event) return { error: found.error! };
  if (!found.event.reportEnabled) return { error: "Les comptes rendus ne sont pas activés pour cet événement." };
  return { event: found.event };
}

async function currentReport(eventId: string) {
  const report = await prisma.eventReport.findUnique({
    where: { eventId },
    select: {
      speaker: true,
      messageTitle: true,
      notes: true,
      decisions: true,
      updatedAt: true,
      sections: { select: { departmentId: true, label: true, position: true, stats: true, notes: true }, orderBy: { position: "asc" } },
    },
  });
  return { report, fp: fingerprint(report) };
}

type Existing = Awaited<ReturnType<typeof currentReport>>["report"];

/**
 * Sections de départ : celles du compte rendu, ou, s'il n'existe pas encore, une section vide par
 * département de l'événement (même ordre que l'écran : ministère puis département).
 */
async function baseSections(eventId: string, existing: Existing): Promise<Section[]> {
  if (existing) {
    return existing.sections.map((s) => ({
      departmentId: s.departmentId,
      label: s.label,
      position: s.position,
      stats: (s.stats as Record<string, number | null> | null) ?? null,
      notes: s.notes,
    }));
  }
  const eventDepts = await prisma.eventDepartment.findMany({
    where: { eventId },
    select: { department: { select: { id: true, name: true } } },
    orderBy: [{ department: { ministry: { name: "asc" } } }, { department: { name: "asc" } }],
  });
  return eventDepts.map((ed, i) => ({ departmentId: ed.department.id, label: ed.department.name, position: i, stats: null, notes: null }));
}

/** Clés de statistiques refusées pour une section, ou null si elles sont toutes valables. */
function statsProblem(label: string, stats: Record<string, number | null>, statsEnabled: boolean): string | null {
  if (Object.keys(stats).length === 0) return null;
  if (!statsEnabled) return "Les statistiques ne sont pas activées pour cet événement : seules les observations se saisissent.";
  const fields = reportStatFields(label);
  if (!fields) return `La section « ${label} » n'a pas de statistiques (seules Accueil, Sainte-Cène, Intégration et Navette en ont) : mettez les chiffres dans ses observations.`;
  const keys = new Set(fields.map((f) => f.key));
  const unknown = Object.keys(stats).filter((k) => !keys.has(k));
  return unknown.length > 0
    ? `Statistique inconnue pour « ${label} » : ${unknown.join(", ")} (attendues : ${fields.map((f) => `${f.key} = ${f.label}`).join(", ")}).`
    : null;
}

/** Compte rendu complet à enregistrer : l'existant (ou les sections d'office), modifié par ce qui est fourni. */
async function merge(
  event: { id: string; churchId: string; statsEnabled: boolean },
  existing: Existing,
  input: z.infer<typeof reportInput>
): Promise<{ data: ReportInput; changes: string[] } | { error: string }> {
  const keep = <T,>(value: T | undefined, before: T | null | undefined) => (value === undefined ? (before ?? null) : value);
  const sections = await baseSections(event.id, existing);
  const changes: string[] = [];
  if (input.sections?.length) {
    const departments = await prisma.department.findMany({ where: { ministry: { churchId: event.churchId } }, select: { id: true, name: true } });
    for (const s of input.sections) {
      const idx = sections.findIndex((x) => norm(x.label) === norm(s.label));
      if (s.remove) {
        if (idx < 0) return { error: `Section introuvable : « ${s.label} ».` };
        changes.push(`- ${sections[idx].label} : section supprimée`);
        sections.splice(idx, 1);
        continue;
      }
      let section: Section;
      let created = false;
      if (idx >= 0) {
        section = { ...sections[idx] };
      } else {
        const dept = departments.find((d) => norm(d.name) === norm(s.label));
        if (!dept && !s.free) {
          return { error: `Ni section ni département « ${s.label} » dans ce compte rendu : utilisez un libellé de report_form, un département de l'église, ou free: true pour une section libre.` };
        }
        section = { departmentId: dept?.id ?? null, label: dept?.name ?? s.label, position: sections.length, stats: null, notes: null };
        created = true;
      }
      if (s.rename && norm(s.rename) !== norm(section.label)) {
        if (sections.some((x, i) => i !== idx && norm(x.label) === norm(s.rename!))) return { error: `Une section s'appelle déjà « ${s.rename} ».` };
        section.label = s.rename;
      }
      if (s.stats) {
        const problem = statsProblem(section.label, s.stats, event.statsEnabled);
        if (problem) return { error: problem };
        section.stats = { ...section.stats, ...s.stats };
      }
      if (s.notes !== undefined) section.notes = s.notes;

      const before = created ? null : sections[idx];
      if (created) sections.push(section);
      else sections[idx] = section;
      changes.push(sectionLine(section, before, created));
    }
  }
  const data: ReportInput = {
    speaker: keep(input.speaker, existing?.speaker),
    messageTitle: keep(input.messageTitle, existing?.messageTitle),
    notes: keep(input.notes, existing?.notes),
    decisions: keep(input.decisions, existing?.decisions),
    sections: sections.map((s, i) => ({ ...s, position: i })),
  };
  return { data, changes };
}

const show = (v: string | null | undefined) => (v ? `« ${v.length > 200 ? `${v.slice(0, 200)}…` : v} »` : "vide");

/** Statistiques lisibles, avec les totaux que l'écran calcule (Accueil, Navette). */
function statsText(label: string, stats: Record<string, number | null> | null | undefined): string {
  if (!stats || Object.keys(stats).length === 0) return "sans chiffres";
  const fields = reportStatFields(label);
  const name = (k: string) => fields?.find((f) => f.key === k)?.label ?? k;
  const parts = Object.entries(stats).map(([k, v]) => `${name(k)} ${v ?? "—"}`);
  const type = reportSectionType(label);
  if (type === "accueil" || type === "navette") {
    const adults = (stats.hommes ?? 0) + (stats.femmes ?? 0);
    parts.push(`total adultes ${adults}`, `total général ${adults + (stats.enfants ?? 0)}`);
  }
  return parts.join(", ");
}

function sectionLine(after: Section, before: Section | null, created: boolean): string {
  const describe = (s: Section) => `${statsText(s.label, s.stats)}${s.notes ? ` · ${show(s.notes)}` : ""}`;
  const head = before && before.label !== after.label ? `${before.label} → ${after.label}` : after.label;
  const origin = created ? (after.departmentId ? " (nouvelle section)" : " (nouvelle section libre)") : "";
  return `- ${head}${origin} : ${describe(after)}${before ? ` (avant : ${describe(before)})` : ""}`;
}

// ─── Lecture : la grille du compte rendu ─────────────────────────────────────

export async function reportForm(input: z.infer<typeof reportFormInput>, ctx: ActionContext): Promise<ActionResult> {
  const loaded = await loadEvent(ctx, input);
  if (!loaded.event) return refusal(loaded.error!);
  const event = loaded.event;
  const { report } = await currentReport(event.id);
  const sections = await baseSections(event.id, report);
  const lines = sections.map((s) => {
    const fields = event.statsEnabled ? reportStatFields(s.label) : null;
    const stats = fields ? fields.map((f) => `${f.key} (${f.label}) = ${s.stats?.[f.key] ?? "—"}`).join(", ") : "observations seulement";
    return `- ${s.label}${s.departmentId ? "" : " (section libre)"} : ${stats}${s.notes ? ` · observations ${show(s.notes)}` : ""}`;
  });
  return {
    text:
      `Compte rendu — ${formatDay(event.date)} · ${event.title.trim()} [eventId ${event.id}] ${report ? "(déjà saisi)" : "(pas encore saisi : sections des départements de l'événement)"}\n` +
      `Orateur : ${show(report?.speaker)} · Message : ${show(report?.messageTitle)}\n` +
      `Sections :\n${lines.join("\n") || "aucune"}\n` +
      `Observations générales : ${show(report?.notes)} · Décisions : ${show(report?.decisions)}\n` +
      (event.statsEnabled ? "Statistiques activées." : "Statistiques non activées pour cet événement : seules les observations se saisissent.") +
      " On peut ajouter un département de l'église ou une section libre, renommer ou supprimer une section.",
    structured: {
      eventId: event.id,
      exists: !!report,
      statsEnabled: event.statsEnabled,
      sections: sections.map((s) => ({
        label: s.label,
        free: !s.departmentId,
        statFields: event.statsEnabled ? (reportStatFields(s.label) ?? []) : [],
        stats: s.stats,
        notes: s.notes,
      })),
    },
  };
}

// ─── Saisie ──────────────────────────────────────────────────────────────────

export async function previewReport(input: z.infer<typeof reportInput>, ctx: ActionContext): Promise<ActionResult> {
  const loaded = await loadEvent(ctx, input);
  if (!loaded.event) return refusal(loaded.error!);
  const event = loaded.event;

  const { report, fp } = await currentReport(event.id);
  const merged = await merge(event, report, input);
  if ("error" in merged) return refusal(merged.error);
  const { data, changes } = merged;

  const lines = [`Compte rendu — ${formatDay(event.date)} · ${event.title.trim()}${report ? " (modifie l'existant pour les rubriques fournies)" : " (nouveau)"}`];
  const field = (label: string, key: "speaker" | "messageTitle" | "notes" | "decisions") => {
    if (input[key] === undefined) return;
    lines.push(`- ${label} : ${show(data[key])}${report ? ` (avant : ${show(report[key])})` : ""}`);
  };
  field("Orateur", "speaker");
  field("Message", "messageTitle");
  lines.push(...changes);
  field("Observations générales", "notes");
  field("Décisions / actions", "decisions");
  if (lines.length === 1) return refusal("Rien à saisir : indiquez au moins une rubrique.");
  if (!report && data.sections.length > 0) lines.push(`Sections enregistrées : ${data.sections.map((s) => s.label).join(", ")}.`);

  const payload: ReportPayload = { eventId: event.id, data, fp };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "fill_report", payload);
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "fill_report", eventId: event.id, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmReport(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "fill_report", input.confirmation)) as ReportPayload | null;
  if (!payload) return refusal(EXPIRED);
  if (!(await allowed(ctx))) return refusal(NOT_ALLOWED);
  const event = await prisma.event.findUnique({ where: { id: payload.eventId }, select: eventSelect });
  if (event?.churchId !== ctx.churchId) return refusal(NOT_ALLOWED);
  if ((await currentReport(payload.eventId)).fp !== payload.fp) return refusal(CHANGED);
  try {
    await saveReport(ctx.session, event, payload.data, { via: "mcp" });
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  const link = `${publicOrigin()}/admin/events/${payload.eventId}/report`;
  return { text: `Compte rendu enregistré.\nVoir dans Koinonia : ${link}`, structured: { done: true, action: "fill_report", link } };
}

export const REPORT_ACTIONS: McpActionDef[] = [
  {
    name: "report_form",
    action: "report_form",
    kind: "read",
    description:
      "Grille du compte rendu d'un événement, telle que l'écran de saisie la montre : orateur, message, sections (celles du compte rendu, sinon une par département de l'événement) avec leurs statistiques attendues (clé et libellé) et valeurs actuelles, observations, décisions, et si les statistiques sont activées. À lire avant fill_report_preview.",
    input: reportFormInput,
    available: canWriteReport,
    run: reportForm as McpActionDef["run"],
  },
  {
    name: "fill_report_preview",
    action: "fill_report",
    kind: "preview",
    description:
      "Prépare la saisie complète du compte rendu d'un événement : orateur, titre du message, observations, décisions ; par section, statistiques (clés de report_form, seulement si l'événement les active) et observations ; ajout d'un département ou d'une section libre (free: true), renommage, suppression. Les rubriques et statistiques non fournies ne changent pas. N'enregistre rien : chaque rubrique avant → après, totaux calculés, et un jeton. Montrez le résumé et attendez l'accord explicite de la personne avant fill_report_confirm.",
    input: reportInput,
    available: canWriteReport,
    run: previewReport as McpActionDef["run"],
  },
  {
    name: "fill_report_confirm",
    action: "fill_report",
    kind: "confirm",
    description: "Enregistre le compte rendu préparé par fill_report_preview, avec son jeton. Refusé si le compte rendu a été modifié depuis l'aperçu.",
    input: confirmInput,
    available: canWriteReport,
    run: confirmReport as McpActionDef["run"],
  },
];
