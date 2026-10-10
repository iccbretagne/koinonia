import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const releaseSchema = z.object({
  releasedAt:     z.string().datetime(),
  releasedAmount: z.number().positive(),
  note:           z.string().max(500).optional(),
});

export const contract = defineContract({
  PATCH: {
    summary: "Confirmation de la remise d'un paiement",
    description: "Une remise partielle crée une tranche résiduelle non confirmée. Le demandeur est notifié (domaine `accounting`, un seul email détaillé).",
    access: "accounting:manage",
    accessNote: "dans l'église courante",
    body: releaseSchema,
    response: "Paiement confirmé",
  },
});
