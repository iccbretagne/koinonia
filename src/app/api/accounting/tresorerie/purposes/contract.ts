import { defineContract } from "@/lib/openapi/contract";
import { purposeInputSchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Objets des offrandes spéciales",
    description: "Missions, construction, actions de grâce, prémices, soutien… et ceux ajoutés par la compta.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    response: "Objets",
  },
  POST: {
    summary: "Ajout d'un objet d'offrande spéciale",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    body: purposeInputSchema,
    status: 201,
    response: "Objet créé",
  },
});
