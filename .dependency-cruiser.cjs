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
     * Règle 3 — src/app ne peut importer que l'index public d'un module.
     *
     * Protège les API publiques : seul {module}/index.ts est importable
     * depuis src/app/. Les fichiers internes d'un module ne sont pas
     * accessibles directement depuis les routes Next.js.
     */
    {
      name: "app-only-module-public-api",
      severity: "error",
      comment:
        "src/app/ ne peut importer que l'index public d'un module (src/modules/{name}/index.ts).",
      from: { path: "^src/app/" },
      to: {
        path: "^src/modules/[^/]+/",
        pathNot: "^src/modules/[^/]+/index\\.ts$",
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
