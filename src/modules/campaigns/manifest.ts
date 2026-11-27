import { defineModule } from "@/core/module-registry";

/**
 * Module campaigns — campagnes de collecte de données (spec 090, ADR-0032) : questionnaires
 * remplis par des responsables, relances, corrections demandées, validation, contrôles de cohérence.
 *
 * Accès :
 *   - `campaigns:manage` (Super Admin, Admin) crée, importe et pilote les campagnes de son église
 *   - gestionnaires d'une campagne et répondants d'une affectation : données, pas des
 *     permissions — un compte de l'église désigné, ou une personne sans compte munie de son lien
 *     personnel (`/collecte/<jeton>`, jeton dérivé dont seule l'empreinte est stockée)
 *   - l'église qui fait foi est celle de la campagne ; autre église ou aucun droit : 404
 *
 * `campaigns` n'importe aucun autre module (règle dependency-cruiser).
 */
export const campaignsModule = defineModule({
  name: "campaigns",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/demandes/questionnaires" }],
    api: [{ path: "/api/campaigns" }],
    public: [{ path: "/collecte" }, { path: "/api/campaigns/public" }],
  },

  permissions: {
    // Création, import et pilotage des campagnes de collecte (spec 090)
    "campaigns:manage": ["SUPER_ADMIN", "ADMIN"],
  },

  notificationDomains: [
    {
      key: "campaigns",
      label: "Collectes",
      description: "Questionnaires de collecte à remplir, relances, corrections demandées et soumissions.",
      defaultEmail: true,
    },
  ],
});
