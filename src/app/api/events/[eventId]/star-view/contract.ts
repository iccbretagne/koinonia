import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Vue STAR d'un événement",
    description: "Départements avec les STAR planifiés, permanence d'accueil, ouverture et fermeture, feuille d'annonces et lien d'écoute du culte publié. Les départements sans STAR planifié ne sont signalés qu'à qui peut les planifier, pour un événement à venir.",
    access: "planning:view",
    accessNote: "dans l'église de l'événement",
    response: "Événement, départements et STAR planifiés, `totalStars`, `unstaffedDepartmentIds`, `canEditPlanning`, familles d'accueil, `audioLink`, ouverture/fermeture et feuille d'annonces",
  },
});
