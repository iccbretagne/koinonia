import { z } from "zod";
import { getUserDepartmentScope, hasChurchPermission, requireDepartmentAccess } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import {
  PLANNED_STATUSES,
  assertEventDepartment,
  assignEventTasks,
  findNotServing,
  getPlanningAvailability,
  listEventTasks,
  listServingMembers,
  listPendingWithdrawalsForSlot,
  manualRelance,
} from "@/modules/planning";
import { savePlanning } from "@/app/api/events/[eventId]/departments/[deptId]/planning/_core";
import { duplicatePlanning } from "@/app/api/events/[eventId]/duplicate-planning/_core";
import { saveNotice } from "@/app/api/departments/[departmentId]/notices/_core";
import { formatDay, formatTime, startOfToday } from "../../assistant/_data/common";
import {
  CHANGED,
  EXPIRED,
  byKey,
  byText,
  confirmInput,
  fingerprint,
  hasPermission,
  previewText,
  refusal,
  type ActionContext,
  type ActionResult,
  type McpActionDef,
} from "./common";

/**
 * Actions de planning des responsables (spec 081, lot 3a) : lectures qui donnent les
 * identifiants, puis remplir, recopier, relancer, publier des consignes. Même droit que la
 * grille (`planning:edit` + périmètre de départements), revérifié à chaque appel ; exécution par
 * le code de l'écran (`_core.ts`). Jamais de coordonnée d'un STAR.
 */

const id = z.string().min(1).max(40);
const OUT_OF_SCOPE = "Cet événement ou ce département n'est pas dans votre périmètre de planning.";
const STATUS_LABEL: Record<string, string> = {
  EN_SERVICE: "En service",
  EN_SERVICE_DEBRIEF: "En service (débrief)",
  REMPLACANT: "Remplaçant",
  INDISPONIBLE: "Indisponible",
};
const STATE_LABEL: Record<string, string> = {
  AVAILABLE: "disponible",
  IF_NEEDED: "si besoin",
  UNAVAILABLE: "pas disponible",
  NO_RESPONSE: "sans réponse",
  NOT_ASKED: "disponibilité non demandée",
};
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 60;

