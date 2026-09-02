# Dossier d'Architecture Technique (DAT) — Koinonia

- **Version du logiciel décrite** : 1.19.0
- **Dernière mise à jour** : 2026-09-02
- **Statut** : Validé

## 1. Objet et périmètre du document

Ce DAT donne la **vue d'ensemble** de l'architecture technique de Koinonia : ce que fait le
système, comment il est découpé, sur quoi il tourne, et comment il est exploité. Il s'adresse à
une personne qui arrive sur le projet, à un auditeur, ou à un décideur qui doit comprendre les
implications d'une évolution.

**Ce document ne duplique pas les documents détaillés — il les référence.** Chaque domaine garde
un document qui fait autorité, listé au §11. Quand ce DAT et un document détaillé divergent, c'est
le document détaillé qui fait foi, et ce DAT qui doit être corrigé. Cette règle est délibérée :
un DAT qui recopie le détail devient faux en quelques semaines.

Ne sont pas couverts ici : les procédures d'installation pas à pas (voir `production.md`,
`staging.md`, `dev-onboarding.md`), le détail des endpoints (voir `api.md`), le détail du modèle
de données (voir `database.md`).

## 2. Présentation générale

**Koinonia** est une application web de gestion opérationnelle pour églises : planning de
service, événements et comptes rendus, discipolat, demandes internes et communication, audio des
cultes, médias, salles, comptabilité et agenda pastoral.

Elle a été conçue pour ICC Bretagne afin de remplacer une organisation éclatée entre groupes
WhatsApp et tableaux Excel par une source de vérité unique, avec un accès adapté à chaque rôle.
Elle est adaptable à toute église structurée en ministères et départements.

| | |
|---|---|
| Nature | Application web fullstack, monolithe modulaire |
| Modèle de déploiement | Auto-hébergé, une instance par organisation |
| Multi-tenant | Oui — plusieurs églises isolées dans une même instance |
| Licence | Apache License 2.0 |
| Dépôt | https://github.com/iccbretagne/koinonia |

### Terminologie métier

| Terme | Définition |
|---|---|
| **STAR** | **S**erviteur **T**ravaillant **A**ctivement pour le **R**oyaume — un membre d'un département |
| **Ministère** | Groupe organisationnel (Louange, Accueil, Communication…) |
| **Département** | Sous-division d'un ministère (Choristes, Musiciens, Son…) |
| **Église** | Le tenant : unité d'isolation de toutes les données |

## 3. Exigences structurantes

### Fonctionnelles

- Planifier le service des membres par département et par événement.
- Couvrir le cycle de vie complet d'une église : membres, ministères, événements, comptes rendus,
  discipolat, demandes internes, médias, audio, salles, comptabilité, agenda pastoral.
- Donner à chaque rôle une vue strictement limitée à son périmètre légitime.

### Non fonctionnelles

| Exigence | Réponse architecturale |
|---|---|
| **Isolation multi-tenant stricte** | `churchId` sur chaque donnée, vérifié au point d'entrée (ADR-0002) |
| **Moindre privilège** | RBAC déclaratif par module, périmètres explicites (ADR-0009) |
| **Évolutivité fonctionnelle** | Découpage modulaire à frontières vérifiées en CI (ADR-0001) |
| **Coût d'exploitation faible** | Monolithe sur une VM unique, pas d'orchestrateur |
| **Réversibilité du déploiement** | Releases horodatées + symlink, rollback par repointage |
| **Traitements longs non bloquants** | Worker hors Next.js piloté par une table de jobs (ADR-0007) |

## 4. Architecture fonctionnelle

Le domaine est découpé en **11 modules** déclaratifs. Chaque module publie un manifeste
(`defineModule`) portant son nom, sa version, ses dépendances, ses permissions et ses entrées de
navigation. Le registry assemble l'ensemble au démarrage.

| Module | Rôle | Dépend de |
|---|---|---|
| `core` | Église, utilisateurs, socle transverse | — |
| `storage` | Primitifs S3 et jetons opaques (infrastructure pure, sans modèle) | — |
| `planning` | Planning de service, événements, demandes | `core` |
| `audio` | Captation, publication et bibliothèque d'écoute des cultes | `core`, `storage`, `planning` |
| `media` | Demandes visuelles, projets et galeries média | `core`, `storage` |
| `discipleship` | Relations de discipolat, appel, statistiques | `core`, `planning` |
| `accounting` | Séries et demandes financières | `core`, `planning` |
| `agenda` | Profils pastoraux et prise de rendez-vous | `core` |
| `integration` | Parcours d'intégration des nouvelles familles | `core` |
| `rooms` | Réservation de salles | `core` |
| `jobs` | Table de jobs et ordonnancement des traitements différés | `core` |

