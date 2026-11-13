import { defineContract } from "@/lib/openapi/contract";
import { responsesQuerySchema } from "@/modules/forms/schemas";

export const contract = defineContract({
  GET: {
    summary: "Réponses d'un formulaire",
    description: "Réponses avec leurs valeurs et, pour un formulaire nominatif, le compte qui a répondu. Un sondage anonyme n'a aucune identité.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    query: responsesQuerySchema,
    response: "Réponses, de la plus ancienne à la plus récente",
  },
});
