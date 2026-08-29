# CLAUDE.md — Koinonia

Contexte pour les agents IA travaillant sur ce projet.

## Projet

**Koinonia** est une application web de gestion des plannings de service pour eglises.
Concue pour ICC Bretagne, adaptable a toute eglise structuree en ministeres et departements.

- **Repository** : https://github.com/iccbretagne/koinonia
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
| Node.js | 22 | Runtime serveur |
| Next.js | 16 | Framework fullstack (App Router + Turbopack) |
| React | 19 | UI (Server Components + Client Components) |
| Tailwind CSS | 4 | Styles (PostCSS, `@theme` tokens) |
| NextAuth (Auth.js) | 5 beta | Authentification Google OAuth |
| Prisma | 7 | ORM (driver adapter MariaDB, ESM-only) |
| MariaDB | 10.11 | Base de donnees (Docker) |
| Zod | 3 | Validation des donnees cote API |
| TypeScript | 5 | Typage strict |

**Points d'attention** :
- Prisma 7 est ESM-only et requiert un driver adapter (`PrismaMariaDb` de `@prisma/adapter-mariadb`)
- Le client Prisma genere est dans `src/generated/prisma/` (plus `@prisma/client`)
- La datasource URL n'est plus dans `schema.prisma` mais dans `prisma.config.ts` (a la racine)
- NextAuth v5 beta : utiliser `auth()` et non `getServerSession()`
- Next.js 16 : `src/middleware.ts` renomme en `src/proxy.ts`, export `middleware` → `proxy`, runtime Node.js (pas Edge)

## Structure du projet

