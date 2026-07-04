# Plan technique — Profils de recherche d'emploi

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-07-04

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

---

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun import interne dans `src/app/` — le module `jobs` n'expose que son index (`@/modules/jobs`). Aucune logique métier complexe → pas de service dédié nécessaire, CRUD direct dans les route handlers (comme `JobOffer` existant).
- [x] **Sécurité** : toutes les routes API protégées par `requireAuth()` ou `requirePermission()`. Pas de `churchId` (aligné sur `JobOffer` existant — module cross-tenant voulu).
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — nouvelle permission `jobs:seek` ajoutée au module.
- [x] **Validation** Zod sur toutes les mutations (POST, PATCH).
- [x] **Migration** Prisma prévue (`prisma migrate dev`) — ajout modèle `JobSeeker` + champ `wantSeekers` sur `JobNotificationSubscription`.
- [x] **Enums** importés depuis `@/generated/prisma/client`.
- [x] **UI** : réutilisation des composants existants (`src/components/ui/`). Aucun nouveau composant UI générique nécessaire.

---

## Approche générale

On étend le module emploi existant en miroir de `JobOffer` : même périmètre cross-tenant, mêmes patterns API (CRUD + notify), même structure de pages. La page `/jobs` adopte un layout à deux onglets pilotés par `searchParams` (SSR-friendly). Un nouveau modèle `JobSeeker` est ajouté au schéma sans perturber l'existant. La permission `jobs:seek` est introduite pour séparer sémantiquement "publier une offre" de "publier son profil de recherche".

---

## Modèle de données

### Nouveaux enums

```prisma
enum JobSeekerStatus {
  ACTIVE
  FOUND
  ARCHIVED
}
```

- `ACTIVE` : en recherche, visible dans la liste publique
- `FOUND` : a trouvé — fermé par l'auteur, visible uniquement par lui et les admins
- `ARCHIVED` : archivé par un admin/secrétaire (modération)

### Nouveau modèle `JobSeeker`

```prisma
/// Profil de recherche d'emploi publié par un utilisateur.
model JobSeeker {
  id              String          @id @default(cuid())
  title           String          @db.VarChar(200)
  wantEmploi      Boolean         @default(false)
  wantStage       Boolean         @default(false)
  wantAlternance  Boolean         @default(false)
  sector          String?         @db.VarChar(150)
  location        String?         @db.VarChar(150)
  remote          Boolean         @default(false)
  availableFrom   DateTime?
  description     String          @db.Text
  contactEmail    String?         @db.VarChar(150)
  contactUrl      String?         @db.VarChar(500)
  status          JobSeekerStatus @default(ACTIVE)
  authorId        String
  author          User            @relation(fields: [authorId], references: [id])
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status])
  @@index([authorId])
  @@map("job_seekers")
}
```

### Modification `JobNotificationSubscription`

```prisma
model JobNotificationSubscription {
  // … champs existants …
  wantSeekers    Boolean @default(false)   // ← nouveau champ
}
```

### Relation `User`

```prisma
model User {
  // … relations existantes …
  jobSeekers  JobSeeker[]
}
```

### Migration

Une migration Prisma créée avec `prisma migrate dev --name add_job_seeker_profiles`.

---

## API

| Endpoint | Méthode | Permission | Corps Zod | Sortie |
|---|---|---|---|---|
| `GET /api/jobs/seekers` | GET | `requireAuth()` | `?type=EMPLOI\|STAGE\|ALTERNANCE` (query) | `JobSeeker[]` (ACTIVE uniquement) |
| `POST /api/jobs/seekers` | POST | `requirePermission("jobs:seek")` | `createSeekerSchema` | `JobSeeker` (201) |
| `GET /api/jobs/seekers/[id]` | GET | `requireAuth()` | — | `JobSeeker` (FOUND/ARCHIVED accessibles auteur + admin) |
| `PATCH /api/jobs/seekers/[id]` | PATCH | `requireAuth()` | `patchSeekerSchema` | `JobSeeker` |
| `DELETE /api/jobs/seekers/[id]` | DELETE | `requireAuth()` | — | `{ success: true }` |
| `PUT /api/jobs/subscription` | PUT | `requireAuth()` | ajouter `wantSeekers: z.boolean().optional()` | `JobNotificationSubscription` |

### Schémas Zod

