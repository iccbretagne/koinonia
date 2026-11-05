import { defineContract } from "@/lib/openapi/contract";
import { budgetCopySchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  POST: {
    summary: "Reprise du budget de l'année précédente",
    description: "Copie dans `year` le budget de `year − 1` (`from: \"budget\"`) ou son réalisé (`from: \"actual\"`), mois par mois, à ajuster ensuite. Remplace le budget des catégories reprises. 400 s'il n'y a rien à reprendre.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: budgetCopySchema,
    response: "Budget de l'année",
  },
});
