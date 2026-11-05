import { defineContract } from "@/lib/openapi/contract";
import { collectionInputSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Cultes proposés pour une collecte",
    description: "Événements de type culte de l'église, sept jours avant et après aujourd'hui.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    response: "Cultes",
  },
  POST: {
    summary: "Saisie de la collecte d'un culte",
    description:
      "Culte (facultatif) ou date, compte (une caisse, en général), deux personnes qui ont compté (différentes), et par catégorie d'entrée : le total en espèces et les chèques un par un (montant, numéro facultatif) ou leur total (`count`). Crée en une transaction une ligne « Espèces » et une ligne « Chèque » par catégorie, et les chèques en caisse. Objet obligatoire pour une offrande spéciale. Refusée dans un mois clôturé. Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: collectionInputSchema,
    status: 201,
    response: "`{ id, entryIds }`",
  },
});
