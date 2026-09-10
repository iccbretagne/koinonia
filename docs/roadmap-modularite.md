# Roadmap — modularité du monolithe

- **Statut** : en cours — **4 chantiers sur 7 réalisés**
- **Établie le** : 2026-09-03, sur la base du code à la version v1.20.0
- **Révisée le** : 2026-09-08, sur la base du code à la version v1.22.0
- **Portée** : architecture interne, aucun impact fonctionnel utilisateur

> Ce document n'est pas une spec. Il décrit un état constaté et propose des chantiers.
> Chaque chantier retenu passe par une PR `chore(architecture)` adossée à ce document, par un ADR
> s'il engage un pattern durable, ou par `/specify` s'il devient une feature à part entière —
> ce qui est arrivé au chantier 6.

## Note de révision (2026-09-08)

Quatre chantiers réalisés, et trois enseignements qui ont modifié le document lui-même. Ils sont
consignés ici parce qu'ils valent au-delà des chantiers concernés.

**1. Les estimations de coût de la version initiale ne sont pas fiables.** Le chantier 7 était
annoncé « peu coûteux » ; son vrai obstacle — les manifestes non isolables de leurs services —
n'y figurait pas et a imposé une extraction sur les 11 modules (ADR-0011). Traiter les
estimations restantes comme des hypothèses à vérifier, pas comme des étiquettes.

**2. L'indicateur des 147 routes ne mesure pas la modularité.** Mesuré à v1.22.0 : 62 de ces
147 routes ne font qu'un ou deux appels Prisma, le plus souvent une simple résolution du
`churchId` avant le contrôle de permission ; et 60 des 147 délèguent **déjà** à un service de
module. `src/app/api/audio/services/[id]/sources/[sourceId]/route.ts` fait 29 lignes, confie
toute sa mutation à `deleteAudioSource()` — elle est exactement dans l'état cible du chantier 2 —
et elle compte pourtant dans les 147. Faire baisser ce compteur pour lui-même reviendrait à
emballer des lectures d'une ligne dans des fonctions de service. Le chantier 2 et les indicateurs
ont été redéfinis en conséquence.

**3. Compter les imports dynamiques est un indicateur faible.** Le chantier 4 a supprimé les 3
imports dynamiques `auth` → `audio`, mais il a fait passer les imports dynamiques
module → registry de 5 à 8 : les trois gardes déplacées importent `rolePermissions` depuis le
module, ce que la règle anti-cycle impose. Le total n'a pas bougé — ce qui a changé, et qui
comptait, c'est que la règle métier vit désormais dans son module et que ses dépendances
internes sont statiques, donc visibles dans le graphe. Un déplacement légitime peut faire monter
un compteur : c'est la nature de la dépendance qui importe, pas son nombre.

## Verdict

Koinonia est un **monolithe bien organisé, mais pas encore un monolithe réellement modulaire au
niveau métier**. Les imports directs entre modules sont maîtrisés ; le couplage fuit ailleurs :
par Prisma, par les routes Next, et par quelques services transverses.

La nuance compte, parce qu'elle dit où porter l'effort. Le découpage en `src/modules/` est réel
et tenu — ce n'est pas un habillage. Mais la logique métier, elle, n'a pas suivi le découpage :
elle est majoritairement restée dans la couche HTTP. Un module n'est donc aujourd'hui ni
extractible, ni réutilisable hors de ses routes.

*Révision 2026-09-08* — ce verdict tient, avec une nuance mesurée depuis : **60 des 147 routes
concernées délèguent déjà à un service de module**, et les modules récents (`audio`, `rooms`,
`integration`) ont une vraie couche de services. La logique n'est pas restée dans la couche HTTP
partout ; elle y est restée là où le code est ancien. C'est une bonne nouvelle pour le chantier 2 :
le motif cible est déjà pratiqué, il reste à le rétro-appliquer, pas à l'inventer.

### Ce qui est solide

