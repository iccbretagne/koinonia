import { defineContract } from "@/lib/openapi/contract";
import { depositInputSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  POST: {
    summary: "Remise au compte commun",
    description:
      "Sortie du compte (caisse), catégorie « Remises au compte commun », avec la référence du bordereau : montant = espèces remises + chèques cochés. Les chèques doivent être en caisse dans ce compte et collectés au plus tard à la date de remise ; ils quittent ensuite la liste des chèques en caisse. Refusée dans un mois clôturé. Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: depositInputSchema,
    status: 201,
    response: "`{ id, amount, cheques }`",
  },
});
