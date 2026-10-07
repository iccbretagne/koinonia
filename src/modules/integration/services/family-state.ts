import { z } from "zod";
import { ApiError } from "@/lib/api-utils";
import type { FamilyIntegrationStatus } from "@/generated/prisma/client";

// ─── Schema ───────────────────────────────────────────────────────────────────

/** Motifs d'abandon (liste fixe, spec 051 — amendement de recette). */
export const ABANDON_REASON_CODES = [
  "UNKNOWN_NUMBER",
  "UNREACHABLE",
  "NO_LONGER_INTERESTED",
  "OTHER_CHURCH",
  "MOVED",
  "DUPLICATE",
  "OTHER",
] as const;

export const ABANDON_REASON_LABELS: Record<(typeof ABANDON_REASON_CODES)[number], string> = {
  UNKNOWN_NUMBER: "Numéro inconnu ou erroné",
  UNREACHABLE: "Injoignable après relances",
  NO_LONGER_INTERESTED: "Ne souhaite plus être contacté·e",
  OTHER_CHURCH: "A rejoint une autre église",
  MOVED: "A déménagé",
  DUPLICATE: "Doublon",
  OTHER: "Autre",
};

export const familyPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    assignedFamilyId: z.number().int(),
    assignedFamilyName: z.string().min(1),
    assignedBergerId: z.string().min(1),
  }),
  z.object({ action: z.literal("contact") }),
  z.object({ action: z.literal("whatsapp") }),
  z.object({ action: z.literal("integrate") }),
  z.object({
    action: z.literal("abandon"),
    abandonReasonCode: z.enum(ABANDON_REASON_CODES),
    // Commentaire libre, facultatif — le motif qualifié est `abandonReasonCode`.
    abandonReason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("note"),
    notes: z.string().max(10000),
  }),
  z.object({
    action: z.literal("reopen"),
    // resume : retrouve l'état d'avant l'abandon ; restart : repart de zéro (spec 051)
    mode: z.enum(["resume", "restart"]).default("resume"),
  }),
  z.object({
    action: z.literal("wait"),
    waitingKind: z.enum(["RECONTACT", "MISSION"]),
    note: z.string().max(1000).optional(),
  }),
  z.object({ action: z.literal("resume") }),
  z.object({
    action: z.literal("handback"),
    // Renvoi à l'équipe intégration par le berger : la raison est obligatoire.
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("relance"),
    note: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal("edit"),
    firstName:    z.string().min(1).max(100).optional(),
    lastName:     z.string().min(1).max(100).optional(),
    phone:        z.string().min(1).max(30).optional(),
    email:        z.string().email().optional().or(z.literal("")).optional(),
    address:      z.string().max(500).optional().or(z.literal("")).optional(),
    ageRange:     z.enum(["YOUTH", "YOUNG_ADULT", "ADULT", "SENIOR"]).optional(),
    churchStatus: z.enum(["VISITOR", "REGULAR", "ENGAGED"]).optional(),
  }),
]);

export type FamilyPatchBody = z.infer<typeof familyPatchSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

export const WAITING_STATUSES: FamilyIntegrationStatus[] = ["WAITING_RECONTACT", "WAITING_MISSION"];

/** Seuls points d'entrée autorisés dans un état d'attente (spec 051). */
const WAITING_ENTRY_STATUSES = new Set<FamilyIntegrationStatus>(["SUBMITTED", "ASSIGNED", "CONTACTED"]);

/** États depuis lesquels un berger peut renvoyer une demande à l'équipe intégration. */
const HANDBACK_STATUSES = new Set<FamilyIntegrationStatus>(["ASSIGNED", "CONTACTED"]);

/**
 * Détachement complet d'une demande qui repart à « demande reçue » : famille, berger, jalons
 * et attente. Partagé par la reprise de zéro et le renvoi à l'équipe.
 */
const DETACH_TO_SUBMITTED = {
  status: "SUBMITTED",
  assignedFamilyId: null,
  assignedFamilyName: null,
  assignedBergerId: null,
  assignedAt: null,
  contactedAt: null,
  whatsappAddedAt: null,
  waitingFrom: null,
  waitingSince: null,
  lastRelanceAt: null,
} as const;

