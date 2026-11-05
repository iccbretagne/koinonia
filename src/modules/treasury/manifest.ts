import { defineModule } from "@/core/module-registry";

/**
 * Module treasury — trésorerie de l'église (spec 076), extension de la comptabilité.
 *
 * Périmètre :
 *   - Comptes de trésorerie (caisse, coffre, en ligne) avec solde de départ daté, archivage
 *   - Registre continu des entrées et sorties, solde après chaque ligne, catégories et objets
 *   - Collecte de culte, chèques en caisse, remise au compte commun, transferts entre comptes
 *   - Clôture mensuelle, budget prévisionnel annuel, rapports, export
 *   - Reprise par lecture (ADR-0027) des paiements de demandes et des abondements de la navette
 *     payés depuis un compte de trésorerie
 *
 * Accès : `treasury:manage` (Super Admin, Admin, Comptable) ; réouverture d'un mois clôturé
 * `treasury:reopen` (Super Admin, Admin). Désactivable par `ENABLED_MODULES` sans toucher à la
 * comptabilité ni à la navette.
 */
export const treasuryModule = defineModule({
  name: "treasury",
  version: "1.0.0",
  dependsOn: ["core", "accounting"],

  routes: {
    authenticated: [{ path: "/accounting/tresorerie" }],
    api: [{ path: "/api/accounting/tresorerie" }],
  },

  permissions: {
    // Tenir la trésorerie : saisies, comptes, catégories, collecte, remise, clôture, budget, export
    "treasury:manage": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
    // Rouvrir un mois clôturé (avec motif)
    "treasury:reopen": ["SUPER_ADMIN", "ADMIN"],
  },
});
