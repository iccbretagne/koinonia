import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const releaseSchema = z.object({
  releasedAt:     z.string().datetime(),
  releasedAmount: z.number().positive(),
  note:           z.string().max(500).optional(),
  /** Compte de trésorerie d'où sort le paiement (spec 076) ; absent ou null = compte commun. */
  treasuryAccountId: z.string().min(1).nullish(),
});

export const contract = defineContract({
  PATCH: {
    summary: "Confirmation de la remise d'un paiement",
    description: "Une remise partielle crée une tranche résiduelle non confirmée. Le demandeur est notifié (domaine `accounting`, un seul email détaillé). `treasuryAccountId` : paiement sorti d'un compte de trésorerie de l'église (spec 076), repris automatiquement dans son registre ; le compte doit être actif et le mois de la remise ouvert dans la trésorerie ; refusé (400) si le module trésorerie est désactivé. Absent : payé depuis le compte commun, non repris.",
    access: "accounting:manage",
    accessNote: "dans l'église courante",
    body: releaseSchema,
    response: "Paiement confirmé",
  },
});