export function isWaitingStatus(status: string): boolean {
  return (WAITING_STATUSES as string[]).includes(status);
}

export interface FamilyRequestState {
  status: FamilyIntegrationStatus;
  waitingFrom: FamilyIntegrationStatus | null;
  assignedFamilyId: number | null;
  assignedBergerId: string | null;
  assignedAt?: Date | null;
  contactedAt?: Date | null;
  whatsappAddedAt?: Date | null;
}

export interface FamilyActor {
  isIntegrationMember: boolean;
  isAssignedBerger: boolean;
}

export interface FamilyTransitionResult {
  data: Record<string, unknown>;
  /** Berger à informer d'une nouvelle affectation. */
  notifyAssignedBergerId: string | null;
  /** Berger à informer qu'il n'est plus en charge (réaffectation, reprise de zéro). */
  notifyUnassignedBergerId: string | null;
}

/** Entrée d'historique minimale nécessaire au calcul de la réouverture. */
export interface StatusHistoryEntry {
  from: string | null;
  to: string | null;
}

// ─── Droits ───────────────────────────────────────────────────────────────────

function requireIntegrationMember(actor: FamilyActor) {
  if (!actor.isIntegrationMember)
    throw new ApiError(403, "Cette action est réservée aux membres de l'équipe intégration");
}

function requireBergerOrIntegrationMember(actor: FamilyActor) {
  if (!actor.isIntegrationMember && !actor.isAssignedBerger)
    throw new ApiError(403, "Cette action est réservée au berger assigné ou à l'équipe intégration");
}

/**
 * Droit de poser ou lever une attente : équipe intégration seule depuis « demande reçue »
 * (aucun berger désigné), berger assigné ou équipe depuis « famille affectée » ou « premier
 * contact établi ». Calculé sur le point d'entrée, pas sur l'état courant.
 */
function requireWaitingRight(origin: FamilyIntegrationStatus | null, actor: FamilyActor) {
  if (origin === "ASSIGNED" || origin === "CONTACTED") requireBergerOrIntegrationMember(actor);
  else requireIntegrationMember(actor);
}

// ─── Machine à états ──────────────────────────────────────────────────────────

type FamilyTransitionBody = Exclude<FamilyPatchBody, { action: "reopen" }>;
type FamilyBodyOf<A extends FamilyTransitionBody["action"]> = Extract<FamilyTransitionBody, { action: A }>;

/** Étapes d'intégration franchies une à une par le berger assigné ou l'équipe. */
const STEPS = {
  contact: { from: "ASSIGNED", to: "CONTACTED", stamp: "contactedAt" },
  whatsapp: { from: "CONTACTED", to: "WHATSAPP_ADDED", stamp: "whatsappAddedAt" },
  integrate: { from: "WHATSAPP_ADDED", to: "INTEGRATED", stamp: "integratedAt" },
} as const satisfies Record<string, { from: FamilyIntegrationStatus; to: FamilyIntegrationStatus; stamp: string }>;

function stepData(step: keyof typeof STEPS, current: FamilyRequestState, actor: FamilyActor, now: Date) {
  const { from, to, stamp } = STEPS[step];
  requireBergerOrIntegrationMember(actor);
  if (current.status !== from) throw new ApiError(400, `Transition invalide : la demande doit être ${from}`);
  return { status: to, [stamp]: now };
}

function assignTransition(body: FamilyBodyOf<"assign">, current: FamilyRequestState, actor: FamilyActor, now: Date, result: FamilyTransitionResult) {
  requireIntegrationMember(actor);
  if (current.status !== "SUBMITTED" && current.status !== "ASSIGNED")
    throw new ApiError(400, "Transition invalide : la demande doit être SUBMITTED ou ASSIGNED");
  result.data = {
    status: "ASSIGNED",
    assignedFamilyId: body.assignedFamilyId,
    assignedFamilyName: body.assignedFamilyName,
    assignedBergerId: body.assignedBergerId,
    assignedAt: now,
  };
  result.notifyAssignedBergerId = body.assignedBergerId;
  if (current.assignedBergerId && current.assignedBergerId !== body.assignedBergerId)
    result.notifyUnassignedBergerId = current.assignedBergerId;
}

