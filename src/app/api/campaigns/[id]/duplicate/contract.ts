import { defineContract } from "@/lib/openapi/contract";
import { duplicateCampaignSchema } from "@/modules/campaigns/schemas";

export { duplicateCampaignSchema };

export const contract = defineContract({
  POST: {
    summary: "Duplication d'une campagne",
    description:
      "Spec 091. Nouvelle campagne en brouillon dans l'église de la source : même structure, règles, confidentialité et modèles de messages ; nouveaux titre, clé et dates (absentes = celles de la source, `null` = aucune). `keepAssignments` garde les destinataires sans leur échéance propre ; sinon un destinataire par questionnaire. Rien d'autre n'est copié : ni réponse, ni fichier, ni répondant, ni lien, ni validation, ni historique. L'auteur devient gestionnaire. Journalisé.",
    access: "campaigns:manage",
    accessNote: "gestionnaire de la campagne source **et** `campaigns:manage` dans son église (403 sinon)",
    body: duplicateCampaignSchema,
    response: "Aperçu d'import de la création, avec `campaignId` (201)",
    status: 201,
  },
});
