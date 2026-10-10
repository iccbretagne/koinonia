import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Historique d'une demande ou d'un suivi",
    description: "`kind` : `requests` ou `followups`.",
    access: "session",
    accessNote: "`care:view` ou `care:qualify` pour la vue d'ensemble ; sinon l'accompagnant en charge, objet par objet",
    response: "Événements de l'historique",
  },
});
