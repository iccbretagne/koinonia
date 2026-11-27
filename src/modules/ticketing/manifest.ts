import { defineModule } from "@/core/module-registry";

/**
 * Module ticketing — billetterie des événements (spec 074) : inscriptions, paiements par
 * élément, billets à QR, équipe et contrôle des présences hors ligne, restauration (Agapé).
 *
 * Accès :
 *   - `ticketing:manage` (SA, Admin, Secrétaire) crée les événements ; il est organisateur
 *     implicite de tous les événements de son église
 *   - rôles d'événement (organisateur, trésorier, accueil, restauration, observateur) : des
 *     données, vérifiées objet par objet (`requireEventRole`)
 *   - public sans compte : inscription, « Ma réservation » et billet, par jetons secrets dont
 *     seule l'empreinte est stockée
 *
 * Koinonia n'encaisse rien : les paiements se font hors de l'application (Wero, Revolut, PayPal,
 * virement sur le compte de l'événement, espèces, chèque) et sont déclarés puis confirmés.
 */
export const ticketingModule = defineModule({
  name: "ticketing",
  version: "1.0.0",
  dependsOn: ["core", "planning"],

  routes: {
    authenticated: [{ path: "/evenements/billetterie" }, { path: "/plateforme/site-domains" }],
    api: [{ path: "/api/ticketing" }],
    public: [
      { path: "/inscription" },
      { path: "/reservation" },
      { path: "/billet" },
      // Site d'un événement (spec 084) : servi par son hôte seulement, le proxy répond 404 ailleurs.
      { path: "/site" },
      { path: "/api/ticketing/public" },
    ],
  },

  permissions: {
    // Création des événements de billetterie et organisation implicite (spec 074)
    "ticketing:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
  },

  notificationDomains: [
    {
      key: "ticketing",
      label: "Billetterie",
      description: "Réservations, paiements, jauge et rappels des événements de billetterie.",
      defaultEmail: true,
    },
  ],
});
