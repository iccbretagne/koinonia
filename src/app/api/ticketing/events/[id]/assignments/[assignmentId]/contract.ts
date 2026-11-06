import { defineContract } from "@/lib/openapi/contract";
import { assignmentUpdateSchema } from "@/modules/ticketing/schemas";

export { assignmentUpdateSchema };

export const contract = defineContract({
  PATCH: {
    summary: "Modifier une affectation",
    description:
      "Change le poste (`null` : sans poste, sinon un poste de l'événement) ou le créneau (fin après le début) ; la personne affectée reste la même. Un compte affecté est prévenu du changement. Journalisé.",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: assignmentUpdateSchema,
    response: "Affectation mise à jour",
  },
  DELETE: {
    summary: "Retrait d'une affectation",
    description: "Le badge cesse d'être reconnu à la prochaine synchronisation. Journalisé.",
    access: "session",
    accessNote: "organisateur de l'événement",
    response: "`{ ok: true }`",
  },
});