```
koinonia/
├── .github/
│   ├── workflows/ci.yml         # CI : typecheck + lint + lint:boundaries + tests
│   └── dependabot.yml           # Mises a jour automatiques des dependances
├── prisma/
│   ├── schema.prisma            # Schema BDD (domaine + NextAuth)
│   └── seed.ts                  # Donnees initiales ICC Rennes
├── prisma.config.ts             # Config CLI Prisma 7 (datasource URL, generated client path)
├── .dependency-cruiser.cjs      # Regles de frontieres modules (enforced en CI)
├── src/
│   ├── core/                    # Infrastructure modulaire (framework-agnostic)
│   │   ├── module-registry.ts   # ModuleRegistry + defineModule()
│   │   ├── event-bus.ts         # EventBus<TEvents> typé, transaction-aware
│   │   ├── boot.ts              # boot() : charge et valide les modules actifs
│   │   └── permissions.ts       # buildRolePermissions(registry)
│   ├── modules/                 # Logique metier par domaine
│   │   ├── core/index.ts        # Manifeste : church:manage, users:manage
│   │   ├── planning/
│   │   │   ├── index.ts         # Manifeste + exports publics (planningBus, executeRequest…)
│   │   │   ├── bus.ts           # planningBus = EventBus<PlanningEvents>
│   │   │   ├── events.ts        # PlanningEvents type map
│   │   │   └── services/
│   │   │       └── request-executor.ts  # Executor demandes approuvees + emissions bus
│   │   ├── discipleship/index.ts # Manifeste : discipleship:view/manage/export
│   │   └── audio/               # Publication (ADR-0007) + bibliotheque d'ecoute (spec 021)
│   │       ├── index.ts         # Manifeste : audio:view/upload/review/manage
│   │       ├── services/        # Depot, sequences, publication, tokens, acces
│   │       └── worker/          # Process hors Next.js (runner + handlers probe/render)
│   ├── app/
│   │   ├── layout.tsx           # Root layout (Montserrat, metadata)
│   │   ├── page.tsx             # Page de connexion (Google OAuth)
│   │   ├── globals.css          # Tailwind v4 (@theme couleurs ICC)
│   │   ├── (auth)/              # Route group : pages authentifiees
│   │   │   ├── layout.tsx       # Auth guard, header, sidebar, footer version
│   │   │   ├── dashboard/       # Vue planning par departement
│   │   │   │   └── stats/       # Statistiques par departement
│   │   │   ├── events/          # Liste et calendrier des evenements
│   │   │   │   └── calendar/    # Vue calendrier
│   │   │   ├── profile/         # Profil utilisateur et liaison compte STAR
│   │   │   ├── requests/        # "Mes demandes" (annonces + demandes unifiees)
│   │   │   │   ├── new/         # Formulaire unifie : annonce, visuel standalone, demandes
│   │   │   │   └── [id]/edit/   # Edition d'une demande en attente
│   │   │   ├── secretariat/
│   │   │   │   └── requests/    # Dashboard Secretariat (toutes demandes)
│   │   │   ├── media/
│   │   │   │   └── requests/    # Dashboard Production Media (VISUEL) — traitement uniquement
│   │   │   ├── communication/
│   │   │   │   └── requests/    # Dashboard Communication (RESEAUX_SOCIAUX)
│   │   │   ├── audio/           # Espace a onglets (spec 021), layout calcule les droits une fois
│   │   │   │   ├── ecouter/     # Onglet (re)Écouter — bibliotheque des cultes publies ([id])
│   │   │   │   ├── production/  # Onglet Production — file d'attente + depot/nommage ([id])
│   │   │   │   └── parametres/  # Onglet Paramètres — couverture par defaut, modele de sequences
│   │   │   ├── guide/           # Guide utilisateur par role
│   │   │   └── admin/           # Section administration
│   │   │       ├── layout.tsx   # Guard acces eglise (requireAuth + requireChurchAccess)
│   │   │       ├── churches/    # CRUD eglises + onboarding
│   │   │       ├── users/       # Gestion utilisateurs
│   │   │       ├── access/      # Gestion des acces et roles
│   │   │       ├── ministries/  # CRUD ministeres
│   │   │       ├── departments/ # CRUD departements
│   │   │       │   └── functions/ # Config fonctions departementales
│   │   │       ├── members/     # CRUD membres (STAR)
│   │   │       ├── events/      # CRUD evenements
│   │   │       │   └── [eventId]/report/ # Saisie compte rendu
│   │   │       ├── reports/     # Dashboard comptes rendus et statistiques
│   │   │       ├── discipleship/ # Dashboard discipolat (relations, appel, stats)
│   │   │       └── audit-logs/  # Historique des modifications
│   │   └── api/                 # Route handlers (API REST)
│   │       ├── auth/[...nextauth]/
│   │       ├── announcements/   # GET/POST + [id] GET/PATCH/DELETE
│   │       ├── requests/        # GET/POST + [id] GET/PATCH/DELETE (unifie)
│   │       ├── audio/           # services (depot, sequences, publish/unpublish, listen) + public/[token]
│   │       ├── churches/
│   │       ├── departments/
│   │       ├── discipleships/   # CRUD, attendance, stats, tree, export
│   │       ├── events/          # CRUD + [eventId]/report GET/PUT + reports/export
│   │       ├── member-user-links/
│   │       ├── member-link-requests/
│   │       ├── members/
│   │       ├── ministries/
│   │       ├── notifications/
│   │       └── users/           # CRUD + [userId]/roles POST/PATCH/DELETE
│   ├── components/
│   │   ├── Sidebar.tsx          # Sidebar (sections : Planning, Evenements, Membres, Demandes, Medias, Discipolat, Configuration)
│   │   ├── AuthLayoutShell.tsx  # Shell layout authentifie (sidebar + bottom nav + contenu)
│   │   ├── BottomNav.tsx        # Navigation mobile fixe en bas
│   │   ├── NotificationBell.tsx # Cloche de notifications avec badge
│   │   ├── ChurchSwitcher.tsx   # Selecteur d'eglise (multi-tenant)
│   │   ├── PlanningGrid.tsx     # Grille planning interactive (auto-save)
│   │   ├── EventSelector.tsx    # Selecteur d'evenement
│   │   ├── MonthlyPlanningView.tsx
│   │   └── ui/                  # Composants UI reutilisables
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Select.tsx
│   │       ├── Modal.tsx
│   │       ├── DataTable.tsx
│   │       ├── CheckboxGroup.tsx
│   │       └── BulkActionBar.tsx
│   ├── generated/
│   │   └── prisma/              # Client Prisma genere (remplace @prisma/client)
│   ├── lib/
│   │   ├── prisma.ts            # Singleton Prisma (globalThis pattern, driver adapter PrismaMariaDb)
│   │   ├── auth.ts              # Config NextAuth + helpers (requireAuth, requireChurchPermission…)
│   │   ├── registry.ts          # Boot registry + rolePermissions pre-calcule
│   │   ├── api-utils.ts         # ApiError, successResponse, errorResponse
│   │   ├── audit.ts             # logAudit() — journal des actions
│   │   ├── rate-limit.ts        # Limiteur de debit par utilisateur
│   │   └── permissions.ts       # DEPRECATED — utiliser rolePermissions de @/lib/registry
│   └── proxy.ts                 # Middleware Next.js 16 (protection routes, runtime Node.js)
├── docs/                        # Documentation detaillee
│   └── adr/                     # Architecture Decision Records (decisions structurantes)
├── docker-compose.yml           # MariaDB locale
└── package.json
```

