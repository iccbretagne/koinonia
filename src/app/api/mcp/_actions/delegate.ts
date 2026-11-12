import { z } from "zod";
import { getUserDepartmentScope, hasChurchPermission } from "@/lib/auth";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import { findWithdrawableServicesForAbsence, getMemberScope, listMemberAvailability } from "@/modules/planning";
import { declareAbsenceFor } from "@/app/api/absences/_core";
import { answerFor, resolveAvailabilityTarget } from "@/app/api/availability/_core";
import { formatDay, formatTime, isOnDay, today } from "../../assistant/_data/common";
import {
  EXPIRED,
  confirmInput,
  day,
  dayStart,
  previewText,
  refusal,
  type ActionContext,
  type ActionResult,
  type McpActionDef,
} from "./common";
import { ANSWERS } from "./personal";

/**
 * Actions d'un responsable pour un STAR de son périmètre (spec 081, lot 3b) : déclarer une
 * absence (`absences:manage`) et répondre à une demande de disponibilité (`planning:edit`), par
 * le code des écrans (`declareAbsenceFor`, `answerFor`), qui revérifie permission et périmètre à
 * la confirmation. Jamais de coordonnée du STAR.
 */

const id = z.string().min(1).max(40);
const OUT_OF_SCOPE = "Ce STAR n'est pas dans votre périmètre, ou vous n'avez pas ce droit dans Koinonia.";
const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`;

/** Contrôle de permission à partir de la session reconstruite (même règle que `requireChurchPermission`). */
const requireAs = (ctx: ActionContext) => async (permission: string) => {
  if (!(await hasChurchPermission(ctx.session, permission, ctx.churchId))) throw new Error("FORBIDDEN");
  return ctx.session;
};

/** Erreur métier ou refus de droit ⇒ message, sans détail interne. */
function asRefusal(error: unknown): ActionResult {
  if (error instanceof ApiError) return refusal(error.message);
  if (error instanceof Error && error.message === "FORBIDDEN") return refusal(OUT_OF_SCOPE);
  throw error;
}

const canDelegate = (viewer: ActionContext["viewer"]) =>
  viewer.permissions.includes("absences:manage") || viewer.permissions.includes("planning:edit");

async function memberName(memberId: string) {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { firstName: true, lastName: true } });
  return m ? fullName(m) : "ce STAR";
}

// ─── Trouver un STAR de son périmètre ────────────────────────────────────────

export const starsInput = z.object({
  query: z.string().trim().min(2).max(60).describe("Prénom ou nom, même partiel"),
});

export async function starsInScope(input: z.infer<typeof starsInput>, ctx: ActionContext): Promise<ActionResult> {
  const allowed =
    (await hasChurchPermission(ctx.session, "absences:manage", ctx.churchId)) ||
    (await hasChurchPermission(ctx.session, "planning:edit", ctx.churchId));
  if (!allowed) return refusal(OUT_OF_SCOPE);
  const scope = getUserDepartmentScope(ctx.session, ctx.churchId);
  const words = input.query.split(/\s+/).filter(Boolean);
  const members = await prisma.member.findMany({
    where: {
      departments: { some: scope.scoped ? { departmentId: { in: scope.departmentIds } } : { department: { ministry: { churchId: ctx.churchId } } } },
      AND: words.map((w) => ({ OR: [{ firstName: { contains: w } }, { lastName: { contains: w } }] })),
    },
    select: { id: true, firstName: true, lastName: true, departments: { select: { department: { select: { name: true } } } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20,
  });
  return {
    text:
      members.length > 0
        ? members.map((m) => `- ${fullName(m)} [memberId ${m.id}] : ${m.departments.map((d) => d.department.name).join(", ")}`).join("\n")
        : "Aucun STAR de votre périmètre ne correspond.",
    structured: { stars: members.map((m) => ({ memberId: m.id, name: fullName(m), departments: m.departments.map((d) => d.department.name) })) },
  };
}

// ─── Absence pour un STAR ────────────────────────────────────────────────────

export const absenceForInput = z.object({
  memberId: id.describe("STAR concerné (identifiant de stars_inScope ou planning_candidates)"),
  startDate: day.describe("Premier jour d'absence, AAAA-MM-JJ"),
  endDate: day.describe("Dernier jour d'absence, AAAA-MM-JJ"),
  reason: z.string().trim().max(200).optional().describe("Motif facultatif, visible des responsables"),
});

type AbsenceForPayload = { memberId: string; startDate: string; endDate: string; reason: string | null };

export async function previewAbsenceFor(input: z.infer<typeof absenceForInput>, ctx: ActionContext): Promise<ActionResult> {
  if (input.endDate < input.startDate) return refusal("La date de fin précède la date de début.");
  if (input.endDate < today()) return refusal("Cette période est déjà passée.");
  // Même règle que l'écran : absences:manage et STAR dans le périmètre du déclarant.
  if (!(await hasChurchPermission(ctx.session, "absences:manage", ctx.churchId))) return refusal(OUT_OF_SCOPE);
  const scope = await getMemberScope(input.memberId);
  if (scope?.churchId !== ctx.churchId) return refusal(OUT_OF_SCOPE);
  const declarer = getUserDepartmentScope(ctx.session, ctx.churchId);
  if (declarer.scoped && !scope.departmentIds.some((d) => declarer.departmentIds.includes(d))) return refusal(OUT_OF_SCOPE);

  const name = await memberName(input.memberId);
  const services = await findWithdrawableServicesForAbsence(undefined, {
    memberId: input.memberId,
    churchId: ctx.churchId,
    targeting: { kind: "PERIOD", startDate: dayStart(input.startDate), endDate: dayStart(input.endDate), allDepartments: true },
  });
  const payload: AbsenceForPayload = { memberId: input.memberId, startDate: input.startDate, endDate: input.endDate, reason: input.reason || null };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "declare_unavailability_for", payload);
  const period =
    input.startDate === input.endDate
      ? `le ${formatDay(dayStart(input.startDate))}`
      : `du ${formatDay(dayStart(input.startDate))} au ${formatDay(dayStart(input.endDate))}`;
  const lines = [
    `Absence saisie pour ${name}, ${period}, tous ses départements.`,
    input.reason ? `Motif : ${input.reason}` : "Sans motif.",
    services.length > 0
      ? `${name} sera retiré(e) de ${services.length} service(s) :\n${services.map((s) => `- ${formatDay(s.date)} · ${s.title} (${s.departmentName})`).join("\n")}`
      : "Aucun service planifié n'est touché.",
    "Ses responsables seront prévenus.",
  ];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "declare_unavailability_for", member: name, withdrawals: services.length, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmAbsenceFor(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "declare_unavailability_for", input.confirmation)) as AbsenceForPayload | null;
  if (!payload) return refusal(EXPIRED);
  try {
    // Le code de l'écran revérifie la permission et le périmètre au moment d'écrire.
    const absence = await declareAbsenceFor(
      ctx.session,
      {
        churchId: ctx.churchId,
        memberId: payload.memberId,
        kind: "PERIOD",
        startDate: dayStart(payload.startDate).toISOString(),
        endDate: dayStart(payload.endDate).toISOString(),
        eventIds: [],
        allDepartments: true,
        departmentIds: [],
        reason: payload.reason,
      },
      requireAs(ctx),
      { via: "mcp" }
    );
    return {
      text: `Absence enregistrée pour ${await memberName(payload.memberId)}. Ses responsables sont prévenus.\nVoir dans Koinonia : ${publicOrigin()}/absences`,
      structured: { done: true, action: "declare_unavailability_for", absenceId: absence.id },
    };
  } catch (error) {
    return asRefusal(error);
  }
}

// ─── Répondre pour un STAR ───────────────────────────────────────────────────

export const answerForInput = z.object({
  memberId: id.describe("STAR concerné"),
  day: day.describe("Jour de l'événement, AAAA-MM-JJ"),
  answer: z.enum(["AVAILABLE", "IF_NEEDED", "UNAVAILABLE"]).describe("AVAILABLE, IF_NEEDED ou UNAVAILABLE"),
});

type AnswerForPayload = { memberId: string; answer: keyof typeof ANSWERS; eventIds: string[] };

export async function previewAnswerFor(input: z.infer<typeof answerForInput>, ctx: ActionContext): Promise<ActionResult> {
  if (input.day < today()) return refusal("Ce jour est déjà passé.");
  let target;
  try {
    target = await resolveAvailabilityTarget(ctx.session, ctx.churchId, input.memberId, requireAs(ctx));
  } catch (error) {
    return asRefusal(error);
  }
  const monthKey = input.day.slice(0, 7);
  const data = await listMemberAvailability(target.memberId, ctx.churchId, new Date(`${monthKey}-01T00:00:00.000Z`));
  const allowed = target.allowedDepartmentIds;
  const events = data.events
    .filter((e) => isOnDay(e.date, input.day))
    .map((e) => ({ ...e, departments: allowed ? e.departments.filter((d) => allowed.includes(d.departmentId)) : e.departments }))
    .filter((e) => e.departments.length > 0);
  if (events.length === 0) return refusal("Aucun événement de ses départements de votre périmètre ce jour-là.");

  const name = await memberName(target.memberId);
  const payload: AnswerForPayload = { memberId: target.memberId, answer: input.answer, eventIds: events.map((e) => e.id) };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "answer_service_for", payload);
  const leaving = input.answer === "UNAVAILABLE" ? events.flatMap((e) => e.plannedIn.filter((p) => !allowed || allowed.includes(p.departmentId))) : [];
  const lines = [
    `Réponse « ${ANSWERS[input.answer]} » saisie pour ${name}${target.isSelf ? "" : " (la grille indiquera qu'elle a été saisie par un tiers)"} :`,
    ...events.map((e) => `- ${formatDay(e.date)} ${formatTime(e.date)} · ${e.title} (${e.departments.map((d) => d.name).join(", ")})`),
    ...leaving.map((p) =>
      p.withdrawable
        ? `${name} est planifié(e) en ${p.departmentName} : cette réponse vaut désistement, ses responsables seront prévenus.`
        : `${name} est planifié(e) en ${p.departmentName} après la date limite : il ou elle reste planifié(e), son responsable sera prévenu.`
    ),
  ];
  return {
    text: previewText(lines, token),
    structured: { done: false, action: "answer_service_for", member: name, events: events.length, confirmation: token, expiresAt: expiresAt.toISOString() },
  };
}

export async function confirmAnswerFor(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "answer_service_for", input.confirmation)) as AnswerForPayload | null;
  if (!payload) return refusal(EXPIRED);
  try {
    const result = await answerFor(
      ctx.session,
      ctx.churchId,
      payload.memberId,
      payload.eventIds.map((eventId) => ({ eventId, answer: payload.answer })),
      requireAs(ctx)
    );
    await logAudit({
      userId: ctx.session.user.id!,
      churchId: ctx.churchId,
      action: "UPDATE",
      entityType: "AvailabilityResponse",
      entityId: payload.memberId,
      details: { eventIds: payload.eventIds, answer: payload.answer, withdrawals: result.withdrawals, forMemberId: payload.memberId, via: "mcp" },
    });
    return {
      text: `Réponse « ${ANSWERS[payload.answer]} » enregistrée pour ${await memberName(payload.memberId)}.${result.withdrawals > 0 ? ` ${result.withdrawals} désistement(s), responsables prévenus.` : ""}`,
      structured: { done: true, action: "answer_service_for", updated: result.updated, withdrawals: result.withdrawals },
    };
  } catch (error) {
    return asRefusal(error);
  }
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

const ASK_FIRST = "Montrez le résumé et attendez l'accord explicite de la personne avant";
const can = (permission: string) => (viewer: ActionContext["viewer"]) => viewer.permissions.includes(permission);

export const DELEGATE_ACTIONS: McpActionDef[] = [
  {
    name: "stars_inScope",
    action: "stars_inScope",
    kind: "read",
    description: "Cherche un STAR de votre périmètre par son nom : nom, départements et identifiant (memberId) à passer aux actions pour un STAR. Sans coordonnée.",
    input: starsInput,
    available: canDelegate,
    run: starsInScope as McpActionDef["run"],
  },
  {
    name: "declare_unavailability_for_preview",
    action: "declare_unavailability_for",
    kind: "preview",
    description: `Prépare la déclaration d'une absence pour un STAR de votre périmètre (tous ses départements). N'enregistre rien : résumé (services quittés, responsables prévenus) et jeton. ${ASK_FIRST} declare_unavailability_for_confirm.`,
    input: absenceForInput,
    available: can("absences:manage"),
    run: previewAbsenceFor as McpActionDef["run"],
  },
  {
    name: "declare_unavailability_for_confirm",
    action: "declare_unavailability_for",
    kind: "confirm",
    description: "Enregistre l'absence préparée par declare_unavailability_for_preview, avec son jeton. Refusé si le STAR n'est plus dans votre périmètre.",
    input: confirmInput,
    available: can("absences:manage"),
    run: confirmAbsenceFor as McpActionDef["run"],
  },
  {
    name: "answer_service_for_preview",
    action: "answer_service_for",
    kind: "preview",
    description: `Prépare la réponse d'un STAR de votre périmètre à une demande de disponibilité, pour les événements d'un jour et les départements de votre périmètre. N'enregistre rien : résumé (dont un éventuel désistement) et jeton. ${ASK_FIRST} answer_service_for_confirm.`,
    input: answerForInput,
    available: can("planning:edit"),
    run: previewAnswerFor as McpActionDef["run"],
  },
  {
    name: "answer_service_for_confirm",
    action: "answer_service_for",
    kind: "confirm",
    description: "Enregistre la réponse préparée par answer_service_for_preview, avec son jeton. Refusé si le STAR n'est plus dans votre périmètre.",
    input: confirmInput,
    available: can("planning:edit"),
    run: confirmAnswerFor as McpActionDef["run"],
  },
];