- `npm run lint:boundaries` passe : **665 modules, 2 575 dépendances**, aucune violation
  (652 / 2 532 à l'établissement).
- La suite de tests passe : **135 fichiers, 1 208 tests** (1 172 à l'établissement).
- Les manifestes et la matrice RBAC sont couverts sur **les 11 modules et les 10 rôles**, la
  matrice attendue étant figée en dur : un changement de droits non répercuté fait échouer la CI.
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

# profondeur d'usage de Prisma par route (indicateurs du chantier 2 redéfini)
for f in $(grep -rlE 'from "@/lib/prisma"' src/app --include=route.ts); do
  echo "$(grep -c 'prisma\.\|tx\.' "$f") $f"
done | sort -n

# routes déléguant déjà à un service de module
grep -rlE 'from "@/lib/prisma"' src/app --include=route.ts | xargs grep -l 'from "@/modules/' | wc -l
```

## Constats

| Priorité | Constat | Preuve | Effet |
|---|---|---|---|
| **Haute** | **221 fichiers de `src/app` importent Prisma directement**, dont **147 des 170 route handlers** (86 %). | `grep` ci-dessus | Les règles métier vivent dans la couche HTTP, pas dans les modules. Un module n'est ni extractible ni réutilisable ; la même règle peut diverger entre deux routes. |
| ~~**Haute**~~ **Traité** | Les règles de frontières ne couvraient que **4 modules sur 11** : `planning`, `discipleship`, `core`, `integration`. | `.dependency-cruiser.cjs` | `audio`, `media`, `agenda`, `accounting`, `rooms`, `jobs` et `storage` pouvaient introduire des imports siblings directs sans que la CI ne dise rien. **Résolu** : les 11 modules ont désormais leur règle, `storage` étant l'unique exception nommée (voir chantier 3). |
| ~~**Haute**~~ **Traité** | `src/lib/auth.ts` portait des règles métier audio et importait le module audio dynamiquement. | *(à l'établissement)* `src/lib/auth.ts:690`, `:724`, `:748` | Cycle logique `registry → modules → auth → modules`, différé par import dynamique. **Résolu** : les trois gardes vivent dans `src/modules/audio/auth.ts` (chantier 4). `lib/auth.ts` n'importe plus aucun module. |
| **Moyenne** | Quatre modules importent dynamiquement le registry en code de production — **par obligation, pas par contournement**. Huit occurrences depuis le chantier 4 (cinq avant), les trois nouvelles étant les gardes audio rapatriées dans leur module. | `agenda/auth.ts:35` et `:57`, `audio/auth.ts:32`, `:54` et `:88`, `integration/auth.ts:40`, `integration/services/msdp-service.ts:37`, `accounting/services/attachments.ts:53` | La règle `no-modules-static-import-registry` (`.dependency-cruiser.cjs:73`, severity `error`) **interdit** l'import statique inverse : `registry.ts` importe tous les modules pour calculer `rolePermissions`, un cycle y produit un `ReferenceError` TDZ non déterministe au build Turbopack (issue #446). L'import dynamique est le remède documenté. Effet résiduel réel : le graphe statique ne reflète pas ces cinq dépendances, `lint:boundaries` ne les voit pas. |
| **Moyenne** | Le schéma Prisma porte des **FK inter-domaines** : discipolat→événement, média→événement, intégration→membre/événement/agenda, comptabilité→département, salles→événement, audio→événement. | `prisma/schema.prisma` (26 références à `eventId`) | Couplage de données légitime, mais qui impose des évolutions et suppressions coordonnées. Supprimer un événement dépend d'un handler central qui nettoie le discipolat. |
| **Moyenne** | `ENABLED_MODULES` ne filtre que les manifestes du registry ; routes, schéma et code des modules restent présents. | `src/core/boot.ts` | C'est un mécanisme de navigation et de permissions, pas un chargement optionnel de modules. Le nom promet plus que ce que le code fait. |
| ~~**Basse**~~ **Traité** | Les tests de manifestes couvraient **3 modules** ; les tests RBAC sur registry **4**. | *(à l'établissement)* `src/modules/__tests__/manifests.test.ts:7`, `src/core/__tests__/permissions.test.ts:4-7` | **Résolu** : 11/11 et 10 rôles (chantier 7). La cause n'était pas un oubli mais l'impossibilité d'importer un manifeste sans charger Prisma, NextAuth et S3 — d'où l'extraction des manifestes (ADR-0011). |
| ~~**Basse**~~ **Traité** | `src/lib/__tests__/permissions.test.ts` testait `hasPermission`, le helper **déprécié**, qui servait aussi d'oracle au test du mécanisme réel. | *(à l'établissement)* fichier entier ; `src/core/__tests__/permissions.test.ts:9` | **Résolu** : matrice figée en dur d'abord, suppression du helper et de son test ensuite (chantier 7). Le helper n'avait aucun consommateur applicatif et ne connaissait que 4 modules sur 11. |

### Le symptôme le plus lisible

`src/app/api/events/route.ts` fait **319 lignes** et contient, dans un seul fichier : le schéma
Zod, `generateRecurrenceDates()` — une fonction de domaine pur —, les transactions Prisma,
l'audit et l'émission sur le bus.

`src/app/api/accounting/requests/route.ts` (186 lignes) suit le même motif : filtrage de
périmètre, persistance, notifications et envoi d'email cohabitent dans la route.

*Révision 2026-09-08* : ces deux routes restent de bons exemples, mais elles ne sont plus les
plus longues. Le classement à v1.22.0 place devant `users/[userId]/roles/route.ts` (394 lignes)
et `requests/[id]/route.ts` (369), puis
`events/[eventId]/departments/[deptId]/planning/route.ts` (360). La longueur seule reste
d'ailleurs un mauvais critère de sélection — voir le chantier 2 redéfini.

## Chantiers proposés

Aucun ne suppose de réécriture massive. Ils sont ordonnés par rapport valeur/risque.

### 1. Arrêter l'hémorragie avant de la résorber — ✅ fait

Interdire **tout nouvel** accès direct à Prisma depuis `src/app` pour les écritures métier, via
une règle `dependency-cruiser` en `warn` puis en `error` sur les nouveaux fichiers. Les 147
routes existantes restent tolérées le temps de la migration.

*Pourquoi d'abord* : sans cliquet, tout déplacement est repris par la route suivante écrite.

*Réalisé différemment* : pas de règle `dependency-cruiser`, qui aurait demandé de lister les 147
exceptions dans la config et de la maintenir à chaque déplacement. À la place, `scripts/
check-prisma-boundary.sh` compare le compte de route handlers important Prisma directement à un
seuil committé (`scripts/prisma-boundary-baseline.txt`, initialisé à 147) et échoue en CI si ce
compte **dépasse ou est inférieur** au seuil — dépasse : nouvelle route à migrer ; inférieur :
seuil à baisser dans le même commit pour verrouiller le progrès. Le seuil committé EST l'historique
du chantier 2, sans config à maintenir en parallèle du code.

### 2. Déplacer la logique de domaine vers des services de module — *redéfini le 2026-09-08*

Cible inchangée : la route valide (Zod), autorise, appelle **un** service de module, et répond.
Le reste descend dans `src/modules/X/services/`.

**Ce qui change, c'est la façon de choisir les routes et de mesurer le progrès.** L'énoncé
initial — « faire baisser les 147 » — désignait mal sa cible. Mesure à v1.22.0 sur ces 147
routes :

| Profondeur d'usage de Prisma | Routes |
|---|---|
| 1-2 appels (le plus souvent une résolution de `churchId`) | 62 |
| 3-5 appels | 52 |
| 6-15 appels | 26 |
| plus de 15 appels | 7 |

Et **60 des 147 délèguent déjà à un service de module**. Une route peut donc être exemplaire et
compter quand même : `audio/services/[id]/sources/[sourceId]/route.ts` fait 29 lignes, confie sa
mutation à `deleteAudioSource()` et n'ouvre Prisma que pour résoudre l'église avant le contrôle
de permission.

**Deux travaux distincts, à ne pas confondre.**

*(a) Le travail utile et bon marché — la résolution du tenant.* `resolveChurchId()`
(`src/lib/auth.ts`) existe déjà et 32 routes l'utilisent. Les routes qui n'ouvrent Prisma que
pour retrouver le `churchId` d'une ressource devraient l'appeler : une résolution faisant
autorité au lieu d'un `findUnique` ad hoc, et le compteur baisse pour une vraie raison. C'est un
gain de sécurité — la constitution exige que l'église d'une ressource fasse autorité — autant
que de modularité.

*(b) Le vrai chantier de modularité — les routes à logique de domaine.* Les 33 routes à plus de
cinq appels Prisma, et celles qui hébergent des fonctions de domaine pur (`generateRecurrenceDates()`
dans `events/route.ts` en est l'exemple type). C'est là que vit la règle métier qui devrait être
dans un module, et c'est là que le déplacement rapporte.

*Critère de sélection* : la présence de **règle métier** dans la route — calcul, invariant,
orchestration de plusieurs entités — jamais sa longueur ni son nombre d'appels Prisma, qui n'en
sont que des indices.

*Critère d'arrêt* : pas de conversion de masse. On déplace ce qui est déjà couvert par des tests,
ou on écrit le test d'abord.

### 3. Étendre les règles de frontières aux 11 modules — ✅ fait

Et formaliser `storage` comme **infrastructure partagée** — une exception nommée et documentée,
plutôt qu'une dépendance sibling implicitement tolérée parce qu'aucune règle ne la couvre.

*Note* : la génération d'une règle par module reste préférable aux backreferences, comme le
commentaire actuel du fichier l'explique.

*Réalisé* : sept règles ajoutées (`accounting`, `agenda`, `jobs`, `rooms`, `audio`, `media`,
`storage`). Cinq passaient sans toucher une ligne de code — ces modules n'avaient aucun import
sibling. Les dix imports d'`audio` et `media` vont **tous** vers `storage` : l'exception se
formule donc en un seul `pathNot`, adossé à l'ADR-0006 qui actait déjà `storage` comme
infrastructure partagée. `storage`, lui, n'importe aucun module. Chaque règle a été vérifiée par
un import sonde temporaire — une règle qui passe pourrait n'être qu'un motif de chemin vide.

### 4. Sortir les gardes métier de `lib/auth` — ✅ fait

`requireAudioAccess`, `requireAudioListenAccess` et `requireAudioUnpublishAccess` étaient des
règles du module audio hébergées dans l'infrastructure d'authentification. Elles vivent désormais
dans `src/modules/audio/auth.ts`, sur le motif déjà appliqué par `agenda/auth.ts` et
`integration/auth.ts`.

*Réalisé* : les trois imports dynamiques `auth.ts` → `audio` ont disparu — ils sont devenus des
imports statiques internes au module (`./services/access`, `./services/sharing`), donc visibles
dans le graphe de dépendances. `src/lib/auth.ts` passe de 836 à 752 lignes et **n'importe plus
aucun module**. Les 17 appelants (`src/app/api/audio/**`, pages `/audio/**`) importent maintenant
`@/modules/audio/auth`, chemin autorisé par la règle `app-only-module-public-api` au même titre
que l'index. Aucun changement de comportement : `requireAuth` reste importé de `@/lib/auth`, et
l'import de `rolePermissions` reste dynamique, imposé par `no-modules-static-import-registry`
(ADR-0004).

*Effet de bord révélé par les tests* : un test qui mockait `@/modules/audio` pour intercepter
`listOutgoingShares` ne l'interceptait plus, la garde traversant désormais `./services/sharing`
directement. Le mock a été reciblé sur le vrai collaborateur — le test dit maintenant la vraie
dépendance au lieu de passer par l'index.

Les cinq imports `module` → `registry`, eux, **ne se retirent pas par déplacement de fichier** :
ils sont imposés par la règle `no-modules-static-import-registry`, qui protège d'un cycle réel
avec la racine de composition (issue #446). Les supprimer suppose d'inverser la composition — le
registry **compose** des abonnements et des permissions déclarés par les modules au lieu d'être
appelé depuis eux. C'est une refonte de `src/lib/registry.ts`, pas un nettoyage : à traiter comme
un chantier séparé, précédé d'un ADR, et seulement si le coût du graphe incomplet le justifie.
Tant qu'il n'est pas fait, l'import dynamique reste la bonne réponse et non une dette.

*Attention* : ADR-0010 vient d'acter que l'accès transverse inter-églises s'implémente par un
helper dédié au module. Ce chantier applique cette décision au code existant plutôt qu'il ne la
contredit.

### 5. Documenter les FK inter-domaines comme des contrats

**Les conserver** — elles protègent l'intégrité, et les remplacer par des ID mous serait une
régression. Mais documenter chaque relation inter-domaine comme un contrat d'intégration
explicite, et couvrir les suppressions/cascades par des tests.

### 6. Dire la vérité sur `ENABLED_MODULES` — ✅ fait (spec 038)

*L'énoncé initial — « le renommer, ou investir dans un vrai chargement optionnel » — est dépassé.*
Il présentait la question comme un choix de nom. L'analyse du 2026-09-08 a montré autre chose :
le réglage n'était **défini nulle part** (ni variables d'exemple, ni CI, ni procédures de
déploiement), et son inefficacité allait plus loin que « il ne filtre que les manifestes » — le
Super Admin court-circuitait le contrôle de permission dans une dizaine de gardes, les accès
obtenus par appartenance à un département survivaient à la désactivation, un module qui ne
déclare aucune permission n'était pas touché du tout, les liens de partage publics par jeton
restaient ouverts, et le cron appelait les services des modules sans condition. Désactiver un
module masquait un menu ; ça ne retirait pas une capacité.

Un déploiement partiel a fini par être réellement demandé — le besoin retenu est le
**déploiement d'instances distinctes et allégées**, pas l'activation par église (une donnée par
tenant, pas un réglage d'environnement, qu'aucune brique existante n'anticipe). L'option retenue
est donc un vrai chargement optionnel, pas un renommage : `ENABLED_MODULES` charge désormais
réellement un sous-ensemble de modules. Chaque manifeste déclare sa surface HTTP
(`routes.authenticated`/`api`/`public`), et le proxy (`src/proxy.ts`, matcher élargi à toute
l'application) refuse en 404 toute route dont le préfixe n'appartient à aucun module actif —
avant toute résolution de session, donc y compris pour le Super Admin. `core` est le seul module
non désactivable ; une dépendance manquante ou un nom de module inconnu dans `ENABLED_MODULES`
fait échouer le démarrage (fail-fast). Un test d'exhaustivité garantit que chaque route réelle de
`src/app/` est couverte par exactement un module ou par la liste noyau explicite. Décision tracée
dans [ADR-0012](adr/0012-manifeste-declare-surface-http.md), spec
[038](../specs/038-modules-optionnels-deploiement/spec.md).

### 7. Étendre les tests de manifestes et de RBAC aux 11 modules — ✅ fait

Les deux tests couvrent désormais les 11 modules et les 10 rôles :
`src/modules/__tests__/manifests.test.ts` (graphe de dépendances figé, propriétaire de chaque
permission, ordre topologique, entrées de navigation) et
`src/core/__tests__/permissions.test.ts` (matrice RBAC figée en dur).

L'ordre imposé a été respecté : la matrice attendue a d'abord été figée en dur dans
`core/__tests__/permissions.test.ts`, puis le helper déprécié `src/lib/permissions.ts` et son
fichier de test ont été supprimés. Le helper n'avait plus aucun consommateur applicatif : il ne
servait qu'à ce test, et ne connaissait que 4 modules sur 11 — la « couverture RBAC du projet »
se comparait donc à une source de vérité périmée.

**Ce que le chantier a révélé** — il n'était pas « peu coûteux » pour la raison annoncée. Les
manifestes vivaient dans les `index.ts`, à côté des re-exports de services : les importer tirait
Prisma, NextAuth et le client S3, indisponibles dans l'environnement de test `node`. C'est la
vraie raison pour laquelle la couverture plafonnait à 3-4 modules, et non un oubli. Chaque
manifeste a donc été extrait dans `src/modules/<module>/manifest.ts`, l'`index.ts` le
re-exportant — l'API publique des modules est inchangée, et la règle
`app-only-module-public-api` reste satisfaite. Décision tracée dans
[ADR-0011](adr/0011-manifeste-separe-de-l-index.md).

Effet de bord utile : le manifeste est maintenant lisible sans traverser 60 lignes de
re-exports, et un test de manifeste ne peut plus casser à cause d'un service.

## Ce qu'on ne fait pas

- **Pas de microservices.** Le monolithe modulaire est le bon format pour ce projet et cette
  équipe. L'objectif est un monolithe dont les modules sont *nets*, pas des modules déployables.
- **Pas de conversion de masse des 147 routes.** Un grand refactoring sans filet sur une base à
  1 172 tests, dont la couverture métier est inégale, coûterait plus qu'il ne rapporterait.
- **Pas de suppression des FK inter-domaines.**

## Indicateurs

De quoi mesurer le progrès sans se raconter d'histoires :

| Indicateur | Aujourd'hui | Cible |
|---|---|---|
| Règles métier d'un module hébergées hors de ce module | **0** ✅ | 0 |
| Modules couverts par une règle de frontière | **11 / 11** ✅ | 11 / 11 |
| Modules couverts par les tests de manifestes | **11 / 11** ✅ | 11 / 11 |
| Modules couverts par les tests RBAC registry | **11 / 11** ✅ | 11 / 11 |
| Route handlers à plus de 5 appels Prisma (logique de domaine probable) | 33 / 170 | en baisse, c'est la cible du chantier 2 |
| Route handlers n'ouvrant Prisma que pour résoudre le `churchId` | 62 / 170 | 0, par `resolveChurchId()` |
| Route handlers important Prisma directement | 147 / 170, **cliquet CI actif** | jamais en hausse — **pas une cible à zéro** |
| Imports dynamiques module→registry (imposés par la règle anti-cycle) | 8 | non borné, sauf inversion de la composition (ADR préalable) |

**Sur les deux derniers indicateurs.** Le compteur des 147 reste utile comme cliquet — il empêche
toute nouvelle route d'ouvrir Prisma sans qu'on le décide — mais il n'a **pas** vocation à
atteindre zéro : 60 de ces routes délèguent déjà correctement à un module. Les deux indicateurs
qui le précèdent le remplacent comme mesure de progrès.

Le compteur des imports dynamiques module→registry n'est plus borné à sa valeur initiale : il
monte mécaniquement chaque fois qu'une règle métier rejoint son module, ce qui est le progrès
recherché. Le tenir bas reviendrait à décourager les chantiers utiles. Seule une inversion de la
composition du registry le ferait tomber, et elle demande son propre ADR.

## Voir aussi

- [DAT](dat.md) — vue d'ensemble de l'architecture
- [Architecture](architecture.md) — structure, patterns, conventions
- [ADR-0004](adr/0004-import-dynamique-anti-cycle-registry.md) — import dynamique comme remède au cycle registry
- [ADR-0010](adr/0010-acces-transverse-inter-eglises.md) — accès transverse borné au module
- [ADR-0011](adr/0011-manifeste-separe-de-l-index.md) — manifeste séparé de l'index public
- [`specs/038-modules-optionnels-deploiement/`](../specs/038-modules-optionnels-deploiement/spec.md) — chantier 6 devenu feature
- [`specs/constitution.md`](../specs/constitution.md) — principes non négociables
