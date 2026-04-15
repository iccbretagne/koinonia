# Architecture

## Stack technique

| Technologie | Version | Role |
|---|---|---|
| Next.js | 16 | Framework fullstack (App Router + Turbopack) |
| React | 19 | UI (Server Components + Client Components) |
| Tailwind CSS | 4 | Styles (PostCSS) |
| NextAuth (Auth.js) | 5 beta | Authentification Google OAuth |
| Prisma | 7 | ORM (driver adapter MariaDB, ESM-only) |
| MariaDB | 10.11 | Base de donnees (Docker) |
| Zod | 3 | Validation des donnees cote API |
| TypeScript | 5 | Typage strict |

## Architecture modulaire (v1.0)

Koinonia suit une architecture **monolithe modulaire** : une seule base de code deployee ensemble, mais organisee en modules avec des frontieres strictes.

```
src/
├── core/           ← infrastructure modulaire (framework-agnostic)
├── modules/        ← logique metier par domaine
└── app/            ← surface Next.js (routes, pages, composants)
```

### Couche core (`src/core/`)

Fournit le "système de plugins" que les modules utilisent :

| Fichier | Role |
|---|---|
| `module-registry.ts` | `ModuleRegistry` (register, validateDeps, resolveLoadOrder, collectPermissions) + `defineModule()` |
| `event-bus.ts` | `EventBus<TEvents>` — bus in-process, typé, transaction-aware |
| `boot.ts` | `boot()` — lit `ENABLED_MODULES`, charge les modules, valide les dépendances |
| `permissions.ts` | `buildRolePermissions(registry)` — derive la matrice roles→permissions depuis les manifestes |

### Couche modules (`src/modules/`)

Chaque module expose un **manifeste** (`index.ts`) qui declare ses permissions, sa navigation, et ses exports publics. La couche `src/app/` ne peut importer qu'a partir de l'index du module (regle CI `app-only-module-public-api`).

| Module | Perimetre |
|---|---|
| `core` | Gestion des eglises (`church:manage`) et des utilisateurs (`users:manage`) |
| `planning` | Evenements, planning, membres, annonces, demandes (Request workflow), espace STAR |
| `discipleship` | Suivi discipolat, relations, presences, stats |
| `media` | Galeries photos evenements, projets de production, versionnage fichiers, tokens de partage |

**Exports du module `media` :**
- `mediaModule` — manifeste
- `uploadMediaFile`, `deleteMediaFile` — upload/suppression S3
- `getSignedThumbnailUrl`, `getSignedOriginalUrl`, `getSignedDownloadUrl` — URLs signees
- `processImage`, `validatePhotoFile` — traitement et validation images (sharp)
- `createMediaShareToken`, `validateMediaShareToken` — gestion des tokens de partage
- `createMultipartUpload`, `getSignedPartUrl`, `completeMultipartUpload`, `abortMultipartUpload` — upload multipart S3

**Exports du module `planning` :**
- `planningModule` — manifeste
- `planningBus` — `EventBus<PlanningEvents>` singleton
- `PlanningEvents` — carte des evenements emis
- `executeRequest()` — executor des demandes approuvees
- `ExecutionResult` — type de retour de l'executor

### Registry (`src/lib/registry.ts`)

Singleton process-level : boot avec tous les modules actifs + matrice `rolePermissions` pre-calculee.

```typescript
export const registry = boot({ modules: [coreModule, planningModule, discipleshipModule] });
export const rolePermissions = buildRolePermissions(registry);
```

`rolePermissions` est importe directement par les routes API et composants qui ont besoin de tester une permission.

### Bus d'evenements (`planningBus`)

Le bus est transaction-aware : les handlers s'executent dans la meme `Prisma.TransactionClient` que l'emetteur. Si un handler throw, la transaction est rollback.

```typescript
await prisma.$transaction(async (tx) => {
  const event = await tx.event.create({ ... });
  await planningBus.emit("planning:event:created", { tx, churchId, userId }, {
    eventId: event.id, ...
  });
});
```

Evenements definis : `planning:event:created`, `planning:event:cancelled`, `planning:request:executed`, `planning:status:changed`.

### Frontieres modules (dependency-cruiser)