function abandonData(body: FamilyBodyOf<"abandon">, current: FamilyRequestState, actor: FamilyActor, now: Date) {
  requireBergerOrIntegrationMember(actor);
  if (current.status === "INTEGRATED")
    throw new ApiError(400, "Impossible d'abandonner une demande déjà intégrée");
  // Les champs d'attente sont conservés : une réouverture peut ramener la demande dans
  // l'attente qu'elle occupait avant l'abandon.
  return {
    status: "ABANDONED",
    abandonedAt: now,
    abandonReasonCode: body.abandonReasonCode,
    abandonReason: body.abandonReason || null,
  };
}

function waitData(body: FamilyBodyOf<"wait">, current: FamilyRequestState, actor: FamilyActor, now: Date) {
  if (!WAITING_ENTRY_STATUSES.has(current.status))
    throw new ApiError(
      400,
      "Transition invalide : seule une demande reçue, affectée ou au premier contact établi peut être mise en attente"
    );
  requireWaitingRight(current.status, actor);
  // La transmission au département mission reste une décision de l'équipe intégration.
  if (body.waitingKind === "MISSION") requireIntegrationMember(actor);
  return {
    status: body.waitingKind === "RECONTACT" ? "WAITING_RECONTACT" : "WAITING_MISSION",
    waitingFrom: current.status,
    waitingSince: now,
    lastRelanceAt: null,
  };
}

function resumeData(current: FamilyRequestState, actor: FamilyActor) {
  if (!isWaitingStatus(current.status) || !current.waitingFrom)
    throw new ApiError(400, "Transition invalide : la demande n'est pas en attente");
  requireWaitingRight(current.waitingFrom, actor);
  // Reprise à l'étape qui suit le point d'arrêt : depuis SUBMITTED, l'affectation d'une
  // famille ; depuis ASSIGNED, le premier contact ; depuis CONTACTED, l'ajout au groupe —
  // dans tous les cas, l'état d'origine.
  return { status: current.waitingFrom, waitingFrom: null, waitingSince: null, lastRelanceAt: null };
}

function handbackTransition(current: FamilyRequestState, actor: FamilyActor, result: FamilyTransitionResult) {
  requireBergerOrIntegrationMember(actor);
  if (!HANDBACK_STATUSES.has(current.status))
    throw new ApiError(
      400,
      "Transition invalide : seule une demande affectée ou au premier contact établi peut être renvoyée à l'équipe intégration"
    );
  result.data = { ...DETACH_TO_SUBMITTED };
  // Renvoi fait par l'équipe à la place du berger : celui-ci est dessaisi, il en est informé.
  if (!actor.isAssignedBerger) result.notifyUnassignedBergerId = current.assignedBergerId;
}

/** Champs d'identité modifiés : seuls ceux transmis, les chaînes vides des champs facultatifs deviennent `null`. */
function editData(body: FamilyBodyOf<"edit">) {
  const data: Record<string, unknown> = {};
  for (const key of ["firstName", "lastName", "ageRange", "churchStatus"] as const) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  for (const key of ["phone", "email", "address"] as const) {
    if (body[key] !== undefined) data[key] = body[key] || null;
  }
  return data;
}

/**
 * Calcule la mise à jour d'une demande d'intégration pour une action donnée.
 * Fonction pure : lève `ApiError` (400 transition invalide, 403 droit insuffisant).
 * La réouverture (`reopen`) passe par `computeReopenData`, qui a besoin de l'historique.
 */
