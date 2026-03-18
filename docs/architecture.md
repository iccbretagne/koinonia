# Architecture

## Stack technique

| Technologie | Version | Role |
|---|---|---|
| Next.js | 15 | Framework fullstack (App Router + Turbopack) |
| React | 19 | UI (Server Components + Client Components) |
| Tailwind CSS | 4 | Styles (PostCSS) |
| NextAuth (Auth.js) | 5 beta | Authentification Google OAuth |
| Prisma | 6 | ORM (connecteur MySQL vers MariaDB) |
| MariaDB | 10.11 | Base de donnees (Docker) |
| Zod | 3 | Validation des donnees cote API |
| TypeScript | 5 | Typage strict |

## Structure du projet

```
planningcenter/
├── .github/
│   ├── workflows/ci.yml           # CI : typecheck + version check
│   └── dependabot.yml             # Mises a jour automatiques des dependances
├── prisma/
│   ├── schema.prisma              # Schema BDD (domaine + NextAuth)
│   └── seed.ts                    # Donnees initiales ICC Rennes
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (Montserrat, metadata)
│   │   ├── page.tsx               # Page de connexion (Google OAuth)
│   │   ├── globals.css            # Tailwind v4 (@theme couleurs ICC)
│   │   ├── (auth)/                # Route group : pages authentifiees
│   │   │   ├── layout.tsx         # Auth guard, header, sidebar, footer version
│   │   │   ├── dashboard/         # Vue planning par departement
│   │   │   ├── events/            # Gestion des evenements
│   │   │   ├── announcements/     # Soumission et suivi des annonces
│   │   │   │   ├── page.tsx       # Liste des annonces du referent
│   │   │   │   └── new/           # Formulaire de soumission d'annonce
│   │   │   ├── secretariat/
│   │   │   │   └── announcements/ # Dashboard Secretariat (DIFFUSION_INTERNE)
│   │   │   ├── media/
│   │   │   │   └── requests/      # Dashboard Production Media (VISUEL)
│   │   │   │       └── new/       # Formulaire demande visuel standalone
│   │   │   ├── communication/
│   │   │   │   └── requests/      # Dashboard Communication (RESEAUX_SOCIAUX)
│   │   │   ├── guide/             # Guide utilisateur par role
│   │   │   └── admin/             # Section administration
│   │   │       ├── layout.tsx     # Guard multi-permissions
│   │   │       ├── churches/      # CRUD eglises
│   │   │       ├── users/         # Gestion utilisateurs et roles
│   │   │       ├── ministries/    # CRUD ministeres
│   │   │       ├── departments/   # CRUD departements
│   │   │       │   └── functions/ # Config fonctions departementales
│   │   │       ├── members/       # CRUD membres
│   │   │       └── events/        # CRUD evenements
│   │   └── api/                   # Route handlers (API REST)
│   │       ├── auth/[...nextauth]/
│   │       ├── announcements/     # GET/POST + [id] GET/PATCH/DELETE
│   │       ├── service-requests/  # GET/POST + [id] GET/PATCH
│   │       ├── churches/
│   │       ├── departments/
│   │       ├── events/
│   │       ├── members/
│   │       ├── ministries/
│   │       └── users/
│   ├── components/
│   │   ├── Sidebar.tsx            # Sidebar unifiee (3 sections accordion)
│   │   ├── PlanningGrid.tsx       # Grille planning interactive (auto-save)
│   │   ├── EventSelector.tsx      # Selecteur d'evenement
│   │   ├── MonthlyPlanningView.tsx
│   │   ├── ViewToggle.tsx
│   │   ├── DashboardActions.tsx
│   │   └── ui/                    # Composants UI reutilisables
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Select.tsx
│   │       ├── Modal.tsx
│   │       ├── DataTable.tsx
│   │       ├── CheckboxGroup.tsx
│   │       └── BulkActionBar.tsx
│   ├── lib/
│   │   ├── prisma.ts              # Singleton Prisma (globalThis pattern)
│   │   ├── auth.ts                # Config NextAuth + helpers
│   │   ├── api-utils.ts           # ApiError, successResponse, errorResponse
│   │   └── permissions.ts         # Matrice roles-permissions RBAC
│   └── middleware.ts              # Edge middleware (protection routes)
├── docker-compose.yml             # MariaDB locale
├── next.config.ts
├── tsconfig.json                  # Strict, path alias @/*
└── postcss.config.mjs             # @tailwindcss/postcss
```

## Patterns et conventions

### Server vs Client components

- **Server Components** (par defaut) : pages, layouts, chargement de donnees initiales
- **Client Components** (`"use client"`) : interactions utilisateur (EventSelector, PlanningGrid)

Les pages chargent les donnees cote serveur et les passent en props aux composants client.

### API Route handlers