CI enforce les regles suivantes via `npm run lint:boundaries` :

| Regle | Description |
|---|---|
| `no-planning-imports-other-modules` | `planning` n'importe pas de `discipleship` |
| `no-discipleship-imports-other-modules` | `discipleship` n'importe pas de `planning` |
| `no-core-module-imports-other-modules` | `core` n'importe pas de module domaine |
| `core-no-modules-import` | `src/core/` n'importe pas de `src/modules/` |
| `app-only-module-public-api` | `src/app/` importe uniquement depuis `src/modules/X/index.ts` |

---

## Structure du projet

```
koinonia/
├── .github/
│   ├── workflows/ci.yml           # CI : typecheck + lint + lint:boundaries + tests
│   └── dependabot.yml             # Mises a jour automatiques des dependances
├── prisma/
│   ├── schema.prisma              # Schema BDD (domaine + NextAuth)
│   └── seed.ts                    # Donnees initiales ICC Rennes
├── prisma.config.ts               # Config CLI Prisma 7 (datasource URL, generated client path)
├── src/
│   ├── core/                      # Infrastructure modulaire (framework-agnostic)
│   │   ├── module-registry.ts     # ModuleRegistry + defineModule()
│   │   ├── event-bus.ts           # EventBus<TEvents> typé, transaction-aware
│   │   ├── boot.ts                # boot() : charge + valide les modules
│   │   ├── permissions.ts         # buildRolePermissions(registry)
│   │   └── __tests__/             # Tests unitaires core
│   ├── modules/                   # Logique metier par domaine
│   │   ├── core/
│   │   │   └── index.ts           # Manifeste : church:manage, users:manage
│   │   ├── planning/
│   │   │   ├── index.ts           # Manifeste + exports publics
│   │   │   ├── bus.ts             # planningBus = EventBus<PlanningEvents>
│   │   │   ├── events.ts          # PlanningEvents type map
│   │   │   └── services/
│   │   │       └── request-executor.ts  # Executor demandes + emissions bus
│   │   ├── discipleship/
│   │   │   └── index.ts           # Manifeste : discipleship:view/manage/export
│   │   └── __tests__/             # Tests unitaires modules
│   ├── app/
│   │   ├── layout.tsx             # Root layout (Montserrat, metadata)
│   │   ├── page.tsx               # Page de connexion (Google OAuth)
│   │   ├── globals.css            # Tailwind v4 (@theme couleurs ICC)
│   │   ├── (auth)/                # Route group : pages authentifiees
│   │   │   ├── layout.tsx         # Auth guard, header, sidebar, footer version
│   │   │   ├── dashboard/         # Vue planning par departement
│   │   │   │   └── stats/         # Statistiques par departement
│   │   │   ├── planning/          # "Mon planning" — espace STAR (role STAR uniquement)
│   │   │   ├── events/            # Liste et calendrier des evenements
│   │   │   │   └── calendar/      # Vue calendrier
│   │   │   ├── profile/           # Profil utilisateur et liaison compte STAR
│   │   │   ├── requests/          # "Mes demandes" (annonces + demandes unifiees)
│   │   │   │   ├── new/           # Formulaire unifie (annonce ou demande)
│   │   │   │   └── [id]/edit/     # Edition d'une demande en attente
│   │   │   ├── secretariat/
│   │   │   │   └── requests/      # Dashboard Secretariat (toutes demandes)
│   │   │   ├── media/
│   │   │   │   ├── requests/      # Dashboard Production Media (VISUEL)
│   │   │   │   │   └── new/       # Demande visuel standalone
│   │   │   │   ├── events/        # Evenements media (module Media)
│   │   │   │   └── projects/      # Projets media (phases v/g/d)
│   │   │   ├── communication/
│   │   │   │   └── requests/      # Dashboard Communication (RESEAUX_SOCIAUX)
│   │   │   ├── guide/             # Guide utilisateur par role
│   │   │   └── admin/             # Section administration
│   │   │       ├── layout.tsx     # Guard multi-permissions
│   │   │       ├── churches/      # CRUD eglises
│   │   │       ├── users/         # Gestion utilisateurs et roles
│   │   │       ├── access/        # Gestion des acces (ministres, resp. dept, reporters, STAR)
│   │   │       ├── ministries/    # CRUD ministeres
│   │   │       ├── departments/   # CRUD departements
│   │   │       │   └── functions/ # Config fonctions departementales
│   │   │       ├── members/       # CRUD membres (STAR)
│   │   │       ├── events/        # CRUD evenements
│   │   │       │   └── [eventId]/report/ # Saisie compte rendu
│   │   │       ├── reports/       # Dashboard comptes rendus et statistiques
│   │   │       ├── discipleship/  # Dashboard discipolat
│   │   │       └── audit-logs/    # Historique des modifications
│   │   └── api/                   # Route handlers (API REST)
│   │       ├── auth/[...nextauth]/
│   │       ├── announcements/     # GET/POST + [id] GET/PATCH/DELETE
│   │       ├── requests/          # GET/POST + [id] GET/PATCH/DELETE (unifie)
│   │       ├── churches/
│   │       ├── departments/
│   │       ├── discipleships/     # GET/POST + gestion discipolat
│   │       ├── events/
│   │       │   └── [eventId]/
│   │       │       └── report/    # GET/PATCH CR d'evenement
│   │       ├── media-events/          # CRUD evenements media + photos + tokens partage
│   │       ├── media-projects/        # CRUD projets media + tokens partage
│   │       ├── media/
│   │       │   ├── files/[id]/        # CRUD fichiers + versions + commentaires
│   │       │   │   ├── versions/      # GET/POST versions + URLs streaming
│   │       │   │   └── comments/      # GET/POST commentaires
│   │       │   ├── files/upload/sign  # URL pre-signee S3 (upload direct navigateur)
│   │       │   ├── settings/          # GET/PUT parametres module media
│   │       │   ├── gallery/[token]/   # Galerie publique sans auth
│   │       │   ├── validate/[token]/  # Validation photos sans auth
│   │       │   └── download/[token]/  # Telechargement photos sans auth
│   │       ├── member-link-requests/
│   │       ├── member-user-links/
│   │       ├── members/
│   │       ├── ministries/
│   │       ├── notifications/
│   │       └── users/
│   ├── components/
│   │   ├── AuthLayoutShell.tsx    # Shell layout authentifie (header, sidebar)
│   │   ├── BottomNav.tsx          # Navigation mobile bas d'ecran
│   │   ├── Sidebar.tsx            # Sidebar (Planning, Evenements, Membres, Demandes, Medias, Discipolat, Configuration)
│   │   ├── PlanningGrid.tsx       # Grille planning interactive (auto-save)
│   │   ├── EventSelector.tsx      # Selecteur d'evenement
│   │   ├── MonthlyPlanningView.tsx
│   │   ├── NotificationBell.tsx   # Cloche de notifications
│   │   ├── ChurchSwitcher.tsx     # Selecteur d'eglise multi-tenant
│   │   └── ui/                    # Composants UI reutilisables
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Select.tsx
│   │       ├── Modal.tsx
│   │       ├── DataTable.tsx
│   │       ├── CheckboxGroup.tsx
│   │       └── BulkActionBar.tsx
│   ├── generated/
│   │   └── prisma/                # Client Prisma genere (remplace @prisma/client)
│   ├── lib/
│   │   ├── prisma.ts              # Singleton Prisma (globalThis, driver adapter PrismaMariaDb)
│   │   ├── auth.ts                # Config NextAuth + helpers (requireAuth, requirePermission…)
│   │   ├── registry.ts            # Boot du registry + rolePermissions pre-calcule
│   │   ├── api-utils.ts           # ApiError, successResponse, errorResponse
│   │   ├── audit.ts               # logAudit() — journal des actions
│   │   ├── rate-limit.ts          # Limiteur de debit par utilisateur
│   │   └── permissions.ts         # DEPRECATED — utiliser rolePermissions de @/lib/registry
│   └── proxy.ts                   # Middleware Next.js 16 (protection routes, runtime Node.js)
├── docker-compose.yml             # MariaDB locale
├── .dependency-cruiser.cjs        # Regles de frontieres modules (CI)
├── next.config.ts
├── tsconfig.json                  # Strict, path alias @/*
└── postcss.config.mjs             # @tailwindcss/postcss
```

