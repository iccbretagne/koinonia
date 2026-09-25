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

const ACTIVE_STATUSES: MsdpStatus[] = ["ASSIGNED", "CONTACTED", "IN_FORMATION"];

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

export function computeFollowupTransitionData(
  current: FollowupState,
  body: FollowupPatchBody,
  actor: FollowupActor,
  now: Date,
  actorId: string,
  assignee: ResolvedAssignee | null
): FollowupTransitionResult {
  switch (body.action) {
    case "assign": {
      requireReferent(actor);
      if (current.status !== "SUBMITTED")
        throw new ApiError(400, "Transition invalide : le suivi doit être reçu (non affecté)");
      if (!assignee) throw new ApiError(400, "Accompagnant requis");
      return {
        ...BASE_RESULT,
        data: {
          status: "ASSIGNED",
          assignedProfileId: assignee.kind === "PROFILE" ? assignee.id : null,
          assignedConseillerMsdpId: assignee.kind === "MEMBER" ? assignee.id : null,
          assignedById: actorId,
          assignedAt: now,
        },
        notifyAssigned: assignee,
      };
    }

    case "reassign": {
      requireReferent(actor);
      if (!ACTIVE_STATUSES.includes(current.status))
        throw new ApiError(400, "Transition invalide : le suivi doit être en cours d'accompagnement");
      if (!assignee) throw new ApiError(400, "Accompagnant requis");
      return {
        ...BASE_RESULT,
        data: {
          assignedProfileId: assignee.kind === "PROFILE" ? assignee.id : null,
          assignedConseillerMsdpId: assignee.kind === "MEMBER" ? assignee.id : null,
          assignedById: actorId,
          assignedAt: now,
        },
        notifyAssigned: assignee,
        notifyPreviousAssignee: true,
      };
    }

    case "contact": {
      requireCurrentAssignee(actor);
      if (current.status !== "ASSIGNED")
        throw new ApiError(400, "Transition invalide : le suivi doit être ASSIGNED");
      return { ...BASE_RESULT, data: { status: "CONTACTED", contactedAt: now } };
    }

    case "in_formation": {
      requireCurrentAssignee(actor);
      if (current.status !== "CONTACTED")
        throw new ApiError(400, "Transition invalide : le suivi doit être CONTACTED");
      return { ...BASE_RESULT, data: { status: "IN_FORMATION", inFormationAt: now } };
    }

    case "complete": {
      requireCurrentAssignee(actor);
      if (current.status !== "IN_FORMATION")
        throw new ApiError(400, "Transition invalide : le suivi doit être IN_FORMATION");
      return { ...BASE_RESULT, data: { status: "COMPLETED", completedAt: now } };
    }

    case "abandon": {
      if (!actor.isCurrentAssignee && !actor.isReferent)
        throw new ApiError(403, "Cette action est réservée à l'accompagnant en charge ou au référent");
      if (current.status === "COMPLETED")
        throw new ApiError(400, "Impossible d'abandonner un suivi terminé");
      return { ...BASE_RESULT, data: { status: "ABANDONED", abandonedAt: now } };
    }

    case "reopen": {
      requireReferent(actor);
      if (current.status !== "ABANDONED")
        throw new ApiError(400, "Seul un suivi abandonné peut être rouvert");
      return { ...BASE_RESULT, data: { status: "SUBMITTED", abandonedAt: null } };
    }

    case "handback": {
      requireCurrentAssignee(actor);
      if (!ACTIVE_STATUSES.includes(current.status))
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

    case "note": {
      if (!actor.isCurrentAssignee && !actor.isReferent)
        throw new ApiError(403, "Cette action est réservée à l'accompagnant en charge ou au référent");
      return { ...BASE_RESULT, data: { notes: body.notes } };
    }
  }
}
