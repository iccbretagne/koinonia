import { defineContract } from "@/lib/openapi/contract";
import { answersSchema } from "@/modules/forms/schemas";

export { answersSchema };

export const contract = defineContract({
  GET: {
    summary: "Ma réponse (lien de gestion)",
    description: "Réponse rattachée au jeton du lien reçu par email, avec le formulaire. Jeton inconnu ou formulaire supprimé : 404.",
    access: "token",
    response: "Formulaire, valeurs de la réponse, état, et si elle peut encore être modifiée",
  },
  PATCH: {
    summary: "Modification de ma réponse",
    description: "Tant que le formulaire accepte des réponses ; mêmes contrôles qu'à l'envoi, un choix devenu complet est refusé (409).",
    access: "token",
    body: answersSchema,
    response: "Réponse modifiée",
  },
  DELETE: {
    summary: "Annulation de ma réponse",
    description: "La réponse passe à « Annulée » et libère sa place.",
    access: "token",
    response: "Réponse annulée",
  },
});
