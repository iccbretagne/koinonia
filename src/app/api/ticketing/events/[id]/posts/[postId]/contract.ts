import { defineContract } from "@/lib/openapi/contract";
import { postSchema } from "@/modules/ticketing/schemas";

export { postSchema };

export const contract = defineContract({
  PATCH: {
    summary: "Renommer un poste",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: postSchema,
    response: "Poste mis à jour",
  },
  DELETE: {
    summary: "Supprimer un poste",
    description: "Ses affectations restent, sans poste. Journalisé.",
    access: "session",
    accessNote: "organisateur de l'événement",
    response: "`{ ok: true }`",
  },
});
