import type { Session } from "next-auth";
import { z } from "zod";
import type { AssistantViewer } from "@/core/assistant";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import {
  declareAbsence,
  findWithdrawableServicesForAbsence,
  listLinkedMemberIds,
  listMemberAvailability,
  saveResponses,
} from "@/modules/planning";
import { requestPrefillHref, requestPrefillSchema } from "@/app/(auth)/requests/prefill";
import { formatDay, formatTime, isOnDay, today } from "../assistant/_data/common";

/**
 * Actions du lot 2 (spec 081) : toujours en deux appels. `…_preview` vérifie, résume et fige ce
 * qui sera fait derrière un jeton de confirmation (5 min, usage unique, lié à la connexion et à
 * l'action) ; `…_confirm` exécute ce résumé figé, après revérification des droits, par les
 * services de l'application, et journalise « via l'assistant IA ». Seulement pour la fiche STAR
 * liée au compte : jamais pour un tiers.
 */

export interface ActionContext {
  session: Session;
  churchId: string;
  viewer: AssistantViewer;
  grantId: string;
}

export interface ActionResult {
  text: string;
  structured: Record<string, unknown>;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const unavailabilityInput = z.object({
  startDate: day.describe("Premier jour d'absence, AAAA-MM-JJ (heure de Paris)"),
  endDate: day.describe("Dernier jour d'absence, AAAA-MM-JJ ; égal à startDate pour un seul jour"),
  reason: z.string().trim().max(200).optional().describe("Motif facultatif, visible des responsables"),
});

export const ANSWERS = { AVAILABLE: "Disponible", IF_NEEDED: "Si besoin", UNAVAILABLE: "Pas disponible" } as const;
type Answer = keyof typeof ANSWERS;

export const serviceAnswerInput = z.object({
  day: day.describe("Jour de l'événement, AAAA-MM-JJ (heure de Paris)"),
  answer: z.enum(["AVAILABLE", "IF_NEEDED", "UNAVAILABLE"]).describe("AVAILABLE = disponible, IF_NEEDED = si besoin, UNAVAILABLE = pas disponible"),
});

export const confirmInput = z.object({
  confirmation: z.string().min(10).max(100).describe("Jeton renvoyé par l'aperçu, après l'accord explicite de la personne"),
});

const CONFIRM_HINT =
  "Montrez ce résumé à la personne et attendez son accord explicite avant d'appeler l'outil de confirmation avec ce jeton (valable 5 minutes).";

const refusal = (text: string): ActionResult => ({ text, structured: { done: false, reason: text } });

/** Fiche STAR liée au compte dans cette église ; une seule attendue, comme « Mes disponibilités ». */
async function ownMemberId(ctx: ActionContext): Promise<string | null> {
  const ids = await listLinkedMemberIds(ctx.session.user.id!, ctx.churchId);
  return ids[0] ?? null;
}

const NO_STAR = "Aucune fiche STAR n'est liée à votre compte dans cette église : cette action se fait par votre responsable.";
const EXPIRED = "Confirmation invalide ou expirée : refaites l'aperçu puis confirmez dans les 5 minutes.";

/** Bornes d'une période, telles que le formulaire de l'application les envoie (minuit UTC). */
const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);

// ─── Déclarer une absence ────────────────────────────────────────────────────

type UnavailabilityPayload = { memberId: string; startDate: string; endDate: string; reason: string | null };

