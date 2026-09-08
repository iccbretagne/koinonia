import { defineModule } from "@/core/module-registry";

/**
 * Module intégration — suivi des parcours d'intégration.
 *
 * Périmètre :
 *   - Demandes d'intégration aux familles
 *   - Suivi MSDP des nouveaux convertis (appel au salut)
 *   - Affectation bergers et conseillers MSDP
 *   - KPIs et statistiques
 *
 * Dépendances : core (obligatoire)
 */
export const integrationModule = defineModule({
  name: "integration",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/integration" }],
    api: [{ path: "/api/integration" }],
    // Formulaire "rejoindre" (page /rejoindre/[churchSlug]) — hors session, Turnstile-protégé.
    public: [
      { path: "/rejoindre" },
      // GET (liste, réservé à requireIntegrationAccess) reste protégé — seule la
      // soumission POST est publique.
      { path: "/api/integration/requests", method: "POST" },
      { path: "/api/integration/families/suggest" },
    ],
  },

  permissions: {},
});
