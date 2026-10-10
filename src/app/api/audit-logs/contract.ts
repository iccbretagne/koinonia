import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Journal d'audit de l'église",
    description: "Historique des modifications de l'église courante, du plus récent au plus ancien ; 400 si aucune église n'est sélectionnée.",
    access: "church:settings",
    accessNote: "dans l'église courante",
    query: z.object({
      page: z.string().optional().describe("Numéro de page ; défaut : 1"),
      limit: z.string().optional().describe("Taille de page ; défaut : 50, maximum : 100"),
    }),
    response: "`{ logs, total, page, totalPages }` ; chaque entrée inclut son auteur",
  },
});
