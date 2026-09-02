# Koinonia

Plateforme de gestion communautaire pour eglises.
Plannings de service, comptes rendus, discipolat, annonces et communication — le tout dans une application web moderne, multi-tenant et accessible sur mobile.

> **Koinonia** (grec : *communion, partage*) — Concue pour ICC Bretagne, adaptable a toute eglise structuree en ministeres et departements.

## Fonctionnalites

- **Planning de service** — Grille interactive par departement, vue mensuelle, duplication, export PDF
- **Comptes rendus** — Saisie par evenement avec stats departementales, export PDF et WhatsApp
- **Discipolat** — Suivi des relations faiseur de disciples / disciple, appel par evenement, export Excel
- **Annonces & communication** — Soumission, workflow de validation, dashboards operationnels (Secretariat, Media, Communication)
- **Audio des cultes** — Depot et decoupage des enregistrements, normalisation sonore, publication,
  bibliotheque d'ecoute, liens de partage publics et partage de bibliotheque entre eglises
- **Medias** — Demandes visuelles, projets, galeries et partage de fichiers
- **Gestion des membres** — Repertoire STAR, liaison compte utilisateur, profil
- **Evenements** — Recurrence, calendrier, configuration par evenement
- **Agenda pastoral** — Demande de rendez-vous, qualification, planification
- **Integration des familles** — Parcours d'accueil et de suivi des nouveaux
- **Comptabilite** — Series et demandes financieres, validation, statistiques
- **Salles** — Reservation et gestion des espaces
- **Emploi** — Offres, profils de recherche et missions freelance
- **RBAC** — 10 roles (Super Admin, Admin, Secretaire, Ministre, Resp. departement,
  Faiseur de Disciples, Reporter, STAR, Qualificateur agenda, Comptable)
- **Multi-tenant** — Plusieurs eglises isolees sur une meme instance
- **PWA** — Installation mobile, mode hors-ligne

## Quick start

```bash
git clone https://github.com/iccbretagne/koinonia.git
cd koinonia
cp .env.example .env          # configurer Google OAuth + AUTH_SECRET
docker-compose up -d           # MariaDB
npm install
npm run db:migrate             # applique les migrations
npm run db:seed                # donnees ICC Rennes
npm run dev                    # http://localhost:3000
```

> Toujours passer par `db:migrate`, jamais par `db:push` : tout changement de schema doit
> produire une migration versionnee (voir [`specs/constitution.md`](specs/constitution.md)).

> **Nouveau contributeur ?** Pour un environnement 100% conteneurisé (app + BDD), avec
> un jeu de données fictif riche et une connexion locale sans compte Google, suivre le
> guide pas à pas : [`docs/dev-onboarding.md`](docs/dev-onboarding.md).

## Prerequis

- Node.js 22
- Docker
- [Google OAuth 2.0](https://console.cloud.google.com/apis/credentials) configure avec `http://localhost:3000/api/auth/callback/google` en URI de redirection

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Developpement (Turbopack) |
| `npm run build` | Build de production (enchaine `build:worker`) |
| `npm run start` | Production |
| `npm run worker` | Worker audio en developpement |
| `npm run typecheck` | Verification TypeScript |
| `npm run lint` | ESLint |
| `npm run lint:boundaries` | Verification des frontieres modules (dependency-cruiser) |
| `npm run test` | Lancer les tests (Vitest) |
| `npm run db:migrate` | Creer une migration (dev) |
| `npm run db:migrate:deploy` | Appliquer les migrations (production) |
| `npm run db:seed` | Charger les donnees ICC Rennes |

Avant toute PR : `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`.

## Stack

Node.js 22 &middot; Next.js 16 &middot; React 19 &middot; Tailwind CSS v4 &middot; NextAuth v5 (beta) &middot; Prisma 7 &middot; MariaDB 10.11 &middot; TypeScript 5 &middot; Zod 3 &middot; Vitest

L'application est un **monolithe modulaire** : 11 modules metier assembles au demarrage par un
registry, aux frontieres verifiees en CI. Voir le [DAT](docs/dat.md) pour la vue d'ensemble.

## Documentation

| Document | Contenu |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Contexte complet pour les agents IA |
| [DAT](docs/dat.md) | Dossier d'architecture technique — vue d'ensemble, point d'entree |
| [Architecture](docs/architecture.md) | Structure du projet, patterns, conventions |
| [Base de donnees](docs/database.md) | Schema Prisma, modeles, relations |
| [API](docs/api.md) | Endpoints, requetes, reponses |
| [Authentification & roles](docs/auth.md) | NextAuth, OAuth, RBAC, permissions |
| [Environnement de developpement](docs/dev-onboarding.md) | Setup conteneurise, jeu de donnees fictif, connexion sans Google OAuth |
| [Deploiement production](docs/production.md) | Debian, Traefik, systemd |
| [Environnement de recette](docs/staging.md) | VM de validation avant mise en production |
| [ADR](docs/adr/README.md) | Decisions architecturales structurantes |
| [Specifications](specs/README.md) | Flux spec-driven et specs par feature |
| [Exceptions securite](docs/security-exceptions.md) | Limites connues et assumees |
| [Changelog](CHANGELOG.md) | Historique des modifications |

## Contribuer

Les fonctionnalites non triviales sont **specifiees avant d'etre codees**
(`/specify` → `/plan` → `/tasks` → `/implement`) — voir [`specs/README.md`](specs/README.md).
Les principes non negociables sont dans [`specs/constitution.md`](specs/constitution.md).

Branches : `feat/<nom>`, `fix/<nom>`, `chore/<nom>`. Jamais de push direct sur `main` —
tout passe par une PR dont la CI doit etre verte.

## Roadmap

Voir la [roadmap complete](docs/roadmap.md).

## Licence

[Apache License 2.0](LICENSE)
