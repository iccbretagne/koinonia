import { defineContract } from "@/lib/openapi/contract";
import { campaignSettingsSchema } from "@/modules/campaigns/schemas";

export { campaignSettingsSchema };

export const contract = defineContract({
  GET: {
    summary: "Pilotage d'une campagne",
    description:
      "Paramètres, questionnaires et destinataires avec leur état, répondants (compte ou lien personnel, jamais le lien lui-même), complétude par destinataire (obligatoires manquantes, estimations, à rechercher, fichiers attendus et reçus, métadonnées des fichiers), taux global (soumis et validés sur le total), contrôles de cohérence (règles locales par destinataire, règles croisées sur toute la campagne) et gestionnaires. Questionnaires confidentiels compris. Spec 091 : `campaign.churchName` et `campaign.messageTemplates` (modèles personnalisés, clé absente = texte par défaut) ; par destinataire, `issues` (questions concernées : manquante, à rechercher, estimée, fichier attendu, contrôle non respecté) et `exploitable` ; `progress.exploitable`.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné de la campagne ; sinon 404",
    response: "`{ campaign, forms, progress, checks, managers }`",
  },
  PATCH: {
    summary: "Paramètres d'une campagne",
    description: "Titre, description, période de référence, échéance (un jour = fin de journée à Paris), conservation des fichiers (1 à 365 jours), modèles de messages (spec 091 : l'objet remplace l'ensemble des modèles personnalisés ; `null` ou `{}` rétablit les textes par défaut). Journalisé.",
    access: "campaigns:manage",
    accessNote: "dans l'église de la campagne, ou gestionnaire désigné",
    body: campaignSettingsSchema,
    response: "Paramètres mis à jour",
  },
});