```typescript
const createSeekerSchema = z.object({
  title:         z.string().min(1).max(200),
  wantEmploi:    z.boolean().default(false),
  wantStage:     z.boolean().default(false),
  wantAlternance: z.boolean().default(false),
  sector:        z.string().max(150).optional().nullable(),
  location:      z.string().max(150).optional().nullable(),
  remote:        z.boolean().default(false),
  availableFrom: z.string().datetime().optional().nullable(),
  description:   z.string().min(1),
  contactEmail:  z.string().email().max(150).optional().nullable(),
  contactUrl:    z.string().url().max(500).optional().nullable(),
});
// Contrainte : au moins un wantEmploi || wantStage || wantAlternance = true (refine)

const patchSeekerSchema = createSeekerSchema.partial().extend({
  status: z.enum(["ACTIVE", "FOUND", "ARCHIVED"]).optional(),
});
// Logique d'autorisation dans le handler : seul l'auteur peut passer à FOUND ;
// seul admin/secrétaire peut passer à ARCHIVED.
```

### Règles d'autorisation dans les handlers

**PATCH** :
- Auteur : peut modifier tous les champs sauf `status: ARCHIVED` (réservé admin)
- Admin/secrétaire (`jobs:manage`) : peut modifier tout, peut passer à `ARCHIVED`
- Tiers : 403

**DELETE** :
- Auteur : peut supprimer si `status: ACTIVE` ou `FOUND`
- Admin/secrétaire (`jobs:manage`) : peut toujours supprimer
- Tiers : 403

---

## Services / logique métier

Pas de service dédié dans `src/modules/jobs/services/` — la logique est simple (CRUD + notification fire-and-forget). Pattern identique à `JobOffer`.

### Notifications à la création (fire-and-forget)

Fonction `notifySeekerSubscribers(seeker)` dans `src/app/api/jobs/seekers/route.ts` :

```typescript
// Filtre les abonnés avec wantSeekers: true
// Pour chaque abonné : notification in-app (type "JOB_SEEKER") et email si sub.email
// Notification in-app : title "Nouveau profil en recherche", link "/jobs/seekers/{id}"
```

Le type de notification `"JOB_SEEKER"` est ajouté à l'enum `NotificationType` dans le schéma Prisma.

---

## UI / composants

### Structure des fichiers

```
src/app/(auth)/jobs/
├── page.tsx                        ← refonte : layout deux onglets (searchParams ?tab=)
├── JobsListClient.tsx              ← inchangé
├── SeekersListClient.tsx           ← NOUVEAU : liste profils + filtre type
├── new/
│   ├── page.tsx                    ← inchangé (offres)
│   └── JobFormClient.tsx           ← inchangé
├── [id]/
│   ├── page.tsx                    ← inchangé
│   └── JobDetailClient.tsx         ← inchangé
└── seekers/
    ├── new/
    │   ├── page.tsx                ← NOUVEAU : server component, précharge email session
    │   └── SeekerFormClient.tsx    ← NOUVEAU : formulaire création/édition
    └── [id]/
        ├── page.tsx                ← NOUVEAU : server component
        ├── SeekerDetailClient.tsx  ← NOUVEAU : vue détail + actions
        └── edit/
            └── page.tsx            ← NOUVEAU : server component, charge le profil

src/app/(auth)/admin/jobs/
├── page.tsx                        ← ajouter onglet "Profils de recherche"
└── AdminJobsClient.tsx             ← ajouter section seekers (tab)

src/app/api/jobs/
├── seekers/
│   ├── route.ts                    ← NOUVEAU : GET + POST
│   └── [id]/
│       └── route.ts                ← NOUVEAU : GET + PATCH + DELETE
└── subscription/
    └── route.ts                    ← modifier : ajouter wantSeekers au schéma Zod
```

### Page `/jobs` — refonte des onglets

La page serveur lit `searchParams.tab` (`"offers"` par défaut | `"seekers"`). Elle charge les données du tab actif et passe le rendu au bon client component. Un composant client léger `JobsTabBar` gère la navigation entre onglets via `useRouter` + `useSearchParams`.

Le CTA principal ("Publier une offre" / "Publier mon profil") change selon le tab actif.

### `SeekersListClient`

- Filtre par type (boutons toggles, plusieurs sélectionnables)
- Tri : plus récent en premier
- Carte profil : nom de l'auteur (ou "Anonyme"), titre, types souhaités (badges colorés), localisation + télétravail, date de dispo, extrait description (line-clamp-2)
- Badge "Mon profil" si `authorId === currentUserId`
- État vide avec CTA "Publier mon profil → /jobs/seekers/new"

### `SeekerFormClient`

- Champs : titre (obligatoire), types de contrat (checkboxes, au moins 1 requis), secteur, localisation, télétravail (toggle), date de disponibilité, description (obligatoire), email de contact, lien externe
- Email pré-rempli depuis la session (passé en props par la page serveur)
- Réutilise le style des inputs de `JobFormClient` (cohérence visuelle)

