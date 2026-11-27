import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Lien personnel actif d'un répondant sans compte",
    description:
      "Spec 091. Pour composer un message individuel : renvoie le lien actif (créé s'il n'existe pas encore, sans révoquer un lien existant). Rien n'est envoyé. Répondant avec compte : 400. Consultation journalisée, sans le lien.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    response: "`{ link }` : adresse `/collecte/<jeton>`",
  },
  POST: {
    summary: "Nouveau lien personnel d'un répondant sans compte",
    description:
      "Spec 090. Nouveau sel : l'ancien lien est révoqué. Campagne ouverte : le lien est envoyé à la personne. Répondant avec compte : 400. Journalisé.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    response: "`{ link }` : adresse `/collecte/<jeton>`",
  },
});