export function computeFamilyTransitionData(
  current: FamilyRequestState,
  body: FamilyTransitionBody,
  actor: FamilyActor,
  now: Date
): FamilyTransitionResult {
  const result: FamilyTransitionResult = {
    data: {},
    notifyAssignedBergerId: null,
    notifyUnassignedBergerId: null,
  };

  switch (body.action) {
    case "assign":
      assignTransition(body, current, actor, now, result);
      break;
    case "contact":
    case "whatsapp":
    case "integrate":
      result.data = stepData(body.action, current, actor, now);
      break;
    case "abandon":
      result.data = abandonData(body, current, actor, now);
      break;
    case "wait":
      result.data = waitData(body, current, actor, now);
      break;
    case "resume":
      result.data = resumeData(current, actor);
      break;
    case "handback":
      handbackTransition(current, actor, result);
      break;
    case "relance":
      if (!isWaitingStatus(current.status))
        throw new ApiError(400, "Seule une demande en attente peut être relancée");
      requireWaitingRight(current.waitingFrom, actor);
      result.data = { lastRelanceAt: now };
      break;
    case "note":
      requireBergerOrIntegrationMember(actor);
      result.data = { notes: body.notes };
      break;
    case "edit":
      requireBergerOrIntegrationMember(actor);
      result.data = editData(body);
      break;
  }
  return result;
}

// ─── Réouverture ──────────────────────────────────────────────────────────────

/**
 * Statut occupé juste avant le dernier abandon. Lu dans l'historique ; à défaut (abandons
 * antérieurs à la spec 051, dont le journal ne portait pas `from`), déduit des jalons portés
 * par la demande.
 */
export function statusBeforeAbandon(
  request: FamilyRequestState,
  history: StatusHistoryEntry[]
): FamilyIntegrationStatus {
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.to === "ABANDONED" && entry.from && entry.from !== "ABANDONED")
      return entry.from as FamilyIntegrationStatus;
  }
  if (request.whatsappAddedAt) return "WHATSAPP_ADDED";
  if (request.contactedAt) return "CONTACTED";
  if (request.assignedFamilyId || request.assignedBergerId) return "ASSIGNED";
  return "SUBMITTED";
}

export function computeReopenData(
  request: FamilyRequestState,
  mode: "resume" | "restart",
  history: StatusHistoryEntry[],
  actor: FamilyActor
): FamilyTransitionResult {
  requireIntegrationMember(actor);
  if (request.status !== "ABANDONED")
    throw new ApiError(400, "Seule une demande abandonnée peut être rouverte");

  if (mode === "resume") {
    return {
      data: {
        status: statusBeforeAbandon(request, history),
        abandonedAt: null,
        abandonReason: null,
        abandonReasonCode: null,
      },
      notifyAssignedBergerId: null,
      notifyUnassignedBergerId: null,
    };
  }

  return {
    data: {
      ...DETACH_TO_SUBMITTED,
      abandonedAt: null,
      abandonReason: null,
      abandonReasonCode: null,
    },
    notifyAssignedBergerId: null,
    notifyUnassignedBergerId: request.assignedBergerId,
  };
}

// ─── Invariant ────────────────────────────────────────────────────────────────

/** Une demande « reçue » ne porte jamais de famille ni de berger affecté (spec 051). */
export function assertNoStaleAssignment(state: {
  status: string;
  assignedFamilyId: number | null;
  assignedBergerId: string | null;
}): void {
  if (state.status === "SUBMITTED" && (state.assignedFamilyId !== null || state.assignedBergerId !== null))
    throw new ApiError(409, "État incohérent : une demande reçue ne peut pas porter de famille ou de berger");
}

// ─── Création (formulaire public) ─────────────────────────────────────────────

/**
 * Consentement au contact du formulaire public. Absent du body ⇒ `NOW` : tout appelant
 * antérieur à la spec 051 garde le comportement d'avant.
 */
export const contactConsentSchema = z.enum(["NOW", "LATER"]).default("NOW");

/**
 * État initial d'une demande selon le consentement : « recontacter plus tard » naît
 * directement en attente de recontact (point d'entrée : demande reçue), pour ne jamais
 * apparaître dans la file des demandes à traiter.
 */
export function initialRequestStatusData(
  contactConsent: "NOW" | "LATER",
  now: Date
): { status: FamilyIntegrationStatus; waitingFrom: FamilyIntegrationStatus | null; waitingSince: Date | null } {
  if (contactConsent === "LATER")
    return { status: "WAITING_RECONTACT", waitingFrom: "SUBMITTED", waitingSince: now };
  return { status: "SUBMITTED", waitingFrom: null, waitingSince: null };
}
