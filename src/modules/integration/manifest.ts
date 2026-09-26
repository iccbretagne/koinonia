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

  // Domaine de notification (spec 053) : envoie déjà des emails (berger affecté) — activé par
  // défaut. Pas de permission propre au module (voir CLAUDE.md) : la visibilité s'appuie sur les
  // permissions du module planning qui approximent aujourd'hui l'équipe intégration
  // (`requireIntegrationAccess`).
  notificationDomains: [
    {
      key: "integration",
      label: "Intégration",
      description: "Demande d'accueil confiée, demande renvoyée, rappel de relance.",
      defaultEmail: true,
      visibleWith: ["members:manage", "events:manage"],
    },
  ],
});
