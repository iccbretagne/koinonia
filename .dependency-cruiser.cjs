/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    /**
     * Règle 1 — Pas d'import direct entre modules siblings.
     *
     * Chaque module ne peut importer que depuis lui-même, src/core et src/lib.
     * La communication cross-module passe uniquement par l'event bus (src/core/event-bus.ts).
     *
     * Une règle par module : plus explicite, pas de dépendance aux backreferences.
     */
    {
      name: "no-planning-imports-other-modules",
      severity: "error",
      comment: "Le module planning ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/planning/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!planning/)",
      },
    },
    {
      name: "no-discipleship-imports-other-modules",
      severity: "error",
      comment: "Le module discipleship ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/discipleship/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!discipleship/)",
      },
    },
    {
      name: "no-core-module-imports-other-modules",
      severity: "error",
      comment: "Le module core ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/core/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!core/)",
      },
    },
    {
      name: "no-integration-imports-other-modules",
      severity: "error",
      comment: "Le module integration ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/integration/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!integration/)",
      },
    },

    /**
     * Règle 2 — src/core ne dépend d'aucun module applicatif.
     *
     * Le noyau (ModuleRegistry, EventBus, boot) doit rester indépendant.
     */
    {
      name: "core-no-modules-import",
      severity: "error",
      comment: "src/core/ ne doit pas importer depuis src/modules/.",
      from: {
        path: "^src/core/",
        pathNot: "/__tests__/", // les tests d'intégration peuvent valider la cohérence cross-layer
      },
      to: { path: "^src/modules/" },
    },

    /**
     * Règle 3 — src/app ne peut importer que les points d'entrée publics d'un module.
     *
     * Points d'entrée autorisés :
     *   - {module}/index.ts  — manifest + exports domaine (sans dépendances Node.js/Next.js)
     *   - {module}/auth.ts   — guards d'authentification spécifiques au module
     *     (second point d'entrée séparé pour éviter que next-auth ne pollue le
     *      graphe d'imports du registry lors des tests unitaires)
     */
    {
      name: "app-only-module-public-api",
      severity: "error",
      comment:
        "src/app/ ne peut importer que les points d'entrée publics d'un module (index.ts ou auth.ts).",
      from: { path: "^src/app/" },
      to: {
        path: "^src/modules/[^/]+/",
        pathNot: "^src/modules/[^/]+/(index|auth)\\.ts$",
      },
    },
  ],

  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
