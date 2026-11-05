import { defineContract } from "@/lib/openapi/contract";
import { budgetInputSchema, yearQuerySchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Budget prévisionnel et réalisé",
    description:
      "Budget de l'année (`year`, défaut : l'année en cours) par catégorie et par mois, et comparaison avec le réalisé du registre (transferts exclus) pour le mois courant (décembre pour une année passée) et depuis le début de l'année : montant, écart, pourcentage. Une catégorie de sortie qui dépasse son budget annuel est signalée (`overBudget`), à partir de 90 % elle est à surveiller (`warning`).",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    query: yearQuerySchema,
    response: "`{ year, month, budget, comparison }`",
  },
  PUT: {
    summary: "Saisie du budget d'une année",
    description: "Par catégorie : un montant annuel réparti également sur les 12 mois (au centime, le reste sur décembre) ou les 12 montants mensuels. Les catégories absentes gardent leur budget. Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: budgetInputSchema,
    response: "Budget de l'année",
  },
});
