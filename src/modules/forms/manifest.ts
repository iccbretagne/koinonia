import { defineModule } from "@/core/module-registry";

/**
 * Module forms — formulaires construits par le secrétariat (spec 079, ADR-0030) : inscriptions,
 * participation à un événement, sondages anonymes ou nominatifs.
 *
 * Accès :
 *   - `forms:manage` (Super Admin, Admin, Secrétaire) construit, publie, ferme, supprime, consulte
 *     et exporte les formulaires de son église
 *   - répondants : formulaire public (sans compte, anti-robot et limite de débit) ou réservé aux
 *     comptes connectés de l'église ; chacun gère sa propre réponse (jeton ou compte)
 *
 * Le moteur (questions typées, réponses validées par un schéma dérivé, affichage conditionnel)
 * est exposé par l'index pour d'autres modules ; `forms` n'importe ni `planning` ni `ticketing`.
 */
export const formsModule = defineModule({
  name: "forms",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/formulaires" }],
    api: [{ path: "/api/forms" }],
    public: [{ path: "/f" }, { path: "/api/forms/public" }],
  },

  permissions: {
    // Construction, publication, réponses et export des formulaires (spec 079)
    "forms:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
  },

  notificationDomains: [
    {
      key: "forms",
      label: "Formulaires",
      description: "Nouvelles réponses à vos formulaires, accusés de réception de vos propres réponses.",
      defaultEmail: true,
    },
  ],
});
