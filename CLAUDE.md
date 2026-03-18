# CLAUDE.md — PlanningCenter

Contexte pour les agents IA travaillant sur ce projet.

## Projet

**PlanningCenter** est une application web de gestion des plannings de service pour eglises.
Concue pour ICC Bretagne, adaptable a toute eglise structuree en ministeres et departements.

- **Repository** : https://github.com/iccbretagne/planningcenter
- **Version** : voir `package.json`
- **Licence** : Apache License 2.0

## Terminologie

- **STAR** (masculin) = **S**erviteur **T**ravaillant **A**ctivement pour le **R**oyaume — designe un membre d'un departement
- **Ministere** : groupe organisationnel (Louange, Accueil, Communication...)
- **Departement** : sous-division d'un ministere (Choristes, Musiciens, Son...)
- **Statuts de service** : `EN_SERVICE`, `EN_SERVICE_DEBRIEF`, `INDISPONIBLE`, `REMPLACANT`

## Stack technique

| Technologie | Version | Role |
|---|---|---|
| Next.js | 15 | Framework fullstack (App Router + Turbopack) |
| React | 19 | UI (Server Components + Client Components) |
| Tailwind CSS | 4 | Styles (PostCSS, `@theme` tokens) |
| NextAuth (Auth.js) | 5 beta | Authentification Google OAuth |
| Prisma | 6 | ORM (connecteur MySQL vers MariaDB) |
| MariaDB | 10.11 | Base de donnees (Docker) |
| Zod | 3 | Validation des donnees cote API |
| TypeScript | 5 | Typage strict |

**Points d'attention** :
- Prisma 6 utilise `@prisma/client` classique (pas de driver adapter)
- NextAuth v5 beta : utiliser `auth()` et non `getServerSession()`
- Next.js 15 : les `params` des route handlers sont des `Promise<{}>` (il faut `await params`)

## Structure du projet

```
planningcenter/
├── .github/
│   ├── workflows/ci.yml         # CI : typecheck + version check
│   └── dependabot.yml           # Mises a jour automatiques des dependances
├── prisma/
│   ├── schema.prisma            # Schema BDD (domaine + NextAuth)
│   └── seed.ts                  # Donnees initiales ICC Rennes
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout (Montserrat, metadata)
│   │   ├── page.tsx             # Page de connexion (Google OAuth)
│   │   ├── globals.css          # Tailwind v4 (@theme couleurs ICC)
│   │   ├── (auth)/              # Route group : pages authentifiees
│   │   │   ├── layout.tsx       # Auth guard, header, sidebar, footer version
│   │   │   ├── dashboard/       # Vue planning par departement
│   │   │   ├── events/          # Gestion des evenements (liste, detail)
│   │   │   ├── announcements/   # Soumission et suivi des annonces
│   │   │   │   └── new/         # Formulaire soumission annonce
│   │   │   ├── secretariat/
│   │   │   │   └── announcements/ # Dashboard Secretariat (DIFFUSION_INTERNE)
│   │   │   ├── media/
│   │   │   │   └── requests/    # Dashboard Production Media (VISUEL)
│   │   │   │       └── new/     # Demande visuel standalone
│   │   │   ├── communication/
│   │   │   │   └── requests/    # Dashboard Communication (RESEAUX_SOCIAUX)
│   │   │   ├── guide/           # Guide utilisateur par role
│   │   │   └── admin/           # Section administration
│   │   │       ├── layout.tsx   # Guard multi-permissions (requireAnyPermission)
│   │   │       ├── churches/    # CRUD eglises
│   │   │       ├── users/       # Gestion utilisateurs et roles
│   │   │       ├── ministries/  # CRUD ministeres
│   │   │       ├── departments/ # CRUD departements
│   │   │       │   └── functions/ # Config fonctions departementales
│   │   │       ├── members/     # CRUD membres (STAR)
│   │   │       └── events/      # CRUD evenements
│   │   └── api/                 # Route handlers (API REST)
│   │       ├── auth/[...nextauth]/
│   │       ├── announcements/   # GET/POST + [id] GET/PATCH/DELETE
│   │       ├── service-requests/ # GET/POST + [id] GET/PATCH
│   │       ├── churches/
│   │       ├── departments/
│   │       ├── events/
│   │       ├── members/
│   │       ├── ministries/
│   │       └── users/
│   ├── components/
│   │   ├── Sidebar.tsx          # Sidebar unifiee (3 sections accordion)
│   │   ├── PlanningGrid.tsx     # Grille planning interactive (auto-save)
│   │   ├── EventSelector.tsx    # Selecteur d'evenement
│   │   ├── MonthlyPlanningView.tsx
│   │   ├── ViewToggle.tsx
│   │   ├── DashboardActions.tsx
│   │   └── ui/                  # Composants UI reutilisables
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Select.tsx
│   │       ├── Modal.tsx
│   │       ├── DataTable.tsx
│   │       ├── CheckboxGroup.tsx
│   │       └── BulkActionBar.tsx
│   ├── lib/
│   │   ├── prisma.ts            # Singleton Prisma (globalThis pattern)
│   │   ├── auth.ts              # Config NextAuth + helpers
│   │   ├── api-utils.ts         # ApiError, successResponse, errorResponse
│   │   └── permissions.ts       # Matrice roles-permissions RBAC
│   └── middleware.ts            # Edge middleware (protection routes)
├── docs/                        # Documentation detaillee
├── docker-compose.yml           # MariaDB locale
└── package.json
```

