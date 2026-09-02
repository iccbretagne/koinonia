# Koinonia

**Le back-office opérationnel de votre église, en une seule application.**

Koinonia est né d'un constat simple : la vie de service d'une église finissait dispersée entre
des groupes WhatsApp et des tableaux Excel. L'information s'y noie dans le flux, les plannings
se recopient à la main, et plus personne ne sait quelle version fait foi.

Du planning de service à la publication audio des cultes — en passant par les comptes rendus, le
discipolat, les demandes internes, les médias, les salles, la comptabilité et l'agenda pastoral —
Koinonia rassemble tout cela derrière une source de vérité unique, avec un accès adapté à chaque
rôle. Auto-hébergée, multi-tenant, sous licence libre et pensée pour le mobile.

> **Koinonia** (grec : *communion, partage*) — Conçue pour ICC Bretagne, adaptable à toute église structurée en ministères et départements.

## Fonctionnalités

- **Planning de service** — Grille interactive par département, vue mensuelle, duplication, export PDF
- **Comptes rendus** — Saisie par événement avec stats départementales, export PDF et WhatsApp
- **Discipolat** — Suivi des relations faiseur de disciples / disciple, appel par événement, export Excel
- **Annonces & communication** — Soumission, workflow de validation, dashboards opérationnels (Secrétariat, Média, Communication)
- **Audio des cultes** — Dépôt et découpage des enregistrements, normalisation sonore, publication,
  bibliothèque d'écoute, liens de partage publics et partage de bibliothèque entre églises
- **Médias** — Demandes visuelles, projets, galeries et partage de fichiers
- **Gestion des membres** — Répertoire STAR, liaison compte utilisateur, profil
- **Événements** — Récurrence, calendrier, configuration par événement
- **Agenda pastoral** — Demande de rendez-vous, qualification, planification
- **Intégration des familles** — Parcours d'accueil et de suivi des nouveaux
- **Comptabilité** — Séries et demandes financières, validation, statistiques
- **Salles** — Réservation et gestion des espaces
- **Emploi** — Offres, profils de recherche et missions freelance
- **RBAC** — 10 rôles (Super Admin, Admin, Secrétaire, Ministre, Resp. département,
  Faiseur de Disciples, Reporter, STAR, Qualificateur agenda, Comptable)
- **Multi-tenant** — Plusieurs églises isolées sur une même instance
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

> Toujours passer par `db:migrate`, jamais par `db:push` : tout changement de schéma doit
> produire une migration versionnée (voir [`specs/constitution.md`](specs/constitution.md)).

> **Nouveau contributeur ?** Pour un environnement 100% conteneurisé (app + BDD), avec
> un jeu de données fictif riche et une connexion locale sans compte Google, suivre le
> guide pas à pas : [`docs/dev-onboarding.md`](docs/dev-onboarding.md).

## Prérequis

- Node.js 22
- Docker
- [Google OAuth 2.0](https://console.cloud.google.com/apis/credentials) configuré avec `http://localhost:3000/api/auth/callback/google` en URI de redirection

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Développement (Turbopack) |
| `npm run build` | Build de production (enchaîne `build:worker`) |
| `npm run start` | Production |
| `npm run worker` | Worker audio en développement |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint |
| `npm run lint:boundaries` | Vérification des frontières modules (dependency-cruiser) |
| `npm run test` | Lancer les tests (Vitest) |
| `npm run db:migrate` | Créer une migration (dev) |
| `npm run db:migrate:deploy` | Appliquer les migrations (production) |
| `npm run db:seed` | Charger les données ICC Rennes |

Avant toute PR : `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`.

## Stack

Node.js 22 &middot; Next.js 16 &middot; React 19 &middot; Tailwind CSS v4 &middot; NextAuth v5 (beta) &middot; Prisma 7 &middot; MariaDB 10.11 &middot; TypeScript 5 &middot; Zod 3 &middot; Vitest

L'application est un **monolithe modulaire** : 11 modules métier assemblés au démarrage par un
registry, aux frontières vérifiées en CI. Voir le [DAT](docs/dat.md) pour la vue d'ensemble.

## Documentation

| Document | Contenu |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Contexte complet pour les agents IA |
| [DAT](docs/dat.md) | Dossier d'architecture technique — vue d'ensemble, point d'entrée |
| [Architecture](docs/architecture.md) | Structure du projet, patterns, conventions |
| [Base de données](docs/database.md) | Schéma Prisma, modèles, relations |
| [API](docs/api.md) | Endpoints, requêtes, réponses |
| [Authentification & rôles](docs/auth.md) | NextAuth, OAuth, RBAC, permissions |
| [Environnement de développement](docs/dev-onboarding.md) | Setup conteneurisé, jeu de données fictif, connexion sans Google OAuth |
| [Déploiement production](docs/production.md) | Debian, Traefik, systemd |
| [Environnement de recette](docs/staging.md) | VM de validation avant mise en production |
| [ADR](docs/adr/README.md) | Décisions architecturales structurantes |
| [Spécifications](specs/README.md) | Flux spec-driven et specs par feature |
| [Exceptions sécurité](docs/security-exceptions.md) | Limites connues et assumées |
| [Changelog](CHANGELOG.md) | Historique des modifications |

## Contribuer

Les fonctionnalités non triviales sont **spécifiées avant d'être codées**
(`/specify` → `/plan` → `/tasks` → `/implement`) — voir [`specs/README.md`](specs/README.md).
Les principes non négociables sont dans [`specs/constitution.md`](specs/constitution.md).

Branches : `feat/<nom>`, `fix/<nom>`, `chore/<nom>`. Jamais de push direct sur `main` —
tout passe par une PR dont la CI doit être verte.

## Roadmap

Voir la [roadmap complète](docs/roadmap.md).

## Licence

[Apache License 2.0](LICENSE)
