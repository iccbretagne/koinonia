import { z } from "zod";
import { ApiError } from "@/lib/api-utils";
import type { MsdpStatus } from "@/generated/prisma/client";
import type { ResolvedAssignee } from "./assignee";

/**
 * Machine à états **pure** des suivis de nouveaux convertis MSDP (spec 052, lot 2) — même
 * modèle que `appointment-state.ts`. Différence du lot 1 : l'affectation choisit désormais
 * entre profil pastoral et membre du MSDP, réservée au référent, et les étapes de suivi sont
 * réservées à l'accompagnant **en charge** (plus à toute l'équipe MSDP).
 */

const assigneeSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PROFILE"), id: z.string().min(1) }),
  z.object({ kind: z.literal("MEMBER"), id: z.string().min(1) }),
]);

export const followupPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), assignee: assigneeSelectionSchema }),
  z.object({ action: z.literal("reassign"), assignee: assigneeSelectionSchema }),
  z.object({ action: z.literal("contact") }),
  z.object({ action: z.literal("in_formation") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("abandon") }),
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("handback"),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("note"),
    notes: z.string().max(10000),
  }),
]);

export type FollowupPatchBody = z.infer<typeof followupPatchSchema>;

const ACTIVE_STATUSES = new Set<MsdpStatus>(["ASSIGNED", "CONTACTED", "IN_FORMATION"]);

export interface FollowupState {
  status: MsdpStatus;
  assignedProfileId: string | null;
  assignedConseillerMsdpId: string | null;
}

export interface FollowupActor {
  /** Détient `care:qualify`. */
  isReferent: boolean;
  /** L'appelant est l'accompagnant actuellement en charge. */
  isCurrentAssignee: boolean;
}

export interface FollowupTransitionResult {
  data: Record<string, unknown>;
  notifyAssigned: ResolvedAssignee | null;
  notifyPreviousAssignee: boolean;
  notifyReferents: boolean;
}

function requireReferent(actor: FollowupActor) {
  if (!actor.isReferent)
    throw new ApiError(403, "Cette action est réservée au référent soins pastoraux");
}

function requireCurrentAssignee(actor: FollowupActor) {
  if (!actor.isCurrentAssignee)
    throw new ApiError(403, "Cette action est réservée à l'accompagnant en charge");
}

const BASE_RESULT = { notifyAssigned: null, notifyPreviousAssignee: false, notifyReferents: false } as const;

function requireAssigneeOrReferent(actor: FollowupActor) {
  if (!actor.isCurrentAssignee && !actor.isReferent)
    throw new ApiError(403, "Cette action est réservée à l'accompagnant en charge ou au référent");
}

/** Étapes d'accompagnement, franchies une à une par l'accompagnant en charge. */
const STEPS = {
  contact: { from: "ASSIGNED", to: "CONTACTED", stamp: "contactedAt" },
  in_formation: { from: "CONTACTED", to: "IN_FORMATION", stamp: "inFormationAt" },
  complete: { from: "IN_FORMATION", to: "COMPLETED", stamp: "completedAt" },
} as const satisfies Record<string, { from: MsdpStatus; to: MsdpStatus; stamp: string }>;

function stepTransition(step: keyof typeof STEPS, current: FollowupState, actor: FollowupActor, now: Date) {
  const { from, to, stamp } = STEPS[step];
  requireCurrentAssignee(actor);
  if (current.status !== from) throw new ApiError(400, `Transition invalide : le suivi doit être ${from}`);
  return { ...BASE_RESULT, data: { status: to, [stamp]: now } };
}

/** Affectation initiale (`assign`) ou changement d'accompagnant (`reassign`) par le référent. */
function assignTransition(
  reassign: boolean,
  current: FollowupState,
  actor: FollowupActor,
  now: Date,
  actorId: string,
  assignee: ResolvedAssignee | null
): FollowupTransitionResult {
  requireReferent(actor);
  if (reassign && !ACTIVE_STATUSES.has(current.status))
    throw new ApiError(400, "Transition invalide : le suivi doit être en cours d'accompagnement");
  if (!reassign && current.status !== "SUBMITTED")
    throw new ApiError(400, "Transition invalide : le suivi doit être reçu (non affecté)");
  if (!assignee) throw new ApiError(400, "Accompagnant requis");
  return {
    ...BASE_RESULT,
    data: {
      ...(reassign ? {} : { status: "ASSIGNED" }),
      assignedProfileId: assignee.kind === "PROFILE" ? assignee.id : null,
      assignedConseillerMsdpId: assignee.kind === "MEMBER" ? assignee.id : null,
      assignedById: actorId,
      assignedAt: now,
    },
    notifyAssigned: assignee,
    notifyPreviousAssignee: reassign,
  };
}

function handbackTransition(current: FollowupState, actor: FollowupActor): FollowupTransitionResult {
  requireCurrentAssignee(actor);
  if (!ACTIVE_STATUSES.has(current.status))
    throw new ApiError(400, "Transition invalide : le suivi doit être en cours d'accompagnement");
  return {
    ...BASE_RESULT,
    data: {
      status: "SUBMITTED",
      assignedProfileId: null,
      assignedConseillerMsdpId: null,
      assignedById: null,
      assignedAt: null,
    },
    notifyReferents: true,
  };
}

export function computeFollowupTransitionData(
  current: FollowupState,
  body: FollowupPatchBody,
  actor: FollowupActor,
  now: Date,
  actorId: string,
  assignee: ResolvedAssignee | null
): FollowupTransitionResult {
  switch (body.action) {
    case "assign":
    case "reassign":
      return assignTransition(body.action === "reassign", current, actor, now, actorId, assignee);

    case "contact":
    case "in_formation":
    case "complete":
      return stepTransition(body.action, current, actor, now);

    case "abandon":
      requireAssigneeOrReferent(actor);
      if (current.status === "COMPLETED") throw new ApiError(400, "Impossible d'abandonner un suivi terminé");
      return { ...BASE_RESULT, data: { status: "ABANDONED", abandonedAt: now } };

    case "reopen":
      requireReferent(actor);
      if (current.status !== "ABANDONED") throw new ApiError(400, "Seul un suivi abandonné peut être rouvert");
      return { ...BASE_RESULT, data: { status: "SUBMITTED", abandonedAt: null } };

    case "handback":
      return handbackTransition(current, actor);

    case "note":
      requireAssigneeOrReferent(actor);
      return { ...BASE_RESULT, data: { notes: body.notes } };
  }
}
