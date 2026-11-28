# Contribuer à Koinonia

Ce guide s'adresse à toute personne — humaine ou agent IA — qui veut modifier Koinonia : monter
un environnement, comprendre les conventions, ouvrir une PR conforme. Pour **déployer** ou
exploiter une instance, voir le [guide de déploiement](docs/deploiement/README.md). La carte de
toute la documentation est dans [docs/README.md](docs/README.md).

## Sommaire

1. [Avant de commencer](#1-avant-de-commencer)
2. [Installer l'environnement](#2-installer-lenvironnement)
3. [Commandes du quotidien](#3-commandes-du-quotidien)
4. [Comprendre le projet](#4-comprendre-le-projet)
5. [Le flux de travail](#5-le-flux-de-travail)
6. [Branches, commits, pull requests](#6-branches-commits-pull-requests)
7. [Checklist avant d'ouvrir la PR](#7-checklist-avant-douvrir-la-pr)
8. [Tests : en local et en CI](#8-tests--en-local-et-en-ci)
9. [Règles qui reviennent le plus](#9-règles-qui-reviennent-le-plus)
10. [Sécurité](#10-sécurité)
11. [Écrire un ADR](#11-écrire-un-adr)
12. [Contribuer avec un agent IA](#12-contribuer-avec-un-agent-ia)
13. [Publier une version](#13-publier-une-version)

## 1. Avant de commencer

- **Langue** : le code, les commits, les PR, la documentation et l'interface sont en **français**
  (identifiants de code en anglais).
- **Vocabulaire** : un **STAR** (masculin) est un membre d'un département ; un **ministère**
  regroupe des **départements** (Louange > Choristes…). Les statuts de service sont `EN_SERVICE`,
  `EN_SERVICE_DEBRIEF`, `INDISPONIBLE`, `REMPLACANT`. Voir [CLAUDE.md](CLAUDE.md#terminologie).
- **Principes non négociables** : [`specs/constitution.md`](specs/constitution.md). En cas de
  conflit avec une spec ou un plan, la constitution l'emporte.
- **Licence** : [Apache 2.0](LICENSE). Une faille de sécurité ne se signale **pas** par une issue
  publique : voir [SECURITY.md](SECURITY.md).

## 2. Installer l'environnement

Prérequis communs : Git et Docker (avec le plugin Compose). Node.js 22 (`.nvmrc`) n'est requis que
pour le parcours B.

### Parcours A — tout en conteneurs (recommandé)

Aucun compte Google, aucun `.env` : l'application et MariaDB tournent dans Docker, avec un jeu de
données **fictif et déterministe** et une connexion par compte de test.

```bash
git clone https://github.com/iccbretagne/koinonia.git && cd koinonia
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build   # terminal 1
# terminal 2, une fois les logs stabilisés :
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app npm run db:migrate:deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec app npm run db:seed:dev
```

Ouvrir <http://localhost:3000> : le bloc **« Développement uniquement »** sous le bouton Google
propose les comptes de test (`super-admin`, `admin`, `secretaire`, `ministre`, `star`…). Raccourcis
npm : `npm run dev:up`, `dev:down`, `dev:reset`. Guide complet, dépannage Windows/WSL2, ce qui ne
fonctionne pas sans configuration (S3, SMTP, worker audio, push) :
[docs/dev-onboarding.md](docs/dev-onboarding.md).

### Parcours B — Node.js sur l'hôte

```bash
git clone https://github.com/iccbretagne/koinonia.git && cd koinonia
cp .env.example .env
docker compose up -d            # MariaDB seule (utilisateur/base/mot de passe : koinonia)
npm install
npx prisma generate
npm run db:migrate:deploy       # applique les migrations existantes
npm run db:seed:dev             # jeu fictif — ou db:seed pour les données ICC Rennes
npm run dev                     # http://localhost:3000
```

Dans `.env` : `DATABASE_URL=mysql://koinonia:koinonia@localhost:3306/koinonia`, un `AUTH_SECRET`
(`openssl rand -base64 32`), `AUTH_URL=http://localhost:3000`, et **`AUTH_DEV_LOGIN=true`** pour se
connecter par compte de test sans OAuth. Pour tester la connexion Google, créer un client OAuth
avec `http://localhost:3000/api/auth/callback/google` en URI de redirection et renseigner
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. `AUTH_DEV_LOGIN` est ignoré dès que `NODE_ENV=production`
et ne doit **jamais** apparaître dans une configuration de déploiement.

> `db:seed:dev` **efface et régénère toute la base** : ne le pointer que vers une base jetable.

## 3. Commandes du quotidien

| Commande | Usage |
|---|---|
| `npm run dev` | Serveur de développement (Turbopack) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`--max-warnings=0`, dont la garde du design system) |
| `npm run lint:boundaries` | Frontières entre modules (dependency-cruiser) |
| `npm run lint:prisma-boundary` | Cliquet : pas de nouvelle route qui importe Prisma directement |
| `npm run test` | Tests unitaires (Vitest) ; `npx vitest run <chemin>` pour un sous-ensemble |
| `npm run test:coverage` | Tests avec seuils de couverture (ce que lance la CI) |
| `npm run test:e2e` | Playwright (voir [docs/e2e.md](docs/e2e.md)) |
| `npm run build` | `prisma generate` + `next build` + bundles `dist/worker.mjs` et `dist/092-rewrite-stored-paths.mjs` |
| `npm run openapi` | Régénère `docs/openapi.json` depuis les `contract.ts` |
| `npm run db:migrate` | Crée une migration (`prisma migrate dev`) |
| `npm run db:migrate:deploy` | Applique les migrations existantes |
| `npm run db:seed:dev` / `db:reset` | Jeu fictif / réinitialisation complète |
| `npm run worker` | Worker audio en développement (demande `ffmpeg`, S3) |

## 4. Comprendre le projet

Koinonia est un **monolithe modulaire** Next.js 16 / React 19 / Prisma 7 / MariaDB, multi-tenant
(chaque donnée porte un `churchId`).

| Pour… | Lire |
|---|---|
| La vue d'ensemble | [docs/dat.md](docs/dat.md), puis [docs/architecture.md](docs/architecture.md) |
| Les conventions et pièges (source la plus complète) | [CLAUDE.md](CLAUDE.md) |
| Rôles, permissions, garde par route | [docs/auth.md](docs/auth.md) et [CLAUDE.md § Rôles](CLAUDE.md#rôles-et-permissions) |
| Le modèle de données | [docs/database.md](docs/database.md) |
| Les conventions d'API et la référence des endpoints | [docs/api.md](docs/api.md), [docs/openapi.json](docs/openapi.json) |
| Pourquoi c'est construit ainsi | [docs/adr/](docs/adr/README.md) |
| Le design system (tokens, composants) | [docs/design-system/](docs/design-system/README.md) |
| Les processus métier de l'église | [docs/processus/](docs/processus/README.md) |

Repères du code : `src/modules/<domaine>/` (logique métier, manifeste, services), `src/app/`
(pages et routes API, qui n'importent un module que par son index), `src/lib/` (transverse),
`src/components/ui/` (composants réutilisables), `prisma/` (schéma, migrations, seeds). Les écrans
connectés sont rangés **par espace métier** (`accueil`, `planning`, `evenements`, `personnes`,
`demandes`, `medias`, `finances`, `ressources`, `pastoral`, `admin`, `plateforme`) ; la table des
anciennes adresses est `src/lib/legacy-paths.ts`.

## 5. Le flux de travail

Les fonctionnalités non triviales sont **spécifiées avant d'être codées** (Spec-Driven Development,
[specs/README.md](specs/README.md)) :

```
/specify <description>  →  /plan  →  /tasks  →  /implement
   spec.md                  plan.md   tasks.md    code + PR
```

| Étape | Produit | Contenu |
|---|---|---|
| `/specify` | `specs/NNN-nom/spec.md` | **Quoi et pourquoi**, comportement observable, critères d'acceptation. Aucune décision technique |
| `/plan` | `plan.md` | **Comment** : modèle, API, UI, migration ; respecte la constitution ; décisions et alternatives écartées |
| `/tasks` | `tasks.md` | Tâches ordonnées et vérifiables |
| `/implement` | code + PR | Exécute les tâches, coche `tasks.md`, passe la spec à `Implémentée` |

Les commandes sont dans `.claude/commands/` (agents Claude Code) ; un contributeur humain suit les
mêmes étapes à la main avec les gabarits de `specs/templates/`.

**Quand une spec est nécessaire** : toute fonctionnalité, tout changement d'écran ou de structure
qui dépasse une ou deux lignes, tout changement de permission ou de schéma. **Pas de spec** : un
correctif trivial (une ligne, un renommage, une coquille), une montée de dépendance, un chantier de
la [roadmap](docs/roadmap.md) traité par une PR `chore` (si son périmètre s'élargit en cours de
route, l'annoncer et écrire un ADR). Dans le doute, spécifier.

Une spec livrée n'est jamais supprimée : elle reste la trace de l'intention.

## 6. Branches, commits, pull requests

**Branches** (jamais de push direct sur `main`) :

| Préfixe | Usage |
|---|---|
| `feat/<nom>` | Nouvelle fonctionnalité |
| `fix/<nom>` | Correction de bug |
| `chore/<nom>` | Maintenance, dépendances, configuration, release (`chore/release-vX.Y.Z`) |
| `docs/<nom>` | Documentation seule |

**Fonctionnalité longue en plusieurs PR** : une branche de base `feat/X` ; les sous-PR visent
`feat/X` ; une seule PR finale `feat/X` → `main`.

**Commits** : messages conventionnels, en français, à l'impératif ou au passé composé selon le
contexte, avec une portée : `feat(planning): …`, `fix(proxy): …`, `docs(deploiement): …`,
`test(mcp): …`, `chore: release vX.Y.Z (#N)`. Un commit = un changement logique ; le message dit le
**pourquoi** quand il n'est pas évident.

**Pull request** : vers `main`, titre au format d'un commit ; le corps décrit le changement, cite la
spec (`specs/NNN-nom/`) et l'issue, et liste ce qui a été vérifié (y compris à la main pour une UI).
La **CI doit être verte** avant le merge. Une PR qui ne touche que `specs/`, `docs/` (hors
`docs/openapi.json`) ou des `.md` ne déclenche pas les jobs de code.

**Migrations Prisma** : si deux branches modifient `prisma/schema.prisma`, rebaser sur `main`
**avant** `npm run db:migrate` pour éviter des dossiers de migration en conflit.

## 7. Checklist avant d'ouvrir la PR

Toujours :

- [ ] `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`
- [ ] Rien de non voulu dans le diff (`next-env.d.ts` régénéré par `next dev`, fichiers `.env`)
- [ ] Documentation à jour dans le même commit si un comportement documenté change

Selon ce que vous touchez :

- [ ] **Interface** : `npm run build` (typecheck, lint et tests ne voient pas la frontière
  client/serveur) ; vérifier le rendu **mobile** et le thème sombre ; composants de
  `src/components/ui/` et tokens sémantiques uniquement (voir § 9)
- [ ] **Route API** ou son contrat : `contract.ts` voisin, `npm run openapi`, commiter
  `docs/openapi.json` ; routes et pages **déclarées dans le manifeste** de leur module
- [ ] **Schéma Prisma** : une migration (`npm run db:migrate`), jamais `db push`
- [ ] **Permissions** : modifier le manifeste du module, la matrice figée de
  `src/core/__tests__/permissions.test.ts`, le tableau de [CLAUDE.md](CLAUDE.md#rôles-et-permissions)
  et [docs/auth.md](docs/auth.md) **dans le même commit**
- [ ] **Dépendance entre modules** : `npm run lint:boundaries`
- [ ] **Décision structurante** : un ADR (voir § 11)
- [ ] **Nouvelle variable d'environnement** : `.env.example` et
  [la référence](docs/deploiement/configuration.md#référence-des-variables)
- [ ] **Nouvelle tâche cron** : [la table du cron](docs/deploiement/exploitation.md#cron--tâches-planifiées)
- [ ] **Opération manuelle au déploiement** (script, bascule) : un runbook dans
  [docs/deploiement/runbooks.md](docs/deploiement/runbooks.md)
- [ ] **Navigation / adresses d'écran** : toute adresse d'écran se construit par `paths.*`
  (`src/lib/paths.ts`) — jamais un littéral (`no-screen-literals.test.ts` le refuse) ; changer une
  adresse = `paths.ts` + `legacy-paths.ts` (ancienne adresse redirigée) ; `src/lib/navigation.ts` et le
  scénario `e2e/navigation-roles.spec.ts` suivent

## 8. Tests : en local et en CI

**En local, rester léger.** Typecheck, lint, frontières, puis les tests qui concernent votre
changement (`npx vitest run src/modules/planning`). La suite complète tourne en CI, et
`npm run build` n'est utile en local que pour une modification d'interface ou de configuration
Next.

**La CI fait le reste** ([`ci.yml`](.github/workflows/ci.yml)) :

| Job | Quand | Contenu |
|---|---|---|
| `lint-test` | code touché | `prisma generate`, typecheck, lint, frontières, cliquet Prisma, **tests avec couverture** (seuils dans `vitest.config.ts`), `npm audit`, SonarCloud |
| `build` | code touché | `npm run build` |
| `migrations` | `prisma/`, `package*.json` touchés | Rejoue **toutes** les migrations sur MariaDB vierge puis vérifie que `schema.prisma` n'a pas de dérive |
| `e2e` | code touché | Playwright (navigation par rôle, accessibilité), non bloquant pour l'instant |
| `check-version` | tag `v*` | tag = version de `package.json` |

Règles de test : toute règle métier ou de sécurité ajoutée a son test unitaire ; un test de
permission s'écrit contre `rolePermissions`, jamais contre un rôle en dur ; un correctif de bug
commence par le test qui le reproduit. L'e2e est décrit dans [docs/e2e.md](docs/e2e.md) (base
jetable obligatoire : `db:seed:dev` efface tout).

## 9. Règles qui reviennent le plus

Le détail et la liste complète sont dans [CLAUDE.md](CLAUDE.md#règles-pour-les-agents-ia) et la
[constitution](specs/constitution.md). L'essentiel :

- **Route API** : `requireAuth()`, `requireChurchPermission(perm, churchId)` ou
  `requireCurrentChurchPermission(perm)` ; jamais de permission évaluée sans église cible ; pour un
  objet identifié, l'église qui fait foi est celle de l'objet (`resolveChurchId`) ; `const { id } =
  await params` ; corps validé par Zod (schéma dans le `contract.ts` voisin) ; `ApiError`,
  `successResponse`/`errorResponse`.
- **Permissions** : toujours via `rolePermissions` (`@/lib/registry`), jamais de `hasPermission` ni
  d'approximation d'un rôle par une autre permission ([ADR-0017](docs/adr/0017-permission-n-approxime-pas-un-role.md)) ;
  périmètre d'un responsable : `getUserDepartmentScope` / `requireDepartmentAccess`.
- **Modules** : `src/app/` n'importe un module que par `@/modules/X`, `@/modules/X/auth` ou
  `@/modules/X/schemas` ; la logique métier vit dans `src/modules/X/services/`, pas dans les routes.
- **Déclaration HTTP** ([ADR-0012](docs/adr/0012-manifeste-declare-surface-http.md)) : toute page ou
  route est déclarée dans le `routes` du manifeste de son module (ou `NOYAU_ROUTES`), sinon le proxy
  répond 404 ; `routes-exhaustivite.test.ts` le vérifie.
- **Contrat d'API** ([ADR-0023](docs/adr/0023-contrats-openapi-generes.md)) : un `contract.ts` pur par
  route, `npm run openapi` après tout changement.
- **Prisma** : migrations versionnées ; enums depuis `@/generated/prisma/client` (pas
  `@prisma/client`) ; client dans `src/generated/prisma/`.
- **UI** : composants de `src/components/ui/` d'abord (`Button` n'a pas de prop `loading`, `Modal`
  prend `open`) ; **tokens sémantiques** (`bg-surface`, `text-ink`…) et jamais de classe de palette
  brute ni de hexadécimal dans un `className` — ESLint le refuse, voir le
  [design system](docs/design-system/README.md) ; mobile d'abord, thème clair et sombre.
- **Notifications** : jamais de `sendEmail` direct pour un compte existant, passer par
  `createNotification`/`notifyUsers` avec un `domain` ([CLAUDE.md](CLAUDE.md#notifications-et-préférences-email-spec-053-adr-0016)).
- **Pas de sur-ingénierie** : le minimum qui satisfait la spec.

Next.js 16 diffère de ce que beaucoup d'outils connaissent (`src/proxy.ts` au lieu de
`middleware.ts`, `params` asynchrones…) : en cas de doute, lire `node_modules/next/dist/docs/`.

## 10. Sécurité

- **Multi-tenant strict** : aucune donnée ne traverse les églises ; un accès transverse passe par un
  helper dédié du module concerné ([ADR-0010](docs/adr/0010-acces-transverse-inter-eglises.md)), jamais
  en élargissant `requireChurchPermission`.
- **Entrées** : tout corps de mutation passe par Zod avant d'atteindre la base ; les fichiers
  téléversés sont vérifiés **sur leur contenu**, pas sur l'extension ; toute requête sortante vers
  une URL fournie par un utilisateur passe par `src/lib/safe-fetch.ts` (garde SSRF).
- **Données personnelles** : rien de pastoral ni de bancaire dans un texte de notification (l'écran
  verrouillé d'un téléphone les montre), pas de donnée réelle dans les jeux de test, aucune
  coordonnée d'autrui renvoyée à l'assistant.
- **Secrets** : jamais dans le dépôt ; `.env` est ignoré par git. Un secret committé par erreur
  est considéré comme compromis et se renouvelle.
- **Connexion de développement** : `AUTH_DEV_LOGIN` n'existe que pour le développement et le job
  `e2e` ; ne jamais l'ajouter à un workflow de déploiement ni à un `.env` de serveur.
- **Faille découverte** : [SECURITY.md](SECURITY.md) (signalement privé, pas d'issue publique).
  Les limites connues et acceptées sont listées dans
  [docs/security-exceptions.md](docs/security-exceptions.md).

## 11. Écrire un ADR

Un **ADR** (Architecture Decision Record) consigne une décision **structurante** : difficile à
défaire, transverse à plusieurs modules, ou qui engage un choix de pile ou de pattern durable.
Test pratique : *la décision resterait-elle vraie si la fonctionnalité qui l'a motivée était
entièrement réécrite ?* Si oui, c'est un ADR ; sinon, la décision va dans la section « Décisions »
du `plan.md` de la spec.

1. Copier [`docs/adr/template.md`](docs/adr/template.md) en `docs/adr/NNNN-titre-court.md` (numéro
   suivant dans l'index).
2. Remplir statut, date, contexte, **décision** (une affirmation), alternatives écartées,
   conséquences, références.
3. Ajouter la ligne à l'index de [docs/adr/README.md](docs/adr/README.md).
4. Citer l'ADR dans le `plan.md` concerné et dans [CLAUDE.md](CLAUDE.md) si une règle d'agent en
   découle. Un ADR accepté ne se réécrit pas : on le **remplace** par un nouvel ADR.

## 12. Contribuer avec un agent IA

[CLAUDE.md](CLAUDE.md) est le contexte chargé automatiquement par Claude Code ; [AGENTS.md](AGENTS.md)
l'est par les autres agents. Mêmes règles que pour un humain, avec en plus : lire un fichier avant de
le modifier, suivre les helpers existants plutôt que d'en inventer, lancer `npm run typecheck` après
les modifications, ne jamais pousser sur `main`, ne jamais commiter de secret. Les commandes
`/specify`, `/plan`, `/tasks`, `/implement` automatisent le flux du § 5.

## 13. Publier une version

La publication est réservée aux mainteneurs : PR `chore/release-vX.Y.Z` (version de `package.json`
+ section du `CHANGELOG.md`), merge, puis workflow **Release** qui pose le tag `vX.Y.Z` et crée la
GitHub Release, ce qui déclenche la CI du tag puis le déploiement en production. Pas à pas :
[docs/deploiement/README.md](docs/deploiement/README.md#publier-une-version-release-courante).
Pour valider une branche avant de la publier, le workflow **Deploy Staging** la déploie sur la
recette ([docs/staging.md](docs/staging.md)).
