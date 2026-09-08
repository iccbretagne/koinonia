import { defineModule } from "@/core/module-registry";

/**
 * Module audio — publication des enregistrements de culte (dépôt, découpage/nommage,
 * publication, lecture publique) et bibliothèque d'écoute ouverte à tout membre (spec 021).
 * P1 : chemin « séquences déjà mixées/découpées » uniquement —
 * voir specs/019-audio-cultes-publication/plan.md.
 *
 * Dépendances : core (obligatoire), storage (S3 multipart), planning (lie un culte audio à un
 * événement via `planningEventId`).
 */
export const audioModule = defineModule({
  name: "audio",
  version: "1.0.0",
  dependsOn: ["core", "storage", "planning"],

  permissions: {
    // Écoute des cultes publiés (bibliothèque + fiche d'événement) — tout membre authentifié
    // (spec 021 : « restreindre la liste plus que le lien de partage n'aurait pas de sens »)
    "audio:listen":  ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD",
                       "DISCIPLE_MAKER", "REPORTER", "STAR", "AGENDA_QUALIFIER", "ACCOUNTANT"],
    // Accès en lecture à la file d'attente et aux cultes publiés (espace de production)
    "audio:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Dépôt de séquences (en plus de l'équipe de captation via isCaptureTeamMember)
    "audio:upload":  ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Corriger un découpage, publier/dépublier
    "audio:review":  ["SUPER_ADMIN", "ADMIN"],
    // Administration du module (paramètres — couverture, template de séquences)
    "audio:manage":  ["SUPER_ADMIN", "ADMIN"],
  },

  navigation: [
    { label: "Audio", icon: "audio", href: "/audio", permission: "audio:listen" },
  ],
});
