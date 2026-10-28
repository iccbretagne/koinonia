import { defineModule } from "@/core/module-registry";

/**
 * Module serving — candidatures au service (fiche STAR, spec 073).
 *
 * Périmètre :
 *   - Formulaire public par église `/servir/<slug>` (fiche + photo), sans compte
 *   - Étude par l'équipe « Vie des STAR » (PVS, fonction de département) et l'Admin, PDF
 *     téléchargé depuis la plateforme
 *   - Affectation à un ou plusieurs départements ; chaque département accueille (la personne
 *     devient STAR, en observation), confirme ou renvoie au PVS
 *   - Consultation de sa fiche par le STAR accueilli (lecture seule)
 *   - Rappels de fin d'observation, relances, purge des candidatures non retenues
 *
 * Dépendances : core, planning (fiche STAR et départements, injectés par les routes — le module
 * n'importe jamais `planning`), storage (photo).
 */
export const servingModule = defineModule({
  name: "serving",
  version: "1.0.0",
  dependsOn: ["core", "planning", "storage"],

  routes: {
    authenticated: [{ path: "/candidatures" }],
    api: [{ path: "/api/serving" }],
    public: [{ path: "/servir" }, { path: "/api/serving/public", method: "POST" }],
  },

  permissions: {
    // Gestion des candidatures de l'église hors équipe PVS (dépannage) : administration seulement.
    // L'équipe PVS passe par la fonction de département `VIE_DES_STAR`, pas par un rôle.
    "serving:manage": ["SUPER_ADMIN", "ADMIN"],
  },

  notificationDomains: [
    {
      key: "serving",
      label: "Candidatures au service",
      description: "Nouvelles candidatures, affectations, fins d'observation et renvois au PVS.",
      defaultEmail: true,
      visibleWith: ["serving:manage"],
    },
  ],
});
