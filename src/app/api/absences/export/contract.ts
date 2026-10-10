import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const exportSchema = z.object({
  churchId: z.string().min(1),
  absenceIds: z.array(z.string().min(1)).max(1000),
  /** Réponses « Pas disponible » affichées (spec 058) — second onglet du classeur. */
  responseIds: z.array(z.string().min(1)).max(1000).default([]),
});

export const contract = defineContract({
  POST: {
    summary: "Export Excel d'absences",
    description: "Génère le classeur à partir des identifiants affichés côté client ; tout identifiant hors périmètre est exclu sans erreur.",
    access: "absences:view",
    body: exportSchema,
    responseType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    response: "Classeur .xlsx en pièce jointe",
  },
});