---

## Patterns et conventions

### Server vs Client components

- **Server Components** (par defaut) : pages, layouts, chargement de donnees initiales
- **Client Components** (`"use client"`) : interactions utilisateur

Les pages chargent les donnees cote serveur et les passent en props aux composants client.

### API Route handlers

```typescript
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireChurchPermission("events:view", churchId);
    const { id } = await params;   // toujours await params (Next.js 15+)
    // ... logique metier + Prisma
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
```

### Helpers d'authentification (`src/lib/auth.ts`)

| Helper | Description |
|---|---|
| `requireAuth()` | Verifie la session, throw `UNAUTHORIZED` |
| `requirePermission(perm, churchId?)` | Verifie une permission, throw `FORBIDDEN` |
| `requireChurchPermission(perm, churchId)` | Idem, churchId obligatoire |
| `requireAnyPermission(...perms)` | Au moins une permission valide |
| `getUserDepartmentScope(session)` | `{ scoped: false }` (admin) ou `{ scoped: true, departmentIds }` |
| `getDiscipleshipScope(session, churchId)` | Portee discipolat (scoped ou non) |
| `resolveChurchId(type, id)` | Retrouve le `churchId` d'une ressource par son type |
| `getCurrentChurchId(session)` | Eglise active (cookie ou premiere de la liste) |

