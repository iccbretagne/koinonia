import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Questionnaire d'une affectation de campagne",
    description:
      "Spec 090. Campagne, questionnaire (définition avec ses codes, non affichés), état de l'affectation, réponses, métadonnées des fichiers, alertes de cohérence locales, complétude et si la saisie est ouverte. Autre église, brouillon pour un répondant ou aucun droit : 404.",
    access: "session",
    accessNote: "répondant désigné ou gestionnaire de la campagne, dans l'église de la campagne",
    response: "Vue complète du questionnaire et de sa saisie",
  },
});
