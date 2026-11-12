import { defineContract } from "@/lib/openapi/contract";
import { answersSchema } from "@/modules/forms/schemas";

export { answersSchema };

export const contract = defineContract({
  GET: {
    summary: "Ma réponse à un formulaire",
    access: "session",
    accessNote: "sa propre réponse seulement",
    response: "Valeurs et état de la réponse du compte, ou 404",
  },
  PATCH: {
    summary: "Modification de ma réponse",
    description: "Tant que le formulaire accepte des réponses ; mêmes contrôles qu'à l'envoi.",
    access: "session",
    accessNote: "sa propre réponse seulement",
    body: answersSchema,
    response: "Réponse modifiée",
  },
  DELETE: {
    summary: "Annulation de ma réponse",
    access: "session",
    accessNote: "sa propre réponse seulement",
    response: "Réponse annulée",
  },
});
