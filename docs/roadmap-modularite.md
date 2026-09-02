# Roadmap — modularité du monolithe

- **Statut** : proposition, non planifiée
- **Établie le** : 2026-09-03, sur la base du code à la version v1.20.0
- **Portée** : architecture interne, aucun impact fonctionnel utilisateur

> Ce document n'est pas une spec. Il décrit un état constaté et propose des chantiers.
> Chaque chantier retenu passera par `/specify` (ou par un ADR s'il engage un pattern durable)
> avant d'être codé.

## Verdict

Koinonia est un **monolithe bien organisé, mais pas encore un monolithe réellement modulaire au
niveau métier**. Les imports directs entre modules sont maîtrisés ; le couplage fuit ailleurs :
par Prisma, par les routes Next, et par quelques services transverses.

La nuance compte, parce qu'elle dit où porter l'effort. Le découpage en `src/modules/` est réel
et tenu — ce n'est pas un habillage. Mais la logique métier, elle, n'a pas suivi le découpage :
elle est majoritairement restée dans la couche HTTP. Un module n'est donc aujourd'hui ni
extractible, ni réutilisable hors de ses routes.

### Ce qui est solide

- `npm run lint:boundaries` passe : **652 modules, 2 532 dépendances**, aucune violation.
- La suite de tests passe : **135 fichiers, 1 171 tests**.
- Les dépendances déclarées sont cohérentes : `audio` et `media` consomment `storage`, le reste
  dépend principalement de `core` et `planning`.
- Le registry centralise correctement les abonnements transactionnels entre `planning`,
  `discipleship` et `media` (`src/lib/registry.ts`).

## Méthode

Tous les chiffres de ce document ont été mesurés sur l'arbre de travail, pas estimés. Pour les
reproduire :

```bash
# routes et pages accédant directement au client Prisma
grep -rlE 'from "@/lib/prisma"' src/app --include=*.ts --include=*.tsx | wc -l
grep -rlE 'from "@/lib/prisma"' src/app --include=route.ts | wc -l
find src/app -name route.ts | wc -l

# modules couverts par une règle de frontière
grep -c 'no-.*-imports-other-modules' .dependency-cruiser.cjs

# imports dynamiques qui contournent le graphe statique
grep -rn 'await import("@/lib/registry")\|await import("@/modules' src/lib src/modules --include=*.ts | grep -v test
```

## Constats

| Priorité | Constat | Preuve | Effet |
|---|---|---|---|
| **Haute** | **221 fichiers de `src/app` importent Prisma directement**, dont **147 des 170 route handlers** (86 %). | `grep` ci-dessus | Les règles métier vivent dans la couche HTTP, pas dans les modules. Un module n'est ni extractible ni réutilisable ; la même règle peut diverger entre deux routes. |
| **Haute** | Les règles de frontières ne couvrent que **4 modules sur 11** : `planning`, `discipleship`, `core`, `integration`. | `.dependency-cruiser.cjs` | `audio`, `media`, `agenda`, `accounting`, `rooms`, `jobs` et `storage` peuvent introduire des imports siblings directs sans que la CI ne dise rien. La garde donne un faux sentiment de couverture. |
| **Haute** | `src/lib/auth.ts` porte des règles métier audio et importe le module audio dynamiquement. | `src/lib/auth.ts:690`, `:724`, `:748` | Cycle logique `registry → modules → auth → modules`, différé par import dynamique. Fragilise le chargement et les tests. |
| **Haute** | Le contournement est **réciproque et installé** : trois modules importent dynamiquement le registry en code de production. | `integration/services/msdp-service.ts:37`, `integration/auth.ts:40`, `agenda/auth.ts:35` et `:57`, `accounting/services/attachments.ts:53` | Ce n'est pas un accident isolé dans `auth.ts` mais un motif reproduit. Le graphe statique ne reflète plus les dépendances réelles — donc `lint:boundaries` ne les voit pas. |
| **Moyenne** | Le schéma Prisma porte des **FK inter-domaines** : discipolat→événement, média→événement, intégration→membre/événement/agenda, comptabilité→département, salles→événement, audio→événement. | `prisma/schema.prisma` (26 références à `eventId`) | Couplage de données légitime, mais qui impose des évolutions et suppressions coordonnées. Supprimer un événement dépend d'un handler central qui nettoie le discipolat. |
| **Moyenne** | `ENABLED_MODULES` ne filtre que les manifestes du registry ; routes, schéma et code des modules restent présents. | `src/core/boot.ts` | C'est un mécanisme de navigation et de permissions, pas un chargement optionnel de modules. Le nom promet plus que ce que le code fait. |
| **Basse** | Les tests de manifestes couvrent **3 modules** (`core`, `planning`, `discipleship`) ; les tests RBAC sur registry en couvrent **4** (les mêmes + `accounting`). | `src/modules/__tests__/manifests.test.ts:7`, `src/core/__tests__/permissions.test.ts:4-7` | Une dépendance, une permission ou un manifeste des sept autres modules peut dériver sans alerte. |
| **Basse** | `src/lib/__tests__/permissions.test.ts` teste `hasPermission`, le helper **déprécié**. | fichier entier | Le fichier qui porte le nom « permissions » ne couvre pas le mécanisme réellement utilisé. Un lecteur qui cherche la couverture RBAC tombe d'abord sur le mauvais fichier. |

### Le symptôme le plus lisible

`src/app/api/events/route.ts` fait **319 lignes** et contient, dans un seul fichier : le schéma
Zod, `generateRecurrenceDates()` — une fonction de domaine pur —, les transactions Prisma,
l'audit et l'émission sur le bus.

`src/app/api/accounting/requests/route.ts` (186 lignes) suit le même motif : filtrage de
périmètre, persistance, notifications et envoi d'email cohabitent dans la route.

Ce sont de bons candidats de départ : le gain y est visible et le risque borné.

## Chantiers proposés

Aucun ne suppose de réécriture massive. Ils sont ordonnés par rapport valeur/risque.

### 1. Arrêter l'hémorragie avant de la résorber

Interdire **tout nouvel** accès direct à Prisma depuis `src/app` pour les écritures métier, via
une règle `dependency-cruiser` en `warn` puis en `error` sur les nouveaux fichiers. Les 147
routes existantes restent tolérées le temps de la migration.

*Pourquoi d'abord* : sans cliquet, tout déplacement est repris par la route suivante écrite.

### 2. Déplacer les cas les plus coûteux vers des services de module

En commençant par `planning`/`events`, puis `accounting`. Cible : la route valide (Zod), autorise
(`requireChurchPermission`), appelle **un** service de module, et répond. Le reste descend dans
`src/modules/X/services/`.

*Critère d'arrêt* : pas de conversion de masse. On déplace ce qui est déjà couvert par des tests,
ou on écrit le test d'abord.

### 3. Étendre les règles de frontières aux 11 modules

Et formaliser `storage` comme **infrastructure partagée** — une exception nommée et documentée,
plutôt qu'une dépendance sibling implicitement tolérée parce qu'aucune règle ne la couvre.

*Note* : la génération d'une règle par module reste préférable aux backreferences, comme le
commentaire actuel du fichier l'explique.

### 4. Sortir les gardes métier de `lib/auth`

`requireAudioAccess`, `requireAudioListenAccess` et `requireAudioUnpublishAccess` sont des règles
du module audio hébergées dans l'infrastructure d'authentification. Les déplacer dans
`src/modules/audio/auth.ts` — le motif existe déjà dans `agenda/auth.ts` et `integration/auth.ts`.

Traiter dans le même geste les imports dynamiques inverses vers le registry : le registry doit
**composer** des abonnements déclarés par les modules, pas être appelé depuis eux. C'est le
chantier qui rendra `lint:boundaries` à nouveau représentatif.

*Attention* : ADR-0010 vient d'acter que l'accès transverse inter-églises s'implémente par un
helper dédié au module. Ce chantier applique cette décision au code existant plutôt qu'il ne la
contredit.

### 5. Documenter les FK inter-domaines comme des contrats

**Les conserver** — elles protègent l'intégrité, et les remplacer par des ID mous serait une
régression. Mais documenter chaque relation inter-domaine comme un contrat d'intégration
explicite, et couvrir les suppressions/cascades par des tests.

### 6. Dire la vérité sur `ENABLED_MODULES`

Soit le renommer en ce qu'il est (un drapeau de visibilité fonctionnelle), soit investir dans un
vrai chargement optionnel — mais seulement si des déploiements partiels sont réellement demandés.
Aujourd'hui ils ne le sont pas ; l'option honnête est le renommage.

### 7. Étendre les tests de manifestes et de RBAC aux 11 modules

Chantier peu coûteux, à faire tôt : il transforme les six autres chantiers en refactorings
vérifiables. Au passage, clarifier le sort de `src/lib/__tests__/permissions.test.ts` — soit
supprimer le test avec le helper déprécié qu'il couvre, soit le renommer pour qu'il cesse de se
faire passer pour la couverture RBAC du projet.

## Ce qu'on ne fait pas

- **Pas de microservices.** Le monolithe modulaire est le bon format pour ce projet et cette
  équipe. L'objectif est un monolithe dont les modules sont *nets*, pas des modules déployables.
- **Pas de conversion de masse des 147 routes.** Un grand refactoring sans filet sur une base à
  1 171 tests, dont la couverture métier est inégale, coûterait plus qu'il ne rapporterait.
- **Pas de suppression des FK inter-domaines.**

## Indicateurs

De quoi mesurer le progrès sans se raconter d'histoires :

| Indicateur | Aujourd'hui | Cible |
|---|---|---|
| Route handlers important Prisma directement | 147 / 170 | en baisse à chaque release, jamais en hausse |
| Modules couverts par une règle de frontière | 4 / 11 | 11 / 11 |
| Imports dynamiques contournant le graphe (prod) | 8 — dont 5 module→registry, 3 `auth`→`audio` | 0 |
| Modules couverts par les tests de manifestes | 3 / 11 | 11 / 11 |
| Modules couverts par les tests RBAC registry | 4 / 11 | 11 / 11 |

## Voir aussi

- [DAT](dat.md) — vue d'ensemble de l'architecture
- [Architecture](architecture.md) — structure, patterns, conventions
- [ADR-0010](adr/0010-acces-transverse-inter-eglises.md) — accès transverse borné au module
- [`specs/constitution.md`](../specs/constitution.md) — principes non négociables
