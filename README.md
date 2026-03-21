# Koinonia

Plateforme de gestion communautaire pour eglises.
Plannings de service, comptes rendus, discipolat, annonces et communication — le tout dans une application web moderne, multi-tenant et accessible sur mobile.

> **Koinonia** (grec : *communion, partage*) — Concue pour ICC Bretagne, adaptable a toute eglise structuree en ministeres et departements.

## Fonctionnalites

- **Planning de service** — Grille interactive par departement, vue mensuelle, duplication, export PDF
- **Comptes rendus** — Saisie par evenement avec stats departementales, export PDF et WhatsApp
- **Discipolat** — Suivi des relations faiseur de disciples / disciple, appel par evenement, export Excel
- **Annonces & communication** — Soumission, workflow de validation, dashboards operationnels (Secretariat, Media, Communication)
- **Gestion des membres** — Repertoire STAR, liaison compte utilisateur, profil
- **Evenements** — Recurrence, calendrier, configuration par evenement
- **RBAC** — 7 roles (Super Admin, Admin, Secretaire, Ministre, Resp. departement, Faiseur de Disciples, Reporter)
- **Multi-tenant** — Plusieurs eglises sur une meme instance
- **PWA** — Installation mobile, mode hors-ligne

## Quick start

```bash
git clone https://github.com/iccbretagne/koinonia.git
cd koinonia
cp .env.example .env          # configurer Google OAuth + AUTH_SECRET
docker-compose up -d           # MariaDB
npm install
npm run db:push                # schema
npm run db:seed                # donnees ICC Rennes
npm run dev                    # http://localhost:3000
```

## Prerequis

- Node.js 18+
- Docker
- [Google OAuth 2.0](https://console.cloud.google.com/apis/credentials) configure avec `http://localhost:3000/api/auth/callback/google` en URI de redirection

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Developpement (Turbopack) |
| `npm run build` | Build de production |
| `npm run start` | Production |
| `npm run typecheck` | Verification TypeScript |
| `npm run db:migrate` | Creer une migration (dev) |
| `npm run db:migrate:deploy` | Appliquer les migrations (production) |
| `npm run db:seed` | Charger les donnees ICC Rennes |
| `npm run test` | Lancer les tests |

## Stack

Next.js 15 &middot; React 19 &middot; Tailwind CSS v4 &middot; NextAuth v5 &middot; Prisma 6 &middot; MariaDB &middot; TypeScript &middot; Zod &middot; Vitest

## Documentation

| Document | Contenu |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Contexte complet pour les agents IA |
| [Architecture](docs/architecture.md) | Structure du projet, patterns, conventions |
| [Base de donnees](docs/database.md) | Schema Prisma, modeles, relations |
| [API](docs/api.md) | Endpoints, requetes, reponses |
| [Authentification & roles](docs/auth.md) | NextAuth, OAuth, RBAC, permissions |
| [Deploiement production](docs/production.md) | Debian, Traefik, systemd |
| [Changelog](CHANGELOG.md) | Historique des modifications |

## Roadmap

Voir la [roadmap complete](docs/roadmap.md).

## Licence

[Apache License 2.0](LICENSE)
