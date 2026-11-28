import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Réservations d'un événement",
    description:
      "Participants, éléments payants et soldes (dû, déclaré, payé, reste, à rembourser). Coordonnées et réponses pour l'organisateur et le trésorier seulement ; l'observateur reçoit les noms et soldes, sans contact ni détail des éléments.",
    access: "session",
    accessNote: "organisateur, trésorier ou observateur de l'événement",
    response: "Liste des réservations",
  },
});