### Permissions dans les composants

```typescript
import { rolePermissions } from "@/lib/registry";

// Test de permission dans un composant serveur
const userPermissions = new Set(
  session.user.churchRoles.flatMap((r) => rolePermissions[r.role] ?? [])
);
const canEdit = userPermissions.has("planning:edit");
```

Ne pas utiliser `hasPermission()` de `src/lib/permissions.ts` — deprecated.

### Validation

```typescript
const schema = z.object({ ... });
const data = schema.parse(await request.json());
```

### Prisma

ESM-only, driver adapter `PrismaMariaDb`. Client genere dans `src/generated/prisma/`.
Datasource URL dans `prisma.config.ts` (pas dans `schema.prisma`).

### Middleware

`src/proxy.ts` (ex `src/middleware.ts`) — protege `/dashboard/*` et `/api/*`.
Exporte `proxy` (pas `middleware`), runtime Node.js.

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL de connexion MariaDB |
| `AUTH_SECRET` | Secret de chiffrement des sessions |
| `AUTH_URL` | URL publique de l'application |
| `GOOGLE_CLIENT_ID` | Client ID Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Client Secret Google OAuth |
| `SUPER_ADMIN_EMAILS` | Emails auto-promus Super Admin (virgule) |
| `ENABLED_MODULES` | Modules a charger (virgule) — tous si absent |
| `S3_ENDPOINT` | Endpoint S3-compatible (backups BDD) |
| `S3_REGION` | Region du bucket backups |
| `S3_BUCKET` | Nom du bucket backups |
| `S3_ACCESS_KEY_ID` | Cle d'acces backups |
| `S3_SECRET_ACCESS_KEY` | Secret backups |
| `BACKUP_RETENTION_DAYS` | Retention des backups en jours (defaut : 30) |
| `MEDIA_S3_ENDPOINT` | Endpoint S3-compatible (module media — photos, visuels, videos) |
| `MEDIA_S3_REGION` | Region du bucket media |
| `MEDIA_S3_BUCKET` | Nom du bucket media |
| `MEDIA_S3_ACCESS_KEY_ID` | Cle d'acces media |
| `MEDIA_S3_SECRET_ACCESS_KEY` | Secret media |

> Si `MEDIA_S3_*` sont absents, le module media utilise les variables `S3_*` (bucket unique — dev uniquement).

---

## Module Demandes (Request workflow)

Systeme unifie de soumission et traitement des demandes (annonces + evenements + acces).

### Types de demandes (`RequestType`)