## Commandes

```bash
npm run dev              # Developpement (Turbopack)
npm run build            # Build de production (enchaine build:worker)
npm run build:worker     # Bundle esbuild du worker audio -> dist/worker.mjs
npm run worker           # Worker audio en developpement (tsx, sources directes)
npm run start            # Serveur de production
npm run typecheck        # Verification TypeScript (tsc --noEmit)
npm run lint             # ESLint
npm run lint:boundaries  # Verification des frontieres modules (dependency-cruiser)
npm run test             # Tests unitaires (Vitest)
npm run test:watch       # Tests en mode watch
npm run test:coverage    # Tests avec rapport de couverture
npm run db:push          # Appliquer le schema Prisma
npm run db:seed          # Charger les donnees ICC Rennes
npm run db:migrate         # Creer une migration (dev)
npm run db:migrate:deploy  # Appliquer les migrations (production)
```

## Patterns et conventions

### API Route handlers

```typescript
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();           // ou requireCurrentChurchPermission("permission")
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
- `requireChurchPermission(permission, churchId)` — verifie une permission **dans une eglise
  precise**, `churchId` obligatoire (jamais optionnel — voir spec 024)
- `requireCurrentChurchPermission(permission)` — resout l'eglise courante puis verifie la
  permission dedans ; remplacant de choix pour une route qui n'agit pas sur un objet deja
  identifie
- `requireSuperAdmin()` — action reservee a l'administration de la plateforme, jamais evaluee
  dans une eglise (Super Admin uniquement)
- `requirePlatformPermission(permission)` — permissions volontairement transverses aux eglises
  (module emploi), liste blanche testee dans `auth-global-scopes.test.ts`
- `getUserDepartmentScope(session)` — retourne `{ scoped: false }` (admin) ou `{ scoped: true, departmentIds }` (roles limites)
- `requireDepartmentAccess(session, churchId, departmentId)` — jette `FORBIDDEN` si le
  departement vise n'est pas dans le perimetre de l'appelant (`getUserDepartmentScope`). Un
  perimetre restreint **vide** (STAR) refuse tout, sans code specifique a ce role — voir
  ADR-0009. A appeler juste apres `requireChurchPermission`/`resolveChurchId` sur toute route
  qui adresse nominativement un `departmentId`/`deptId`
- `getUserMinistryScope(session, churchId)` — symetrique de `getUserDepartmentScope` pour le
  ministere : `{ scoped: false }` (Super Admin/Admin/Secretaire) ou `{ scoped: true, ministryIds }`
  (Ministre, borne a `UserChurchRole.ministryId` de l'eglise courante)
- `resolveChurchId(type, resourceId)` — retrouve le `churchId` d'une ressource par son type et ID.
  Pour toute action portant sur un objet identifie, cette eglise fait autorite — jamais le
  contexte d'eglise affiche, qui peut etre manipule cote client
- `requireAudioAccess(permission, churchId)` — permission de role **ou** membre du departement de captation
- `requireAudioUnpublishAccess(churchId)` — `audio:manage` ou responsable du departement de captation

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

| Permission | Super Admin | Admin | Secrétaire | Ministre | Resp. département | Faiseur de Disciples | Reporter |
|---|---|---|---|---|---|---|---|
| `planning:view` | x | x | x | x | x | | |
| `planning:edit` | x | x | | x | x | | |
| `planning:department` | x | x | x | x | x | | |
| `access:manage` | x | x | x | x | | | |
| `members:view` | x | x | x | x | x | | |
| `members:manage` | x | x | | x | x | | |
| `events:view` | x | x | x | x | x | | x |
| `events:manage` | x | x | x | | | | |
| `departments:view` | x | x | x | x | x | | |
| `departments:manage` | x | x | | | | | |
| `church:manage` | x | | | | | | |
| `users:manage` | x | | | | | | |
| `discipleship:view` | x | x | x | | x | x | |
| `discipleship:manage` | x | x | x | | | x | |
| `discipleship:export` | x | | x | | | | |
| `reports:view` | x | x | x | | | | x |
| `reports:edit` | x | x | x | | | | x |
| `audio:listen` | x | x | x | x | x | x | x |
| `audio:view` | x | x | x | | | | |
| `audio:upload` | x | x | x | | | | |
| `audio:review` | x | x | | | | | |
| `audio:manage` | x | x | | | | | |

**Visibilite des departements** :
- Super Admin / Admin / Secrétaire : tous les départements de l'église (lecture globale)
- Ministre : départements du ministère assigné
- Responsable de département : départements assignés via `user_departments` (principal ou adjoint via `isDeputy`)

**Spécificités du Secrétaire** :
- Voit tous les départements de son église (même périmètre que Admin)
- Planning en lecture seule (pas de `planning:edit`)
- Membres en lecture seule dans l'admin (pas de `members:manage`)
- Peut gérer les événements (`events:manage`)
- Accès complet aux comptes rendus (`reports:view` + `reports:edit`)
- Gestion complète du discipolat (`discipleship:manage` + `discipleship:export`) : créer/modifier/supprimer les relations, changer le FD et le premier FD

**Spécificités du STAR** (spec 031, issues #462/#463) :
- N'a pas `planning:department` : pas d'accès à `/dashboard` (grille par département), ni aux
  routes API de département (tâches, consignes, membres, stats, planning mensuel/hebdomadaire)
- Conserve `planning:view` : « Mon planning » (vue macro personnelle), ses événements
  (`/planning/events`) et l'auto-déclaration d'absences restent accessibles
- Aucun accès au module salles : ni `rooms:view` ni `rooms:reserve` — retirés totalement
- `getUserDepartmentScope` renvoie systématiquement `{ scoped: true, departmentIds: [] }` pour
  ce rôle (aucun `user_departments`), ce qui produit la restriction totale de `requireDepartmentAccess`
  sans code spécifique — voir ADR-0009. Décision actée : la chaîne d'appartenance (`Member` →
  `member_departments`) n'est pas fusionnée avec le périmètre de responsabilité

**Spécificités du Ministre dans la gestion des accès** (spec 031, issue #467) :
- `access:manage` remplace l'ancien emprunt de `events:manage` sur
  `POST/PATCH/DELETE /api/users/[userId]/roles` — aligné sur la garde de la page `/admin/access`
- Un Ministre au périmètre restreint (`getUserMinistryScope`) ne peut attribuer/modifier/retirer
  que des rôles rattachables (`MINISTER`, `DEPARTMENT_HEAD`, `STAR`), et seulement dans **ses**
  ministères — jamais un rôle transverse à l'église (`ADMIN`, `SECRETARY`, `REPORTER`,
  `ACCOUNTANT`, `DISCIPLE_MAKER`, `AGENDA_QUALIFIER`)
- L'anti-escalade `PRIVILEGED_ROLES` → `isSuperAdmin` (SUPER_ADMIN/ADMIN/SECRETARY) reste
  inchangée et s'applique en plus de ce périmètre

**Spécificités du Reporter** :
- Accès en lecture aux événements (`events:view`)
- Accès en lecture/écriture aux comptes rendus (`reports:view` + `reports:edit`)
- Pas d'accès au planning, membres, ou administration

**Spécificités du module audio** — le tableau ci-dessus ne suffit pas :
- `/audio` est un espace a onglets a droits distincts (spec 021), un seul lien de navigation
  **« Audio »** conditionne par `audio:listen` — chaque onglet verifie en plus son propre droit
  server-side (l'onglet masque ne dispense jamais du controle) :
  - `/audio/ecouter` (+ `/audio/ecouter/[id]`) — **(re)Écouter**, bibliotheque des cultes publies,
    `audio:listen` — accordee a **tous les roles**, y compris STAR
  - `/audio/production` (+ `/audio/production/[id]`) — **Production**, file d'attente et
    depot/nommage, `requireAudioAccess("audio:view", …)`
  - `/audio/parametres` — **Paramètres**, couverture par defaut et modele de sequences,
    `requireAudioAccess("audio:manage", …)`
- `requireAudioAccess(permission, churchId)` verifie d'abord les permissions de role, puis
  retombe sur `isCaptureTeamMember()` — un STAR du departement de captation audio passe
  donc le controle **quelle que soit la permission demandee**, sans role dedie
- `requireAudioUnpublishAccess(churchId)` est volontairement plus strict : `audio:manage` ou
  `isCaptureTeamLead` (responsable/ministre du departement de captation audio) uniquement — pas
  de passe-droit pour un simple STAR, depublier engageant plus que publier
- Le departement de captation se configure comme une **fonction de departement**
  (`Department.function = "CAPTATION_AUDIO"`) dans `/admin/departments/functions`
  (`events:manage`) — plus de colonne dediee sur `AudioSettings`, et plus de page
  `/admin/audio/settings` (jamais mise en production, supprimee sans redirection)

## Multi-tenant

Chaque eglise (`Church`) est un tenant isole. Les donnees sont rattachees a une eglise via `churchId`. Un utilisateur peut avoir des roles differents dans plusieurs eglises via `UserChurchRole`.

## Gestion des versions

- Version source de verite : `package.json` > `version`
- Releases via tags git `v*` (le CI verifie la correspondance tag/version)
- La version s'affiche dans le footer du layout authentifie
- Changelog dans `CHANGELOG.md`

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`) : typecheck + lint + lint:boundaries + tests sur chaque PR, validation version sur tags
- **Dependabot** (`.github/dependabot.yml`) : mises a jour hebdomadaires npm + GitHub Actions (minor/patch uniquement, majeures ignorées)

