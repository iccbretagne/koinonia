import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Nouveau lien personnel d'un répondant sans compte",
    description:
      "Spec 090. Nouveau sel : l'ancien lien est révoqué. Campagne ouverte : le lien est envoyé à la personne. Répondant avec compte : 400. Journalisé.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    response: "`{ link }` : adresse `/collecte/<jeton>`",
  },
});
