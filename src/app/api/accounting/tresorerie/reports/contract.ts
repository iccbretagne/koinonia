import { defineContract } from "@/lib/openapi/contract";
import { periodQuerySchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Rapports de trésorerie d'une période",
    description: "Totaux des entrées et des sorties par catégorie (offrandes spéciales détaillées par objet), par moyen et par mois, calculés depuis le registre (transferts exclus) : ils se recoupent avec lui.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    query: periodQuerySchema,
    response: "Rapports",
  },
});
