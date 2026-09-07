# Architecture

## Stack technique

| Technologie | Version | Rôle |
|---|---|---|
| Next.js | 16 | Framework fullstack (App Router + Turbopack) |
| React | 19 | UI (Server Components + Client Components) |
| Tailwind CSS | 4 | Styles (PostCSS) |
| NextAuth (Auth.js) | 5 beta | Authentification Google OAuth |
| Prisma | 7 | ORM (driver adapter MariaDB, ESM-only) |
| MariaDB | 10.11 | Base de données (Docker) |
| Zod | 3 | Validation des données côté API |
| TypeScript | 5 | Typage strict |

## Architecture modulaire (v1.0)

Koinonia suit une architecture **monolithe modulaire** : une seule base de code déployée ensemble, mais organisée en modules avec des frontières strictes.

```
src/
├── core/           ← infrastructure modulaire (framework-agnostic)
├── modules/        ← logique metier par domaine
└── app/            ← surface Next.js (routes, pages, composants)
```

### Couche core (`src/core/`)

Fournit le "système de plugins" que les modules utilisent :

| Fichier | Rôle |
|---|---|
| `module-registry.ts` | `ModuleRegistry` (register, validateDeps, resolveLoadOrder, collectPermissions) + `defineModule()` |
| `event-bus.ts` | `EventBus<TEvents>` — bus in-process, typé, transaction-aware |
| `boot.ts` | `boot()` — lit `ENABLED_MODULES`, charge les modules, valide les dépendances |
| `permissions.ts` | `buildRolePermissions(registry)` — dérive la matrice rôles→permissions depuis les manifestes |

### Couche modules (`src/modules/`)

Chaque module expose un **manifeste** (`index.ts`) qui déclare ses permissions, sa navigation, et ses exports publics. La couche `src/app/` ne peut importer qu'à partir de l'index du module (règle CI `app-only-module-public-api`).

| Module | Périmètre |
|---|---|
| `core` | Gestion des églises (`church:manage`), des utilisateurs (`users:manage`) et des accès/rôles au sein d'une église (`access:manage`) — module racine, sans dépendance |
| `planning` | Événements, planning, membres, annonces, demandes (Request workflow), espace STAR, auto-déclaration d'absences |
| `discipleship` | Suivi discipolat, relations, présences, stats. Dépend de `planning` |
| `storage` | Primitifs de stockage S3 et de jeton, extraits de `media` ([ADR-0006](adr/0006-extraction-module-storage.md)). Pas de modèle Prisma propre |
| `media` | Galeries photos événements, projets de production, versionnage fichiers, tokens de partage. Dépend de `storage` ; optionnellement lié à `planning` |
| `audio` | Publication audio des cultes : dépôt des séquences, nommage, rendu sonore, diffusion par lien public, bibliothèque d'écoute (`audio:listen`, ouverte à tous les rôles) et partage de cette bibliothèque entre églises (spec 036, `services/sharing.ts`). Dépend de `storage` et `planning`. Seul module à embarquer un **worker hors Next.js** ([ADR-0007](adr/0007-worker-hors-nextjs-table-jobs.md)) |
| `agenda` | Agenda pastoral : profils pastoraux (Pasteur, Berger, Assistante), demandes de RDV, qualification, planification. Dépend de `core` |
| `accounting` | Demandes de dépenses/remboursements, paiements, justificatifs, statistiques financières. Dépend de `core` et `planning` |
| `rooms` | Réservation de salles (partage cross-église via liste blanche `RoomAccess`) et main courante (ouverture/fermeture, contrôle). Dépend de `core` |
| `integration` | Suivi des parcours d'intégration : demandes aux familles, appel au salut (MSDP), affectation bergers/conseillers, KPIs. Dépend de `core` |
| `jobs` | Offres d'emploi/stage/alternance, profils de recherche d'emploi, abonnements aux notifications, modération. Module transversal ouvert à tous les rôles authentifiés. Dépend de `core` |

**Exports du module `media` :**
- `mediaModule` — manifeste
- `uploadMediaFile`, `deleteMediaFile` — upload/suppression S3
- `getSignedThumbnailUrl`, `getSignedOriginalUrl`, `getSignedDownloadUrl` — URLs signées
- `processImage`, `validatePhotoFile` — traitement et validation images (sharp)
- `createMediaShareToken`, `validateMediaShareToken` — gestion des tokens de partage
- `createMultipartUpload`, `getSignedPartUrl`, `completeMultipartUpload`, `abortMultipartUpload` — upload multipart S3

