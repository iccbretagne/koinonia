import { defineContract } from "@/lib/openapi/contract";
import { respondentReplaceSchema } from "@/modules/campaigns/schemas";

export { respondentReplaceSchema };

export const contract = defineContract({
  POST: {
    summary: "Remplacement d'un répondant",
    description:
      "Spec 091. En un seul geste, sous verrou : le nouveau répondant (compte de l'église ou personne sans compte, mêmes règles que l'ajout) est ajouté, l'ancien retiré et son lien personnel révoqué. Réponses et fichiers restent à la contribution. Campagne ouverte : le nouveau est prévenu. Journalisé.",
    access: "session",
    accessNote: "gestionnaire de la campagne",
    body: respondentReplaceSchema,
    response: "Le nouveau répondant (sans lien)",
  },
});
