# ADR-0004 — Import dynamique comme échappatoire au cycle `registry.ts` ↔ modules

- **Statut** : Accepté
- **Date** : 2026-08-23

## Contexte

`src/lib/registry.ts` est la racine de composition de l'application (ADR-0001) :
il importe **tous** les modules pour construire `registry` et pré-calculer
`rolePermissions` via `buildRolePermissions(registry)`. Ce sens de dépendance
est correct et voulu (`registry → modules`).

Le problème apparaît quand un fichier **à l'intérieur** d'un module importe
`rolePermissions` depuis `@/lib/registry` de façon statique
(`import { rolePermissions } from "@/lib/registry"`). Cela crée un cycle
d'import : `registry.ts → module X → registry.ts`. En développement (Webpack),
ce cycle est généralement toléré par l'ordre d'évaluation des modules. Mais en
build de production avec **Turbopack** (Next.js 16), ce même cycle produisait
un échec intermittent et non déterministe :

```
ReferenceError: Cannot access '<var>' before initialization
```

— une erreur de TDZ (Temporal Dead Zone) causée par l'ordre d'évaluation des
imports circulaires, qui ne se manifestait pas de façon systématique (d'où le
caractère "intermittent" du bug, issue **#446**).

## Décision

Interdire, via une règle `dependency-cruiser` enforced en CI
(`no-modules-static-import-registry`), tout **import statique** de
`src/lib/registry.ts` depuis `src/modules/**` :

```js
{
  name: "no-modules-static-import-registry",
  severity: "error",
  from: { path: "^src/modules/", pathNot: "/__tests__/" },
  to: {
    path: "^src/lib/registry\\.ts$",
    dependencyTypesNot: ["dynamic-import"],
  },
}
```

Le pattern autorisé à la place est l'**import dynamique**, résolu à
l'exécution plutôt qu'à l'évaluation statique du module — il ne participe pas
au graphe de cycle détecté par le bundler :

```ts
const { rolePermissions } = await import("@/lib/registry");
```

Ce pattern était déjà utilisé dans `src/lib/auth.ts` avant l'introduction de
la règle CI ; celle-ci généralise et enforce la convention.

## Alternatives considérées

- **Extraire `rolePermissions` dans un module tiers indépendant** (ni dans
  `registry.ts`, ni dans un module métier), pour casser le cycle
  structurellement plutôt que par un import dynamique — *Écarté à ce
  stade* : `rolePermissions` dépend par construction de l'agrégation de
  *tous* les manifestes de modules (c'est la raison d'être de `registry.ts`
  comme racine de composition) ; le déplacer ailleurs ne fait que déplacer
  le même point de convergence sans supprimer le risque de cycle si un
  module l'importe en retour. Resterait pertinent si le nombre de call-sites
  dynamiques devenait difficile à maintenir.
- **Downgrade vers Webpack pour le build de production** — *Écarté* :
  reviendrait sur l'adoption de Turbopack (performance de build), et ne
  ferait que masquer un vrai risque architectural (le cycle) plutôt que le
  supprimer.
- **Tolérer le cycle et accepter le risque de build intermittent** —
  *Écarté* : un échec de build non déterministe en production est
  inacceptable pour la fiabilité des déploiements.

## Conséquences

- **Positif** : élimine la classe de bug entière (cycle statique vers la
  racine de composition), pas seulement le cas précis de l'issue #446 —
  toute nouvelle tentative similaire est bloquée par `lint:boundaries` en
  CI, avant même d'atteindre un build Turbopack.
- **Négatif / contrainte** : un module ayant besoin de `rolePermissions` doit
  systématiquement utiliser `await import(...)`, ce qui introduit une
  fonction `async` là où un import statique aurait suffi — léger surcoût de
  lisibilité, compensé par la prévention du bug de build.
- **Point de vigilance** : cette règle ne protège que le sens
  `modules → registry`. Un futur point de composition équivalent
  (autre "racine" qui importe tous les modules) devra recevoir la même
  protection explicitement — elle n'est pas générique à toute racine de
  composition future.

## Références

- Issue #446 (build Turbopack intermittent)
- PR #453 (correctif, mergé directement par l'équipe)
- PR #448 (tentative équivalente, fermée comme doublon de #453)
- `.dependency-cruiser.cjs` (règle `no-modules-static-import-registry`)
- `src/lib/auth.ts` (pattern d'import dynamique préexistant)
