import { defineContract } from "@/lib/openapi/contract";
import { responseStatusSchema } from "@/modules/forms/schemas";

export { responseStatusSchema };

export const contract = defineContract({
  PATCH: {
    summary: "Annulation d'une réponse par la gestion",
    description: "La réponse passe à « Annulée » et libère sa place. 409 si elle est déjà close. Journalisé.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    body: responseStatusSchema,
    response: "Réponse mise à jour",
  },
});
