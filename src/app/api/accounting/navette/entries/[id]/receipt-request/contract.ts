import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const params = z.object({ id: z.string() });
export const receiptRequestSchema = z.object({ note: z.string().trim().max(500).optional() });

export const contract = defineContract({
  PUT: {
    summary: "Demande du justificatif d'une ligne à son auteur",
    description: "Spec 086. Demande ou relance (compteur et date mis à jour) ; l'auteur est notifié et peut redéposer le justificatif même hors du délai de 48 h. Journalisé.",
    access: "shuttle:manage",
    accessNote: "dans l'église de la ligne",
    params,
    body: receiptRequestSchema,
    response: "Ligne avec la demande en cours",
  },
  DELETE: {
    summary: "Annulation de la demande de justificatif",
    access: "shuttle:manage",
    accessNote: "dans l'église de la ligne",
    params,
    response: "Ligne",
  },
});