Le détail des capacités et des permissions de chaque module est dans `architecture.md` et
`auth.md`.

## 5. Architecture applicative

### Stack

| Technologie | Version | Rôle |
|---|---|---|
| Node.js | 22 | Runtime serveur |
| Next.js | 16 | Framework fullstack (App Router, Turbopack) |
| React | 19 | UI (Server Components + Client Components) |
| Tailwind CSS | 4 | Styles (`@theme`, tokens ICC) |
| NextAuth (Auth.js) | 5 beta | Authentification Google OAuth |
| Prisma | 7 | ORM (driver adapter MariaDB, ESM-only) |
| MariaDB | 10.11 | Base de données |
| Zod | 3 | Validation des entrées API |
| TypeScript | 5 | Typage strict |

### Découpage en couches

```
src/app/        Pages (Server Components) et route handlers — couche de présentation et d'entrée
src/modules/    Logique métier, un dossier par domaine, exposé par un index unique
src/core/       Infrastructure modulaire framework-agnostic (registry, event bus, boot)
src/lib/        Accès transverses : Prisma, auth, réponses API, audit, rate-limit
src/components/ Composants UI réutilisables
```

### Règles de frontière — vérifiées automatiquement

- `src/app/` n'accède à un module que **par son index** (`@/modules/X`), jamais par un chemin
  interne. Idem pour `src/lib/`.
- `src/core/` reste framework-agnostic : aucune dépendance à Next.js.
- Toute dépendance entre modules passe le contrôle `dependency-cruiser`.

Ces règles sont **exécutées en CI** (`npm run lint:boundaries`) et non laissées à la discipline :
c'est ce qui rend le découpage modulaire réel plutôt que déclaratif. Voir ADR-0001.

### Patterns transverses

- **Route handler** : garde d'authentification → `await params` → validation Zod → métier →
  `successResponse` / `errorResponse`.
- **Erreurs métier** : `ApiError(status, message)`, jamais d'erreur nue remontée au client.
- **Server Components par défaut** ; `"use client"` réservé aux interactions et formulaires.
- **Import dynamique** comme échappatoire au cycle `registry.ts` ↔ modules (ADR-0004).

## 6. Architecture des données

### Isolation multi-tenant

Chaque église (`Church`) est un tenant. Toute donnée métier porte un `churchId`. Un utilisateur
peut détenir des rôles différents dans plusieurs églises via `UserChurchRole`.

**Principe non négociable** : pour toute action portant sur un objet identifié, l'église de
rattachement de cet objet fait autorité — jamais le contexte d'église affiché côté client, qui
est manipulable. `resolveChurchId(type, resourceId)` matérialise cette règle. Voir ADR-0002.

### Persistance

- Client Prisma généré dans `src/generated/prisma/` (et non `@prisma/client`), ESM-only, via le
  driver adapter `PrismaMariaDb` (ADR-0003).
- URL de datasource portée par `prisma.config.ts`, hors du schéma.
- **Tout changement de schéma passe par une migration** (`prisma migrate`), jamais `db push`.

Le modèle détaillé est documenté dans `database.md`.

### Stockage objet

Deux buckets S3 **distincts, aux credentials séparés** :

| Bucket | Contenu | Raison de la séparation |
|---|---|---|
| Média | Photos, fichiers, sources et renditions audio | Règles de cycle de vie et permissions propres |
| Sauvegarde | Dumps de base et archives | Doit survivre à une compromission du bucket média |

Les renditions audio servies aux auditeurs passent par un **cache disque local**, alimenté au
premier accès depuis S3 (ADR-0008).

## 7. Architecture de sécurité

### Authentification

Google OAuth via NextAuth v5, **stratégie de session en base** : le cookie ne porte qu'un
identifiant opaque pointant vers une ligne `Session`. Conséquence assumée et outillée : cookie et
session peuvent diverger, d'où un mécanisme serveur de nettoyage des cookies Auth.js
(`/api/auth/reset`) pour éviter à l'utilisateur une purge manuelle du navigateur.

### Autorisation

Le contrôle d'accès repose sur trois mécanismes complémentaires :