## Commandes

```bash
npm run dev              # Developpement (Turbopack)
npm run build            # Build de production
npm run start            # Serveur de production
npm run typecheck        # Verification TypeScript (tsc --noEmit)
npm run db:push          # Appliquer le schema Prisma
npm run db:seed          # Charger les donnees ICC Rennes
```

## Patterns et conventions

### API Route handlers

```typescript
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();           // ou requirePermission("permission")
    const { id } = await params;   // TOUJOURS await params (Next.js 15)
    // ... logique metier + Prisma
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
```

### Helpers d'authentification (`src/lib/auth.ts`)

- `requireAuth()` — verifie la session, throw `UNAUTHORIZED`
- `requirePermission(permission, churchId?)` — verifie une permission, throw `FORBIDDEN`
- `requireAnyPermission(...permissions)` — verifie au moins une permission parmi la liste
- `getUserDepartmentScope(session)` — retourne `{ scoped: false }` (admin) ou `{ scoped: true, departmentIds }` (roles limites)

### Reponses API (`src/lib/api-utils.ts`)

- `successResponse(data, status?)` — JSON avec status 200 par defaut
- `errorResponse(error)` — gestion centralisee (ApiError, ZodError, Error generique)
- `throw new ApiError(statusCode, message)` — erreur metier

### Validation Zod

Les mutations (POST, PUT, PATCH) valident le body avec Zod :

```typescript
const schema = z.object({ ... });
const data = schema.parse(await request.json());
```

### Server vs Client components

- **Server Components** (par defaut) : pages, layouts, chargement de donnees
- **Client Components** (`"use client"`) : interactions utilisateur, formulaires
- Les pages chargent les donnees cote serveur et les passent en props aux composants client

### Composants UI

Style coherent : border-2, rounded-lg, focus:ring-icc-violet. Voir les composants existants dans `src/components/ui/` avant d'en creer de nouveaux.

## Design tokens

| Token | Valeur | Usage |
|---|---|---|
| `icc-violet` | `#5E17EB` | Couleur principale |
| `icc-jaune` | `#FFEB05` | Accent |
| `icc-rouge` | `#FF3131` | Erreurs, suppression |
| `icc-bleu` | `#38B6FF` | Information |
| Font | Montserrat | Police principale |

## Roles et permissions

| Permission | Super Admin | Admin | Secrétaire | Ministre | Resp. département |
|---|---|---|---|---|---|
| `planning:view` | x | x | x | x | x |
| `planning:edit` | x | x | | x | x |
| `members:view` | x | x | x | x | x |
| `members:manage` | x | x | | x | x |
| `events:view` | x | x | x | x | x |
| `events:manage` | x | x | x | | |
| `departments:view` | x | x | x | x | x |
| `departments:manage` | x | x | | | |
| `church:manage` | x | | | | |
| `users:manage` | x | | | | |

**Visibilite des departements** :
- Super Admin / Admin / Secrétaire : tous les départements de l'église (lecture globale)
- Ministre : départements du ministère assigné
- Responsable de département : départements assignés via `user_departments`

**Spécificités du Secrétaire** :
- Voit tous les départements de son église (même périmètre que Admin)
- Planning en lecture seule (pas de `planning:edit`)
- Membres en lecture seule dans l'admin (pas de `members:manage`)
- Peut gérer les événements (`events:manage`)

## Multi-tenant

Chaque eglise (`Church`) est un tenant isole. Les donnees sont rattachees a une eglise via `churchId`. Un utilisateur peut avoir des roles differents dans plusieurs eglises via `UserChurchRole`.

## Gestion des versions

- Version source de verite : `package.json` > `version`
- Releases via tags git `v*` (le CI verifie la correspondance tag/version)
- La version s'affiche dans le footer du layout authentifie
- Changelog dans `CHANGELOG.md`

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`) : typecheck sur chaque PR et push main, validation version sur tags
- **Dependabot** (`.github/dependabot.yml`) : mises a jour hebdomadaires npm + GitHub Actions (minor/patch uniquement, majeures ignorées)

## Documentation

| Document | Contenu |
|---|---|
| [Architecture](docs/architecture.md) | Structure, patterns, conventions |
| [Base de donnees](docs/database.md) | Schema Prisma, modeles, relations |
| [API](docs/api.md) | Endpoints, requetes, reponses |
| [Authentification](docs/auth.md) | NextAuth, OAuth, RBAC, permissions |
| [Production](docs/production.md) | Deploiement Debian, Traefik, systemd |
| [Roadmap](docs/roadmap.md) | Evolutions prevues |

## Regles pour les agents IA

1. **Lire avant d'ecrire** : toujours lire un fichier existant avant de le modifier
2. **Suivre les patterns existants** : utiliser les helpers (`requireAuth`, `successResponse`, etc.)
3. **Valider avec TypeScript** : executer `npm run typecheck` apres les modifications
4. **await params** : dans les route handlers Next.js 15, les params sont des Promise
5. **Composants UI** : verifier `src/components/ui/` avant de creer un nouveau composant
6. **Pas de sur-ingenierie** : faire le minimum necessaire pour la fonctionnalite demandee
7. **Erreurs** : utiliser `ApiError` pour les erreurs metier, Zod pour la validation
8. **Permissions** : toujours proteger les routes API avec `requireAuth()` ou `requirePermission()`
