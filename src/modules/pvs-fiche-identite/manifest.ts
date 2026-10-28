import { defineModule } from "@/core/module-registry";

/**
 * Module fiche d'identité — candidatures de serviteurs.
 *
 * Périmètre :
 *   - Formulaire public de fiche d'identité (avec photo)
 *   - Génération du PDF et envoi par email à l'équipe
 *
 * Dépendances : core (obligatoire)
 */
export const ficheIdentiteModule = defineModule({
  name: "fiche-identite",
  version: "1.0.0",
  dependsOn: ["core"],

  routes: {
    authenticated: [{ path: "/pvs-fiche-identite" }],
    api: [{ path: "/api/pvs-fiche-identite" }],
    public: [
      { path: "/pvs-fiche-identite" },
      // Seule la soumission est publique ; un éventuel GET (liste) resterait protégé.
      { path: "/api/pvs-fiche-identite", method: "POST" },
    ],
  },
});