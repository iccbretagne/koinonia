import { defineContract } from "@/lib/openapi/contract";
import { facilitatorsSchema } from "@/modules/forms/schemas";

export { facilitatorsSchema };

export const contract = defineContract({
  GET: {
    summary: "Intervenants d'un formulaire",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    response: "Intervenants, avec tout le formulaire ou leurs sessions et niveaux",
  },
  PUT: {
    summary: "Désignation des intervenants",
    description:
      "Remplace la liste. Comptes de l'église seulement ; inscription à sessions seulement ; chacun sur tout le formulaire ou sur des sessions et niveaux du formulaire. Les nouveaux intervenants sont prévenus (domaine forms). Journalisé.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    body: facilitatorsSchema,
    response: "Intervenants enregistrés",
  },
});
