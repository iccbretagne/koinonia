# Tâches — Environnement de développement conteneurisé pour contributeurs

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé (vérification manuelle croisée Windows/Linux non réalisable dans cet environnement — voir T17)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : fixtures → seed dev → auth dev → conteneurisation → documentation → tests.
> Les tâches `[P]` sont parallélisables (fichiers indépendants).

## Prérequis

- [x] Branche créée : `feat/environnement-dev-contributeurs`
- [x] `[Aucune migration Prisma]` — pas de changement de schéma (voir plan.md)

## Tâches

### 1. Dépendances

- [x] **T1** — Ajouter `@faker-js/faker` en devDependency *(fichier : `package.json`)*

### 2. Fixtures & jeu de données

- [x] **T2** — Créer la table statique des comptes de test (email `xxx@dev.local`, rôle, église/ministère/département de rattachement) : un compte par rôle métier de Koinonia, plus deux comptes `DEPARTMENT_HEAD` sur des départements distincts, pour tester le scoping *(fichier : `prisma/fixtures/dev-users.ts`)*
- [x] **T3** — Créer la table statique des libellés structurels réalistes (3 églises fictives avec couleur de marque, ministères et départements avec leur `function`), inspirée des libellés non personnels identifiés dans le plan (`## Inspiration réelle`) *(fichier : `prisma/fixtures/dev-structure.ts`)*
- [x] **T4** — Écrire `prisma/seed-dev.ts` : initialise `faker.seed(<graine fixe>)`, nettoie les tables, crée les 3 églises + ministères + départements depuis `dev-structure.ts`, génère des membres (STAR) réalistes par département via `faker` (noms français, emails `@dev.local`), crée les comptes de test depuis `dev-users.ts`, génère des événements passés et à venir, des plannings de service, des absences (avec backups), des demandes (plusieurs statuts), des comptes rendus d'événements, et des relations de discipolat *(fichier : `prisma/seed-dev.ts`)*. Exécuté de bout en bout contre une base MariaDB réelle pendant l'implémentation — voir note de vérification ci-dessous.
- [x] **T5** — Ajouter le script `db:seed:dev` *(fichier : `package.json`)*

### 3. Authentification de développement

- [x] **T6** — Ajouter la garde `isDevLoginEnabled(env)` (vraie uniquement si `AUTH_DEV_LOGIN === "true"` et `NODE_ENV !== "production"`) et exporter `SESSION_COOKIE_NAME` *(fichier : `src/lib/auth.ts`)*. **Écart par rapport à la conception initiale** (provider NextAuth Credentials) : testé en conditions réelles, un provider Credentials force une session JWT incompatible avec la stratégie de session "database" utilisée par Google — la connexion semblait réussir mais n'était pas reconnue par `/api/auth/session`. Remplacé par une route dédiée (T6b) qui crée directement la ligne `Session`, sans toucher au provider Google ni à la stratégie de session. Voir plan.md, section Décisions.
- [x] **T6b** — Créer `POST /api/auth/dev-login` : 404 si `isDevLoginEnabled` est faux, résout le compte de test choisi via `dev-users.ts`, crée une `Session` Prisma pour l'utilisateur seedé correspondant et pose le cookie `SESSION_COOKIE_NAME` *(fichier : `src/app/api/auth/dev-login/route.ts`)*
- [x] **T7** — Documenter `AUTH_DEV_LOGIN` dans `.env.example` avec l'avertissement explicite de ne jamais la définir en production *(fichier : `.env.example`)*
- [x] **T8** [P] — Ajouter le bloc de connexion développement (liste des comptes de test depuis `dev-users.ts`, formulaire HTML postant vers `/api/auth/dev-login`) sous le bouton Google existant, rendu uniquement quand `isDevLoginEnabled` est vrai côté serveur ; le rendu par défaut (sans la variable) reste strictement identique à l'actuel *(fichier : `src/app/page.tsx`)*

### 4. Conteneurisation