1. **Permissions de rôle** — chaque module déclare ses permissions et les rôles qui les portent ;
   `buildRolePermissions(registry)` assemble la matrice au démarrage. Le code consomme
   `rolePermissions` depuis `@/lib/registry`.
2. **Périmètre** — au-delà de la permission, un rôle est borné à ses départements
   (`getUserDepartmentScope`) ou à ses ministères (`getUserMinistryScope`). La garde est **posée
   explicitement au point d'entrée** plutôt que déduite par rôle : un périmètre restreint vide
   refuse tout, sans code spécifique par rôle (ADR-0009).
3. **Église cible obligatoire** — aucune vérification de permission ne s'évalue « hors église ».
   Les helpers exigent un `churchId` ; les rares permissions volontairement transverses passent
   par une liste blanche testée.

### Accès transverses entre églises

Le cloisonnement par défaut est total. Trois dérogations existent, chacune délibérée et bornée :

| Dérogation | Portée | Mécanisme |
|---|---|---|
| Super Admin | Administration de la plateforme | Court-circuit explicite en tête des helpers |
| Profil pastoral | Lecture seule, **par personne** | Liste blanche `PASTORAL_READ_PERMISSIONS` dans `requireChurchPermission` |
| Partage de bibliothèque audio | Écoute seule, **par église** | Helper dédié `requireAudioListenAccess`, hors du garde générique |

La troisième dérogation est volontairement **implémentée hors de `requireChurchPermission`** :
élargir le garde générique pour un besoin propre à un module exposerait tout le multi-tenant à une
régression. Cette règle est désormais la règle générale du projet pour tout partage inter-églises
à venir — voir [ADR-0010](adr/0010-acces-transverse-inter-eglises.md). Le détail fonctionnel est
dans `auth.md` et `specs/036-partage-bibliotheque-audio/`.

### Autres dispositifs

- Validation Zod systématique des entrées de mutation.
- Journal d'audit (`logAudit`) sur les actions sensibles, dont l'ouverture et la révocation d'un
  partage de bibliothèque.
- Limiteur de débit par utilisateur (en mémoire, mono-instance — limite documentée).
- Analyse statique de sécurité (CodeQL) et porte `npm audit` en CI.
- Les exceptions de sécurité acceptées et leur justification sont tracées dans
  `security-exceptions.md`.

## 8. Architecture technique et infrastructure

### Topologie de production

```
Internet
   │  HTTPS (Let's Encrypt)
   ▼
Traefik ──────────────► Service systemd « koinonia »  (Next.js, port local)
   (reverse proxy,             │
    terminaison TLS)           ├──► MariaDB (locale)
                               ├──► Bucket S3 média
                               └──► Cache disque des renditions audio

               Service systemd « koinonia-audio-worker »  (process hors Next.js)
                               │
                               └──► Table de jobs (MariaDB) + Bucket S3 média
```

### Composants

| Composant | Nature | Remarque |
|---|---|---|
| Application | Service systemd, Node.js | Durci (isolation réseau et système de fichiers) |
| Worker audio | Service systemd distinct | Hors Next.js, piloté par une table de jobs (ADR-0007) |
| Reverse proxy | Traefik | Terminaison TLS, routage par domaine |
| Base de données | MariaDB locale | Une base par environnement |
| Tâches planifiées | Timers systemd | Rappels, digests, sauvegardes |

### Organisation sur disque

Structure de type Capistrano : `releases/` horodatées, `shared/` (dont `.env`), et un symlink
`current`. **Le rollback consiste à repointer le symlink et redémarrer le service** — pas de
reconstruction, pas de redéploiement.

## 9. Exploitation et cycle de vie

### Environnements

| Environnement | Support | Alimentation | Objet |
|---|---|---|---|
| Développement | Docker local | Jeu de données fictif | Développement quotidien |
| Recette | VM dédiée | Jeu de données de formation | Valider une branche avant tag |
| Production | VM dédiée | Données réelles | Exploitation |

Recette et production sont **totalement indépendantes** : deux VMs, deux jeux de secrets, deux
workflows. La recette n'intervient jamais dans le pipeline de production.

### Intégration continue

À chaque PR : `typecheck`, `lint`, `lint:boundaries`, tests unitaires (Vitest), porte
`npm audit --omit=dev --audit-level=high`, et analyse CodeQL. Sur un tag `v*` : vérification de la
correspondance tag ↔ `package.json`, puis empaquetage de l'artefact.