const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`;
const canEdit = hasPermission("planning:edit");
const canViewDepartment = hasPermission("planning:department");

/** Événement et département de l'église de la connexion, dans le périmètre de planning du compte. */
async function loadSlot(ctx: ActionContext, eventId: string, departmentId: string, permission = "planning:edit") {
  if (!(await hasChurchPermission(ctx.session, permission, ctx.churchId))) return null;
  const [event, department] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { id: true, churchId: true, title: true, date: true, planningDeadline: true } }),
    prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true, ministry: { select: { churchId: true } } } }),
  ]);
  if (event?.churchId !== ctx.churchId || department?.ministry.churchId !== ctx.churchId) return null;
  try {
    requireDepartmentAccess(ctx.session, ctx.churchId, departmentId);
  } catch {
    return null;
  }
  return { event, department };
}

/** Grille actuelle du département pour l'événement : statut par STAR. */
async function currentGrid(eventId: string, departmentId: string): Promise<Map<string, string | null>> {
  const rows = await prisma.planning.findMany({
    where: { eventDepartment: { eventId, departmentId } },
    select: { memberId: true, status: true },
  });
  return new Map(rows.map((r) => [r.memberId, r.status]));
}

/** Date limite passée : seuls Admin, Secrétaire et Super Admin modifient encore (règle de la grille). */
function deadlineBlocks(ctx: ActionContext, planningDeadline: Date | null): boolean {
  if (!planningDeadline || Date.now() <= planningDeadline.getTime()) return false;
  if (ctx.session.user.isSuperAdmin) return false;
  return !ctx.session.user.churchRoles.some(
    (r) => r.churchId === ctx.churchId && ["SUPER_ADMIN", "ADMIN", "SECRETARY"].includes(r.role)
  );
}

/** Ce que la grille dit d'un STAR, en une ligne lisible. */
function gridNote(av: { state: string; source: string; busyElsewhere: string[] } | undefined): string {
  if (!av) return "";
  const parts = [av.state === "UNAVAILABLE" && av.source === "period" ? "absent (absence déclarée)" : STATE_LABEL[av.state] ?? av.state];
  if (av.busyElsewhere.length > 0) parts.push(`déjà en service ce jour-là en ${av.busyElsewhere.join(", ")}`);
  return parts.join(", ");
}

const isWarning = (av: { state: string; busyElsewhere: string[] } | undefined) =>
  !!av && (av.state === "UNAVAILABLE" || av.busyElsewhere.length > 0);

// ─── Lectures ────────────────────────────────────────────────────────────────

export const eventsToStaffInput = z.object({
  days: z.number().int().min(1).max(90).optional().describe("Horizon en jours à partir d'aujourd'hui (31 par défaut)"),
});

export async function eventsToStaff(input: z.infer<typeof eventsToStaffInput>, ctx: ActionContext): Promise<ActionResult> {
  if (!(await hasChurchPermission(ctx.session, "planning:edit", ctx.churchId))) return refusal(OUT_OF_SCOPE);
  const scope = getUserDepartmentScope(ctx.session, ctx.churchId);
  const from = startOfToday();
  const to = new Date(from.getTime() + (input.days ?? 31) * DAY_MS);
  const deptFilter = scope.scoped ? { departmentId: { in: scope.departmentIds } } : {};
  const events = await prisma.event.findMany({
    where: { churchId: ctx.churchId, isRecurrenceParent: false, date: { gte: from, lt: to }, eventDepts: { some: deptFilter } },
    select: {
      id: true,
      title: true,
      date: true,
      planningDeadline: true,
      eventDepts: {
        where: deptFilter,
        select: {
          departmentId: true,
          department: { select: { name: true, _count: { select: { memberDepts: true } } } },
          plannings: { where: { status: { in: [...PLANNED_STATUSES] } }, select: { id: true } },
        },
      },
    },
    orderBy: { date: "asc" },
    take: 60,
  });
  const lines = events.map(
    (e) =>
      `- ${formatDay(e.date)} ${formatTime(e.date)} · ${e.title.trim()} [eventId ${e.id}] : ` +
      e.eventDepts.map((d) => `${d.department.name} ${d.plannings.length}/${d.department._count.memberDepts} [departmentId ${d.departmentId}]`).join(" ; ")
  );
  return {
    text: events.length > 0 ? `Événements à planifier (en service / membres du département)\n${lines.join("\n")}` : "Aucun événement à planifier dans votre périmètre sur cette période.",
    structured: {
      events: events.map((e) => ({
        eventId: e.id,
        title: e.title.trim(),
        date: e.date.toISOString(),
        planningDeadline: e.planningDeadline?.toISOString() ?? null,
        departments: e.eventDepts.map((d) => ({ departmentId: d.departmentId, name: d.department.name, planned: d.plannings.length, members: d.department._count.memberDepts })),
      })),
    },
  };
}

export const candidatesInput = z.object({ eventId: id, departmentId: id });

export async function planningCandidates(input: z.infer<typeof candidatesInput>, ctx: ActionContext): Promise<ActionResult> {
  const slot = await loadSlot(ctx, input.eventId, input.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  const members = await prisma.memberDepartment.findMany({
    where: { departmentId: input.departmentId },
    select: { member: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { member: { lastName: "asc" } },
  });
  const memberIds = members.map((m) => m.member.id);
  const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS);
  const [av, grid, withdrawals, history] = await Promise.all([
    getPlanningAvailability(ctx.churchId, slot.event, input.departmentId, memberIds),
    currentGrid(input.eventId, input.departmentId),
    listPendingWithdrawalsForSlot(input.eventId, input.departmentId),
    prisma.planning.findMany({
      where: {
        memberId: { in: memberIds },
        status: { in: [...PLANNED_STATUSES] },
        eventDepartment: { event: { churchId: ctx.churchId, date: { gte: since, lt: new Date() } } },
      },
      select: { memberId: true },
    }),
  ]);
  const served = new Map<string, number>();
  for (const h of history) served.set(h.memberId, (served.get(h.memberId) ?? 0) + 1);
  const withdrawn = new Set(withdrawals.map((w) => w.memberId));

  const rows = members.map(({ member }) => {
    const a = av.members.get(member.id);
    return {
      memberId: member.id,
      name: fullName(member),
      status: grid.get(member.id) ?? null,
      availability: a?.state ?? null,
      absent: a?.state === "UNAVAILABLE" && a.source === "period",
      busyElsewhere: a?.busyElsewhere ?? [],
      pendingWithdrawal: withdrawn.has(member.id),
      servicesLast60Days: served.get(member.id) ?? 0,
    };
  });
  const lines = rows.map(
    (r) =>
      `- ${r.name} [memberId ${r.memberId}] : ${gridNote(av.members.get(r.memberId)) || "—"}` +
      `${r.status ? ` · actuellement ${STATUS_LABEL[r.status] ?? r.status}` : ""}` +
      `${r.pendingWithdrawal ? " · désistement en attente" : ""} · ${r.servicesLast60Days} service(s) sur ${HISTORY_DAYS} jours`
  );
  return {
    text:
      `${slot.department.name} — ${formatDay(slot.event.date)} ${formatTime(slot.event.date)} · ${slot.event.title.trim()}\n` +
      `${lines.join("\n") || "Aucun membre dans ce département."}\n` +
      "Koinonia ne connaît ni les compétences ni l'effectif nécessaire : demandez-les au responsable avant de proposer un planning.",
    structured: { eventId: input.eventId, departmentId: input.departmentId, candidates: rows },
  };
}

// ─── Remplir le planning ─────────────────────────────────────────────────────

const plannedStatus = z.enum(["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"]).nullable();

export const fillPlanningInput = z.object({
  eventId: id,
  departmentId: id,
  plannings: z
    .array(z.object({ memberId: id, status: plannedStatus.describe("EN_SERVICE, EN_SERVICE_DEBRIEF (un seul), REMPLACANT, ou null pour retirer") }))
    .min(1)
    .max(100)
    .describe("STAR à placer (identifiants de planning_candidates) ; les autres membres ne changent pas"),
});

type FillPayload = { eventId: string; departmentId: string; plannings: { memberId: string; status: string | null }[]; fp: string };

/** État relu à l'aperçu et à la confirmation : grille du département et disponibilités des STAR visés. */
async function fillState(churchId: string, event: { id: string; date: Date }, departmentId: string, memberIds: string[]) {
  const [grid, av] = await Promise.all([currentGrid(event.id, departmentId), getPlanningAvailability(churchId, event, departmentId, memberIds)]);
  const availability = memberIds.map((m) => {
    const a = av.members.get(m);
    return [m, a?.state ?? null, a?.source ?? null, a?.busyElsewhere ?? []];
  });
  return { grid, av, fp: fingerprint({ grid: [...grid.entries()].sort(byKey), availability }) };
}

export async function previewFillPlanning(input: z.infer<typeof fillPlanningInput>, ctx: ActionContext): Promise<ActionResult> {
  const slot = await loadSlot(ctx, input.eventId, input.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  if (deadlineBlocks(ctx, slot.event.planningDeadline)) return refusal("La date limite de planification est dépassée.");
  if (input.plannings.filter((p) => p.status === "EN_SERVICE_DEBRIEF").length > 1) return refusal("Un seul STAR peut être « en service (débrief) ».");
  const ids = [...new Set(input.plannings.map((p) => p.memberId))];
  if (ids.length !== input.plannings.length) return refusal("Un même STAR apparaît deux fois.");
  const members = await prisma.member.findMany({
    where: { id: { in: ids }, departments: { some: { departmentId: input.departmentId } } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (members.length !== ids.length) return refusal("Un ou plusieurs STAR n'appartiennent pas à ce département : utilisez les identifiants de planning_candidates.");
  const names = new Map(members.map((m) => [m.id, fullName(m)]));

  const state = await fillState(ctx.churchId, slot.event, input.departmentId, ids);
  const changes = input.plannings.filter((p) => (state.grid.get(p.memberId) ?? null) !== p.status);
  if (changes.length === 0) return refusal("Ce planning est déjà celui de la grille : rien à changer.");

  const payload: FillPayload = { eventId: input.eventId, departmentId: input.departmentId, plannings: input.plannings, fp: state.fp };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "fill_planning", payload);
  const lines = [
    `${slot.department.name} — ${formatDay(slot.event.date)} ${formatTime(slot.event.date)} · ${slot.event.title.trim()}`,
    ...changes.map((p) => {
      const before = state.grid.get(p.memberId);
      const av = state.av.members.get(p.memberId);
      const warn = p.status !== null && isWarning(av) ? " ⚠" : "";
      return `- ${names.get(p.memberId)} : ${before ? `${STATUS_LABEL[before] ?? before} → ` : ""}${p.status ? STATUS_LABEL[p.status] : "retiré(e)"}${warn} (${gridNote(av) || "—"})`;
    }),
    "Les STAR concernés recevront le récapitulatif habituel de leurs changements de service.",
  ];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "fill_planning", changes: changes.length, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmFillPlanning(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "fill_planning", input.confirmation)) as FillPayload | null;
  if (!payload) return refusal(EXPIRED);
  const slot = await loadSlot(ctx, payload.eventId, payload.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  const state = await fillState(ctx.churchId, slot.event, payload.departmentId, payload.plannings.map((p) => p.memberId));
  if (state.fp !== payload.fp) return refusal(CHANGED);
  try {
    await savePlanning(
      ctx.session,
      ctx.churchId,
      payload.eventId,
      payload.departmentId,
      payload.plannings as Parameters<typeof savePlanning>[4],
      { via: "mcp" }
    );
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  const link = `${publicOrigin()}/dashboard`;
  return {
    text: `Planning enregistré pour ${slot.department.name}.\nVoir dans Koinonia : ${link}`,
    structured: { done: true, action: "fill_planning", link },
  };
}

// ─── Recopier un planning ────────────────────────────────────────────────────

export const copyPlanningInput = z.object({
  sourceEventId: id.describe("Événement dont on reprend le planning"),
  targetEventId: id.describe("Événement à planifier"),
});

type CopyPayload = { sourceEventId: string; targetEventId: string; fp: string };

async function copyPlan(ctx: ActionContext, sourceEventId: string, targetEventId: string) {
  const scope = getUserDepartmentScope(ctx.session, ctx.churchId);
  const deptFilter = scope.scoped ? { departmentId: { in: scope.departmentIds } } : {};
  const [source, target] = await Promise.all(
    [sourceEventId, targetEventId].map((eventId) =>
      prisma.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          churchId: true,
          title: true,
          date: true,
          planningDeadline: true,
          eventDepts: {
            where: deptFilter,
            select: {
              departmentId: true,
              department: { select: { name: true } },
              plannings: { select: { memberId: true, status: true, member: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      })
    )
  );
  if (source?.churchId !== ctx.churchId || target?.churchId !== ctx.churchId) return null;
  const targetDepts = new Map(target.eventDepts.map((d) => [d.departmentId, d]));
  const shared = source.eventDepts.filter((d) => targetDepts.has(d.departmentId) && d.plannings.length > 0);
  const fp = fingerprint({
    source: shared.map((d) => [d.departmentId, d.plannings.map((p) => [p.memberId, p.status]).sort(byKey)]),
    target: shared.map((d) => [d.departmentId, targetDepts.get(d.departmentId)!.plannings.map((p) => [p.memberId, p.status]).sort(byKey)]),
  });
  return { source, target, shared, fp };
}

export async function previewCopyPlanning(input: z.infer<typeof copyPlanningInput>, ctx: ActionContext): Promise<ActionResult> {
  if (!(await hasChurchPermission(ctx.session, "planning:edit", ctx.churchId))) return refusal(OUT_OF_SCOPE);
  if (input.sourceEventId === input.targetEventId) return refusal("L'événement source et l'événement cible doivent être différents.");
  const plan = await copyPlan(ctx, input.sourceEventId, input.targetEventId);
  if (!plan) return refusal(OUT_OF_SCOPE);
  if (deadlineBlocks(ctx, plan.target.planningDeadline)) return refusal("La date limite de planification de l'événement cible est dépassée.");
  if (plan.shared.length === 0) return refusal("Aucun département de votre périmètre n'a de planning à recopier entre ces deux événements.");

  const lines = [`De ${formatDay(plan.source.date)} · ${plan.source.title.trim()} vers ${formatDay(plan.target.date)} · ${plan.target.title.trim()} :`];
  for (const d of plan.shared) {
    const av = await getPlanningAvailability(ctx.churchId, plan.target, d.departmentId, d.plannings.map((p) => p.memberId));
    lines.push(
      `- ${d.department.name} : ` +
        d.plannings
          .map((p) => {
            const a = av.members.get(p.memberId);
            return `${fullName(p.member)}${p.status ? ` (${STATUS_LABEL[p.status] ?? p.status})` : ""}${isWarning(a) ? ` ⚠ ${gridNote(a)}` : ""}`;
          })
          .join(", ")
    );
  }
  lines.push("Les statuts déjà saisis sur l'événement cible pour ces STAR sont remplacés ; les STAR concernés recevront le récapitulatif habituel.");
  const payload: CopyPayload = { sourceEventId: input.sourceEventId, targetEventId: input.targetEventId, fp: plan.fp };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "copy_planning", payload);
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "copy_planning", departments: plan.shared.length, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmCopyPlanning(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "copy_planning", input.confirmation)) as CopyPayload | null;
  if (!payload) return refusal(EXPIRED);
  if (!(await hasChurchPermission(ctx.session, "planning:edit", ctx.churchId))) return refusal(OUT_OF_SCOPE);
  const plan = await copyPlan(ctx, payload.sourceEventId, payload.targetEventId);
  if (!plan) return refusal(OUT_OF_SCOPE);
  if (plan.fp !== payload.fp) return refusal(CHANGED);
  try {
    const result = await duplicatePlanning(ctx.session, ctx.churchId, payload.sourceEventId, payload.targetEventId);
    await logAudit({
      userId: ctx.session.user.id!,
      churchId: ctx.churchId,
      action: "UPDATE",
      entityType: "Planning",
      entityId: payload.targetEventId,
      details: { sourceEventId: payload.sourceEventId, copied: result.copied, departments: result.departments, via: "mcp" },
    });
    const link = `${publicOrigin()}/dashboard`;
    return {
      text: `Planning recopié : ${result.copied} affectation(s) dans ${result.departments} département(s).\nVoir dans Koinonia : ${link}`,
      structured: { done: true, action: "copy_planning", ...result, link },
    };
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
}

// ─── Relancer les sans-réponse ───────────────────────────────────────────────

export const remindInput = z.object({ eventId: id, departmentId: id });

type RemindPayload = { eventId: string; departmentId: string };

export async function previewRemind(input: z.infer<typeof remindInput>, ctx: ActionContext): Promise<ActionResult> {
  const slot = await loadSlot(ctx, input.eventId, input.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  if (slot.event.date.getTime() < Date.now()) return refusal("Cet événement est déjà passé.");
  const ask = await prisma.availabilityAsk.findUnique({
    where: { eventId_departmentId: { eventId: input.eventId, departmentId: input.departmentId } },
    select: { manualRelanceAt: true },
  });
  if (ask?.manualRelanceAt && ask.manualRelanceAt.toDateString() === new Date().toDateString()) {
    return refusal("Les sans-réponse de ce département ont déjà été relancés aujourd'hui.");
  }
  const members = await prisma.memberDepartment.findMany({ where: { departmentId: input.departmentId }, select: { memberId: true } });
  const av = await getPlanningAvailability(ctx.churchId, slot.event, input.departmentId, members.map((m) => m.memberId));
  if (av.counts.noResponse === 0) return refusal("Tous les STAR de ce département ont déjà répondu.");

  const payload: RemindPayload = { eventId: input.eventId, departmentId: input.departmentId };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "remind_unanswered", payload);
  const lines = [
    `${slot.department.name} — ${formatDay(slot.event.date)} · ${slot.event.title.trim()}`,
    `Jusqu'à ${av.counts.noResponse} STAR sans réponse recevront un rappel (ceux qui ont un compte et n'ont pas déjà été relancés aujourd'hui).`,
  ];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "remind_unanswered", unanswered: av.counts.noResponse, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmRemind(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "remind_unanswered", input.confirmation)) as RemindPayload | null;
  if (!payload) return refusal(EXPIRED);
  const slot = await loadSlot(ctx, payload.eventId, payload.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  try {
    await assertEventDepartment(payload.eventId, payload.departmentId);
    const { notified } = await manualRelance({ eventId: payload.eventId, departmentId: payload.departmentId });
    await logAudit({
      userId: ctx.session.user.id!,
      churchId: ctx.churchId,
      action: "UPDATE",
      entityType: "AvailabilityAsk",
      entityId: `${payload.eventId}:${payload.departmentId}`,
      details: { relance: true, notified, via: "mcp" },
    });
    return { text: `Rappel envoyé à ${notified} STAR.`, structured: { done: true, action: "remind_unanswered", notified } };
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
}

// ─── Publier des consignes ───────────────────────────────────────────────────

export const noticeInput = z.object({
  eventId: id,
  departmentId: id,
  content: z.string().trim().min(1).max(2000).describe("Texte de la consigne (arrivée, tenue, organisation…)"),
});

type NoticePayload = { eventId: string; departmentId: string; content: string; fp: string };

async function existingNotice(eventId: string, departmentId: string) {
  const notice = await prisma.departmentNotice.findUnique({
    where: { departmentId_eventId: { departmentId, eventId } },
    select: { content: true, updatedAt: true },
  });
  return { notice, fp: fingerprint({ content: notice?.content ?? null, updatedAt: notice?.updatedAt ?? null }) };
}

export async function previewNotice(input: z.infer<typeof noticeInput>, ctx: ActionContext): Promise<ActionResult> {
  const slot = await loadSlot(ctx, input.eventId, input.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  const { notice, fp } = await existingNotice(input.eventId, input.departmentId);
  const payload: NoticePayload = { eventId: input.eventId, departmentId: input.departmentId, content: input.content, fp };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "publish_notice", payload);
  const lines = [
    `Consigne ${slot.department.name} — ${formatDay(slot.event.date)} · ${slot.event.title.trim()} :`,
    input.content,
    notice ? `Elle remplace la consigne actuelle : « ${notice.content} »` : "Aucune consigne n'existe encore pour ce département.",
  ];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "publish_notice", replaces: notice?.content ?? null, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmNotice(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "publish_notice", input.confirmation)) as NoticePayload | null;
  if (!payload) return refusal(EXPIRED);
  const slot = await loadSlot(ctx, payload.eventId, payload.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  if ((await existingNotice(payload.eventId, payload.departmentId)).fp !== payload.fp) return refusal(CHANGED);
  try {
    await saveNotice(ctx.session, ctx.churchId, payload.departmentId, payload.eventId, payload.content, { via: "mcp" });
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  return { text: `Consigne publiée pour ${slot.department.name}.`, structured: { done: true, action: "publish_notice" } };
}

// ─── Tâches du département ───────────────────────────────────────────────────

const NOT_LINKED = "Ce département n'est pas lié à cet événement.";

export const tasksInput = z.object({ eventId: id, departmentId: id });

/** Tâches du département et STAR en service pour l'événement (null si le département n'est pas lié). */
async function loadTasks(eventId: string, departmentId: string) {
  const eventDept = await prisma.eventDepartment.findUnique({
    where: { eventId_departmentId: { eventId, departmentId } },
    select: { id: true },
  });
  if (!eventDept) return null;
  const [tasks, serving] = await Promise.all([listEventTasks(eventId, departmentId), listServingMembers(eventDept.id)]);
  return { eventDepartmentId: eventDept.id, tasks, serving };
}

export async function planningTasks(input: z.infer<typeof tasksInput>, ctx: ActionContext): Promise<ActionResult> {
  const slot = await loadSlot(ctx, input.eventId, input.departmentId, "planning:department");
  if (!slot) return refusal(OUT_OF_SCOPE);
  const data = await loadTasks(input.eventId, input.departmentId);
  if (!data) return refusal(NOT_LINKED);
  const taskLines = data.tasks.map(
    (t) =>
      `- ${t.name} [taskId ${t.id}]${t.description ? ` — ${t.description}` : ""} : ` +
      (t.assignments.length > 0 ? t.assignments.map((a) => `${fullName(a.member)} [memberId ${a.member.id}]`).join(", ") : "personne")
  );
  const servingLines = data.serving.map(
    (p) => `- ${fullName(p.member)} [memberId ${p.memberId}]${p.status === "EN_SERVICE_DEBRIEF" ? " (débrief)" : ""}`
  );
  return {
    text:
      `${slot.department.name} — ${formatDay(slot.event.date)} ${formatTime(slot.event.date)} · ${slot.event.title.trim()}\n` +
      `Tâches et STAR affectés :\n${taskLines.join("\n") || "Aucune tâche définie pour ce département."}\n` +
      `STAR en service, qu'on peut affecter :\n${servingLines.join("\n") || "Aucun STAR en service : remplissez d'abord le planning."}`,
    structured: {
      eventId: input.eventId,
      departmentId: input.departmentId,
      tasks: data.tasks.map((t) => ({
        taskId: t.id,
        name: t.name,
        description: t.description,
        assigned: t.assignments.map((a) => ({ memberId: a.member.id, name: fullName(a.member) })),
      })),
      serving: data.serving.map((p) => ({ memberId: p.memberId, name: fullName(p.member), status: p.status })),
    },
  };
}

export const assignTasksInput = z.object({
  eventId: id,
  departmentId: id,
  assignments: z
    .array(
      z.object({
        taskId: id,
        memberIds: z.array(id).max(50).describe("STAR en service à affecter (identifiants de planning_tasks) ; liste vide = plus personne sur cette tâche"),
      })
    )
    .min(1)
    .max(30)
    .describe("Tâches à affecter : leurs affectations sont remplacées, les autres tâches ne changent pas"),
});

type AssignPayload = { eventId: string; departmentId: string; assignments: { taskId: string; memberIds: string[] }[]; fp: string };

/** Empreinte des affectations des tâches citées et des STAR en service. */
const tasksFingerprint = (data: NonNullable<Awaited<ReturnType<typeof loadTasks>>>, taskIds: string[]) =>
  fingerprint({
    tasks: data.tasks
      .filter((t) => taskIds.includes(t.id))
      .map((t) => [t.id, t.assignments.map((a) => a.member.id).sort(byText)])
      .sort(byKey),
    serving: data.serving.map((p) => p.memberId).sort(byText),
  });

/** Vérifie la demande sur l'état lu ; renvoie un refus nommé, ou null si tout est valable. */
async function checkAssignments(input: z.infer<typeof assignTasksInput>, data: NonNullable<Awaited<ReturnType<typeof loadTasks>>>): Promise<string | null> {
  const taskIds = input.assignments.map((a) => a.taskId);
  if (new Set(taskIds).size !== taskIds.length) return "Une même tâche apparaît deux fois.";
  const known = new Set(data.tasks.map((t) => t.id));
  const unknown = taskIds.filter((t) => !known.has(t));
  if (unknown.length > 0) return `Tâche introuvable dans ce département [taskId ${unknown.join(", ")}] : utilisez les identifiants de planning_tasks.`;
  for (const a of input.assignments) {
    if (new Set(a.memberIds).size !== a.memberIds.length) return "Un même STAR apparaît deux fois sur une tâche.";
  }
  const memberIds = [...new Set(input.assignments.flatMap((a) => a.memberIds))];
  const notServing = await findNotServing(data.eventDepartmentId, memberIds);
  if (notServing.length === 0) return null;
  const members = await prisma.member.findMany({ where: { id: { in: notServing } }, select: { id: true, firstName: true, lastName: true } });
  const names = new Map(members.map((m) => [m.id, fullName(m)]));
  const list = notServing.map((m) => (names.has(m) ? `${names.get(m)} [memberId ${m}]` : `STAR inconnu [memberId ${m}]`)).join(", ");
  return `${notServing.length > 1 ? "Ces STAR ne sont pas" : "Ce STAR n'est pas"} en service pour cet événement : ${list}. Mettez-les d'abord en service (fill_planning) ou choisissez parmi les STAR en service de planning_tasks.`;
}

export async function previewAssignTasks(input: z.infer<typeof assignTasksInput>, ctx: ActionContext): Promise<ActionResult> {
  const slot = await loadSlot(ctx, input.eventId, input.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  const data = await loadTasks(input.eventId, input.departmentId);
  if (!data) return refusal(NOT_LINKED);
  const problem = await checkAssignments(input, data);
  if (problem) return refusal(problem);

  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const names = new Map(data.serving.map((p) => [p.memberId, fullName(p.member)]));
  const changes = input.assignments.filter((a) => {
    const current = tasks.get(a.taskId)!.assignments.map((x) => x.member.id).sort(byText);
    return current.join(",") !== [...a.memberIds].sort(byText).join(",");
  });
  if (changes.length === 0) return refusal("Ces affectations sont déjà celles de Koinonia : rien à changer.");

  const payload: AssignPayload = {
    eventId: input.eventId,
    departmentId: input.departmentId,
    assignments: changes,
    fp: tasksFingerprint(data, changes.map((a) => a.taskId)),
  };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "assign_tasks", payload);
  const lines = [
    `${slot.department.name} — ${formatDay(slot.event.date)} ${formatTime(slot.event.date)} · ${slot.event.title.trim()}`,
    ...changes.map((a) => {
      const task = tasks.get(a.taskId)!;
      const before = task.assignments.map((x) => fullName(x.member)).join(", ") || "personne";
      const after = a.memberIds.map((m) => names.get(m) ?? m).join(", ") || "personne";
      return `- ${task.name} : ${before} → ${after}`;
    }),
    "Les autres tâches du département ne changent pas.",
  ];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "assign_tasks", changes: changes.length, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmAssignTasks(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "assign_tasks", input.confirmation)) as AssignPayload | null;
  if (!payload) return refusal(EXPIRED);
  const slot = await loadSlot(ctx, payload.eventId, payload.departmentId);
  if (!slot) return refusal(OUT_OF_SCOPE);
  const data = await loadTasks(payload.eventId, payload.departmentId);
  if (!data) return refusal(NOT_LINKED);
  if (tasksFingerprint(data, payload.assignments.map((a) => a.taskId)) !== payload.fp) return refusal(CHANGED);
  try {
    await assignEventTasks(payload.eventId, payload.departmentId, payload.assignments);
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  for (const a of payload.assignments) {
    await logAudit({
      userId: ctx.session.user.id!,
      churchId: ctx.churchId,
      action: "UPDATE",
      entityType: "TaskAssignment",
      entityId: a.taskId,
      details: { eventId: payload.eventId, departmentId: payload.departmentId, memberIds: a.memberIds, via: "mcp" },
    });
  }
  const link = `${publicOrigin()}/dashboard`;
  return {
    text: `Tâches affectées pour ${slot.department.name} (${payload.assignments.length} tâche(s)).\nVoir dans Koinonia : ${link}`,
    structured: { done: true, action: "assign_tasks", tasks: payload.assignments.length, link },
  };
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

const ASK_FIRST = "Montrez le résumé et attendez l'accord explicite de la personne avant";

export const PLANNING_ACTIONS: McpActionDef[] = [
  {
    name: "planning_eventsToStaff",
    action: "planning_eventsToStaff",
    kind: "read",
    description: "Événements à venir de votre périmètre de planning, avec leurs départements, le nombre de STAR en service et les identifiants (eventId, departmentId) à passer aux actions de planning.",
    input: eventsToStaffInput,
    available: canEdit,
    run: eventsToStaff as McpActionDef["run"],
  },
  {
    name: "planning_candidates",
    action: "planning_candidates",
    kind: "read",
    description:
      "STAR d'un département pour un événement, avec ce qu'en dit la grille : disponibilité, absence déclarée, déjà en service ailleurs ce jour-là, désistement en attente, statut actuel, nombre de services sur 60 jours, et leurs identifiants (memberId). Sans coordonnée.",
    input: candidatesInput,
    available: canEdit,
    run: planningCandidates as McpActionDef["run"],
  },
  {
    name: "fill_planning_preview",
    action: "fill_planning",
    kind: "preview",
    description: `Prépare le planning d'un département pour un événement : STAR à mettre en service (identifiants de planning_candidates). N'enregistre rien : résumé des changements avec les alertes de la grille, et un jeton. Demandez d'abord au responsable l'effectif et les compétences nécessaires. ${ASK_FIRST} fill_planning_confirm.`,
    input: fillPlanningInput,
    available: canEdit,
    run: previewFillPlanning as McpActionDef["run"],
  },
  {
    name: "fill_planning_confirm",
    action: "fill_planning",
    kind: "confirm",
    description: "Enregistre le planning préparé par fill_planning_preview, avec son jeton. Refusé si la grille, une absence ou une disponibilité a changé depuis l'aperçu.",
    input: confirmInput,
    available: canEdit,
    run: confirmFillPlanning as McpActionDef["run"],
  },
  {
    name: "copy_planning_preview",
    action: "copy_planning",
    kind: "preview",
    description: `Prépare la recopie du planning d'un événement sur un autre, pour les départements de votre périmètre. N'enregistre rien : ce qui sera recopié, STAR devenus absents ou pas disponibles signalés, et un jeton. ${ASK_FIRST} copy_planning_confirm.`,
    input: copyPlanningInput,
    available: canEdit,
    run: previewCopyPlanning as McpActionDef["run"],
  },
  {
    name: "copy_planning_confirm",
    action: "copy_planning",
    kind: "confirm",
    description: "Recopie le planning préparé par copy_planning_preview, avec son jeton. Refusé si l'un des deux plannings a changé depuis l'aperçu.",
    input: confirmInput,
    available: canEdit,
    run: confirmCopyPlanning as McpActionDef["run"],
  },
  {
    name: "remind_unanswered_preview",
    action: "remind_unanswered",
    kind: "preview",
    description: `Prépare la relance des STAR d'un département qui n'ont pas répondu à la demande de disponibilité d'un événement (une fois par jour). N'envoie rien : nombre de STAR concernés, sans nom, et un jeton. ${ASK_FIRST} remind_unanswered_confirm.`,
    input: remindInput,
    available: canEdit,
    run: previewRemind as McpActionDef["run"],
  },
  {
    name: "remind_unanswered_confirm",
    action: "remind_unanswered",
    kind: "confirm",
    description: "Envoie la relance préparée par remind_unanswered_preview, avec son jeton.",
    input: confirmInput,
    available: canEdit,
    run: confirmRemind as McpActionDef["run"],
  },
  {
    name: "publish_notice_preview",
    action: "publish_notice",
    kind: "preview",
    description: `Prépare la consigne d'un département pour un événement (arrivée, tenue, organisation). N'enregistre rien : le texte, la consigne qu'il remplace, et un jeton. ${ASK_FIRST} publish_notice_confirm.`,
    input: noticeInput,
    available: canEdit,
    run: previewNotice as McpActionDef["run"],
  },
  {
    name: "publish_notice_confirm",
    action: "publish_notice",
    kind: "confirm",
    description: "Publie la consigne préparée par publish_notice_preview, avec son jeton. Refusé si la consigne a été modifiée depuis l'aperçu.",
    input: confirmInput,
    available: canEdit,
    run: confirmNotice as McpActionDef["run"],
  },
  {
    name: "planning_tasks",
    action: "planning_tasks",
    kind: "read",
    description:
      "Tâches d'un département pour un événement (taskId, nom, description) avec les STAR déjà affectés, et les STAR en service qu'on peut y affecter (memberId). Sans coordonnée.",
    input: tasksInput,
    available: canViewDepartment,
    run: planningTasks as McpActionDef["run"],
  },
  {
    name: "assign_tasks_preview",
    action: "assign_tasks",
    kind: "preview",
    description: `Prépare l'affectation de STAR en service aux tâches d'un département pour un événement (identifiants de planning_tasks). Remplace les affectations des tâches citées ; les autres ne changent pas. N'enregistre rien : résumé avant → après et un jeton. ${ASK_FIRST} assign_tasks_confirm.`,
    input: assignTasksInput,
    available: canEdit,
    run: previewAssignTasks as McpActionDef["run"],
  },
  {
    name: "assign_tasks_confirm",
    action: "assign_tasks",
    kind: "confirm",
    description: "Enregistre les affectations préparées par assign_tasks_preview, avec son jeton. Refusé si les affectations ou les STAR en service ont changé depuis l'aperçu.",
    input: confirmInput,
    available: canEdit,
    run: confirmAssignTasks as McpActionDef["run"],
  },
];
