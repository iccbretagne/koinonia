import { defineContract } from "@/lib/openapi/contract";
import { answersBodySchema } from "@/modules/campaigns/schemas";

export { answersBodySchema };

export const contract = defineContract({
  PUT: {
    summary: "Enregistrement de réponses par un lien personnel",
    description:
      "Spec 090. Sauvegarde partielle (enregistrement automatique, 100 réponses au plus par envoi, 120 envois par minute). Chaque code doit appartenir au questionnaire (sinon 400) ; valeur validée selon le type, qualificatif et précision (estimation : valeur + précision ; à rechercher : note). Zéro est une valeur ; vide en « exacte » sans note efface la réponse. Premier enregistrement : « En cours » (journalisé). Saisie fermée (campagne non ouverte, questionnaire soumis) : 409.",
    access: "token",
    body: answersBodySchema,
    response: "État de l'affectation, alertes locales et complétude à jour",
  },
});
