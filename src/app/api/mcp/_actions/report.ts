import { z } from "zod";
import { hasChurchPermission } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
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
 * Remplir le compte rendu d'un événement (spec 081, lot 3b) : `reports:edit` ou `events:manage`
 * dans l'église, comptes rendus activés. Les rubriques non fournies gardent leur valeur ; les
 * sections fournies remplacent celles du même département (ou du même libellé). Exécution par le
 * code de l'écran (`saveReport`).
 */

const NOT_ALLOWED = "Vous ne pouvez pas saisir de compte rendu pour cet événement dans Koinonia.";
const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const reportInput = z.object({
  eventId: z.string().min(1).max(40).optional().describe("Événement (lien de reports_get ou reports_recent) ; sinon le jour"),
  day: day.optional().describe("Jour de l'événement, AAAA-MM-JJ, si l'identifiant n'est pas connu"),
  speaker: text(200).describe("Orateur ; null pour effacer"),
  messageTitle: text(300).describe("Titre du message ; null pour effacer"),
  notes: text(5000).describe("Observations générales"),
  decisions: text(5000).describe("Décisions / actions"),
  sections: z
    .array(
      z.object({
        department: z.string().trim().min(1).max(100).describe("Nom du département (ex. Accueil, Sainte-Cène, Intégration)"),
        stats: z
          .record(z.string(), z.number().int().min(0).nullable())
          .optional()
          .describe("Accueil : hommes, femmes, enfants ; Sainte-Cène : supportsUtilises, supportsRestants ; Intégration : hommes, femmes, passage, convertis, voeux"),
        notes: text(2000).describe("Remarques du département"),
      })
    )
    .max(30)
    .optional(),
});

type ReportPayload = { eventId: string; data: ReportInput; fp: string };

const canWriteReport = (viewer: ActionContext["viewer"]) =>
  viewer.permissions.includes("reports:edit") || viewer.permissions.includes("events:manage");

async function allowed(ctx: ActionContext): Promise<boolean> {
  return (
    (await hasChurchPermission(ctx.session, "reports:edit", ctx.churchId)) ||
    (await hasChurchPermission(ctx.session, "events:manage", ctx.churchId))
  );
}

const eventSelect = { id: true, churchId: true, title: true, date: true, reportEnabled: true } as const;

/** L'événement visé, par identifiant ou par jour (un seul événement aux comptes rendus activés). */
async function findEvent(ctx: ActionContext, input: z.infer<typeof reportInput>) {
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

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Compte rendu complet à enregistrer : l'existant, complété ou remplacé par ce qui est fourni. */
async function merge(churchId: string, existing: Awaited<ReturnType<typeof currentReport>>["report"], input: z.infer<typeof reportInput>) {
  const keep = <T,>(value: T | undefined, before: T | null | undefined) => (value === undefined ? (before ?? null) : value);
  const sections: ReportInput["sections"] = (existing?.sections ?? []).map((s) => ({
    departmentId: s.departmentId,
    label: s.label,
    position: s.position,
    stats: (s.stats as Record<string, number | null> | null) ?? null,
    notes: s.notes,
  }));
  const unknown: string[] = [];
  if (input.sections?.length) {
    const departments = await prisma.department.findMany({ where: { ministry: { churchId } }, select: { id: true, name: true } });
    for (const s of input.sections) {
      const idx = sections.findIndex((x) => norm(x.label) === norm(s.department));
      const dept = departments.find((d) => norm(d.name) === norm(s.department));
      if (idx < 0 && !dept) {
        unknown.push(s.department);
        continue;
      }
      const before = idx >= 0 ? sections[idx] : null;
      const next = {
        departmentId: before?.departmentId ?? dept!.id,
        label: before?.label ?? dept!.name,
        position: before?.position ?? sections.length,
        stats: s.stats === undefined ? (before?.stats ?? null) : s.stats,
        notes: s.notes === undefined ? (before?.notes ?? null) : s.notes,
      };
      if (idx >= 0) sections[idx] = next;
      else sections.push(next);
    }
  }
  const data: ReportInput = {
    speaker: keep(input.speaker, existing?.speaker),
    messageTitle: keep(input.messageTitle, existing?.messageTitle),
    notes: keep(input.notes, existing?.notes),
    decisions: keep(input.decisions, existing?.decisions),
    sections,
  };
  return { data, unknown };
}

const show = (v: string | null | undefined) => (v ? `« ${v.length > 200 ? `${v.slice(0, 200)}…` : v} »` : "vide");
const statsLine = (stats: Record<string, number | null> | null | undefined) =>
  stats ? Object.entries(stats).map(([k, v]) => `${k} ${v ?? "—"}`).join(", ") : "sans chiffres";

export async function previewReport(input: z.infer<typeof reportInput>, ctx: ActionContext): Promise<ActionResult> {
  if (!(await allowed(ctx))) return refusal(NOT_ALLOWED);
  const found = await findEvent(ctx, input);
  if (!found.event) return refusal(found.error!);
  const event = found.event;
  if (!event.reportEnabled) return refusal("Les comptes rendus ne sont pas activés pour cet événement.");

  const { report, fp } = await currentReport(event.id);
  const { data, unknown } = await merge(ctx.churchId, report, input);
  if (unknown.length > 0) return refusal(`Département inconnu dans cette église : ${unknown.join(", ")}.`);

  const lines = [`Compte rendu — ${formatDay(event.date)} · ${event.title.trim()}${report ? " (remplace l'existant pour les rubriques fournies)" : " (nouveau)"}`];
  const field = (label: string, key: "speaker" | "messageTitle" | "notes" | "decisions") => {
    if (input[key] === undefined) return;
    lines.push(`- ${label} : ${show(data[key])}${report ? ` (avant : ${show(report[key])})` : ""}`);
  };
  field("Orateur", "speaker");
  field("Message", "messageTitle");
  for (const s of input.sections ?? []) {
    const after = data.sections.find((x) => norm(x.label) === norm(s.department));
    const before = report?.sections.find((x) => norm(x.label) === norm(s.department));
    lines.push(
      `- ${after?.label ?? s.department} : ${statsLine(after?.stats)}${after?.notes ? ` · ${show(after.notes)}` : ""}` +
        (before ? ` (avant : ${statsLine(before.stats as Record<string, number | null> | null)}${before.notes ? ` · ${show(before.notes)}` : ""})` : "")
    );
  }
  field("Observations générales", "notes");
  field("Décisions / actions", "decisions");
  if (lines.length === 1) return refusal("Rien à saisir : indiquez au moins une rubrique.");

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
    name: "fill_report_preview",
    action: "fill_report",
    kind: "preview",
    description:
      "Prépare la saisie du compte rendu d'un événement : orateur, titre du message, statistiques et remarques par département, observations, décisions. Les rubriques non fournies ne changent pas. N'enregistre rien : chaque rubrique et ce qu'elle remplace, et un jeton. Lisez d'abord l'existant avec reports_get. Montrez le résumé et attendez l'accord explicite de la personne avant fill_report_confirm.",
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
