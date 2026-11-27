import { defineContract } from "@/lib/openapi/contract";
import { assignmentPatchSchema } from "@/modules/campaigns/schemas";

export { assignmentPatchSchema };

export const contract = defineContract({
  GET: {
    summary: "Questionnaire d'une affectation de campagne",
    description:
      "Spec 090. Campagne, questionnaire (définition avec ses codes, non affichés), état de l'affectation, réponses, métadonnées des fichiers, alertes de cohérence locales, complétude et si la saisie est ouverte. Autre église, brouillon pour un répondant ou aucun droit : 404.",
    access: "session",
    accessNote: "répondant désigné ou gestionnaire de la campagne, dans l'église de la campagne",
    response: "Vue complète du questionnaire et de sa saisie",
  },
  PATCH: {
    summary: "Échéance d'une contribution",
    description:
      "Spec 091. Sans réimport : un jour (fin de journée à Paris), un instant, ou `null` (échéance de la campagne). Si l'échéance applicable recule, la relance automatique J-2 peut repartir. Journalisé.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    body: assignmentPatchSchema,
    response: "`{ assignmentDueAt, dueAt }` : échéance propre et échéance applicable",
  },
});