### `SeekerDetailClient`

- Vue complète du profil
- Actions auteur : "Modifier" → edit, "J'ai trouvé !" → PATCH status: FOUND, "Supprimer" → DELETE
- Actions admin/secrétaire (canManage) : "Archiver" → PATCH status: ARCHIVED, "Supprimer" → DELETE
- Profil FOUND : bannière "Ce profil est clôturé (emploi trouvé)" + masquage de l'action "J'ai trouvé"
- Profil ARCHIVED : bannière "Ce profil a été archivé par un modérateur"

### Paramètre `tab` et navigation

```
/jobs            → tab "Offres" (défaut)
/jobs?tab=seekers → tab "En recherche"
```

Lien "Publier mon profil" depuis l'onglet seekers → `/jobs/seekers/new`
Après création d'un profil → redirect vers `/jobs/seekers/{id}`

---

## Module `jobs` — ajout permission

```typescript
// src/modules/jobs/index.ts
permissions: {
  "jobs:view":   [...tous les rôles...],
  "jobs:post":   [...tous les rôles...],
  "jobs:seek":   [...tous les rôles...],   // ← nouveau
  "jobs:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
},
```

`jobs:seek` regroupe les mêmes rôles que `jobs:post` mais garde une sémantique distincte pour une éventuelle différenciation future.

---

## Décisions & alternatives écartées

- **Trois booleans `wantEmploi/wantStage/wantAlternance` vs. tableau JSON ou table de jonction** : choix des booleans — cohérence avec `JobNotificationSubscription`, simplicité des requêtes de filtrage, pas de support natif des tableaux en MariaDB. Un tableau JSON aurait rendu les index impossibles.

- **Cross-tenant (pas de `churchId`) vs. scoped par église** : choix cross-tenant — aligné sur `JobOffer`. Le module emploi est volontairement un espace commun à toute la plateforme, pas limité à une église.

- **Statut `FOUND` vs. simple suppression quand "j'ai trouvé"** : choix du statut — conserve l'historique consultable par l'auteur, évite la perte de données involontaire, permet des statistiques futures.

- **`searchParams` (SSR) vs. état client pour les onglets** : choix `searchParams` — le tab est partageable par URL (`/jobs?tab=seekers`), SEO-friendly, compatible avec le rendu serveur initial de la liste.

- **`/jobs/seekers/[id]` vs. `/jobs/[id]?type=seeker`** : URLs distinctes — modèles différents, pas de pollution du handler existant `JobOffer`.

- **Service dédié dans `src/modules/jobs/services/`** : écarté — la logique est du CRUD pur sans invariant métier complexe. Ajouter un service serait de la sur-ingénierie.

---

## Risques & points d'attention

- **`NotificationType` enum** : ajouter `JOB_SEEKER` nécessite une migration. Vérifier qu'aucun autre code ne fait de switch exhaustif sur cet enum sans cas par défaut.
- **Email pré-rempli** : la session Next.js expose `session.user.email` — le passer en props côté serveur, ne pas le lire côté client.
- **Filtrage multi-type** : le filtre "Emploi + Stage" sélectionnés simultanément doit utiliser un `OR` Prisma (`{ OR: [{ wantEmploi: true }, { wantStage: true }] }`).
- **Admin `/admin/jobs`** : la page admin doit couvrir les deux entités. L'onglet seekers liste tous les profils (ACTIVE + FOUND + ARCHIVED).

---

## Stratégie de tests

Tests Vitest dans `src/app/api/jobs/__tests__/` (fichier dédié `seekers.test.ts`) :

| Cas | Type |
|---|---|
| POST `/api/jobs/seekers` — sans auth → 401 | Unitaire API |
| POST `/api/jobs/seekers` — body invalide (sans type de contrat) → 400 | Unitaire API |
| POST `/api/jobs/seekers` — succès → 201 + profil retourné | Unitaire API |
| GET `/api/jobs/seekers` — filtre par type → seuls les profils ACTIVE + type matching | Unitaire API |
| PATCH `/api/jobs/seekers/[id]` — auteur passe à FOUND → 200 | Unitaire API |
| PATCH `/api/jobs/seekers/[id]` — auteur tente ARCHIVED → 403 | Unitaire API |
| PATCH `/api/jobs/seekers/[id]` — tiers → 403 | Unitaire API |
| DELETE `/api/jobs/seekers/[id]` — auteur → 200 | Unitaire API |
| DELETE `/api/jobs/seekers/[id]` — tiers → 403 | Unitaire API |
