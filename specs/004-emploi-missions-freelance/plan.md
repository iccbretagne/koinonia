# Plan technique — Missions freelance

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-07-04

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

---

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun import interne `src/app/` → module ; le module `jobs` expose uniquement son index. CRUD direct dans les route handlers (pas de service dédié — même logique que `JobOffer` et `JobSeeker`).
- [x] **Sécurité** : toutes les routes API protégées par `requireAuth()` ou `requirePermission()`. Pas de `churchId` (module cross-tenant, aligné sur l'existant).
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — nouvelle permission `jobs:freelance`.
- [x] **Validation** Zod sur toutes les mutations.
- [x] **Migration** Prisma prévue (pas de `db push`).
- [x] **Enums** importés depuis `@/generated/prisma/client`.
- [x] **UI** : réutilisation des patterns `JobSeeker` / `JobOffer` existants.

---

## Approche générale

Deux nouveaux modèles indépendants : `FreelanceMission` (donneur d'ordre) et `FreelanceProfile` (prestataire). Même pattern que `JobOffer` / `JobSeeker` : CRUD + notification fire-and-forget, cross-tenant, pas de `churchId`.

La page `/jobs` passe à **trois onglets** (`offers` / `seekers` / `freelance`) via `searchParams.tab`. Quand `tab=freelance`, la page charge les deux sous-flux et les passe à un composant client `FreelanceTabContent` qui affiche missions + profils avec un filtre de sous-flux.

Un enum partagé `FreelanceModality` (REMOTE / ONSITE / HYBRID) est réutilisé sur les deux modèles.

---

## Modèle de données

### Nouveaux enums

```prisma
enum FreelanceModality {
  REMOTE
  ONSITE
  HYBRID
}

enum FreelanceMissionStatus {
  ACTIVE    // en cours de recherche, visible publiquement
  FILLED    // pourvue par l'auteur — clôture volontaire
  ARCHIVED  // archivé par un modérateur
}

enum FreelanceProfileStatus {
  ACTIVE       // disponible, visible publiquement
  UNAVAILABLE  // plus disponible — clôture volontaire
  ARCHIVED     // archivé par un modérateur
}
```

### Nouveau modèle `FreelanceMission`

```prisma
/// Mission freelance à confier, publiée par un donneur d'ordre.
model FreelanceMission {
  id           String                 @id @default(cuid())
  title        String                 @db.VarChar(200)
  domain       String                 @db.VarChar(150)
  duration     String?                @db.VarChar(100)
  dailyRate    String?                @db.VarChar(100)
  hourlyRate   String?                @db.VarChar(100)
  modality     FreelanceModality      @default(REMOTE)
  location     String?                @db.VarChar(150)
  description  String                 @db.Text
  contactEmail String?                @db.VarChar(150)
  contactUrl   String?                @db.VarChar(500)
  status       FreelanceMissionStatus @default(ACTIVE)
  authorId     String
  author       User                   @relation(fields: [authorId], references: [id])
  createdAt    DateTime               @default(now())
  updatedAt    DateTime               @updatedAt

  @@index([status])
  @@index([authorId])
  @@map("freelance_missions")
}
```

### Nouveau modèle `FreelanceProfile`

```prisma
/// Profil freelance publié par un prestataire qui se rend disponible.
model FreelanceProfile {
  id            String                 @id @default(cuid())
  title         String                 @db.VarChar(200)
  domain        String                 @db.VarChar(150)
  dailyRate     String?                @db.VarChar(100)
  hourlyRate    String?                @db.VarChar(100)
  modality      FreelanceModality      @default(REMOTE)
  location      String?                @db.VarChar(150)
  availableFrom DateTime?
  description   String                 @db.Text
  contactEmail  String?                @db.VarChar(150)
  contactUrl    String?                @db.VarChar(500)
  status        FreelanceProfileStatus @default(ACTIVE)
  authorId      String
  author        User                   @relation(fields: [authorId], references: [id])
  createdAt     DateTime               @default(now())
  updatedAt     DateTime               @updatedAt

  @@index([status])
  @@index([authorId])
  @@map("freelance_profiles")
}
```

### Modifications `JobNotificationSubscription`

```prisma
model JobNotificationSubscription {
  // … champs existants …
  wantFreelanceMissions Boolean @default(false)  // ← nouveau
  wantFreelanceProfiles Boolean @default(false)  // ← nouveau
}
```

### Relations `User`

```prisma
model User {
  // … relations existantes …
  freelanceMissions  FreelanceMission[]
  freelanceProfiles  FreelanceProfile[]
}
```

### `dailyRate` — choix String libre

Le TJM est stocké en `String?` (ex : `"400€/j"`, `"300–500€/j"`, `"à définir"`). Évite la complexité des types numériques/currency pour un champ purement indicatif et textuel.

### Migration

Une migration créée avec `prisma migrate dev --name add_freelance_module` (ou manuelle si Docker indisponible).

---

## API

| Endpoint | Méthode | Permission | Corps Zod | Sortie |
|---|---|---|---|---|
| `GET /api/jobs/freelance/missions` | GET | `requireAuth()` | — | `FreelanceMission[]` (ACTIVE) |
| `POST /api/jobs/freelance/missions` | POST | `requirePermission("jobs:freelance")` | `createMissionSchema` | `FreelanceMission` (201) |
| `GET /api/jobs/freelance/missions/[id]` | GET | `requireAuth()` | — | `FreelanceMission` |
| `PATCH /api/jobs/freelance/missions/[id]` | PATCH | `requireAuth()` | `patchMissionSchema` | `FreelanceMission` |
| `DELETE /api/jobs/freelance/missions/[id]` | DELETE | `requireAuth()` | — | `{ success: true }` |
| `GET /api/jobs/freelance/profiles` | GET | `requireAuth()` | — | `FreelanceProfile[]` (ACTIVE) |
| `POST /api/jobs/freelance/profiles` | POST | `requirePermission("jobs:freelance")` | `createProfileSchema` | `FreelanceProfile` (201) |
| `GET /api/jobs/freelance/profiles/[id]` | GET | `requireAuth()` | — | `FreelanceProfile` |
| `PATCH /api/jobs/freelance/profiles/[id]` | PATCH | `requireAuth()` | `patchProfileSchema` | `FreelanceProfile` |
| `DELETE /api/jobs/freelance/profiles/[id]` | DELETE | `requireAuth()` | — | `{ success: true }` |
| `PUT /api/jobs/subscription` | PUT | `requireAuth()` | ajouter `wantFreelanceMissions` + `wantFreelanceProfiles` | `JobNotificationSubscription` |

### Schémas Zod

```typescript
const modalityEnum = z.enum(["REMOTE", "ONSITE", "HYBRID"]);

const createMissionSchema = z.object({
  title:        z.string().min(1).max(200),
  domain:       z.string().min(1).max(150),
  duration:     z.string().max(100).optional().nullable(),
  dailyRate:    z.string().max(100).optional().nullable(),
  modality:     modalityEnum.default("REMOTE"),
  location:     z.string().max(150).optional().nullable(),
  description:  z.string().min(1),
  contactEmail: z.string().email().max(150).optional().nullable(),
  contactUrl:   z.string().url().max(500).optional().nullable(),
});

const createProfileSchema = z.object({
  title:         z.string().min(1).max(200),
  domain:        z.string().min(1).max(150),
  dailyRate:     z.string().max(100).optional().nullable(),
  modality:      modalityEnum.default("REMOTE"),
  location:      z.string().max(150).optional().nullable(),
  availableFrom: z.string().datetime().optional().nullable(),
  description:   z.string().min(1),
  contactEmail:  z.string().email().max(150).optional().nullable(),
  contactUrl:    z.string().url().max(500).optional().nullable(),
});

// Patch = partial + status
const patchMissionSchema  = createMissionSchema.partial().extend({
  status: z.enum(["ACTIVE", "FILLED", "ARCHIVED"]).optional(),
});
const patchProfileSchema  = createProfileSchema.partial().extend({
  status: z.enum(["ACTIVE", "UNAVAILABLE", "ARCHIVED"]).optional(),
});
```

### Règles d'autorisation (PATCH / DELETE)

Identiques au pattern `JobSeeker` :
- Auteur : peut modifier tous les champs + passer à `FILLED`/`UNAVAILABLE` ; ne peut pas passer à `ARCHIVED`.
- Admin/secrétaire (`jobs:manage`) : peut tout modifier, peut passer à `ARCHIVED`.
- Tiers : 403.
- `FILLED`/`UNAVAILABLE` : toujours accessible à l'auteur et aux admins via GET, invisible en liste publique.

---

## Services / logique métier

Pas de service dédié — CRUD pur. Deux fonctions fire-and-forget de notification :

```typescript
// Dans route.ts mission POST :
notifyFreelanceMissionSubscribers(mission) // filtre wantFreelanceMissions: true

// Dans route.ts profile POST :
notifyFreelanceProfileSubscribers(profile) // filtre wantFreelanceProfiles: true
```

Chaque fonction crée des `Notification` in-app (type `"FREELANCE_MISSION"` / `"FREELANCE_PROFILE"`).

---

## Module `jobs` — ajout permission

```typescript
// src/modules/jobs/index.ts
permissions: {
  "jobs:view":      [...tous les rôles...],
  "jobs:post":      [...tous les rôles...],
  "jobs:seek":      [...tous les rôles...],
  "jobs:freelance": [...tous les rôles...],   // ← nouveau
  "jobs:manage":    ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
},
```

---

## UI / composants

### Structure des fichiers

```
src/app/(auth)/jobs/
├── page.tsx                              ← ajouter tab "freelance" + chargement des deux sous-flux
├── JobsTabBar.tsx                        ← ajouter troisième onglet "Freelance"
├── freelance/
│   ├── FreelanceTabContent.tsx          ← NOUVEAU : layout deux sections + filtre sous-flux
│   ├── missions/
│   │   ├── new/
│   │   │   ├── page.tsx                 ← NOUVEAU
│   │   │   └── MissionFormClient.tsx    ← NOUVEAU
│   │   └── [id]/
│   │       ├── page.tsx                 ← NOUVEAU
│   │       ├── MissionDetailClient.tsx  ← NOUVEAU
│   │       └── edit/page.tsx            ← NOUVEAU
│   └── profiles/
│       ├── new/
│       │   ├── page.tsx                 ← NOUVEAU
│       │   └── FreelanceProfileFormClient.tsx ← NOUVEAU
│       └── [id]/
│           ├── page.tsx                 ← NOUVEAU
│           ├── FreelanceProfileDetailClient.tsx ← NOUVEAU
│           └── edit/page.tsx            ← NOUVEAU

src/app/(auth)/admin/jobs/
├── page.tsx                              ← ajouter chargement missions + profiles freelance
└── AdminJobsClient.tsx                   ← ajouter onglet "Freelance" (deux sous-listes)

src/app/api/jobs/
├── freelance/
│   ├── missions/
│   │   ├── route.ts                     ← NOUVEAU : GET + POST
│   │   └── [id]/route.ts               ← NOUVEAU : GET + PATCH + DELETE
│   └── profiles/
│       ├── route.ts                     ← NOUVEAU : GET + POST
│       └── [id]/route.ts               ← NOUVEAU : GET + PATCH + DELETE
└── subscription/route.ts                ← ajouter wantFreelanceMissions + wantFreelanceProfiles

src/app/(auth)/profile/
└── JobSubscriptionClient.tsx            ← ajouter deux nouveaux toggles
```

### Page `/jobs` — troisième onglet

`searchParams.tab` accepte désormais `"offers"` | `"seekers"` | `"freelance"`. Quand `tab=freelance`, la page charge en parallèle `FreelanceMission[]` (ACTIVE) et `FreelanceProfile[]` (ACTIVE) et les passe à `FreelanceTabContent`.

Le CTA principal devient deux boutons côte à côte : "Proposer une mission" et "Proposer mes services".

### `FreelanceTabContent`

Composant client qui reçoit `missions[]` + `profiles[]` + `currentUserId`. Affiche :
- Un filtre de sous-flux : `Tout` | `Missions` | `Disponibles` (boutons toggle)
- Section "Missions à pourvoir" (cartes `MissionCard`) — visible si filtre Tout ou Missions
- Section "Freelances disponibles" (cartes `FreelanceProfileCard`) — visible si filtre Tout ou Disponibles
- États vides par section avec leurs CTAs respectifs

### Cartes

`MissionCard` : titre, domaine (badge), modalité (badge), durée, TJM si renseigné, auteur, date, extrait description.

`FreelanceProfileCard` : titre, domaine (badge), modalité (badge), dispo, TJM si renseigné, auteur, date, extrait description.

Même style que `JobCard` et `SeekerCard` existantes.

### Formulaires

`MissionFormClient` et `FreelanceProfileFormClient` : même pattern que `SeekerFormClient`. Email pré-rempli depuis props serveur. Redirect vers `/jobs/freelance/missions/{id}` ou `/jobs/freelance/profiles/{id}` après création.

### Pages détail

`MissionDetailClient` : bannières statut `FILLED` / `ARCHIVED`. Actions auteur : Modifier, "Mission pourvue", Supprimer. Actions admin : Archiver, Supprimer.

`FreelanceProfileDetailClient` : bannières `UNAVAILABLE` / `ARCHIVED`. Actions auteur : Modifier, "Plus disponible", Supprimer. Actions admin : Archiver, Supprimer.

### `JobSubscriptionClient`

Ajouter deux toggles sous les types existants : "Missions freelance" et "Profils freelance disponibles".

---

## Décisions & alternatives écartées

- **Deux modèles distincts vs. un modèle `FreelanceListing` avec un type enum** : deux modèles — champs différents (`duration`/`availableFrom`, statuts différents `FILLED`/`UNAVAILABLE`), pas de colonne nullable inutile, plus lisible.
- **`dailyRate`/`hourlyRate` String vs. Decimal** : String — champs purement indicatifs (ex. "400€/j", "50€/h", "à définir") ; un Decimal forcerait un format rigide inadapté. Deux champs distincts (journalier + horaire) retenus plutôt qu'un champ unique `rate` pour garder la lisibilité côté affichage.
- **Route `/api/jobs/freelance/missions` vs. `/api/freelance/missions`** : sous `/api/jobs/` — cohérence avec le module existant, pas de nouvelle section dans l'arbre de routes.
- **Page dédiée `/jobs/freelance` vs. tab dans `/jobs`** : tab dans `/jobs` — même pattern que `seekers`, pas de route intermédiaire superflue.
- **Filtre sous-flux côté serveur via `searchParams` vs. état client** : état client (`FreelanceTabContent`) — le filtre `Missions`/`Disponibles` est une navigation locale dans l'onglet, pas un changement d'URL. Charger les deux sous-flux côté serveur en une seule passe est plus efficace.

---

## Risques & points d'attention

- **`JobsTabBar`** : passer de 2 à 3 onglets — vérifier que le layout reste correct sur mobile (overflow horizontal ou wrapping).
- **`JobSubscriptionClient`** : l'interface grossit avec 2 nouveaux toggles — garder la lisibilité (regrouper les toggles "freelance" dans un sous-groupe si nécessaire).
- **`prismaMock`** : ajouter `freelanceMission` et `freelanceProfile` pour que les tests compilent (pattern établi avec `jobSeeker`).
- **Relations `User`** : deux nouvelles relations à ajouter — vérifier que Prisma ne génère pas de conflit de nom.

---

## Stratégie de tests

Tests Vitest dans `src/app/api/jobs/__tests__/freelance.test.ts` :

| Cas | Portée |
|---|---|
| POST missions — sans auth → 401 | API |
| POST missions — body invalide (sans domain) → 400 | API |
| POST missions — succès → 201 | API |
| GET missions — liste ACTIVE uniquement | API |
| PATCH missions — auteur passe à FILLED → 200 | API |
| PATCH missions — auteur tente ARCHIVED → 403 | API |
| PATCH missions — tiers → 403 | API |
| DELETE missions — auteur → 200 | API |
| DELETE missions — tiers → 403 | API |
| POST profiles — sans auth → 401 | API |
| POST profiles — body invalide (sans domain) → 400 | API |
| POST profiles — succès → 201 | API |
| PATCH profiles — auteur passe à UNAVAILABLE → 200 | API |
| PATCH profiles — auteur tente ARCHIVED → 403 | API |
| DELETE profiles — admin → 200 | API |
