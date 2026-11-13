import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Export des réponses d'un formulaire",
    description: "Classeur avec une ligne par réponse et une colonne par question, valeurs neutralisées contre l'injection de formules ; aucune identité pour un sondage anonyme. Journalisé.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    response: "Classeur des réponses",
    responseType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
});
