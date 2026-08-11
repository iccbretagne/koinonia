# Tâches — Environnement de développement conteneurisé pour contributeurs

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : fixtures → seed dev → auth dev → conteneurisation → documentation → tests.
> Les tâches `[P]` sont parallélisables (fichiers indépendants).

## Prérequis

- [ ] Branche créée : `feat/environnement-dev-contributeurs`
- [ ] `[Aucune migration Prisma]` — pas de changement de schéma (voir plan.md)

## Tâches

### 1. Dépendances

- [ ] **T1** — Ajouter `@faker-js/faker` en devDependency *(fichier : `package.json`)*

### 2. Fixtures & jeu de données

- [ ] **T2** — Créer la table statique des comptes de test (email `xxx@dev.local`, rôle, église/ministère/département de rattachement) : un compte par rôle métier existant de l'enum `Role`, plus au moins deux comptes `DEPARTMENT_HEAD` sur des départements distincts d'une même église, pour tester le scoping *(fichier : `prisma/fixtures/dev-users.ts`)*
- [ ] **T3** — Créer la table statique des libellés structurels réalistes (3 églises fictives avec couleur de marque, ministères et départements avec leur `function`), inspirée des libellés non personnels identifiés dans le plan (`## Inspiration réelle`) *(fichier : `prisma/fixtures/dev-structure.ts`)*
- [ ] **T4** — Écrire `prisma/seed-dev.ts` : initialise `faker.seed(<graine fixe>)`, nettoie les tables (même ordre FK que `prisma/seed.ts`), crée les 3 églises + ministères + départements depuis `dev-structure.ts`, génère des membres (STAR) réalistes par département via `faker` (noms français, emails `@dev.local`), crée les comptes de test depuis `dev-users.ts` (`User` + `UserChurchRole` + `UserDepartment` + `MemberUserLink` pour le compte STAR), génère des événements passés et à venir sur plusieurs semaines, des plannings de service, des absences (avec quelques backups), des demandes (tous statuts), des comptes rendus d'événements, et des relations de discipolat *(fichier : `prisma/seed-dev.ts`)*
- [ ] **T5** — Ajouter le script `db:seed:dev` *(fichier : `package.json`)*

### 3. Authentification de développement

- [ ] **T6** — Extraire l'assemblage de la liste `providers` NextAuth dans une fonction pure testable (`buildProviders(env)`), qui ajoute le provider `Credentials` (dérivé de `dev-users.ts`, sans mot de passe) uniquement si `env.AUTH_DEV_LOGIN === "true"` et `env.NODE_ENV !== "production"` ; le provider `Google` reste inchangé et toujours présent *(fichier : `src/lib/auth.ts`)*
- [ ] **T7** — Documenter `AUTH_DEV_LOGIN` dans `.env.example` avec l'avertissement explicite de ne jamais la définir en production *(fichier : `.env.example`)*
- [ ] **T8** [P] — Ajouter le bloc de connexion développement (liste des comptes de test depuis `dev-users.ts`, formulaire `signIn("credentials", …)`) sous le bouton Google existant, rendu uniquement quand `AUTH_DEV_LOGIN=true` côté serveur ; le rendu par défaut (sans la variable) reste strictement identique à l'actuel *(fichier : `src/app/page.tsx`)*

### 4. Conteneurisation

- [ ] **T9** [P] — Créer l'image de développement (Node 22, dépendances, `next dev --turbopack`) *(fichier : `docker/Dockerfile.dev`)*
- [ ] **T10** — Créer `docker-compose.dev.yml` : service `app` (build `docker/Dockerfile.dev`, volume sur le repo avec volume anonyme dédié pour `node_modules`, port 3000, variables d'env dont `AUTH_DEV_LOGIN=true`) + service `db` (réutilise la définition MariaDB de `docker-compose.yml`) *(fichier : `docker-compose.dev.yml`)*
- [ ] **T11** — Ajouter les scripts npm de confort pour le flux dev conteneurisé (démarrage, arrêt, reset complet BDD + reseed dev en une commande) *(fichier : `package.json`)*

### 5. Documentation

- [ ] **T12** — Rédiger le guide d'onboarding contributeur pas-à-pas (prérequis par OS avec liens d'installation, clonage, démarrage conteneurisé, chargement du jeu de données fictif, connexion avec un compte de test par rôle, commande de réinitialisation complète, note sur l'option de connexion Google réelle) *(fichier : `docs/dev-onboarding.md`)*
- [ ] **T13** [P] — Ajouter une entrée vers ce nouveau guide dans la table de documentation et une note dans le Quick start pointant vers le parcours conteneurisé *(fichier : `README.md`)*
- [ ] **T14** [P] — Ajouter une entrée dans la table de documentation de `CLAUDE.md` *(fichier : `CLAUDE.md`)*

### 6. Tests

- [ ] **T15** — Tester `buildProviders(env)` : absence du provider `Credentials` quand `AUTH_DEV_LOGIN` est absent, quand il vaut `"false"`, et quand `NODE_ENV=production` même avec `AUTH_DEV_LOGIN=true` ; présence du provider `Credentials` uniquement quand les deux conditions dev sont réunies ; présence systématique du provider `Google` dans tous les cas *(fichier : `src/lib/__tests__/auth.providers.test.ts`)*
- [ ] **T16** [P] — Tester la structure de `prisma/fixtures/dev-users.ts` : au moins un compte par valeur de l'enum `Role`, au moins deux comptes `DEPARTMENT_HEAD` avec des `departmentId`/`ministryId` distincts *(fichier : `prisma/fixtures/__tests__/dev-users.test.ts`)*
- [ ] **T17** — Vérification manuelle croisée Windows/Linux de la procédure documentée (T12) : suivre le guide de bout en bout sur les deux OS, se connecter avec au moins un compte par rôle, confirmer que les permissions/scopes affichés correspondent au rôle choisi *(consignée en commentaire de PR, non automatisable)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits :
  - [ ] Documentation autoportante suivie sans aide extérieure (T12, T17)
  - [ ] Procédure identique Windows/Linux (T9, T10, T12, T17)
  - [ ] Aucune étape standard ne requiert un client Google OAuth réel ni un service externe payant (T6, T10, T12)
  - [ ] Jeu de données fictif couvrant tous les domaines listés en proportions réalistes (T2, T3, T4)
  - [ ] Connexion immédiate avec un compte de n'importe quel rôle (T2, T6, T8)
  - [ ] Commande unique de réinitialisation complète (T11)
  - [ ] Auth dev isolée de la production, activable uniquement en dev (T6, T7, T15)
  - [ ] Google OAuth production strictement inchangé (T6)
  - [ ] `docs/production.md` non impacté (aucune tâche ne le touche)
- [ ] PR ouverte vers `main`
