import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Soumission d'un questionnaire par un lien personnel",
    description:
      "Spec 090. Refusée (400, libellés manquants) tant qu'une question obligatoire n'est pas renseignée ou qu'un « fichier transmis » n'a pas de fichier ; « à rechercher » compte comme renseigné. Le questionnaire passe à « Soumis », en lecture seule ; les gestionnaires sont prévenus. Journalisé.",
    access: "token",
    response: "`{ status, submittedAt, completeness }`",
  },
});