## Documentation

| Document | Contenu |
|---|---|
| [Architecture](docs/architecture.md) | Structure, patterns, conventions |
| [Base de donnees](docs/database.md) | Schema Prisma, modeles, relations |
| [API](docs/api.md) | Endpoints, requetes, reponses |
| [Authentification](docs/auth.md) | NextAuth, OAuth, RBAC, permissions |
| [Production](docs/production.md) | Deploiement Debian, Traefik, systemd |
| [Environnement de dev](docs/dev-onboarding.md) | Setup conteneurise, jeu de donnees fictif, connexion sans Google OAuth |
| [Roadmap](docs/roadmap.md) | Evolutions prevues |
| [ADR](docs/adr/README.md) | Decisions architecturales structurantes (Architecture Decision Records) |

## Setup local

Prerequis : Node.js 22, Docker.

```bash
# 1. Installer les dependances
npm install

# 2. Demarrer MariaDB
docker-compose up -d

# 3. Copier les variables d'environnement et les remplir
cp .env.example .env
# Variables requises : AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL

# 4. Initialiser la base de donnees
npm run db:migrate
npm run db:seed

# 5. Lancer en developpement
npm run dev
```

## Workflow contributeur

### Spec-Driven Development

Les fonctionnalites non triviales sont specifiees avant d'etre codees. Le flux :

