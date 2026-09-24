import { z } from "zod";
import { ApiError } from "@/lib/api-utils";
import type { AppointmentRequestStatus } from "@/generated/prisma/client";
import type { ResolvedAssignee } from "./assignee";

/**
 * Machine à états **pure** des demandes de rendez-vous pastoral (spec 052, lot 2) — sur le
 * modèle de `family-state.ts` (051) : `(état, action, acteur, maintenant) → { data, … }` ou
 * lève `ApiError`. Porte toutes les transitions et tous les droits par action ; la résolution
 * de l'accompagnant (`resolveAssignee`, DB), le calcul de qui était affecté avant (pour la
 * notification de dessaisissement) et les écritures restent à la charge de l'appelant
 * (`services/appointments.ts`), qui a déjà chargé la fiche complète.
 */

export const REJECT_REASON_CODES = [
  "OUT_OF_SCOPE",
  "DUPLICATE",
  "WITHDRAWN",
  "UNREACHABLE",
  "REDIRECTED",
  "OTHER",
] as const;

export const REJECT_REASON_LABELS: Record<(typeof REJECT_REASON_CODES)[number], string> = {
  OUT_OF_SCOPE: "Hors du champ pastoral",
  DUPLICATE: "Doublon",
  WITHDRAWN: "Demande retirée par la personne",
  UNREACHABLE: "Injoignable",
  REDIRECTED: "Orientée vers un autre service",
  OTHER: "Autre",
};

const assigneeSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PROFILE"), id: z.string().min(1) }),
  z.object({ kind: z.literal("MEMBER"), id: z.string().min(1) }),
]);

export const appointmentPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("validate"),
    assignee: assigneeSelectionSchema,
    note: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    reasonCode: z.enum(REJECT_REASON_CODES),
    comment: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("reassign"),
    assignee: assigneeSelectionSchema,
  }),
  z.object({
    action: z.literal("set_date"),
    scheduledFor: z.string().datetime("Date invalide"),
  }),
  z.object({
    action: z.literal("outcome"),
    kind: z.enum(["HELD", "REFERRED_TO_FOLLOWUP", "NO_SHOW_CLOSE", "NEW_APPOINTMENT", "NO_SHOW_REPLAN"]),
  }),
  z.object({
    action: z.literal("handback"),
    reason: z.string().trim().min(1).max(500),
  }),
]);

export type AppointmentPatchBody = z.infer<typeof appointmentPatchSchema>;

export interface AppointmentRequestState {
  status: AppointmentRequestStatus;
  assignedToId: string | null;
  assignedMemberId: string | null;
  scheduledFor: Date | null;
}

export interface AppointmentActor {
  /** Détient `care:qualify` (Référent soins pastoraux, Admin, Super Admin). */
  isReferent: boolean;
  /** L'appelant est l'accompagnant actuellement en charge (`isCurrentAssignee`). */
  isCurrentAssignee: boolean;
  /** Le profil pastoral actuellement affecté a un compte rattaché (toujours vrai pour un
   *  membre MSDP) — un profil sans compte ne peut pas agir lui-même ; le référent agit à sa
   *  place pour l'issue. */
  currentAssigneeHasAccount: boolean;
}

export interface AppointmentTransitionResult {
  data: Record<string, unknown>;
  /** Accompagnant nouvellement affecté (validate/reassign) — à notifier. */
  notifyAssigned: ResolvedAssignee | null;
  /** Un accompagnant était en charge avant cette transition et doit être prévenu qu'il ne
   *  l'est plus (reassign/handback) — l'appelant résout son identité depuis la fiche déjà
   *  chargée (`assignedTo`/`assignedMember`). */
  notifyPreviousAssignee: boolean;
  /** Retour au référent (handback) : notifier tous les détenteurs de `care:qualify`. */
  notifyReferents: boolean;
  /** Confié à un **profil pastoral** (validate/reassign) : le Protocole doit le planifier. */
  notifyProtocole: boolean;
  /** Un suivi de nouveau converti doit être créé à partir de cette demande (issue « orienté »,
   *  T41) — laissé à l'appelant, qui a accès à l'identité et au dossier de parcours. */
  createFollowUpFromOrientation: boolean;
}

function requireReferent(actor: AppointmentActor) {
  if (!actor.isReferent)
    throw new ApiError(403, "Cette action est réservée au référent soins pastoraux");
}

/** Accompagnant en charge, ou référent si le profil affecté n'a pas de compte. */
function requireAssigneeOrReferentProxy(actor: AppointmentActor) {
  if (actor.isCurrentAssignee) return;
  if (actor.isReferent && !actor.currentAssigneeHasAccount) return;
  throw new ApiError(403, "Cette action est réservée à l'accompagnant en charge");
}

const BASE_RESULT = {
  notifyAssigned: null,
  notifyPreviousAssignee: false,
  notifyReferents: false,
  notifyProtocole: false,
  createFollowUpFromOrientation: false,
} as const;

