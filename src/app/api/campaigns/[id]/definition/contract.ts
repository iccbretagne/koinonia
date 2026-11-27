import { defineContract } from "@/lib/openapi/contract";
import { definitionQuerySchema } from "@/modules/campaigns/schemas";

export { definitionQuerySchema };

export const contract = defineContract({
  GET: {
    summary: "Définition JSON d'une campagne",
    description:
      "Spec 091. Document `koinonia.campaign` v1 reconstruit depuis la base : champs de campagne, modèles de messages, questionnaires (confidentiels compris, pour le gestionnaire) avec leurs destinataires et échéances propres, règles. Jamais de réponse, de fichier, de répondant ni de lien. Réimporté tel quel, il est annoncé « inchangé ». `download=1` : pièce jointe `<clé>.json`. Journalisé.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné ; sinon 404",
    query: definitionQuerySchema,
    response: "Document `koinonia.campaign` v1",
  },
});