- [x] **T9** [P] — Créer l'image de développement (Node 22, dépendances, `next dev --turbopack`) *(fichier : `docker/Dockerfile.dev`)*. Build vérifié (`docker compose build app`) — succès.
- [x] **T10** — Créer `docker-compose.dev.yml` : service `app` (build `docker/Dockerfile.dev`, volume sur le repo avec volumes anonymes dédiés pour `node_modules`/`.next`, port 3000, variables d'env dont `AUTH_DEV_LOGIN=true`) + service `db` (réutilise la définition MariaDB de `docker-compose.yml`) *(fichier : `docker-compose.dev.yml`)*. Démarrage réel vérifié (`docker compose up`) — l'app répond sur :3000, la page de connexion affiche bien le bloc dev.
- [x] **T11** — Ajouter les scripts npm de confort pour le flux dev conteneurisé (démarrage, arrêt, reset complet BDD + reseed dev en une commande) *(fichier : `package.json`)*

### 5. Documentation

- [x] **T12** — Rédiger le guide d'onboarding contributeur pas-à-pas (prérequis par OS avec liens d'installation, clonage, démarrage conteneurisé, chargement du jeu de données fictif, connexion avec un compte de test par rôle, commande de réinitialisation complète, note sur l'option de connexion Google réelle) *(fichier : `docs/dev-onboarding.md`)*
- [x] **T13** [P] — Ajouter une entrée vers ce nouveau guide dans la table de documentation et une note dans le Quick start pointant vers le parcours conteneurisé *(fichier : `README.md`)*
- [x] **T14** [P] — Ajouter une entrée dans la table de documentation de `CLAUDE.md` *(fichier : `CLAUDE.md`)*

### 6. Tests

- [x] **T15** — Tester `isDevLoginEnabled(env)` : `false` quand `AUTH_DEV_LOGIN` est absent, quand il vaut `"false"`, et en production même avec `AUTH_DEV_LOGIN=true` ; `true` uniquement quand les deux conditions dev sont réunies *(fichier : `src/lib/__tests__/auth.providers.test.ts`)*. Complétée par un test de la route `POST /api/auth/dev-login` (404 hors dev, redirection si compte inconnu/non seedé, création de session + cookie pour un compte valide) *(fichier : `src/app/api/auth/dev-login/__tests__/route.test.ts`)*.
- [x] **T16** [P] — Tester la structure de `prisma/fixtures/dev-users.ts` : un compte par rôle métier de Koinonia, au moins deux comptes `DEPARTMENT_HEAD` sur des départements distincts, emails/clés uniques, domaine `@dev.local` exclusivement *(fichier : `prisma/fixtures/__tests__/dev-users.test.ts`)*
- [ ] **T17** — Vérification manuelle croisée Windows/Linux de la procédure documentée (T12) : suivre le guide de bout en bout sur les deux OS, se connecter avec au moins un compte par rôle, confirmer que les permissions/scopes affichés correspondent au rôle choisi *(consignée en commentaire de PR, non automatisable)*. **Non réalisée** : pas de poste Windows/Linux desktop disponible dans cet environnement d'implémentation. À la place, le parcours a été vérifié de bout en bout sur Linux dans ce même environnement (build de l'image, démarrage des conteneurs, seed, connexion via `curl` avec un compte `SUPER_ADMIN`, session confirmée valide sur `/api/auth/session` et `/dashboard`). La vérification Windows et la vérification manuelle via navigateur restent à faire par un contributeur avant fusion définitive.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint` (0 erreur ; 9 avertissements préexistants, sans rapport avec cette feature)
- [x] `npm run lint:boundaries`
- [x] `npm run test` (625 tests, tous verts)
- [x] Tous les critères d'acceptation de `spec.md` satisfaits :
  - [x] Documentation autoportante suivie sans aide extérieure (T12) — vérifiée par exécution réelle des commandes documentées
  - [~] Procédure identique Windows/Linux (T9, T10, T12) — vérifiée sur Linux uniquement (voir T17)
  - [x] Aucune étape standard ne requiert un client Google OAuth réel ni un service externe payant (T6, T6b, T10, T12)
  - [x] Jeu de données fictif couvrant tous les domaines listés en proportions réalistes (T2, T3, T4) — vérifié par exécution réelle (3 églises, 9 ministères, 22 départements, 155 membres, 9 comptes de test, 15 événements, absences, demandes, comptes rendus, discipolat)
  - [x] Connexion immédiate avec un compte de n'importe quel rôle (T2, T6b, T8) — vérifié de bout en bout (session `SUPER_ADMIN` valide via `curl`)
  - [x] Commande unique de réinitialisation complète (T11)
  - [x] Auth dev isolée de la production, activable uniquement en dev (T6, T6b, T7, T15)
  - [x] Google OAuth production strictement inchangé (T6, T6b — aucune modification du provider ni des callbacks)
  - [x] `docs/production.md` non impacté (aucune tâche ne le touche)
- [ ] PR ouverte vers `main`
