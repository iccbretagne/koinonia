import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Relance des répondants d'un questionnaire",
    description:
      "Spec 090. Questionnaire non soumis, au plus une relance par 24 h. Notification sans aucune valeur (titre, questionnaire, échéance, lien) ; lien personnel par email pour un répondant sans compte.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    response: "`{ sent }` : nombre de répondants relancés",
  },
});
