import { defineContract } from "@/lib/openapi/contract";
import { optionUpdateSchema } from "@/modules/ticketing/schemas";

export { optionUpdateSchema };

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'une option",
    description:
      "Champs qui engagent les inscrits : existence, prix, stock (jamais sous les quantités réservées), remboursement. Le type ne change plus une fois l'option choisie. Journalisée.",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: optionUpdateSchema,
    response: "Option mise à jour",
  },
  DELETE: {
    summary: "Suppression d'une option",
    description: "Supprimée si jamais choisie ; sinon seulement désactivée (`deleted: false`). Journalisée.",
    access: "session",
    accessNote: "organisateur de l'événement",
    response: "`{ deleted }`",
  },
});