Chaque route suit le meme pattern :

```typescript
export async function GET(request, { params }) {
  try {
    await requireAuth();           // verifier l'authentification
    const { id } = await params;   // extraire les parametres
    // ... logique metier + requete Prisma
    return successResponse(data);  // 200 avec JSON
  } catch (error) {
    return errorResponse(error);   // gestion centralisee des erreurs
  }
}
```

Les erreurs metier utilisent `throw new ApiError(statusCode, message)`.
Les erreurs d'auth (`UNAUTHORIZED`, `FORBIDDEN`) sont gerees automatiquement par `errorResponse`.

### Helpers d'authentification (`src/lib/auth.ts`)

- `requireAuth()` — verifie la session, throw `UNAUTHORIZED`
- `requirePermission(permission, churchId?)` — verifie une permission, throw `FORBIDDEN`
- `requireAnyPermission(...permissions)` — verifie au moins une permission parmi la liste
- `getUserDepartmentScope(session)` — retourne `{ scoped: false }` (admin) ou `{ scoped: true, departmentIds }` (roles limites)

### Validation

Les mutations (PUT, POST) valident le body avec Zod avant traitement :

```typescript
const schema = z.object({ ... });
const data = schema.parse(await request.json());
```

### Prisma singleton

Le client Prisma est instancie une seule fois via `globalThis` pour eviter les connexions multiples en developpement (hot reload) :

```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Middleware

Le middleware Next.js (`src/middleware.ts`) protege les routes `/dashboard/*` et `/api/*` (sauf `/api/auth/*`).
Il reexporte directement la fonction `auth` de NextAuth qui verifie la session.

### Navigation

La navigation dans le dashboard utilise les query params (`?dept=...&event=...`) plutot que des routes imbriquees.
La sidebar utilise des liens `<a>` vers `/dashboard?dept={id}` et l'EventSelector met a jour les params via `router.push`.

### Auto-save

Le composant PlanningGrid sauvegarde automatiquement les modifications avec un debounce de 1 seconde.
Un indicateur visuel affiche l'etat : sauvegarde en cours, modifications non sauvegardees, ou sauvegarde.

## Variables d'environnement

| Variable | Description | Exemple |
|---|---|---|
| `DATABASE_URL` | URL de connexion MariaDB | `mysql://planningcenter:planningcenter@localhost:3306/planningcenter` |
| `NEXTAUTH_SECRET` | Secret de chiffrement des sessions | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL publique de l'application | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Client ID Google OAuth | |
| `GOOGLE_CLIENT_SECRET` | Client Secret Google OAuth | |
| `SUPER_ADMIN_EMAILS` | Emails auto-promus Super Admin (virgule) | `admin@example.com,other@example.com` |

## Module Annonces et Demandes de service

Le module d'annonces permet aux referents (tous les utilisateurs authentifies) de soumettre des annonces destinees a etre diffusees en interne ou sur les reseaux sociaux.

### Flux de soumission

1. Le referent soumet une annonce via `/announcements/new` avec les canaux cibles
2. L'API `POST /api/announcements` cree l'annonce **et** les `ServiceRequest` correspondants en transaction :
   - Canal INTERNE → `DIFFUSION_INTERNE` (Secretariat) + `VISUEL` (Production Media, Slide/Affiche)
   - Canal EXTERNE → `RESEAUX_SOCIAUX` (Communication) + `VISUEL` (Production Media, Story/Post)
3. Chaque departement fonctionnel traite ses demandes via son dashboard dedie

### Fonctions departementales

Un departement peut se voir assigner une `DepartmentFunction` qui le designe comme responsable d'un type de traitement :

| Fonction | Type de ServiceRequest | Dashboard |
|---|---|---|
| `SECRETARIAT` | `DIFFUSION_INTERNE` | `/secretariat/announcements` |
| `COMMUNICATION` | `RESEAUX_SOCIAUX` | `/communication/requests` |
| `PRODUCTION_MEDIA` | `VISUEL` | `/media/requests` |

La configuration se fait via `/admin/departments/functions` (permission `events:manage`).

### Relation VISUEL → canal parent

Les demandes `VISUEL` sont liees a leur demande parente (`DIFFUSION_INTERNE` ou `RESEAUX_SOCIAUX`) via `parentRequestId`. Ce lien contextualise le format attendu (Slide vs Story/Post).

## Multi-tenant

Chaque eglise (`Church`) est un tenant isole. Les donnees (ministeres, departements, membres, evenements, annonces) sont rattachees a une eglise via `churchId`.

```
Super Admin
├── ICC Rennes
│   └── Ministeres → Departements → Membres
├── ICC Lyon
│   └── Ministeres → Departements → Membres
└── ...
```

Un utilisateur peut avoir des roles differents dans plusieurs eglises via la table `UserChurchRole`.
