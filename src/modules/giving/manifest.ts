import { defineModule } from "@/core/module-registry";

/**
 * Module giving — page publique « Donner » d'une église et slide de projection (spec 065).
 *
 * Périmètre :
 *   - Paramétrage de la page (don en ligne, virement, sur place, reçu fiscal, bas de page)
 *   - Page publique `/donner/<slug>` sans compte
 *   - Slide « Dîmes & Offrandes » avec QR code (téléchargement et plein écran)
 *   - Intégrité des coordonnées : journal des modifications et alerte de la comptabilité (ou des
 *     Admins de l'église) à chaque changement d'IBAN, de BIC, de bénéficiaire ou de lien de don
 *   - Nom et logo de l'église sur la page et la slide (spec 066) : le logo est déposé par le
 *     serveur, réencodé, et son dépôt alerte comme un changement de coordonnées
 *
 * Dépendances : core (obligatoire), storage (logo). Koinonia n'encaisse rien : la page renvoie vers le service
 * de don en ligne de l'église et affiche ses coordonnées bancaires.
 */
export const givingModule = defineModule({
  name: "giving",
  version: "1.0.0",
  dependsOn: ["core", "storage"],

  routes: {
    authenticated: [{ path: "/dons" }],
    api: [{ path: "/api/giving" }],
    public: [{ path: "/donner" }, { path: "/api/giving/public", method: "GET" }],
  },

  permissions: {
    // Paramétrage de la page et slide : administration, secrétariat et comptabilité (spec 065)
    "giving:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY", "ACCOUNTANT"],
  },

  // Alerte de modification des coordonnées de paiement, adressée aux Admins de l'église quand
  // aucune adresse comptable n'est configurée (spec 065) — email activé par défaut.
  notificationDomains: [
    {
      key: "giving",
      label: "Page de dons",
      description: "Modification des coordonnées de paiement de la page de dons de l'église.",
      defaultEmail: true,
      visibleWith: ["giving:manage", "church:settings"],
    },
  ],
});