export async function previewUnavailability(input: z.infer<typeof unavailabilityInput>, ctx: ActionContext): Promise<ActionResult> {
  const memberId = await ownMemberId(ctx);
  if (!memberId) return refusal(NO_STAR);
  if (input.endDate < input.startDate) return refusal("La date de fin précède la date de début.");
  if (input.endDate < today()) return refusal("Cette période est déjà passée.");

  const services = await findWithdrawableServicesForAbsence(undefined, {
    memberId,
    churchId: ctx.churchId,
    targeting: { kind: "PERIOD", startDate: dayStart(input.startDate), endDate: dayStart(input.endDate), allDepartments: true },
  });
  const payload: UnavailabilityPayload = { memberId, startDate: input.startDate, endDate: input.endDate, reason: input.reason || null };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "declare_unavailability", payload);

  const period =
    input.startDate === input.endDate
      ? `le ${formatDay(dayStart(input.startDate))}`
      : `du ${formatDay(dayStart(input.startDate))} au ${formatDay(dayStart(input.endDate))}`;
  const lines = [
    `Absence ${period}, pour tous vos départements.`,
    input.reason ? `Motif : ${input.reason}` : "Sans motif.",
    services.length > 0
      ? `Vous serez retiré(e) de ${services.length} service(s) où vous êtes planifié(e), et vos responsables prévenus :\n${services
          .map((s) => `- ${formatDay(s.date)} · ${s.title} (${s.departmentName})`)
          .join("\n")}`
      : "Aucun service planifié n'est touché.",
    "Vos responsables seront prévenus.",
  ];
  return {
    text: `Aperçu — rien n'est encore enregistré.\n${lines.join("\n")}\n\n${CONFIRM_HINT}\nJeton : ${token}`,
    structured: {
      done: false,
      action: "declare_unavailability",
      startDate: input.startDate,
      endDate: input.endDate,
      reason: payload.reason,
      withdrawals: services.map((s) => ({ date: s.date.toISOString(), title: s.title, department: s.departmentName })),
      confirmation: token,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function confirmUnavailability(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "declare_unavailability", input.confirmation)) as UnavailabilityPayload | null;
  if (!payload) return refusal(EXPIRED);
  // Droits revérifiés à l'exécution : la fiche doit toujours être celle du compte.
  if ((await ownMemberId(ctx)) !== payload.memberId) return refusal(NO_STAR);

  const userId = ctx.session.user.id!;
  const absence = await declareAbsence({
    churchId: ctx.churchId,
    memberId: payload.memberId,
    kind: "PERIOD",
    startDate: dayStart(payload.startDate),
    endDate: dayStart(payload.endDate),
    allDepartments: true,
    reason: payload.reason,
    createdById: userId,
  });
  await logAudit({
    userId,
    churchId: ctx.churchId,
    action: "CREATE",
    entityType: "Absence",
    entityId: absence.id,
    details: { memberId: payload.memberId, kind: "PERIOD", startDate: payload.startDate, endDate: payload.endDate, allDepartments: true, via: "mcp" },
  });
  const link = `${publicOrigin()}/planning`;
  return {
    text: `Absence enregistrée. Vos responsables sont prévenus.\nVoir dans Koinonia : ${link}`,
    structured: { done: true, action: "declare_unavailability", absenceId: absence.id, link },
  };
}

// ─── Répondre à une demande de disponibilité ─────────────────────────────────

type ServiceAnswerPayload = { memberId: string; answer: Answer; eventIds: string[] };

