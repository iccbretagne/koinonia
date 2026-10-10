import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  status: z.enum(["EN_ATTENTE", "EN_COURS", "LIVRE", "ANNULE", "APPROUVEE", "REFUSEE"]).optional(),
  reviewNotes: z.string().nullable().optional(),
  // Owner-editable fields (when request is EN_ATTENTE)
  title: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  // Payload fields update (for announcement-type requests)
  deliveryLink: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  brief: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  // Statut attendu par l'interface (spec 063) : refus si la demande a changé entre-temps.
  expectedStatus: z
    .enum(["EN_ATTENTE", "EN_COURS", "APPROUVEE", "EXECUTEE", "LIVRE", "REFUSEE", "ANNULE", "ERREUR"])
    .optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'une demande",
    description: "Avec la demande parente, les sous-demandes, l'annonce liée, la fonction destinataire et les départements qui la portent. 403 si l'appelant n'est ni gestionnaire, ni membre de l'équipe destinataire, ni demandeur.",
    access: "members:view",
    accessNote: "dans l'église de la demande ; le demandeur, `events:manage` ou un membre d'un département de la fonction destinataire",
    response: "Demande avec demandeur, relecteur, annonce, parente et sous-demandes",
  },
  PATCH: {
    summary: "Traitement ou correction d'une demande",
    description: "Le demandeur ne peut qu'annuler ou corriger sa demande tant qu'elle est en attente. L'équipe destinataire et `events:manage` changent le statut ; un refus exige une note, et une annulation par l'équipe exige un motif (spec 063). Approuver un type exécutable (événement, planning, accès) l'applique automatiquement (statut `EXECUTEE` ou `ERREUR`) et notifie les personnes concernées (spec 059). Annuler une demande parente annule ses sous-demandes et synchronise le statut de l'annonce. `expectedStatus` donne 409 si la demande a changé entre-temps. Le demandeur est notifié. Journalisé.",
    access: "session",
    accessNote: "`members:view` dans l'église de la demande, puis : le demandeur (annulation ou correction en attente), un membre d'un département de la fonction destinataire, ou `events:manage`",
    body: patchSchema,
    response: "Demande mise à jour (`id`, `type`, `status`, `executionError`) avec `notified`",
  },
  DELETE: {
    summary: "Suppression d'une demande",
    description: "Journalisé.",
    access: "events:manage",
    accessNote: "dans l'église de la demande",
    response: "`{ deleted: id }`",
  },
});
