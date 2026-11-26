import { defineContract } from "@/lib/openapi/contract";
import { campaignSettingsSchema } from "@/modules/campaigns/schemas";

export { campaignSettingsSchema };

export const contract = defineContract({
  GET: {
    summary: "Pilotage d'une campagne",
    description:
      "Paramètres, questionnaires et destinataires avec leur état, répondants (compte ou lien personnel, jamais le lien lui-même), complétude par destinataire (obligatoires manquantes, estimations, à rechercher, fichiers attendus et reçus, métadonnées des fichiers), taux global (soumis et validés sur le total), contrôles de cohérence (règles locales par destinataire, règles croisées sur toute la campagne) et gestionnaires. Questionnaires confidentiels compris.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné de la campagne ; sinon 404",
    response: "`{ campaign, forms, progress, checks, managers }`",
  },
  PATCH: {
    summary: "Paramètres d'une campagne",
    description: "Titre, description, période de référence, échéance (un jour = fin de journée à Paris), conservation des fichiers (1 à 365 jours). Journalisé.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné",
    body: campaignSettingsSchema,
    response: "Paramètres mis à jour",
  },
});