export async function previewServiceAnswer(input: z.infer<typeof serviceAnswerInput>, ctx: ActionContext): Promise<ActionResult> {
  const memberId = await ownMemberId(ctx);
  if (!memberId) return refusal(NO_STAR);
  if (input.day < today()) return refusal("Ce jour est déjà passé.");

  const monthKey = input.day.slice(0, 7);
  const data = await listMemberAvailability(memberId, ctx.churchId, new Date(`${monthKey}-01T00:00:00.000Z`));
  if (!data.months.some((m) => m.month.toISOString().startsWith(monthKey))) {
    return refusal("Les disponibilités de ce mois ne sont pas encore demandées.");
  }
  const events = data.events.filter((e) => isOnDay(e.date, input.day));
  if (events.length === 0) return refusal("Aucun événement de vos départements ce jour-là.");

  const payload: ServiceAnswerPayload = { memberId, answer: input.answer, eventIds: events.map((e) => e.id) };
  const { token, expiresAt } = await createConfirmation(ctx.grantId, "answer_service", payload);

  const leaving =
    input.answer === "UNAVAILABLE" ? events.flatMap((e) => e.plannedIn.map((p) => ({ event: e, ...p }))) : [];
  const lines = [
    `Réponse « ${ANSWERS[input.answer]} », pour tous vos départements concernés :`,
    ...events.map((e) => `- ${formatDay(e.date)} ${formatTime(e.date)} · ${e.title} (${e.departments.map((d) => d.name).join(", ")})`),
    ...leaving.map((p) =>
      p.withdrawable
        ? `Vous êtes planifié(e) en ${p.departmentName} : cette réponse vaut désistement, vos responsables seront prévenus.`
        : `Vous êtes planifié(e) en ${p.departmentName} après la date limite : vous restez planifié(e), votre responsable sera prévenu.`
    ),
  ];
  return {
    text: `Aperçu — rien n'est encore enregistré.\n${lines.join("\n")}\n\n${CONFIRM_HINT}\nJeton : ${token}`,
    structured: {
      done: false,
      action: "answer_service",
      answer: input.answer,
      events: events.map((e) => ({ date: e.date.toISOString(), title: e.title, departments: e.departments.map((d) => d.name) })),
      withdrawals: leaving.filter((p) => p.withdrawable).map((p) => ({ title: p.event.title, department: p.departmentName })),
      confirmation: token,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function confirmServiceAnswer(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
  const payload = (await consumeConfirmation(ctx.grantId, "answer_service", input.confirmation)) as ServiceAnswerPayload | null;
  if (!payload) return refusal(EXPIRED);
  if ((await ownMemberId(ctx)) !== payload.memberId) return refusal(NO_STAR);

  const userId = ctx.session.user.id!;
  try {
    const result = await saveResponses({
      memberId: payload.memberId,
      churchId: ctx.churchId,
      answers: payload.eventIds.map((eventId) => ({ eventId, answer: payload.answer })),
      actorId: userId,
    });
    await logAudit({
      userId,
      churchId: ctx.churchId,
      action: "UPDATE",
      entityType: "AvailabilityResponse",
      entityId: payload.memberId,
      details: { eventIds: payload.eventIds, answer: payload.answer, withdrawals: result.withdrawals, via: "mcp" },
    });
    const link = `${publicOrigin()}/disponibilites`;
    const withdrawn = result.withdrawals > 0 ? ` ${result.withdrawals} désistement(s) enregistré(s), vos responsables sont prévenus.` : "";
    return {
      text: `Réponse « ${ANSWERS[payload.answer]} » enregistrée.${withdrawn}\nVoir dans Koinonia : ${link}`,
      structured: { done: true, action: "answer_service", updated: result.updated, withdrawals: result.withdrawals, link },
    };
  } catch (error) {
    // Événement passé ou retiré entre l'aperçu et la confirmation : message métier, sans détail interne.
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
}

// ─── Préparer une demande (lien prérempli, rien n'est enregistré) ─────────────

export const draftRequestInput = requestPrefillSchema.extend({
  type: requestPrefillSchema.shape.type.describe("annonce, visuel ou evenement (demande d'ajout d'un événement)"),
  titre: requestPrefillSchema.shape.titre.describe("Titre de l'annonce, du visuel ou de l'événement"),
  texte: requestPrefillSchema.shape.texte.describe("Texte de l'annonce ou brief du visuel (ignoré pour un événement)"),
  date: requestPrefillSchema.shape.date.describe("AAAA-MM-JJ : date de l'événement annoncé, date limite du visuel ou date de l'événement à ajouter"),
  heure: requestPrefillSchema.shape.heure.describe("HH:MM, heure de l'événement à ajouter (10:00 par défaut)"),
  typeEvenement: requestPrefillSchema.shape.typeEvenement.describe("Type de l'événement à ajouter"),
});

const KIND_LABEL = { annonce: "annonce", visuel: "demande de visuel", evenement: "demande d'ajout d'événement" } as const;

/**
 * Brouillon de demande (spec 081, T38) : un lien vers « Nouvelle demande » prérempli. Rien n'est
 * enregistré ; la personne complète (départements, canaux…) et envoie elle-même dans Koinonia.
 */
export async function draftRequest(input: z.infer<typeof draftRequestInput>): Promise<ActionResult> {
  const link = `${publicOrigin()}${requestPrefillHref(input)}`;
  return {
    text:
      `Brouillon de ${KIND_LABEL[input.type]} prêt — rien n'est encore envoyé.
` +
      `La personne ouvre ce lien, complète le formulaire si besoin et l'envoie elle-même :
${link}`,
    structured: { done: false, action: "draft_request", link },
  };
}

/** Le formulaire « Nouvelle demande » exige `members:view` (même garde que la page). */
export const canDraftRequest = (viewer: AssistantViewer) => viewer.permissions.includes("members:view");

export const DRAFT_REQUEST_TOOL = {
  name: "draft_request",
  description:
    "Prépare une annonce, une demande de visuel ou une demande d'ajout d'événement sous forme de lien vers le formulaire de Koinonia prérempli. N'enregistre et n'envoie rien : la personne relit, complète et envoie elle-même.",
  input: draftRequestInput,
} as const;

// ─── Catalogue ───────────────────────────────────────────────────────────────

export interface McpActionDef {
  name: string;
  /** Clé journalisée et liée au jeton de confirmation. */
  action: string;
  kind: "preview" | "confirm";
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  run: (input: never, ctx: ActionContext) => Promise<ActionResult>;
}

export const MCP_ACTIONS: McpActionDef[] = [
  {
    name: "declare_unavailability_preview",
    action: "declare_unavailability",
    kind: "preview",
    description:
      "Prépare la déclaration d'une absence de la personne sur une période (tous ses départements). N'enregistre rien : renvoie un résumé (services quittés, responsables prévenus) et un jeton. Montrez le résumé et attendez l'accord explicite de la personne avant declare_unavailability_confirm.",
    input: unavailabilityInput,
    run: previewUnavailability as McpActionDef["run"],
  },
  {
    name: "declare_unavailability_confirm",
    action: "declare_unavailability",
    kind: "confirm",
    description:
      "Enregistre l'absence préparée par declare_unavailability_preview, avec son jeton. À appeler seulement après l'accord explicite de la personne sur le résumé.",
    input: confirmInput,
    run: confirmUnavailability as McpActionDef["run"],
  },
  {
    name: "answer_service_preview",
    action: "answer_service",
    kind: "preview",
    description:
      "Prépare la réponse de la personne à une demande de disponibilité pour les événements d'un jour (Disponible, Si besoin, Pas disponible). N'enregistre rien : renvoie un résumé (dont un éventuel désistement) et un jeton. Montrez le résumé et attendez l'accord explicite de la personne avant answer_service_confirm.",
    input: serviceAnswerInput,
    run: previewServiceAnswer as McpActionDef["run"],
  },
  {
    name: "answer_service_confirm",
    action: "answer_service",
    kind: "confirm",
    description:
      "Enregistre la réponse préparée par answer_service_preview, avec son jeton. À appeler seulement après l'accord explicite de la personne sur le résumé.",
    input: confirmInput,
    run: confirmServiceAnswer as McpActionDef["run"],
  },
];

/** Actions proposées : connexion autorisée aux actions, et fiche STAR liée au compte. */
export function actionsFor(viewer: AssistantViewer, write: boolean): McpActionDef[] {
  return write && viewer.predicates.includes("linkedStar") ? MCP_ACTIONS : [];
}
