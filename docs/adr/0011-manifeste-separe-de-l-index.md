# ADR-0011 — Manifeste de module séparé de son index public

- **Statut** : Accepté
- **Date** : 2026-09-08

## Contexte

Chaque module déclarait son manifeste (`defineModule({ … })`) dans son `index.ts`, au milieu des
re-exports de services qui constituent son API publique. Les deux rôles cohabitaient dans le même
fichier : la **description déclarative** du module (nom, version, dépendances, permissions,
navigation) et son **API d'exécution**.

Cette cohabitation a un coût qui n'était pas visible tant qu'on ne cherchait pas à tester les
manifestes. Importer `@/modules/media` pour lire son manifeste charge
`services/tokens` → `lib/prisma`, donc le driver MariaDB et `DATABASE_URL` ; `@/modules/integration`
charge `auth` → NextAuth → `next/server`, que l'environnement de test `node` de Vitest ne résout
pas ; `@/modules/storage` charge le client S3. Un manifeste — trois lignes de données littérales —
n'était pas lisible sans démarrer la moitié de l'infrastructure.

Conséquence concrète : la couverture de test plafonnait à 3 modules sur 11 pour les manifestes et
4 sur 11 pour la matrice RBAC (`src/modules/__tests__/manifests.test.ts`,
`src/core/__tests__/permissions.test.ts`). Les modules couverts étaient exactement ceux dont
l'index ne re-exporte aucun service — `core`, `planning`, `discipleship`, `accounting`. Ce n'était
pas un oubli de couverture mais une impossibilité technique, que le chantier 7 de
`docs/roadmap-modularite.md` avait qualifié à tort de « peu coûteux ».

La matrice rôles→permissions est le contrôle d'accès de toute l'application. Ne pas pouvoir la
tester au-delà de 4 modules sur 11 est une lacune de sécurité, pas seulement de qualité.

## Décision

Le manifeste de chaque module vit dans son propre fichier `src/modules/<module>/manifest.ts`, dont
la seule dépendance est `defineModule` de `@/core/module-registry`. L'`index.ts` le re-exporte
(`export { xModule } from "./manifest";`) aux côtés des services publics du module.

Le manifeste devient ainsi importable sans effet de bord : aucune connexion base, aucune session,
aucun client S3. L'API publique des modules est inchangée — `src/lib/registry.ts` et
`src/app/` continuent d'importer `@/modules/<module>`, et la règle de frontière
`app-only-module-public-api` reste satisfaite sans modification.

Les tests, eux, importent directement `@/modules/<module>/manifest` : ils sont autorisés à
traverser l'index (la règle ne contraint que `src/app/`), et c'est précisément ce qui rend la
couverture des 11 modules possible sans mock.

## Alternatives considérées

- **Mocker Prisma, NextAuth et le client S3 dans les tests de manifestes** — le test deviendrait
  dépendant de la chaîne d'imports interne de chaque module : ajouter un service à un `index.ts`
  casserait un test de manifeste, sans rapport avec le manifeste. La liste de mocks aurait grossi
  à chaque module. On testerait la capacité à mocker l'infrastructure, pas le manifeste.

- **Aliaser `next/server` et fournir un `DATABASE_URL` factice dans `vitest.config.ts`** — moins
  de code, mais règle le symptôme de résolution sans traiter la cause : le manifeste resterait
  inséparable de l'infrastructure du module. La configuration de test porterait une dette
  d'architecture.

- **Un fichier `permissions.ts` par module plutôt qu'un manifeste complet** — n'isolerait que les
  permissions, laissant dépendances et navigation inaccessibles au test. La frontière naturelle
  est le manifeste entier : il est déjà l'unité que `ModuleRegistry` manipule.

- **Ne rien changer et laisser la couverture à 3-4 modules** — écarté : les chantiers restants de
  `docs/roadmap-modularite.md` (migration des routes vers des services de module, sortie des
  gardes métier de `lib/auth`) sont des refactorings sur le chemin des permissions. Sans filet
  RBAC complet, ils se font à l'aveugle.

## Conséquences

**Ce que ça rend plus facile.** Les 11 modules sont couverts par les tests de manifestes et par la
matrice RBAC figée, sur les 10 rôles. Un manifeste se lit sans traverser les re-exports de
services. Un test de manifeste ne peut plus casser à cause d'un service. Les chantiers de
modularité restants s'appuient sur un filet complet.

**Ce que ça contraint.** Deux fichiers par module au lieu d'un : créer un module suppose de créer
`manifest.ts` **et** de le re-exporter depuis `index.ts` — un oubli se voit immédiatement, le
module n'étant alors plus composable par `registry.ts`. Le test « couvre les 11 modules » de
`manifests.test.ts` fige le nombre de modules : ajouter un module oblige à l'y déclarer, ce qui
est l'effet recherché.

**Ce que ça ne change pas.** Aucun comportement applicatif, aucune permission, aucune frontière de
module. `buildRolePermissions(registry)` produit exactement la même matrice qu'avant — la matrice
figée dans `src/core/__tests__/permissions.test.ts` en est le relevé, pas une correction.

**Dette rendue visible.** Le module `planning` déclare 13 des 43 permissions (membres, événements,
départements, absences, comptes rendus). La table `PERMISSION_OWNER` de `manifests.test.ts`
l'affiche noir sur blanc. Ce n'est pas traité ici, mais c'est désormais documenté par un test
plutôt que par une lecture attentive des manifestes.

## Références

- [`docs/roadmap-modularite.md`](../roadmap-modularite.md) — chantier 7
- [ADR-0001](0001-architecture-modulaire-monolithe.md) — architecture modulaire (registry, manifestes)
- [ADR-0004](0004-import-dynamique-anti-cycle-registry.md) — cycle `registry.ts` ↔ modules
- PR [#527](https://github.com/iccbretagne/koinonia/pull/527) — extraction, tests 11 modules, suppression de `src/lib/permissions.ts`
