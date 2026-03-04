# Base de donnees

MariaDB 10.11 via Docker. ORM Prisma avec connecteur MySQL.
Tous les IDs sont des `String @default(cuid())`.

## Schema relationnel

```
┌──────────────────────────────────────────────────────────────────────┐
│                          NextAuth                                    │
│  accounts ←── users ──→ sessions                                     │
│                 │        verification_tokens                         │
└─────────────────┼────────────────────────────────────────────────────┘
                  │
                  │ churchRoles
                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Domaine                                      │
│                                                                      │
│  churches ◄─── user_church_roles ───► users                         │
│     │               │                                                │
│     │               │ departments                                    │
│     │               ▼                                                │
│     │          user_departments ───► departments                     │
│     │                                    │                           │
│     ├──► ministries ──► departments ◄────┘                          │
│     │                       │                                        │
│     │                       ├──► members ──► plannings               │
│     │                       │                    ▲                    │
│     └──► events ──► event_departments ───► plannings                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Modeles

### NextAuth (gestion automatique)

| Table | Description |
|---|---|
| `accounts` | Comptes OAuth lies a un utilisateur (Google) |
| `sessions` | Sessions actives |
| `verification_tokens` | Tokens de verification email |

### Domaine

#### `churches`

Tenant principal. Chaque eglise est un espace isole.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `name` | String | Nom de l'eglise |
| `slug` | String (unique) | Identifiant URL |
| `createdAt` | DateTime | Date de creation |
| `updatedAt` | DateTime | Derniere modification |

#### `users`

Utilisateurs de l'application. Crees automatiquement a la premiere connexion Google via NextAuth.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `email` | String (unique) | Adresse email |
| `name` | String? | Nom affiche |
| `image` | String? | URL avatar Google |
| `emailVerified` | DateTime? | Date de verification (NextAuth) |

#### `user_church_roles`

Association utilisateur-eglise-role. Un utilisateur peut avoir plusieurs roles dans plusieurs eglises.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `userId` | String | Ref vers `users` |
| `churchId` | String | Ref vers `churches` |
| `role` | Role (enum) | `SUPER_ADMIN`, `ADMIN`, `SECRETARY`, `MINISTER`, `DEPARTMENT_HEAD` |
| `ministryId` | String? | Ref vers `ministries` (pour MINISTER) |

Contrainte unique : `[userId, churchId, role]`

#### `user_departments`

Departements assignes a un role utilisateur-eglise.

| Champ | Type | Description |
|---|---|---|
| `userChurchRoleId` | String | Ref vers `user_church_roles` |
| `departmentId` | String | Ref vers `departments` |

Contrainte unique : `[userChurchRoleId, departmentId]`

#### `ministries`

Ministeres d'une eglise (Accueil, Louange, Communication...).

| Champ | Type | Description |
|---|---|---|
| `name` | String | Nom du ministere |
| `churchId` | String | Ref vers `churches` |

#### `departments`

Departements d'un ministere (Choristes, Musiciens, Son...).

| Champ | Type | Description |
|---|---|---|
| `name` | String | Nom du departement |
| `ministryId` | String | Ref vers `ministries` |

#### `members`

Membres d'un departement (les personnes planifiees).

| Champ | Type | Description |
|---|---|---|
| `firstName` | String | Prenom |
| `lastName` | String | Nom |
| `departmentId` | String | Ref vers `departments` |

#### `events`

Evenements d'une eglise.

| Champ | Type | Description |
|---|---|---|
| `title` | String | Titre de l'evenement |
| `type` | String | `CULTE`, `PRIERE`, `PARLONS_PAROLE`, `CONFERENCE` |
| `date` | DateTime | Date et heure |
| `churchId` | String | Ref vers `churches` |

#### `event_departments`

Quels departements sont concernes par un evenement.

| Champ | Type | Description |
|---|---|---|
| `eventId` | String | Ref vers `events` |
| `departmentId` | String | Ref vers `departments` |

Contrainte unique : `[eventId, departmentId]`

#### `plannings`

Statut d'un membre pour un departement a un evenement donne.

| Champ | Type | Description |
|---|---|---|
| `eventDepartmentId` | String | Ref vers `event_departments` |
| `memberId` | String | Ref vers `members` |
| `status` | ServiceStatus? | Statut (nullable = non renseigne) |
| `updatedAt` | DateTime | Derniere modification |

Contrainte unique : `[eventDepartmentId, memberId]`

### Enums

#### `Role`

```
SUPER_ADMIN      # Acces a toutes les eglises
ADMIN            # Admin d'une eglise
SECRETARY        # Secretariat d'une eglise
MINISTER         # Responsable d'un ministere
DEPARTMENT_HEAD  # Responsable d'un ou plusieurs departements
```

#### `ServiceStatus`

```
EN_SERVICE          # Present et en service
EN_SERVICE_DEBRIEF  # En service + animateur du debrief (max 1 par dept/event)
INDISPONIBLE        # Absent
REMPLACANT          # Remplace un membre indisponible
```

## Seed (donnees initiales)

Le script `prisma/seed.ts` cree :

- **1 eglise** : ICC Rennes (`icc-rennes`)
- **7 ministeres** avec leurs departements :
  - Accueil (Accueil, Protocole, Parking)
  - Louange (Choristes, Musiciens, Son, Video/Regie)
  - Communication (Reseaux sociaux, Design, Photographie, Videographie)
  - Intercession (Intercession culte, Intercession permanente)
  - Enseignement (Ecole du dimanche, Adolescents, Jeunes adultes)
  - Technique (Son, Lumiere, Multimedia, Streaming)
  - Service d'ordre (Securite, Premiers secours)
- **3-5 membres fictifs** par departement
- **4 cultes hebdomadaires** + **1 soiree de priere**
- **Tous les departements** lies au premier evenement

## Migrations

Depuis v0.5.0, le projet utilise **Prisma Migrate** pour gerer les evolutions du schema.

### Workflow developpement

```bash
npm run db:migrate         # creer et appliquer une migration (dev)
npm run db:push            # appliquer le schema directement (prototypage rapide)
npm run db:seed            # charger les donnees initiales
npm run db:reset           # reinitialiser la base + re-appliquer les migrations + seed
```

### Workflow production

```bash
npm run db:migrate:deploy  # appliquer les migrations en production (non-interactif)
```

### Migration baseline

La migration `0_init` contient le schema complet initial. Pour une base existante (pre-v0.5.0), marquer cette migration comme deja appliquee :

```bash
npx prisma migrate resolve --applied 0_init
```

### Ajouter une migration

1. Modifier `prisma/schema.prisma`
2. Lancer `npm run db:migrate` — Prisma genere le SQL et l'applique
3. Committer le dossier `prisma/migrations/` avec le code
