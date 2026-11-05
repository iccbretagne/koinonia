import { defineContract } from "@/lib/openapi/contract";
import { categoryInputSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Catégories d'entrées et de sorties",
    description: "Créées par défaut à la première ouverture (dîmes, offrandes, offrandes spéciales… ; remises au compte commun, loyer…). `system` marque les catégories dont Koinonia a besoin.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    response: "Catégories",
  },
  POST: {
    summary: "Création d'une catégorie",
    description: "Nom unique par sens dans l'église. Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: categoryInputSchema,
    status: 201,
    response: "Catégorie créée",
  },
});
