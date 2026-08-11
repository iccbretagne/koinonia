# Plan technique — Environnement de développement conteneurisé pour contributeurs

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouveau code métier — les scripts de seed dev appellent Prisma directement (comme `prisma/seed.ts` existant), pas de nouvelle dépendance inter-module
- [x] **Sécurité** : le provider d'authentification dev est gardé par une double condition (`NODE_ENV !== "production"` **et** variable d'environnement explicite absente en prod) ; aucune route API existante n'est modifiée ; multi-tenant `churchId` respecté par le jeu de données généré
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — inchangé, le seed dev attribue les `Role` existants tels quels
- [x] **Validation** Zod — sans objet (pas de nouvelle route API)
- [x] **Migration** Prisma — `[Aucun changement de schéma]`
- [x] **Enums** importés depuis `@/generated/prisma/client` — le seed dev réutilise l'enum `Role` existant
- [x] **UI** : réutilisation du bouton de connexion existant (`src/app/page.tsx`), ajout conditionnel d'un bloc de connexion dev à côté, pas de nouveau design system

## Approche générale

Trois livrables indépendants mais complémentaires, tous strictement cantonnés au développement local :

1. **Conteneurisation complète** : `docker-compose.yml` étendu avec un service `app` (image Node basée sur un `Dockerfile.dev`, code monté en volume pour le hot-reload Turbopack) en plus du service `db` (MariaDB) déjà existant. Un nouveau `docker-compose.dev.yml` (ou extension du fichier existant) orchestre les deux.
2. **Jeu de données fictif riche** : un nouveau script `prisma/seed-dev.ts`, distinct du `prisma/seed.ts` de production (qui reste le seed minimal "ICC Rennes" utilisé en recette/prod pour l'amorçage réel). Le seed dev génère des données via `@faker-js/faker` avec un RNG initialisé à une graine fixe (déterminisme), couvrant les domaines listés dans la spec, sur 2-3 églises fictives, avec des comptes de test par rôle. Les libellés structurels (noms d'églises, de ministères, de départements, types/titres d'événements) et la volumétrie s'inspirent d'un export de production analysé pour cette feature — voir « Inspiration réelle » ci-dessous — mais aucune donnée personnelle (nom, email, téléphone de membre/utilisateur réel) n'y figure ni n'y a été copiée : les membres, comptes et coordonnées restent 100% générés par `faker`.
3. **Authentification de développement** : un provider NextAuth **Credentials** additionnel, enregistré dans `src/lib/auth.ts` uniquement si `process.env.AUTH_DEV_LOGIN === "true"` **et** `process.env.NODE_ENV !== "production"`. Il permet de choisir un compte de test (créé par le seed dev) dans une liste, sans mot de passe ni appel externe. Le provider Google reste strictement inchangé et reste le seul actif quand `AUTH_DEV_LOGIN` n'est pas positionné (donc en production).

Le fil directeur : **additif et isolé**. Rien de ce qui existe pour la production (schéma, seed prod, provider Google, docs/production.md) n'est modifié ; tout le nouveau code dev est soit dans de nouveaux fichiers, soit derrière une garde de variable d'environnement qui ne peut physiquement pas être vraie en production (elle n'apparaît dans aucun `.env` de déploiement, et `docs/production.md` n'est pas touché).

## Modèle de données

`[Aucun changement de schéma]` — le seed dev n'utilise que les modèles Prisma existants (`Church`, `Ministry`, `Department`, `Member`, `MemberDepartment`, `User`, `UserChurchRole`, `UserDepartment`, `MemberUserLink`, `Event`, `EventDepartment`, `Planning`, `Absence`, `AbsenceBackup`, `Request`, `EventReport`, `EventReportSection`, `Discipleship`, `DiscipleshipAttendance`), avec un volume et une diversité plus réalistes que `prisma/seed.ts`.

Pour permettre la connexion via le provider Credentials sans passer par le flux OAuth (qui crée normalement la ligne `Account` via `PrismaAdapter`), le seed dev crée directement les lignes `User` (avec `email` en `xxx@dev.local`) et `UserChurchRole` correspondantes — le provider Credentials n'a pas besoin de ligne `Account`, NextAuth gère nativement l'authentification par identifiants sans adapter pour ce provider.

### Inspiration réelle (structurelle uniquement)

Un export de production (`2026-07-25T00-03-54Z-db.sql.gz`, fourni par l'utilisateur) a été analysé ponctuellement pour calibrer le réalisme du seed dev, en ne retenant que des éléments **non personnels** :

- **Églises** : 4 tenants réels (ex. `ICC Rennes`, `ICC Vannes`, `ICC Saint-Brieuc`, `EJP Rennes`), avec leurs couleurs de marque (`primaryColor`) — le seed dev s'inspire de ce nombre et de cette diversité de tenants (3, pour rester proportionné au périmètre dev) plutôt que de reprendre les noms exacts un à un.
- **Ministères et départements** : les intitulés réels observés (ex. `Ordre`, `Croissance spirituelle`, `Coordination générale`, `Jeunesse` ; `Secrétariat`, `Production média`, `Accueil`, `Sécurité`, `Modération`…) et leurs valeurs de `function` associées servent de base à la liste statique du seed dev, en remplacement des listes actuelles de `prisma/seed.ts` qui sont plus pauvres.
- **Événements** : types et intitulés génériques réutilisables (`CULTE`, `PRIERE`, `EJP`, `DISCIPOLAT`, `REUNION`, `COMFRAT`, `RTT`, `EVENEMENT`, `ADP`, `AUTRE` — déjà l'enum `EventType` du schéma — et des titres génériques comme « Culte 1 », « Culte EJP », « 3 jours de jeûne et prière »). Les titres d'événements qui s'avéraient être en réalité des prénoms de personnes (probablement liés à des événements ponctuels type anniversaire/parrainage) ont été explicitement écartés.
- **Volumétrie** : ordres de grandeur observés (~1800 membres et ~90 comptes utilisateurs sur 4 églises, ~1300 événements, ~170 départements) informent un ratio proportionné pour le seed dev — sans viser ce volume exact, qui serait disproportionné pour un usage de développement local (temps de seed, lisibilité des données en base).

**Ce qui n'est jamais repris** : identifiants réels (`cuid`), noms/emails/téléphones de membres ou d'utilisateurs, adresses email de contact réelles des églises (`secretariaticcrennes@…`, `compta.iccrennes35@…`), contenu libre des comptes rendus, demandes ou commentaires. Le fichier d'export lui-même n'est ni committé, ni référencé par un script du repo — cette section documente uniquement la démarche d'inspiration ponctuelle.

## API

*Aucun endpoint ajouté ou modifié.* L'authentification dev passe par le mécanisme standard NextAuth (`/api/auth/callback/credentials`, généré automatiquement par le handler `[...nextauth]` existant) — pas de route custom.

## Services / logique métier

Pas de nouveau code dans `src/modules/`. Le seed dev est un script d'infrastructure (comme `prisma/seed.ts` actuel), volontairement hors des frontières modulaires puisqu'il n'est jamais exécuté en production et ne fait pas partie du runtime applicatif.

Nouveaux fichiers :
- `prisma/seed-dev.ts` — génère le jeu de données fictif complet (déterministe, `faker.seed(<constante>)`).
- `prisma/fixtures/dev-users.ts` — table statique des comptes de test (email, rôle, église/département de rattachement) partagée entre le seed dev et le provider Credentials, pour garantir que la liste affichée à la connexion correspond exactement aux comptes créés.
- `docker/Dockerfile.dev` — image de développement (Node 22, `npm install`, `next dev --turbopack`).
- `docker-compose.dev.yml` — service `app` (build `Dockerfile.dev`, volume sur le repo, port 3000) + réutilisation du service `db` existant.

Modification :
- `src/lib/auth.ts` — ajout conditionnel du provider `Credentials` dans le tableau `providers`, dérivé de `dev-users.ts` ; aucune modification du provider `Google` ni des callbacks `signIn`/`session` (le provider Credentials passe par les mêmes callbacks, donc le comportement `isSuperAdmin`/`churchRoles` reste identique quel que soit le provider utilisé).
- `src/app/page.tsx` — affichage conditionnel (rendu **uniquement** si `AUTH_DEV_LOGIN=true` côté serveur) d'un second bloc "Connexion développement" listant les comptes de test, sous le bouton Google existant qui reste inchangé.

## UI / composants

- Réutilisation du composant `Select`/`Button` existants (`src/components/ui/`) pour le sélecteur de compte de test sur la page de connexion.
- Aucune nouvelle page : le bloc de connexion dev est un ajout server-rendered dans `src/app/page.tsx`, actif uniquement quand la garde d'environnement est vraie — en production, `src/app/page.tsx` rend exactement le même HTML qu'aujourd'hui.

## Décisions & alternatives écartées

- **Choix — Provider NextAuth Credentials pour l'auth dev** — *Pourquoi* : reste dans l'écosystème NextAuth déjà en place (mêmes callbacks `signIn`/`session`, même cookie de session lu par `src/proxy.ts`, aucune divergence de comportement entre un utilisateur connecté via Google ou via le provider dev). Pas de nouveau système d'auth à maintenir.
- **Écarté — Mock complet du provider Google (fausses réponses OAuth)** — *Raison* : c'est explicitement ce que l'utilisateur a demandé d'éviter ("sans le mocker") ; en plus, ça complexifierait le provider de production existant et créerait un risque de divergence de comportement entre dev et prod.
- **Écarté — Bypass au niveau du middleware (`src/proxy.ts`) qui injecterait une session factice** — *Raison* : contourne le cookie de session standard, donc un comportement testé en dev (garde de route, expiration de session) ne serait plus représentatif de la production. Le provider Credentials garde le même mécanisme de session de bout en bout.
- **Choix — Double garde d'activation (`AUTH_DEV_LOGIN=true` ET `NODE_ENV !== "production"`)** — *Pourquoi* : défense en profondeur — même si `AUTH_DEV_LOGIN` fuitait par erreur dans un `.env` de prod, `NODE_ENV=production` (toujours positionné par le build/déploiement, voir `docs/production.md`) bloque quand même l'activation.
- **Choix — Seed dev déterministe (graine fixe) dans un fichier séparé de `prisma/seed.ts`** — *Pourquoi* : `prisma/seed.ts` reste le seed d'amorçage réel (utilisé aussi en recette avec de vraies données ICC Rennes) ; le mélanger avec un générateur massif de données fictives risquerait de casser ce cas d'usage existant. Deux scripts, deux responsabilités.
- **Écarté — Générer le jeu de données fictif à partir d'un export anonymisé de la base de production** — *Raison* : explicitement hors périmètre de la spec (pas de données réelles, même anonymisées, dans l'environnement de dev).
- **Choix — Conteneuriser uniquement `db` + `app` en dev (pas de conteneur par service annexe : S3, SMTP)** — *Pourquoi* : la spec exige de ne dépendre d'aucun service externe réel ; les fonctionnalités qui en dépendent (upload média S3, envoi SMTP) sont testables autrement en dev (ex. variables non configurées → dégradation gracieuse déjà présente dans le code) ; ajouter des conteneurs MinIO/Mailhog serait au-delà du périmètre demandé et pourra être une amélioration ultérieure si un contributeur en a besoin.
- **Choix — Périmètre du jeu de données limité aux domaines cités dans la spec** (ministères, départements, membres, événements, plannings, absences, demandes, comptes rendus, discipolat) — *Pourquoi* : ce sont les domaines explicitement listés dans les critères d'acceptation. Les modules annexes (média, comptabilité, réservation de salles, emploi, intégration familles, agenda pastoral) ne sont pas couverts par le seed dev pour rester dans le minimum nécessaire ; un contributeur travaillant spécifiquement sur l'un de ces modules pourra étendre `prisma/seed-dev.ts` le moment venu.

## Risques & points d'attention

- **Risque** : qu'un contributeur copie par erreur `AUTH_DEV_LOGIN=true` dans une configuration de production. *Mitigation* : double garde (voir ci-dessus) + `.env.example` documente la variable avec un avertissement explicite "ne jamais définir en production" + `docs/production.md` liste exhaustivement les variables attendues et ne mentionne pas `AUTH_DEV_LOGIN`.
- **Risque** : dérive entre `prisma/fixtures/dev-users.ts` (comptes affichés à la connexion) et les données réellement créées par `prisma/seed-dev.ts`. *Mitigation* : le seed dev importe et consomme directement ce fichier de fixtures comme source unique de vérité, il ne redéfinit pas les comptes en parallèle.
- **Risque** : image Docker de dev lente à démarrer ou hot-reload dégradé sur Windows (bind mount + Turbopack). *Mitigation* : documenter explicitement l'usage de Docker Desktop avec le backend WSL2 sur Windows (recommandation standard), et valider la procédure sur les deux OS avant de considérer la doc terminée (critère d'acceptation de la spec).
- **Point d'attention** : `npm run build` (production) ne doit jamais embarquer `prisma/seed-dev.ts` ni `prisma/fixtures/dev-users.ts` dans le bundle applicatif — ce sont des scripts Node exécutés hors du runtime Next.js (comme `prisma/seed.ts` actuel), donc aucun risque d'inclusion, mais à vérifier en revue.
- **Point d'attention** : le volume Docker monté pour le hot-reload doit exclure `node_modules` (volume anonyme dédié) pour éviter les conflits binaires entre l'hôte (Windows/Linux) et le conteneur Linux.

## Stratégie de tests

- **Test unitaire** sur la garde d'activation du provider dev : vérifier que le tableau `providers` de `src/lib/auth.ts` ne contient **pas** le provider Credentials quand `AUTH_DEV_LOGIN` est absent ou quand `NODE_ENV=production`, et le contient quand les deux conditions dev sont réunies (test direct sur la fonction d'assemblage des providers, extraite pour être testable indépendamment de l'initialisation NextAuth complète).
- **Test unitaire** sur `prisma/fixtures/dev-users.ts` : au moins un compte par rôle métier existant (`Role`), et au moins deux comptes `DEPARTMENT_HEAD` sur des départements distincts — vérifié par assertion sur la structure statique (pas d'accès BDD).
- **Vérification manuelle documentée** (non automatisable en CI, consignée dans les tâches) : exécution complète de la procédure pas-à-pas sur un poste Windows et un poste Linux, connexion avec au moins un compte par rôle, vérification que les permissions/scopes affichés correspondent au rôle choisi.
- Pas de test d'intégration Docker en CI : la CI existante (`typecheck`, `lint`, `lint:boundaries`, `test`) n'est pas modifiée par cette feature (hors périmètre de la spec).