| Type | Soumetteur | Traite par |
|---|---|---|
| `DIFFUSION_INTERNE` | Tous (planning:view) | SECRETARIAT |
| `RESEAUX_SOCIAUX` | Tous | COMMUNICATION |
| `VISUEL` | Systeme (enfant d'une annonce) | PRODUCTION_MEDIA |
| `AJOUT_EVENEMENT` | planning:edit | SECRETARIAT |
| `MODIFICATION_EVENEMENT` | planning:edit | SECRETARIAT |
| `ANNULATION_EVENEMENT` | planning:edit | SECRETARIAT |
| `MODIFICATION_PLANNING` | planning:edit | SECRETARIAT |
| `DEMANDE_ACCES` | planning:edit | SECRETARIAT |

### Execution automatique

Quand une demande de type evenement est approuvee, `executeRequest()` (dans `src/modules/planning/services/request-executor.ts`) l'execute en transaction et emet les evenements planningBus correspondants. Le statut passe a `EXECUTEE` ou `ERREUR` selon le resultat.

### Annulation en cascade

- Annuler une `Announcement` → toutes ses `Request` liees passent en `ANNULE`
- Annuler une `Request` parente `DIFFUSION_INTERNE`/`RESEAUX_SOCIAUX` → la `Request` enfant `VISUEL` passe en `ANNULE`

---

## Module Media

Perimetre : galeries photos (evenements) et projets de production (videos, visuels).

### Dependances

- `core` : obligatoire (churchId, permissions)
- `planning` : optionnelle — lie un `MediaEvent` a un evenement du planning (`planningEventId`)

### Permissions

| Permission | Roles | Description |
|---|---|---|
| `media:view` | SUPER_ADMIN, ADMIN, SECRETARY | Consulter galeries, projets, fichiers |
| `media:upload` | SUPER_ADMIN, ADMIN, SECRETARY | Uploader, supprimer photos et fichiers |
| `media:review` | SUPER_ADMIN, ADMIN | Valider / rejeter photos et fichiers |
| `media:manage` | SUPER_ADMIN, ADMIN | Creer/supprimer evenements et projets, gerer les tokens |

### Services (`src/modules/media/services/`)

| Fichier | Role |
|---|---|
| `image.ts` | Traitement d'images via `sharp` : redimensionnement, conversion WebP, validation MIME |
| `s3.ts` | Interaction S3 : upload, suppression, URLs signees (get/put), upload multipart |
| `tokens.ts` | Generation et validation des tokens de partage (`MediaShareToken`) |

### Flux d'upload photos

1. `POST /api/media-events/[id]/photos` — multipart form-data
2. Serveur : `validatePhotoFile` → `processImage` (sharp) → `uploadMediaFile` (original + thumbnail S3)
3. BDD : creation `MediaPhoto` avec `originalKey` + `thumbnailKey`

### Flux d'upload fichiers (projets)

Upload direct navigateur vers S3 (evite le transit serveur pour les gros fichiers) :

1. `POST /api/media/files/upload/sign` → URL pre-signee S3 + `fileId`
2. Navigateur : `PUT {uploadUrl}` directement vers S3 (XHR avec suivi de progression)
3. `PATCH /api/media/files/[fileId]` avec `{ originalKey }` — confirmation cote serveur

### Acces publics (tokens de partage)

Quatre types de tokens controlent les acces sans authentification :

| Type | Route | Droits |
|---|---|---|
| `GALLERY` | `/media/g/[token]` | Lecture seule, galerie photos approuvees |
| `MEDIA` | `/media/d/[token]` | Telechargement photos approuvees |
| `VALIDATOR` | `/media/v/[token]` | Valider/rejeter des photos (APPROVED/REJECTED) |
| `PREVALIDATOR` | `/media/v/[token]` | Pre-valider (PREVALIDATED/PREREJECTED) |

---

## Qualite du code

- **TypeScript strict** : `noUnusedLocals` + `noUnusedParameters`
- **ESLint** : `eslint.config.mjs` (`eslint-config-next` + `eslint-plugin-react-hooks`)
- **dependency-cruiser** : frontieres modules enforces en CI (`npm run lint:boundaries`)
- **Tests** : Vitest, `npm run test`
- **CI** : typecheck + lint + lint:boundaries + tests sur chaque PR

---

## Multi-tenant

Chaque eglise (`Church`) est un tenant isole. Toutes les donnees sont rattachees via `churchId`.
Un utilisateur peut avoir des roles differents dans plusieurs eglises via `UserChurchRole`.
