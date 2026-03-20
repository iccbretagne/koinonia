# PlanningCenter

Application web de gestion des plannings de service pour eglises.
Concue pour ICC Bretagne, adaptable a toute eglise structuree en ministeres et departements.

## Quick start

```bash
git clone https://github.com/iccbretagne/planningcenter.git
cd planningcenter
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
| `npm run db:push` | Appliquer le schema Prisma |
| `npm run db:seed` | Charger les donnees ICC Rennes |

## Stack

Next.js 15 &middot; React 19 &middot; Tailwind CSS v4 &middot; NextAuth v5 &middot; Prisma &middot; MariaDB &middot; TypeScript

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

## Reste a faire

Voir la [roadmap complete](docs/roadmap.md).

## Licence

[Apache License 2.0](LICENSE)
