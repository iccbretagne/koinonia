import { defineContract } from "@/lib/openapi/contract";
import { formDuplicateSchema } from "@/modules/forms/schemas";

export { formDuplicateSchema };

export const contract = defineContract({
  POST: {
    summary: "Duplication d'un formulaire",
    description: "Copie en brouillon : réglages, questions, choix et conditions, sans aucune réponse. Journalisé.",
    access: "forms:manage",
    accessNote: "dans l'église du formulaire",
    body: formDuplicateSchema,
    response: "Nouveau brouillon",
    status: 201,
  },
});
