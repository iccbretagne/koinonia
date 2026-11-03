import { defineModule } from "@/core/module-registry";

/**
 * Module shuttle — registre de suivi budgétaire de la navette (spec 073), extension de la
 * comptabilité.
 *
 * Périmètre :
 *   - Registre continu : solde de départ, abondements, dépenses déclarées avec justificatif,
 *     restitutions de caution, remboursements du loueur ; solde à date et par période
 *   - Locations de véhicule, cautions en cours, alerte de solde bas, export
 *   - Liens avec la comptabilité : remboursement d'une avance personnelle (note de frais créée
 *     depuis la ligne), avances de budget versées lues dans la comptabilité, notes de frais hors
 *     registre ajoutables
 *
 * Accès : `shuttle:manage` (compta) ou appartenance à un département de fonction NAVETTE
 * (ADR-0014). Désactivable par `ENABLED_MODULES` sans toucher à la comptabilité.
 */
export const shuttleModule = defineModule({
  name: "shuttle",
  version: "1.0.0",
  dependsOn: ["core", "planning", "accounting"],

  routes: {
    authenticated: [{ path: "/accounting/navette" }],
    api: [{ path: "/api/accounting/navette" }],
  },

  permissions: {
    // Gestion du registre : abondements, solde de départ, corrections à tout moment,
    // signalements, réglages, export (mêmes titulaires que accounting:manage)
    "shuttle:manage": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
  },

  notificationDomains: [
    {
      key: "shuttle",
      label: "Navette",
      description: "Dépenses déclarées par la navette, signalements, solde bas.",
      defaultEmail: true,
      visibleWith: ["shuttle:manage"],
    },
  ],
});
