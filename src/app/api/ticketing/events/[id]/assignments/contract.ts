import { defineContract } from "@/lib/openapi/contract";
import { assignmentSchema } from "@/modules/ticketing/schemas";

export { assignmentSchema };

export const contract = defineContract({
  POST: {
    summary: "Affectation à l'équipe d'un événement",
    description:
      "Un compte de l'église, quel que soit son département (400 sinon), ou un intervenant nommé sans compte ; poste et créneau facultatifs. Badge personnel créé (seule son empreinte est stockée). Le compte affecté est notifié et voit l'affectation dans « Mon planning ». Journalisée.",
    access: "session",
    accessNote: "organisateur de l'événement",
    body: assignmentSchema,
    status: 201,
    response: "Affectation créée",
  },
});