### Déploiement

Deux chaînes aux propriétés volontairement différentes :

| | Recette | Production |
|---|---|---|
| Déclenchement | Manuel (`workflow_dispatch`) | Automatique sur tag `v*` |
| Source | Compilée depuis la branche choisie | **Promotion** de l'artefact déjà construit et testé par la CI |
| Portes qualité | Aucune — on y valide du travail en cours, y compris aux tests rouges | Toutes |

Cette asymétrie est assumée : la recette sert à valider une branche **avant** que la CI ne soit
nécessairement verte, ce qui est impossible en production par construction.

### Gestion des versions

`package.json` est la source de vérité. Une release suit : branche `chore/release-vX.Y.Z` →
PR → merge → tag → GitHub Release. La version s'affiche dans le pied de page de l'application.
Le changelog est tenu dans `CHANGELOG.md`.

### Sauvegarde et restauration

Dumps de base poussés vers le bucket de sauvegarde par timer systemd, avec convention de nommage
et procédure de restauration documentées dans `production.md`.

## 10. Décisions structurantes

Les décisions architecturales sont tracées comme ADR dans `docs/adr/`. Elles se distinguent des
décisions de `plan.md`, portées à une seule feature, par le critère : *une décision reste un ADR
même si la feature qui l'a motivée est totalement réécrite.*

| ADR | Décision | Statut |
|---|---|---|
| [0001](adr/0001-architecture-modulaire-monolithe.md) | Architecture modulaire en monolithe (registry + event bus) | Accepté |
| [0002](adr/0002-multi-tenant-church-id.md) | Multi-tenant par `churchId` sur chaque donnée | Accepté |
| [0003](adr/0003-prisma7-esm-driver-adapter.md) | Prisma 7 ESM-only avec driver adapter MariaDB | Accepté |
| [0004](adr/0004-import-dynamique-anti-cycle-registry.md) | Import dynamique contre le cycle `registry.ts` ↔ modules | Accepté |
| [0005](adr/0005-module-audio-distinct.md) | Module `audio` distinct de `media` | Proposé |
| [0006](adr/0006-extraction-module-storage.md) | Extraction de `modules/storage` hors de `media` | Proposé |
| [0007](adr/0007-worker-hors-nextjs-table-jobs.md) | Worker hors Next.js piloté par une table de jobs | Proposé |
| [0008](adr/0008-cache-disque-renditions-audio.md) | Cache disque local des renditions audio | Accepté |
| [0009](adr/0009-garde-perimetre-explicite.md) | Garde de périmètre explicite au point d'entrée | Accepté |
| [0010](adr/0010-acces-transverse-inter-eglises.md) | Accès transverse inter-églises borné au module demandeur | Accepté |

## 11. Index documentaire

Chaque document ci-dessous fait **autorité sur son domaine** ; ce DAT n'en est que la synthèse.

| Document | Domaine |
|---|---|
| [architecture.md](architecture.md) | Structure du code, patterns, conventions |
| [database.md](database.md) | Schéma Prisma, modèles, relations |
| [api.md](api.md) | Endpoints, requêtes, réponses |
| [auth.md](auth.md) | Authentification, rôles, permissions |
| [production.md](production.md) | Déploiement, infrastructure, exploitation |
| [staging.md](staging.md) | Environnement de recette |
| [dev-onboarding.md](dev-onboarding.md) | Environnement de développement |
| [security-exceptions.md](security-exceptions.md) | Exceptions de sécurité acceptées |
| [roadmap.md](roadmap.md) | Trajectoire fonctionnelle et technique |
| [roadmap-modularite.md](roadmap-modularite.md) | État de la modularité du monolithe et chantiers proposés |
| [adr/](adr/README.md) | Décisions architecturales |
| `specs/` | Spécifications par feature (`spec.md` → `plan.md` → `tasks.md`) |

## 12. Trajectoire technique

Les évolutions prévues sont tenues dans `roadmap.md`. Les limites connues et assumées à ce jour,
avec leur justification, sont dans `security-exceptions.md` et
`todo-separation-comptes-deploiement.md`.

Deux limites structurantes à connaître :

- **Limiteur de débit en mémoire** : suffisant pour un déploiement mono-instance derrière
  Traefik, à remplacer par un store partagé en cas de passage multi-instances.
- **Comptes runtime et déploiement confondus** sur les VM : écart identifié, tracé et reporté
  (voir `todo-separation-comptes-deploiement.md`).
