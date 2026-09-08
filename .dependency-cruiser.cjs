/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    /**
     * Règle 1 — Pas d'import direct entre modules siblings.
     *
     * Chaque module ne peut importer que depuis lui-même, src/core et src/lib.
     * La communication cross-module passe uniquement par l'event bus (src/core/event-bus.ts).
     *
     * Une règle par module — les 11 modules sont couverts : plus explicite, pas de
     * dépendance aux backreferences.
     *
     * Seule exception, nommée : `storage` est l'infrastructure de stockage partagée
     * (ADR-0006), pas un domaine métier. `audio` et `media` peuvent l'importer ;
     * `storage` n'importe aucun module.
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
    {
      name: "no-accounting-imports-other-modules",
      severity: "error",
      comment: "Le module accounting ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/accounting/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!accounting/)",
      },
    },
    {
      name: "no-agenda-imports-other-modules",
      severity: "error",
      comment: "Le module agenda ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/agenda/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!agenda/)",
      },
    },
    {
      name: "no-jobs-imports-other-modules",
      severity: "error",
      comment: "Le module jobs ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/jobs/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!jobs/)",
      },
    },
    {
      name: "no-rooms-imports-other-modules",
      severity: "error",
      comment: "Le module rooms ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/rooms/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!rooms/)",
      },
    },
    {
      name: "no-audio-imports-other-modules",
      severity: "error",
      comment:
        "Le module audio ne peut importer aucun autre module, sauf storage (infrastructure partagee, ADR-0006).",
      from: {
        path: "^src/modules/audio/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!audio/|storage/)",
      },
    },
    {
      name: "no-media-imports-other-modules",
      severity: "error",
      comment:
        "Le module media ne peut importer aucun autre module, sauf storage (infrastructure partagee, ADR-0006).",
      from: {
        path: "^src/modules/media/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!media/|storage/)",
      },
    },
    /**
     * storage est l'infrastructure partagee (ADR-0006) : les autres modules
     * l'importent, mais lui-meme ne depend d'aucun module metier.
     */
    {
      name: "no-storage-imports-other-modules",
      severity: "error",
      comment: "Le module storage ne peut pas importer directement depuis un autre module.",
      from: {
        path: "^src/modules/storage/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/modules/(?!storage/)",
      },
    },

    /**
     * Règle 1bis — src/modules/** ne peut pas importer statiquement src/lib/registry.ts.
     *
     * registry.ts est la racine de composition : il importe TOUS les modules pour
     * calculer rolePermissions. Un import statique dans le sens inverse (un module
     * important registry.ts) crée un cycle qui peut provoquer un ReferenceError
     * "Cannot access '<var>' before initialization" (TDZ) non déterministe au build
     * Turbopack — cf. issue #446. Un import dynamique (`await import("@/lib/registry")`,
     * résolu à l'exécution plutôt qu'à l'évaluation du module) est le pattern déjà
     * utilisé dans src/lib/auth.ts et reste autorisé.
     */
    {
      name: "no-modules-static-import-registry",
      severity: "error",
      comment:
        "Un module ne peut pas importer statiquement src/lib/registry.ts (cycle avec la racine de composition) — utiliser un import dynamique si nécessaire.",
      from: {
        path: "^src/modules/",
        pathNot: "/__tests__/",
      },
      to: {
        path: "^src/lib/registry\\.ts$",
        dependencyTypesNot: ["dynamic-import"],
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

    /**
     * Règle 4 — le proxy ne dépend que des manifestes (spec 038).
     *
     * `src/proxy.ts` s'exécute avant toute notion d'identité, sur toute requête. Il ne
     * doit importer ni `src/lib/registry.ts` (qui tire les index de modules, donc
     * Prisma/NextAuth/S3 — exactement le couplage qu'ADR-0011 a démonté), ni un module
     * directement (même via `index.ts`/`auth.ts`, eux aussi trop lourds pour tourner sur
     * chaque requête sans base de données). Seul `src/lib/module-routes.ts` (manifestes
     * seuls) est autorisé.
     */
    {
      name: "proxy-only-module-routes",
      severity: "error",
      comment:
        "src/proxy.ts ne doit importer ni src/lib/registry.ts ni un module (src/modules/) — seuls les manifestes, via src/lib/module-routes.ts.",
      from: { path: "^src/proxy\\.ts$" },
      to: { path: "^src/(lib/registry\\.ts$|modules/)" },
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
