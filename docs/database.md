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
│     ├──► events ──► event_departments ───► plannings                │
│     │        │                                                       │
│     │        └──► announcement_events ◄── announcements             │
│     │                                          │                     │
│     ├──► announcements ──► service_requests ───┘                    │
│     └──► service_requests                                            │
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
| `function` | DepartmentFunction? | Fonction speciale : `SECRETARIAT`, `COMMUNICATION`, `PRODUCTION_MEDIA` (nullable) |

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
| `allowAnnouncements` | Boolean | Autorise la soumission d'annonces pour cet evenement (default: false) |
| `planningDeadline` | DateTime? | Date limite de modification du planning |
| `recurrenceRule` | String? | Regle de recurrence (format iCal RRULE) |
| `seriesId` | String? | ID de l'evenement parent de la serie |
| `isRecurrenceParent` | Boolean | Indique si cet evenement est le parent d'une serie |

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

#### `announcements`

Annonces soumises par les referents des departements ou ministeres.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `submittedById` | String | Ref vers `users` (soumetteur) |
| `departmentId` | String? | Ref vers `departments` (optionnel) |
| `ministryId` | String? | Ref vers `ministries` (optionnel) |
| `title` | String | Titre de l'annonce |
| `content` | String (Text) | Contenu de l'annonce |
| `eventDate` | DateTime? | Date de l'evenement concerne (optionnel) |
| `isSaveTheDate` | Boolean | Calcule auto : true si `eventDate` > 21 jours |
| `isUrgent` | Boolean | Marquee comme urgente |
| `channelInterne` | Boolean | Canal de diffusion interne |
| `channelExterne` | Boolean | Canal de diffusion externe (reseaux sociaux) |
| `status` | AnnouncementStatus | Statut : `EN_ATTENTE`, `EN_COURS`, `TRAITEE`, `ANNULEE` |
| `submittedAt` | DateTime | Date de soumission |
| `updatedAt` | DateTime | Derniere modification |

Index : `[churchId, status]`

#### `announcement_events`

Table de jointure Announcement ↔ Event (evenements cibles par l'annonce).

| Champ | Type | Description |
|---|---|---|
| `announcementId` | String | Ref vers `announcements` (cascade delete) |
| `eventId` | String | Ref vers `events` |

Cle primaire composite : `[announcementId, eventId]`

#### `service_requests`

Demandes de service generees automatiquement lors de la soumission d'une annonce, ou creees manuellement (visuels standalone).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `type` | ServiceRequestType | `VISUEL`, `DIFFUSION_INTERNE`, `RESEAUX_SOCIAUX` |
| `submittedById` | String | Ref vers `users` (soumetteur) |
| `departmentId` | String? | Departement soumetteur (optionnel) |
| `ministryId` | String? | Ministere soumetteur (optionnel) |
| `assignedDeptId` | String? | Departement traitant (resolu via `DepartmentFunction`) |
| `announcementId` | String? | Ref vers `announcements` (si generee depuis une annonce) |
| `parentRequestId` | String? | Ref vers `service_requests` (auto-referentiel : lie un VISUEL a son canal parent) |
| `title` | String | Titre |
| `brief` | String? (Text) | Description / brief |
| `format` | String? | Format attendu (ex: Slide/Affiche, Story/Post) |
| `deadline` | DateTime? | Echeance |
| `status` | ServiceRequestStatus | `EN_ATTENTE`, `EN_COURS`, `LIVRE`, `ANNULE` |
| `deliveryLink` | String? | Lien de livraison |
| `reviewNotes` | String? | Notes de revue |
| `reviewedById` | String? | Ref vers `users` (revieweur) |
| `reviewedAt` | DateTime? | Date de revue |
| `submittedAt` | DateTime | Date de soumission |
| `updatedAt` | DateTime | Derniere modification |

Index : `[churchId, type, status]`, `[assignedDeptId, status]`

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

#### `DepartmentFunction`

```
SECRETARIAT       # Departement traitant les diffusions internes
COMMUNICATION     # Departement traitant les publications reseaux sociaux
PRODUCTION_MEDIA  # Departement traitant les demandes de visuels
```

Un seul departement par fonction et par eglise. Assigne via `PATCH /api/departments/[id]`.

#### `AnnouncementStatus`

```
EN_ATTENTE  # Annonce soumise, en attente de traitement
EN_COURS    # En cours de traitement
TRAITEE     # Traitement termine
ANNULEE     # Annulee
```

#### `ServiceRequestType`

```
VISUEL             # Creation d'un visuel (Production Media)
DIFFUSION_INTERNE  # Diffusion interne (Secretariat)
RESEAUX_SOCIAUX    # Publication reseaux sociaux (Communication)
```

#### `ServiceRequestStatus`

```
EN_ATTENTE  # Demande recue, en attente
EN_COURS    # En cours de traitement
LIVRE       # Livre (avec lien de livraison)
ANNULE      # Annulee
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