**Exports du module `planning` :**
- `planningModule` — manifeste
- `planningBus` — `EventBus<PlanningEvents>` singleton
- `PlanningEvents` — carte des événements émis
- `executeRequest()` — executor des demandes approuvées
- `ExecutionResult` — type de retour de l'executor

**Exports du module `audio` liés au partage de bibliothèque entre églises (spec 036,
`services/sharing.ts`) :**
- `listAccessibleLibraryChurchIds(churchId)` / `listAccessibleLibraryChurches(churchId)` —
  fonction pivot : l'église elle-même, plus les églises qui lui ont ouvert leur bibliothèque
  (jamais l'inverse — un partage sortant ne donne rien en retour)
- `listOutgoingShares(ownerChurchId)`, `grantLibraryShare(ownerChurchId, slug, options)`,
  `revokeLibraryShare(ownerChurchId, shareId)` — administration des partages (écran
  `/audio/parametres`, garde par `audio:manage`)

### Registry (`src/lib/registry.ts`)

Singleton process-level : boot avec tous les modules actifs + matrice `rolePermissions` pré-calculée.

```typescript
export const registry = boot({
  modules: [coreModule, planningModule, discipleshipModule, storageModule, mediaModule,
            audioModule, agendaModule, roomsModule, integrationModule, accountingModule, jobsModule],
});
export const rolePermissions = buildRolePermissions(registry);
```

`rolePermissions` est importé directement par les routes API et composants qui ont besoin de tester une permission.

### Bus d'événements (`planningBus`)

Le bus est transaction-aware : les handlers s'exécutent dans la même `Prisma.TransactionClient` que l'émetteur. Si un handler throw, la transaction est rollback.

```typescript
await prisma.$transaction(async (tx) => {
  const event = await tx.event.create({ ... });
  await planningBus.emit("planning:event:created", { tx, churchId, userId }, {
    eventId: event.id, ...
  });
});
```

Événements définis : `planning:event:created`, `planning:event:cancelled`, `planning:request:executed`, `planning:status:changed`.

### Frontières modules (dependency-cruiser)

CI enforce les règles suivantes via `npm run lint:boundaries` :

| Règle | Description |
|---|---|
| `no-planning-imports-other-modules` | `planning` n'importe pas d'un autre module |
| `no-discipleship-imports-other-modules` | `discipleship` n'importe pas d'un autre module |
| `no-core-module-imports-other-modules` | `core` n'importe pas d'un autre module |
| `no-integration-imports-other-modules` | `integration` n'importe pas d'un autre module |
| `no-modules-static-import-registry` | Un module ne peut pas importer statiquement `src/lib/registry.ts` (cycle avec la racine de composition — issue #446) ; un import dynamique reste autorisé |
| `core-no-modules-import` | `src/core/` n'importe pas de `src/modules/` |
| `app-only-module-public-api` | `src/app/` importe uniquement depuis `src/modules/X/index.ts` ou `src/modules/X/auth.ts` |

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
│   ├── modules/                   # Logique metier par domaine (11 modules, voir tableau plus haut)
│   │   ├── core/
│   │   │   └── index.ts           # Manifeste : church:manage, users:manage, access:manage
│   │   ├── planning/
│   │   │   ├── index.ts           # Manifeste + exports publics
│   │   │   ├── bus.ts             # planningBus = EventBus<PlanningEvents>
│   │   │   ├── events.ts          # PlanningEvents type map
│   │   │   └── services/          # request-executor, event.service, absence.service…
│   │   ├── discipleship/
│   │   │   └── index.ts           # Manifeste : discipleship:view/manage/export
│   │   ├── storage/
│   │   │   ├── index.ts           # Manifeste : primitifs S3 + jetons, sans permission propre
│   │   │   └── services/          # s3.ts, token.ts
│   │   ├── media/
│   │   │   ├── index.ts           # Manifeste : media:view/upload/review/manage
│   │   │   └── services/          # image, files, tokens (galeries, projets, versions)
│   │   ├── audio/
│   │   │   ├── index.ts           # Manifeste : audio:listen/view/upload/review/manage
│   │   │   ├── services/          # Depot, sequences, publication, tokens, acces, partage (sharing.ts, spec 036)
│   │   │   └── worker/            # Hors Next.js — runner + handlers probe/render
│   │   ├── agenda/
│   │   │   ├── index.ts           # Manifeste : agenda:view/manage/qualify — agenda pastoral
│   │   │   ├── auth.ts            # Guards specifiques (2e point d'entree)
│   │   │   └── __tests__/
│   │   ├── accounting/
│   │   │   ├── index.ts           # Manifeste : accounting:submit/view/manage/stats
│   │   │   └── services/          # attachments.ts (pieces jointes)
│   │   ├── rooms/
│   │   │   ├── index.ts           # Manifeste : rooms:view/reserve/manage
│   │   │   └── services/          # reservation.service, checklist.service (main courante)
│   │   ├── integration/
│   │   │   ├── index.ts           # Manifeste : suivi parcours d'integration (pas de permission propre)
│   │   │   ├── bus.ts             # integrationBus = EventBus<IntegrationEvents>
│   │   │   ├── auth.ts            # Guards specifiques (2e point d'entree)
│   │   │   ├── events.ts
│   │   │   └── services/          # export-service, family-service, msdp-service
│   │   ├── jobs/
│   │   │   ├── index.ts           # Manifeste : jobs:view/post/seek/freelance/manage
│   │   │   └── services/          # lifecycle-service (expiration/archivage)
│   │   └── __tests__/             # Tests unitaires transverses (manifests, planning-bus…)
│   ├── app/
│   │   ├── layout.tsx             # Root layout (Montserrat, metadata)
│   │   ├── page.tsx               # Page de connexion (Google OAuth)
│   │   ├── globals.css            # Tailwind v4 (@theme couleurs ICC)
│   │   ├── (auth)/                # Route group : pages authentifiees
│   │   │   ├── layout.tsx         # Auth guard, header, sidebar, footer version
│   │   │   ├── dashboard/         # Vue planning par departement
│   │   │   │   └── stats/         # Statistiques par departement
│   │   │   ├── planning/          # "Mon planning" — espace STAR (role STAR uniquement)
│   │   │   │   └── events/        # Evenements du STAR connecte
│   │   │   ├── absences/          # Auto-declaration d'absences (timeline)
│   │   │   ├── events/            # Liste et calendrier des evenements
│   │   │   │   └── calendar/      # Vue calendrier
│   │   │   ├── profile/           # Profil utilisateur et liaison compte STAR
│   │   │   ├── requests/          # "Mes demandes" (annonces + demandes unifiees)
│   │   │   │   ├── new/           # Formulaire unifie : annonce, visuel standalone ou demande
│   │   │   │   └── [id]/edit/     # Edition d'une demande en attente
│   │   │   ├── secretariat/
│   │   │   │   └── requests/      # Dashboard Secretariat (toutes demandes)
│   │   │   ├── media/
│   │   │   │   ├── requests/      # Dashboard Production Media (VISUEL)
│   │   │   │   ├── events/        # Evenements media (module media, galeries photos)
│   │   │   │   ├── projects/      # Projets media (phases v/g/d)
│   │   │   │   └── collections/   # Constructeur de collections photos (CollectionBuilder)
│   │   │   ├── communication/
│   │   │   │   └── requests/      # Dashboard Communication (RESEAUX_SOCIAUX)
│   │   │   ├── audio/             # Espace a onglets (spec 021), droits par onglet
│   │   │   │   ├── ecouter/       # (re)Ecouter — bibliotheque des cultes publies (+ partagés, spec 036) ([id])
│   │   │   │   ├── production/    # File d'attente + depot/nommage ([id])
│   │   │   │   └── parametres/    # Couverture par defaut, modele de sequences, partage inter-eglises (spec 036)
│   │   │   ├── agenda/            # Agenda pastoral (calendrier, demandes de RDV publiques)
│   │   │   │   ├── [profileId]/   # Vue agenda hebdomadaire d'un profil pastoral
│   │   │   │   ├── new/           # Saisie directe d'une entree (Protocole)
│   │   │   │   ├── request/       # Prise de RDV (STAR connecte)
│   │   │   │   ├── requests/      # Qualification des demandes brutes (AGENDA_QUALIFIER)
│   │   │   │   └── schedule/      # Planification des demandes validees (Protocole)
│   │   │   ├── accounting/        # Comptabilite : demandes de depenses/remboursements
│   │   │   │   ├── requests/      # Dashboard des demandes (soumission, traitement)
│   │   │   │   └── stats/         # Statistiques financieres
│   │   │   ├── rooms/             # Reservation de salles + main courante
│   │   │   │   └── checklists/    # Suivi des ouvertures/fermetures (RoomChecklist)
│   │   │   ├── integration/       # Suivi des parcours d'integration
│   │   │   │   ├── leaders/       # Dashboard leaders (bergers)
│   │   │   │   ├── parcours/      # Vue parcours d'un membre
│   │   │   │   ├── requests/      # Dashboard demandes d'integration aux familles
│   │   │   │   └── stats/         # KPIs et statistiques
│   │   │   ├── jobs/              # Offres d'emploi/stage/alternance
│   │   │   │   ├── [id]/          # Detail d'une offre
│   │   │   │   ├── freelance/     # Onglet freelance
│   │   │   │   ├── new/           # Publication d'une offre
│   │   │   │   └── seekers/       # Profils de recherche d'emploi
│   │   │   ├── pastoral/          # Dashboard pastoral (Pasteur/Assistant/Berger, lecture agregee)
│   │   │   │   ├── accounting/    # Vue comptabilite du profil pastoral
│   │   │   │   ├── events/        # Vue evenements du profil pastoral
│   │   │   │   ├── members/       # Vue membres du profil pastoral
│   │   │   │   └── reports/       # Vue comptes rendus du profil pastoral
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
│   │   │       ├── pastoral-profiles/ # CRUD profils pastoraux (Pasteur, Berger, Assistante)
│   │   │       ├── rooms/         # CRUD salles et acces cross-eglise
│   │   │       ├── welcome-duty/  # Planification et pool de l'accueil (welcome duty)
│   │   │       ├── jobs/          # Moderation des offres d'emploi (archivage)
│   │   │       ├── backups/       # Sauvegardes BDD (S3), restauration
│   │   │       └── audit-logs/    # Historique des modifications
│   │   └── api/                   # Route handlers (API REST)
│   │       ├── auth/
│   │       │   ├── [...nextauth]/ # NextAuth (Google OAuth)
│   │       │   ├── dev-login/     # Connexion sans Google OAuth (dev uniquement, AUTH_DEV_LOGIN)
│   │       │   └── reset/         # Reinitialisation session dev
│   │       ├── announcements/     # GET/POST + [id] GET/PATCH/DELETE
│   │       ├── requests/          # GET/POST + [id] GET/PATCH/DELETE (unifie)
│   │       ├── absences/          # GET/POST + [id], export, backup-options
│   │       ├── planning/
│   │       │   └── weekly/        # Vue planning hebdomadaire (STAR)
│   │       ├── audio/
│   │       │   ├── services/          # CRUD cultes + [id]/upload/sequences/publish/unpublish/play/stream/share
│   │       │   ├── settings/          # GET/PUT parametres module audio (+ cover/sign)
│   │       │   ├── shares/            # GET/POST + [id] DELETE — partage de bibliotheque entre eglises (spec 036)
│   │       │   └── public/[token]/    # Lecture publique sans auth (play, stream)
│   │       ├── agenda/
│   │       │   ├── entries/       # Entrees d'agenda (Protocole)
│   │       │   ├── profiles/      # Profils pastoraux
│   │       │   └── requests/      # Demandes de RDV (qualification, planification)
│   │       ├── accounting/
│   │       │   ├── requests/      # CRUD demandes de depenses/remboursements
│   │       │   ├── attachments/   # Pieces jointes (S3 ACCOUNTING_S3_*)
│   │       │   ├── payments/      # Saisie des paiements
│   │       │   ├── series/        # Series de demandes recurrentes
│   │       │   └── stats/         # Statistiques financieres
│   │       ├── room-reservations/ # GET/POST + [id] GET/PATCH/DELETE
│   │       ├── rooms/
│   │       │   └── key-holders/   # Detenteurs de cles
│   │       ├── integration/
│   │       │   ├── families/      # Demandes d'integration aux familles
│   │       │   ├── leaders/       # Dashboard leaders (bergers)
│   │       │   ├── msdp/          # Suivi MSDP (appel au salut)
│   │       │   ├── requests/      # CRUD demandes d'integration
│   │       │   └── stats/         # KPIs et statistiques
│   │       ├── jobs/
│   │       │   ├── [id]/          # GET/PATCH/DELETE une offre
│   │       │   ├── freelance/     # Offres freelance
│   │       │   ├── seekers/       # Profils de recherche d'emploi
│   │       │   └── subscription/  # Abonnements aux notifications par type
│   │       ├── welcome-duty/
│   │       │   ├── assignments/   # Affectations planning accueil
│   │       │   ├── available-families/
│   │       │   ├── families/
│   │       │   └── suggestions/
│   │       ├── onboarding/
│   │       │   └── candidates/    # Onboarding eglise (recherche adresse, etc.)
│   │       ├── churches/
│   │       │   └── onboard/       # Assistant de creation d'une eglise
│   │       ├── departments/
│   │       ├── discipleships/     # GET/POST + gestion discipolat, attendance, stats, tree, export
│   │       ├── events/
│   │       │   ├── [eventId]/report/  # GET/PATCH CR d'evenement
│   │       │   └── reports/           # Export des comptes rendus
│   │       ├── media-events/          # CRUD evenements media + photos + tokens partage
│   │       ├── media-projects/        # CRUD projets media + tokens partage
│   │       ├── media/
│   │       │   ├── files/[id]/        # CRUD fichiers + versions + commentaires
│   │       │   │   ├── versions/      # GET/POST versions + URLs streaming
│   │       │   │   └── comments/      # GET/POST commentaires
│   │       │   ├── files/upload/sign  # URL pre-signee S3 (upload direct navigateur)
│   │       │   ├── collection/        # Collections de photos (construites depuis plusieurs evenements)
│   │       │   ├── settings/          # GET/PUT parametres module media
│   │       │   ├── gallery/[token]/   # Galerie publique sans auth
│   │       │   ├── validate/[token]/  # Validation photos sans auth
│   │       │   └── download/[token]/  # Telechargement photos sans auth
│   │       ├── admin/
│   │       │   ├── backups/       # Lancer/lister/restaurer les sauvegardes BDD
│   │       │   └── media/         # Administration media transverse
│   │       ├── cron/
│   │       │   ├── backup/        # Sauvegarde BDD planifiee (proteger par CRON_SECRET)
│   │       │   └── reminders/     # Rappels planifies (email)
│   │       ├── audit-logs/
│   │       ├── current-church/    # Eglise courante (cookie)
│   │       ├── member-link-requests/
│   │       ├── member-user-links/
│   │       │   └── self/
│   │       ├── members/
│   │       │   └── search/
│   │       ├── ministries/
│   │       ├── notifications/
│   │       ├── user/
│   │       │   └── tour-seen/     # Marque le tour guide comme vu
│   │       ├── users/
│   │       │   └── search/
│   │       └── health/            # Healthcheck
│   ├── components/
│   │   ├── AuthLayoutShell.tsx    # Shell layout authentifie (header, sidebar, bottom nav)
│   │   ├── BottomNav.tsx          # Navigation mobile bas d'ecran
│   │   ├── MobileNavSheet.tsx     # Feuille de navigation mobile (menu complet)
│   │   ├── Sidebar.tsx            # Sidebar (navigation desktop, une entree par module)
│   │   ├── Breadcrumb.tsx         # Fil d'Ariane
│   │   ├── PlanningGrid.tsx       # Grille planning interactive (auto-save)
│   │   ├── WeeklyPlanningView.tsx # Vue planning hebdomadaire (STAR)
│   │   ├── MonthlyPlanningView.tsx
│   │   ├── EventSelector.tsx      # Selecteur d'evenement
│   │   ├── DepartmentTasksView.tsx # Taches/consignes d'un departement
│   │   ├── TaskPanel.tsx          # Panneau de taches
│   │   ├── DashboardActions.tsx   # Actions rapides du dashboard
│   │   ├── NotificationBell.tsx   # Cloche de notifications
│   │   ├── ChurchSwitcher.tsx     # Selecteur d'eglise multi-tenant
│   │   ├── SwitchChurchLink.tsx   # Lien de bascule vers une autre eglise
│   │   ├── GuideContent.tsx       # Contenu du guide utilisateur par role
│   │   ├── GuidedTour.tsx         # Visite guidee interactive (tour-steps)
│   │   ├── ServiceWorkerRegistration.tsx # Enregistrement du service worker (PWA)
│   │   ├── audio/
│   │   │   └── AudioPlayer.tsx    # Lecteur audio (bibliotheque + fiche evenement)
│   │   └── ui/                    # Composants UI reutilisables
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Textarea.tsx
│   │       ├── Select.tsx
│   │       ├── Modal.tsx
│   │       ├── ConfirmModal.tsx
│   │       ├── DataTable.tsx
│   │       ├── CheckboxGroup.tsx
│   │       └── BulkActionBar.tsx
│   ├── generated/
│   │   └── prisma/                # Client Prisma genere (remplace @prisma/client)
│   ├── lib/
│   │   ├── prisma.ts              # Singleton Prisma (globalThis, driver adapter PrismaMariaDb)
│   │   ├── auth.ts                # Config NextAuth + helpers (requireAuth, requireChurchPermission…)
│   │   ├── auth-cookies.ts        # Nettoyage des cookies Auth.js (issue #505)
│   │   ├── registry.ts            # Boot du registry + rolePermissions pre-calcule
│   │   ├── api-utils.ts           # ApiError, successResponse, errorResponse
│   │   ├── errors.ts              # Erreurs metier, sans dependance Next.js
│   │   ├── audit.ts               # logAudit() — journal des actions
│   │   ├── rate-limit.ts          # Limiteur de debit par utilisateur
│   │   ├── permissions.ts         # DEPRECATED — utiliser rolePermissions de @/lib/registry
│   │   ├── s3.ts                  # Client S3 backups (distinct de src/modules/storage)
│   │   ├── file-storage.ts        # Stockage pieces jointes comptabilite (S3 ACCOUNTING_S3_* ou disque)
│   │   ├── backup.ts              # Sauvegarde BDD (mysqldump) vers S3
│   │   ├── restore.ts             # Restauration BDD depuis une sauvegarde
│   │   ├── config-export.ts       # Export de la configuration eglise
│   │   ├── config-import.ts       # Import de la configuration eglise
│   │   ├── config-backup-types.ts # Types partages export/import config
│   │   ├── email.ts               # Envoi d'emails (SMTP, nodemailer)
│   │   ├── notifications.ts       # Creation de notifications in-app
│   │   ├── audio-progress.ts      # Reprise d'ecoute audio par appareil (localStorage, spec 021)
│   │   ├── department-functions.ts # Constantes des fonctions de departement (CAPTATION_AUDIO…)
│   │   ├── event-types.ts         # Constantes des types d'evenement
│   │   ├── excel.ts               # Neutralisation injection CSV/Excel + helpers export
│   │   ├── report-export.ts       # Export des comptes rendus
│   │   ├── family-geo.ts          # Geocodage adresse (integration familles, api.adresse.data.gouv.fr)
│   │   ├── onboarding.ts          # Normalisation de noms (comparaison insensible casse/accents)
│   │   ├── turnstile.ts           # Verification Cloudflare Turnstile (formulaires publics)
│   │   ├── text.ts                # Helpers de texte partages
│   │   ├── tour-steps.ts          # Etapes de la visite guidee (GuidedTour)
│   │   ├── week.ts                # Helpers de dates purs (semaine française, vue STAR)
│   │   └── logger.ts              # Logger pino (stdout, sans transport worker thread)
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

- **Server Components** (par défaut) : pages, layouts, chargement de données initiales
- **Client Components** (`"use client"`) : interactions utilisateur

Les pages chargent les données côté serveur et les passent en props aux composants client.

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

> **Il n'existe pas de helper `requirePermission(perm, churchId?)`.** Une permission ne s'évalue
> jamais hors d'une église : le `churchId` n'est jamais optionnel (voir `specs/024-*`). Utiliser
> `requireChurchPermission` quand l'église est déjà résolue, `requireCurrentChurchPermission`
> sinon.

| Helper | Description |
|---|---|
| `requireAuth()` | Vérifie la session, throw `UNAUTHORIZED` |
| `requireChurchPermission(perm, churchId)` | Vérifie une permission dans une église précise — `churchId` obligatoire |
| `requireCurrentChurchPermission(perm)` | Résout l'église courante puis vérifie la permission dedans |
| `requireChurchAccess(churchId)` | Vérifie un rôle quelconque dans l'église, sans permission précise |
| `requireSuperAdmin()` | Action réservée à l'administration de la plateforme |
| `requirePlatformPermission(perm)` | Permissions volontairement transverses aux églises (liste blanche testée) |
| `requireDepartmentAccess(session, churchId, departmentId)` | Garde de périmètre département (ADR-0009) |
| `getUserDepartmentScope(session)` | `{ scoped: false }` (admin) ou `{ scoped: true, departmentIds }` |
| `getUserMinistryScope(session, churchId)` | Symétrique pour le ministère (Ministre borné à ses ministères) |
| `getDiscipleshipScope(session, churchId)` | Portée discipolat (scoped ou non) |
| `resolveChurchId(type, id)` | Retrouve le `churchId` d'une ressource par son type |
| `getCurrentChurchId(session)` | Église active (cookie ou première de la liste) |
| `requireMediaAccess` / `UploadAccess` / `ManageAccess` / `ReviewAccess` | Gardes propres au module media |
| `requireAudioAccess(perm, churchId)` | Permission de rôle **ou** membre du département de captation |
| `requireAudioListenAccess(churchId)` | Écoute : rôle dans l'église **ou** bibliothèque partagée (ADR-0010) |
| `requireAudioUnpublishAccess(churchId)` | `audio:manage` ou responsable du département de captation |

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

ESM-only, driver adapter `PrismaMariaDb`. Client généré dans `src/generated/prisma/`.
Datasource URL dans `prisma.config.ts` (pas dans `schema.prisma`).

### Middleware

`src/proxy.ts` (ex `src/middleware.ts`) — protège `/dashboard/*` et `/api/*`.
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
| `ENABLED_MODULES` | Modules à charger (virgule) — tous si absent |
| `BACKUP_S3_ENDPOINT` | Endpoint S3-compatible (backups BDD) |
| `BACKUP_S3_REGION` | Région du bucket backups |
| `BACKUP_S3_BUCKET` | Nom du bucket backups |
| `BACKUP_S3_ACCESS_KEY_ID` | Clé d'accès backups |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret backups |
| `BACKUP_RETENTION_DAYS` | Rétention des backups en jours (défaut : 30) |
| `MEDIA_S3_ENDPOINT` | Endpoint S3-compatible (module media — photos, visuels, vidéos) |
| `MEDIA_S3_REGION` | Région du bucket media |
| `MEDIA_S3_BUCKET` | Nom du bucket media |
| `MEDIA_S3_ACCESS_KEY_ID` | Clé d'accès media |
| `MEDIA_S3_SECRET_ACCESS_KEY` | Secret media |
| `ACCOUNTING_S3_BUCKET` / `ACCOUNTING_S3_REGION` / `ACCOUNTING_S3_ENDPOINT` / `ACCOUNTING_S3_ACCESS_KEY` / `ACCOUNTING_S3_SECRET_KEY` | Stockage des pièces jointes comptabilité (`src/lib/file-storage.ts`) — fallback disque si absentes |
| `AUTH_TRUST_HOST` | `true` si derrière un reverse proxy (Traefik, nginx) |
| `PORT` | Port d'écoute du serveur Next.js |
| `AUTH_DEV_LOGIN` | Active la connexion sans Google OAuth (dev/recette uniquement) |
| `CRON_SECRET` | Protège les routes `/api/cron/*` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Envoi d'emails (nodemailer) — notifications, rappels |
| `SMTP_IGNORE_TLS` / `SMTP_TLS_REJECT_UNAUTHORIZED` | Ajustements TLS pour un relay local ou un certificat auto-signé |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile sur le formulaire public `agenda-public` (désactivé sur `rejoindre`) |
| `AUDIO_CACHE_DIR` / `AUDIO_CACHE_MAX_BYTES` | Cache local du module audio, éviction LRU (défaut : 5 Go) |
| `AUDIO_XACCEL_LOCATION` | Active la délégation de diffusion audio au reverse proxy (X-Accel) |

> Les variables `MEDIA_S3_*` sont obligatoires — aucun fallback sur `BACKUP_S3_*`. Les deux buckets doivent être configurés séparément.

---

## Module Demandes (Request workflow)

Système unifié de soumission et traitement des demandes (annonces + événements + accès).

### Types de demandes (`RequestType`)

| Type | Soumetteur | Traite par |
|---|---|---|
| `DIFFUSION_INTERNE` | Tous (planning:view) | SECRETARIAT |
| `RESEAUX_SOCIAUX` | Tous | COMMUNICATION |
| `VISUEL` | Système (enfant d'une annonce) | PRODUCTION_MEDIA |
| `AJOUT_EVENEMENT` | planning:edit | SECRETARIAT |
| `MODIFICATION_EVENEMENT` | planning:edit | SECRETARIAT |
| `ANNULATION_EVENEMENT` | planning:edit | SECRETARIAT |
| `MODIFICATION_PLANNING` | planning:edit | SECRETARIAT |
| `DEMANDE_ACCES` | planning:edit | SECRETARIAT |

### Exécution automatique

Quand une demande de type événement est approuvée, `executeRequest()` (dans `src/modules/planning/services/request-executor.ts`) l'exécute en transaction et émet les événements planningBus correspondants. Le statut passe à `EXECUTEE` ou `ERREUR` selon le résultat.

### Annulation en cascade

- Annuler une `Announcement` → toutes ses `Request` liées passent en `ANNULE`
- Annuler une `Request` parente `DIFFUSION_INTERNE`/`RESEAUX_SOCIAUX` → la `Request` enfant `VISUEL` passe en `ANNULE`

---

## Module Média

Périmètre : galeries photos (événements) et projets de production (vidéos, visuels).

### Dépendances

- `core` : obligatoire (churchId, permissions)
- `planning` : optionnelle — lie un `MediaEvent` à un événement du planning (`planningEventId`)

### Permissions

| Permission | Rôles | Description |
|---|---|---|
| `media:view` | SUPER_ADMIN, ADMIN, SECRETARY | Consulter galeries, projets, fichiers |
| `media:upload` | SUPER_ADMIN, ADMIN, SECRETARY | Uploader, supprimer photos et fichiers |
| `media:review` | SUPER_ADMIN, ADMIN | Valider / rejeter photos et fichiers |
| `media:manage` | SUPER_ADMIN, ADMIN | Créer/supprimer événements et projets, gérer les tokens |

### Services (`src/modules/media/services/`)

| Fichier | Rôle |
|---|---|
| `image.ts` | Traitement d'images via `sharp` : redimensionnement, conversion WebP, validation MIME |
| `files.ts` | Constantes fichiers (`MAX_FILE_SIZE`) |
| `tokens.ts` | Génération et validation des tokens de partage (`MediaShareToken`), résolution des données galerie/collection/validateur |

L'interaction S3 (upload, suppression, URLs signées, multipart) vit dans le module `storage`
([ADR-0006](adr/0006-extraction-module-storage.md)) — `media` la réexporte depuis
`@/modules/storage` (voir `src/modules/media/index.ts`).

### Flux d'upload photos

1. `POST /api/media-events/[id]/photos` — multipart form-data
2. Serveur : `validatePhotoFile` → `processImage` (sharp) → `uploadMediaFile` (original + thumbnail S3)
3. BDD : création `MediaPhoto` avec `originalKey` + `thumbnailKey`

### Flux d'upload fichiers (projets)

Upload direct navigateur vers S3 (évite le transit serveur pour les gros fichiers) :

1. `POST /api/media/files/upload/sign` → URL pré-signée S3 + `fileId`
2. Navigateur : `PUT {uploadUrl}` directement vers S3 (XHR avec suivi de progression)
3. `PATCH /api/media/files/[fileId]` avec `{ originalKey }` — confirmation côté serveur

### Accès publics (tokens de partage)

Quatre types de tokens contrôlent les accès sans authentification :

| Type | Route | Droits |
|---|---|---|
| `GALLERY` | `/media/g/[token]` | Lecture seule, galerie photos approuvées |
| `MEDIA` | `/media/d/[token]` | Téléchargement photos approuvées |
| `VALIDATOR` | `/media/v/[token]` | Valider/rejeter des photos (APPROVED/REJECTED) |
| `PREVALIDATOR` | `/media/v/[token]` | Pré-valider (PREVALIDATED/PREREJECTED) |

---

## Qualité du code

- **TypeScript strict** : `noUnusedLocals` + `noUnusedParameters`
- **ESLint** : `eslint.config.mjs` (`eslint-config-next` + `eslint-plugin-react-hooks`)
- **dependency-cruiser** : frontières modules enforces en CI (`npm run lint:boundaries`)
- **Tests** : Vitest, `npm run test`
- **CI** : typecheck + lint + lint:boundaries + tests + `npm audit --omit=dev --audit-level=high`
  sur chaque PR

### Dépendances vulnérables : le champ `overrides`

`npm audit --omit=dev --audit-level=high` bloque la CI si une dépendance de **production**
présente une faille haute ou critique. Le périmètre s'arrête volontairement à la production :
une faille dans un outil de build ou de test n'est pas exposée aux utilisateurs, et faire
échouer la CI dessus finirait par pousser à désactiver le garde-fou.

Quand la correction dépend d'un paquet intermédiaire qui n'a pas encore relâché la version
saine, le champ `overrides` de `package.json` force la version corrigée dans tout l'arbre.
Chaque entrée existe pour une faille précise et doit **disparaître** dès que le paquet parent
publie une version qui embarque déjà le correctif :

| Override | Pourquoi | À retirer quand |
|---|---|---|
| `@prisma/adapter-mariadb > mariadb: ^3.5.3` | L'adaptateur épingle `mariadb@3.4.5`, qui fuit le mot de passe en clair face à un MitM malgré `ssl: true` | L'adaptateur épingle une version >= 3.5.3 |
| `mysql2: ^3.24.2` | Faille GHSA-3f6p-5ww8-9rcr | Le paquet parent qui tire `mysql2` dépend de >= 3.24.2 |
| `fast-uri: ^3.1.7` | Faille GHSA-5jgf-p345-68v8 | Le paquet parent qui tire `fast-uri` dépend de >= 3.1.7 |
| `nodemailer: ^9.0.6` | Injections de commandes SMTP (CRLF) sur `<= 9.0.0` ; `next-auth` et `@auth/core` déclarent encore `^7 \|\| ^8`, ce qui réintroduisait une copie vulnérable | `next-auth` accepte `^9` |
| `deepmerge-ts: ^8.0.0` | Épuisement de pile dans `@prisma/config` (chargement de configuration, hors chemin de requête) | `@prisma/config` dépend de `>= 8` |
| `uuid: ^11.1.1` | Borne de buffer manquante, tirée par `exceljs` | `exceljs` dépend de `>= 11.1.1` |

Un override est un contournement, pas une solution : vérifier à chaque montée de version si le
paquet parent a rattrapé son retard, et retirer la ligne devenue inutile.

---

## Multi-tenant

Chaque église (`Church`) est un tenant isolé. Toutes les données sont rattachées via `churchId`.
Un utilisateur peut avoir des rôles différents dans plusieurs églises via `UserChurchRole`.
