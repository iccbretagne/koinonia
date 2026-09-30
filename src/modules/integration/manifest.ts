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

  permissions: {
    // Accès complet aux dossiers d'accueil et parcours (coordonnées personnelles, export) —
    // Super Admin, Admin, Secrétaire. Ne s'approxime plus par members:manage/events:manage,
    // détenus par tout Ministre/Resp. département quel que soit son département (spec 054/#583).
    // L'équipe (fonction INTEGRATION/MSDP) et les bergers gardent leur accès via une garde dédiée
    // (requireIntegrationAccess), indépendante de cette permission.
    "integration:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Suppression définitive d'une demande d'intégration (spec 057) — Admin/Super Admin seuls.
    "integration:delete": ["SUPER_ADMIN", "ADMIN"],
  },

  // Domaine de notification (spec 053) : envoie déjà des emails (berger affecté) — activé par
  // défaut. Visible avec `integration:manage` (spec 054, plus l'ancien raccourci
  // members:manage/events:manage) ; l'équipe (INTEGRATION/MSDP) et les bergers, qui n'ont pas
  // cette permission, voient quand même le réglage dès qu'ils ont reçu une notification du
  // domaine (`isDomainVisible`, historique).
  notificationDomains: [
    {
      key: "integration",
      label: "Intégration",
      description: "Demande d'accueil confiée, demande renvoyée, rappel de relance.",
      defaultEmail: true,
      visibleWith: ["integration:manage"],
    },
  ],
});
