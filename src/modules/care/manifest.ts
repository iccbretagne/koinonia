import { defineModule } from "@/core/module-registry";

/**
 * Module care — Suivi et rendez-vous pastoraux (ADR-0015, spec 052).
 *
 * Périmètre :
 *   - Demandes de rendez-vous pastoral (dépôt, qualification, affectation, rejet, issue)
 *   - Suivis de nouveaux convertis (naissance, affectation, étapes, clôture)
 *   - Affectation à un accompagnant (profil pastoral ou membre du MSDP), retours au
 *     référent, relances, confidentialité du contenu
 *
 * Dépendances : core (obligatoire). Aucun import vers/depuis `agenda` ou `integration` —
 * les réactions passent par le bus d'événements (abonnement dans `src/lib/registry.ts`).
 */
export const careModule = defineModule({
  name: "care",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/care" }],
    api: [{ path: "/api/care" }],
    // Formulaire public de demande de RDV (Turnstile-protégé) — adresse historique
    // conservée (ADR-0015), déplacée depuis `agenda`.
    public: [
      { path: "/agenda-public" },
      { path: "/api/care/requests/public", method: "POST" },
    ],
  },

  permissions: {
    // Qualification, affectation, rejet, réglages — Référent soins pastoraux (ex-Qualificateur
    // agenda, renommé) + Admin/Super Admin.
    "care:qualify": ["SUPER_ADMIN", "ADMIN", "PASTORAL_CARE_REFERENT"],
    // Vue d'ensemble sans droit de qualifier — Secrétaire en plus des détenteurs ci-dessus.
    "care:view": ["SUPER_ADMIN", "ADMIN", "SECRETARY", "PASTORAL_CARE_REFERENT"],
  },

  navigation: [
    { label: "Suivi pastoral", icon: "heart", href: "/care", permission: "care:view" },
  ],
});