```
/specify <description>  →  /plan  →  /tasks  →  /implement
     spec.md                plan.md   tasks.md    code + PR
```

- Les specs vivent dans `specs/NNN-nom-feature/` (voir `specs/README.md`).
- `specs/constitution.md` = principes non-negociables que toute spec/plan/implementation respecte.
- La `spec.md` decrit QUOI/POURQUOI (aucune technique) ; le `plan.md` decrit COMMENT ; le `tasks.md` decoupe.
- Un fix trivial ne necessite pas de spec.

### Conventions de branches

| Prefixe | Usage |
|---|---|
| `feat/<nom>` | Nouvelle fonctionnalite |
| `fix/<nom>` | Correction de bug |
| `chore/<nom>` | Maintenance (release, deps, config) |

Ne jamais pusher directement sur `main`.

### Sequence pour une feature

```bash
git checkout -b feat/ma-feature
# ... developpement ...
npm run typecheck && npm run lint && npm run test
# Ouvrir une PR vers main — CI doit passer avant de merger
```

### Sequence de release

```bash
# 1. Bumper la version dans package.json + CHANGELOG.md
git checkout -b chore/release-vX.Y.Z
git commit -m "chore: release vX.Y.Z (#N)"
# Ouvrir une PR vers main, la merger

# 2. Tagger apres merge
git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z

# 3. Creer la GitHub Release
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

### Features longues (multi-PR)

Creer une branche `feat/X` comme base. Les sous-features ouvrent des PRs vers `feat/X`. Une seule PR finale `feat/X` → `main`.

## Pieges connus

1. **`next-env.d.ts` regenere automatiquement** — ce fichier change a chaque `npm run dev`. Si `git pull` bloque a cause de lui :
   ```bash
   git stash && git pull && git stash drop
   ```

2. **`await params` obligatoire** — dans les route handlers Next.js 15+, `params` est une `Promise`. Toujours `const { id } = await params` (jamais destructuring direct).

3. **`Modal` : prop `open` pas `isOpen`** — `<Modal open onClose={...}>` — voir `src/components/ui/Modal.tsx` avant d'utiliser un composant UI.

4. **`Button` : pas de prop `loading`** — utiliser `disabled={isLoading}` avec un texte conditionnel.

5. **Imports Prisma** — les types enum (ex. `Role`) viennent de `@/generated/prisma/client`, pas de `@prisma/client`.

6. **`rolePermissions` pas `hasPermission`** — `src/lib/permissions.ts` est deprecated. Utiliser `rolePermissions` de `@/lib/registry`.

7. **Conflits de migration** — si deux branches modifient `schema.prisma`, rebaser sur `main` avant `npm run db:migrate` pour eviter des conflits de fichiers de migration.

## Regles pour les agents IA

1. **Lire avant d'ecrire** : toujours lire un fichier existant avant de le modifier
2. **Suivre les patterns existants** : utiliser les helpers (`requireAuth`, `successResponse`, etc.)
3. **Valider avec TypeScript** : executer `npm run typecheck` apres les modifications
4. **await params** : dans les route handlers Next.js 15, les params sont des Promise
5. **Composants UI** : verifier `src/components/ui/` avant de creer un nouveau composant
6. **Pas de sur-ingenierie** : faire le minimum necessaire pour la fonctionnalite demandee
7. **Erreurs** : utiliser `ApiError` pour les erreurs metier, Zod pour la validation
8. **Permissions** : toujours proteger les routes API avec `requireAuth()`, `requireChurchPermission()`
   ou `requireCurrentChurchPermission()` — jamais de controle de permission sans eglise cible
9. **Migrations** : toujours creer une migration Prisma (`prisma migrate dev`) au lieu de `db push` pour tout changement de schema
10. **Permissions dans le code** : utiliser `rolePermissions` de `@/lib/registry` (PAS `hasPermission` de `@/lib/permissions` qui est deprecated)
11. **Imports modules** : `src/app/` ne peut importer depuis un module que via son index (`@/modules/X`) — pas de chemins internes
12. **Frontieres modules** : verifier `npm run lint:boundaries` apres tout ajout de dependance entre modules
13. **ADR** : toute decision architecturale/structurante (cross-module, difficile a revenir en arriere, choix de stack ou de pattern durable) est documentee dans `docs/adr/` — voir `docs/adr/README.md` pour la distinguer d'une decision de `plan.md` (portee a une seule feature)