export function computeAppointmentTransitionData(
  current: AppointmentRequestState,
  body: AppointmentPatchBody,
  actor: AppointmentActor,
  now: Date,
  actorId: string,
  assignee: ResolvedAssignee | null
): AppointmentTransitionResult {
  switch (body.action) {
    case "validate": {
      requireReferent(actor);
      if (current.status !== "PENDING")
        throw new ApiError(400, "Transition invalide : la demande doit être en attente");
      if (!assignee) throw new ApiError(400, "Accompagnant requis");
      return {
        ...BASE_RESULT,
        data: {
          status: "VALIDATED",
          assignedToId: assignee.kind === "PROFILE" ? assignee.id : null,
          assignedMemberId: assignee.kind === "MEMBER" ? assignee.id : null,
          assignedAt: now,
          assignedById: actorId,
          qualifiedById: actorId,
          qualifiedAt: now,
          qualificationNote: body.note ?? null,
        },
        notifyAssigned: assignee,
        notifyProtocole: assignee.kind === "PROFILE",
      };
    }

    case "reject": {
      requireReferent(actor);
      if (current.status !== "PENDING")
        throw new ApiError(400, "Transition invalide : la demande doit être en attente");
      return {
        ...BASE_RESULT,
        data: {
          status: "REJECTED",
          rejectReasonCode: body.reasonCode,
          rejectReason: body.comment ?? null,
          qualifiedById: actorId,
          qualifiedAt: now,
        },
      };
    }

    case "reassign": {
      requireReferent(actor);
      if (current.status !== "VALIDATED" && current.status !== "SCHEDULED")
        throw new ApiError(
          400,
          "Transition invalide : seule une demande confiée ou planifiée peut être réaffectée"
        );
      if (!assignee) throw new ApiError(400, "Accompagnant requis");
      return {
        ...BASE_RESULT,
        data: {
          status: "VALIDATED",
          assignedToId: assignee.kind === "PROFILE" ? assignee.id : null,
          assignedMemberId: assignee.kind === "MEMBER" ? assignee.id : null,
          assignedAt: now,
          assignedById: actorId,
          scheduledFor: null,
          scheduledById: null,
          scheduledAt: null,
        },
        notifyAssigned: assignee,
        notifyPreviousAssignee: true,
        notifyProtocole: assignee.kind === "PROFILE",
      };
    }

    case "set_date": {
      if (!current.assignedMemberId)
        throw new ApiError(
          400,
          "Seul un accompagnant membre du MSDP peut fixer lui-même la date — un profil pastoral est planifié par le protocole"
        );
      if (!actor.isCurrentAssignee)
        throw new ApiError(403, "Cette action est réservée à l'accompagnant en charge");
      if (current.status !== "VALIDATED")
        throw new ApiError(400, "Transition invalide : la demande doit être confiée");
      return {
        ...BASE_RESULT,
        data: {
          status: "SCHEDULED",
          scheduledFor: new Date(body.scheduledFor),
          scheduledById: actorId,
          scheduledAt: now,
        },
      };
    }

    case "outcome": {
      requireAssigneeOrReferentProxy(actor);
      if (current.status !== "SCHEDULED")
        throw new ApiError(400, "Transition invalide : la demande doit être planifiée");
      if (!current.scheduledFor || current.scheduledFor.getTime() > now.getTime())
        throw new ApiError(400, "Le rendez-vous n'a pas encore eu lieu");

      if (body.kind === "NEW_APPOINTMENT" || body.kind === "NO_SHOW_REPLAN") {
        return {
          ...BASE_RESULT,
          data: { status: "VALIDATED", scheduledFor: null, scheduledById: null, scheduledAt: null },
        };
      }

      const outcome = body.kind === "NO_SHOW_CLOSE" ? "NO_SHOW" : body.kind;
      return {
        ...BASE_RESULT,
        data: { status: "CLOSED", outcome, outcomeAt: now },
        createFollowUpFromOrientation: body.kind === "REFERRED_TO_FOLLOWUP",
      };
    }

    case "handback": {
      if (current.status !== "VALIDATED" && current.status !== "SCHEDULED")
        throw new ApiError(
          400,
          "Transition invalide : seule une demande confiée ou planifiée peut être rendue au référent"
        );
      if (!actor.isCurrentAssignee)
        throw new ApiError(403, "Cette action est réservée à l'accompagnant en charge");
      return {
        ...BASE_RESULT,
        data: {
          status: "PENDING",
          assignedToId: null,
          assignedMemberId: null,
          assignedAt: null,
          assignedById: null,
          scheduledFor: null,
          scheduledById: null,
          scheduledAt: null,
          qualifiedById: null,
          qualifiedAt: null,
          qualificationNote: null,
        },
        notifyReferents: true,
      };
    }
  }
}
