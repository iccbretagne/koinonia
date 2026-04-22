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
│     │                       │        │           ▲                   │
│     │                       │        ├──► member_user_links          │
│     │                       │        ├──► member_link_requests       │
│     │                       │        ├──► discipleships              │
│     │                       │        └──► discipleship_attendances   │
│     │                       ├──► tasks ──► task_assignments          │
│     │                       └──► event_report_sections               │
│     │                                    ▲                           │
│     ├──► events ──► event_departments ───► plannings                │
│     │        │           │                                           │
│     │        │           └──► task_assignments                       │
│     │        ├──► announcement_events ◄── announcements             │
│     │        ├──► discipleship_attendances                          │
│     │        └──► event_reports ──► event_report_sections           │
│     │                                          │                     │
│     ├──► announcements ──► requests ───────────┘                    │
│     ├──► requests                                                    │
│     ├──► member_user_links                                           │
│     ├──► member_link_requests                                        │
│     ├──► discipleships                                               │
│     └──► event_reports                                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                         Module Média                                 │
│                                                                      │
│  churches ──► media_events ──► media_photos                         │
│          │         │                                                 │
│          │         └──► media_share_tokens                          │
│          │                                                           │
│          ├──► media_projects ──► media_files ──► media_file_versions│
│          │              │             │                              │
│          │              │             ├──► media_comments           │
│          │              └──► media_share_tokens                     │
│          │                                                           │
│          ├──► media_zip_jobs                                         │
│          └──► media_settings                                         │
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
| `name` | String? | Nom affiche (fourni par Google) |
| `displayName` | String? | Nom d'affichage personnalise (defini par l'utilisateur) |
| `image` | String? | URL avatar Google |
| `emailVerified` | DateTime? | Date de verification (NextAuth) |
| `isSuperAdmin` | Boolean | Super administrateur global (default: false) |
| `hasSeenTour` | Boolean | Indique si l'utilisateur a vu la visite guidee (default: false) |
| `createdAt` | DateTime | Date de creation |
| `updatedAt` | DateTime | Derniere modification |

#### `user_church_roles`

Association utilisateur-eglise-role. Un utilisateur peut avoir plusieurs roles dans plusieurs eglises.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `userId` | String | Ref vers `users` |
| `churchId` | String | Ref vers `churches` |
| `role` | Role (enum) | `SUPER_ADMIN`, `ADMIN`, `SECRETARY`, `MINISTER`, `DEPARTMENT_HEAD`, `DISCIPLE_MAKER`, `REPORTER`, `STAR` |
| `ministryId` | String? | Ref vers `ministries` (pour MINISTER) |

Contrainte unique : `[userId, churchId, role]`

#### `user_departments`

Departements assignes a un role utilisateur-eglise.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `userChurchRoleId` | String | Ref vers `user_church_roles` |
| `departmentId` | String | Ref vers `departments` |
| `isDeputy` | Boolean | `true` = responsable adjoint, `false` = responsable principal (default: false) |

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
| `function` | String? | Fonction speciale : `SECRETARIAT`, `COMMUNICATION`, `PRODUCTION_MEDIA`, ou valeur personnalisee (nullable) |

#### `members`

Membres d'un departement (les personnes planifiees). Appeles **STAR** (Serviteur Travaillant Activement pour le Royaume).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `firstName` | String | Prenom |
| `lastName` | String | Nom |
| `email` | String? | Adresse email (optionnel) |
| `phone` | String? | Numero de telephone (optionnel) |
| `departmentId` | String | Ref vers `departments` |
| `createdAt` | DateTime | Date de creation |

#### `member_user_links`

Liaison entre un membre (STAR) et un compte utilisateur. Permet au membre de se connecter et d'acceder a son planning personnel.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `memberId` | String (unique) | Ref vers `members` (un membre ne peut avoir qu'un seul lien) |
| `userId` | String | Ref vers `users` |
| `churchId` | String | Ref vers `churches` |
| `validatedAt` | DateTime? | Date de validation de la liaison (null = en attente) |
| `validatedById` | String? | Ref vers `users` (administrateur validateur) |

Contraintes : `memberId` unique ; `[userId, churchId]` unique (un utilisateur ne peut etre lie qu'a un seul membre par eglise).

#### `member_link_requests`

Demandes de liaison entre un compte utilisateur et un profil membre. Soumises par l'utilisateur, validees par un administrateur.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `userId` | String | Ref vers `users` (demandeur) |
| `memberId` | String? | Ref vers `members` (membre selectionne, nullable si inconnu) |
| `firstName` | String? | Prenom saisi manuellement (si memberId absent) |
| `lastName` | String? | Nom saisi manuellement (si memberId absent) |
| `phone` | String? | Telephone saisi manuellement (si memberId absent) |
| `churchId` | String | Ref vers `churches` |
| `status` | MemberLinkRequestStatus | `PENDING`, `APPROVED`, `REJECTED` (default: `PENDING`) |
| `rejectReason` | String? | Motif de rejet (renseigné si `REJECTED`) |
| `departmentId` | String? | Ref vers `departments` (departement selectionne lors de l'onboarding) |
| `ministryId` | String? | Ref vers `ministries` (ministere selectionne lors de l'onboarding) |
| `requestedRole` | String? | Role demande : `DEPARTMENT_HEAD`, `DEPUTY`, `MINISTER`, `DISCIPLE_MAKER`, `REPORTER`, ou null (membre regulier) |
| `notes` | String? (Text) | Notes libres du demandeur |
| `createdAt` | DateTime | Date de soumission |
| `reviewedAt` | DateTime? | Date de traitement |
| `reviewedById` | String? | Ref vers `users` (administrateur traitant) |

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
| `trackedForDiscipleship` | Boolean | Evenement suivi pour la presences discipolat (default: false) |
| `reportEnabled` | Boolean | Activation du compte-rendu pour cet evenement (default: false) |
| `statsEnabled` | Boolean | Activation des stats departementales dans le CR (default: false) |

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

#### `tasks`

Taches definies par departement (ex : "Animation debrief", "Accueil enfants"). Servent a structurer les responsabilites lors d'un evenement.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `departmentId` | String | Ref vers `departments` |
| `name` | String | Nom de la tache |
| `description` | String? (Text) | Description detaillee (optionnel) |
| `createdAt` | DateTime | Date de creation |

Contrainte unique : `[departmentId, name]`

#### `task_assignments`

Affectation d'un membre a une tache pour un evenement donne.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `taskId` | String | Ref vers `tasks` (cascade delete) |
| `memberId` | String | Ref vers `members` |
| `eventId` | String | Ref vers `events` |
| `assignedAt` | DateTime | Date d'affectation |

Contrainte unique : `[taskId, eventId, memberId]`

#### `discipleships`

Relation de discipolat entre deux membres (disciple et faiseur de disciples). Un seul enregistrement actif par disciple par eglise.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `discipleId` | String | Ref vers `members` (le disciple) |
| `discipleMakerId` | String | Ref vers `members` (le faiseur de disciples courant) |
| `firstMakerId` | String | Ref vers `members` (premier faiseur de disciples — ne change jamais, sert pour la lignee) |
| `churchId` | String | Ref vers `churches` |
| `startedAt` | DateTime | Date de debut de la relation (default: now) |

Contrainte unique : `[discipleId, churchId]` — un seul FD courant par disciple par eglise.

#### `discipleship_attendances`

Presences des membres suivis pour le discipolat lors des evenements traces (`trackedForDiscipleship = true`).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `memberId` | String | Ref vers `members` |
| `eventId` | String | Ref vers `events` |
| `present` | Boolean | Presence effective (default: true) |

Contrainte unique : `[memberId, eventId]`

#### `event_reports`

Compte-rendu d'un evenement. Un seul CR par evenement.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `eventId` | String (unique) | Ref vers `events` (un seul CR par evenement) |
| `churchId` | String | Ref vers `churches` |
| `speaker` | String? | Nom de l'orateur |
| `messageTitle` | String? | Titre du message |
| `notes` | String? (Text) | Notes generales du CR |
| `decisions` | String? (Text) | Decisions prises lors de l'evenement |
| `authorId` | String? | Ref vers `users` (auteur du CR, nullable) |
| `createdAt` | DateTime | Date de creation |
| `updatedAt` | DateTime | Derniere modification |

#### `event_report_sections`

Sections d'un compte-rendu, organisees par departement ou libres. Chaque section peut contenir des statistiques JSON et des notes texte.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `reportId` | String | Ref vers `event_reports` (cascade delete) |
| `departmentId` | String? | Ref vers `departments` (null = section libre) |
| `label` | String | Libelle de la section |
| `position` | Int | Ordre d'affichage (default: 0) |
| `stats` | Json? | Statistiques specifiques au departement (structure libre) |
| `notes` | String? (Text) | Notes texte de la section |

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

#### `requests`

Modele unifie pour toutes les demandes : annonces (DIFFUSION_INTERNE, RESEAUX_SOCIAUX, VISUEL) et demandes metier (AJOUT_EVENEMENT, MODIFICATION_EVENEMENT, ANNULATION_EVENEMENT, MODIFICATION_PLANNING, DEMANDE_ACCES).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `type` | RequestType | Type de demande (voir enum ci-dessous) |
| `status` | RequestStatus | Statut (voir enum ci-dessous) |
| `title` | String | Titre de la demande |
| `payload` | Json | Donnees specifiques au type (brief, eventId, changes, etc.) |
| `submittedById` | String | Ref vers `users` (soumetteur) |
| `departmentId` | String? | Ref vers `departments` (departement source) |
| `ministryId` | String? | Ref vers `ministries` (ministere source) |
| `assignedDeptId` | String? | Ref vers `departments` (departement traitant, resolu via fonction) |
| `announcementId` | String? | Ref vers `announcements` (si liee a une annonce) |
| `parentRequestId` | String? | Ref vers `requests` (auto-referentiel : lie un VISUEL a son canal parent) |
| `reviewNotes` | String? (Text) | Notes du traitant |
| `reviewedById` | String? | Ref vers `users` (traitant) |
| `reviewedAt` | DateTime? | Date de traitement |
| `executedAt` | DateTime? | Date d'execution automatique (demandes metier) |
| `executionError` | String? (Text) | Message d'erreur si execution echouee |
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
DISCIPLE_MAKER   # Faiseur de disciples (acces aux fonctionnalites de discipolat)
REPORTER         # Rapporteur (acces a la saisie des comptes-rendus)
STAR             # Membre actif (acces uniquement a son planning personnel via MemberUserLink)
```

#### `ServiceStatus`

```
EN_SERVICE          # Present et en service
EN_SERVICE_DEBRIEF  # En service + animateur du debrief (max 1 par dept/event)
INDISPONIBLE        # Absent
REMPLACANT          # Remplace un membre indisponible
```

#### Fonctions departementales (`department.function`)

Champ `String?` sur le modele `Department` (plus un enum Prisma depuis v1.0). Valeurs conventionnelles :

```
SECRETARIAT       # Departement traitant les diffusions internes et demandes
COMMUNICATION     # Departement traitant les publications reseaux sociaux
PRODUCTION_MEDIA  # Departement traitant les demandes de visuels
```

Des valeurs personnalisees sont possibles. Un seul departement par fonction et par eglise. Assigne via `PATCH /api/departments/[id]`. Constantes definies dans `src/lib/department-functions.ts`.

#### `MemberLinkRequestStatus`

```
PENDING   # Demande en attente de traitement
APPROVED  # Demande approuvee — lien cree
REJECTED  # Demande rejetee (motif dans rejectReason)
```

#### `AnnouncementStatus`

```
EN_ATTENTE  # Annonce soumise, en attente de traitement
EN_COURS    # En cours de traitement
TRAITEE     # Traitement termine
ANNULEE     # Annulee
```

#### `RequestType`

```
DIFFUSION_INTERNE      # Annonce : diffusion interne (Secretariat)
RESEAUX_SOCIAUX        # Annonce : publication reseaux sociaux (Communication)
VISUEL                 # Annonce : creation d'un visuel (Production Media) — enfant auto
AJOUT_EVENEMENT        # Demande : ajouter un evenement au planning
MODIFICATION_EVENEMENT # Demande : modifier un evenement existant
ANNULATION_EVENEMENT   # Demande : annuler un evenement
MODIFICATION_PLANNING  # Demande : modifier le statut d'un membre dans un planning
DEMANDE_ACCES          # Demande : attribuer un role a un utilisateur
```

#### `RequestStatus`

```
EN_ATTENTE   # Recue, en attente de traitement
EN_COURS     # Traitement en cours (annonces)
APPROUVEE    # Validee (demandes metier, avant execution)
EXECUTEE     # Execution automatique reussie
LIVRE        # Livree manuellement (annonces)
REFUSEE      # Refusee (note obligatoire)
ANNULE       # Annulee par le soumetteur ou en cascade
ERREUR       # Echec de l'execution automatique
```

### Module Media

#### `media_events`

Galerie photos liee a un evenement planning (ou autonome).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `name` | String | Nom de l'evenement media |
| `date` | DateTime | Date de l'evenement |
| `description` | String? (Text) | Description optionnelle |
| `status` | MediaEventStatus | Statut : `DRAFT`, `PENDING_REVIEW`, `REVIEWED`, `ARCHIVED` |
| `planningEventId` | String? (unique) | Ref vers `events` (lien optionnel au planning) |
| `createdById` | String | Ref vers `users` |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `media_photos`

Photos appartenant a un evenement media.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `mediaEventId` | String | Ref vers `media_events` (cascade delete) |
| `filename` | String | Nom du fichier original |
| `mimeType` | String | Type MIME (image/jpeg, image/webp…) |
| `size` | Int | Taille en octets |
| `width` / `height` | Int? | Dimensions en pixels |
| `originalKey` | String | Cle S3 de l'original (JPEG haute resolution) |
| `thumbnailKey` | String | Cle S3 du thumbnail (WebP 400px) |
| `status` | MediaPhotoStatus | Statut de validation |
| `validatedAt` | DateTime? | Date de validation |
| `validatedBy` | String? | Identifiant du validateur (token ou user) |
| `uploadedAt` | DateTime | Date d'upload |

#### `media_projects`

Conteneur de fichiers de production (videos, visuels) sans lien planning.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `name` | String | Nom du projet |
| `description` | String? (Text) | Description optionnelle |
| `createdById` | String | Ref vers `users` |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `media_files`

Fichier de production (video ou visuel) appartenant a un projet.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `mediaProjectId` | String | Ref vers `media_projects` (cascade delete) |
| `type` | MediaFileType | `VIDEO`, `VISUAL`, `PHOTO` |
| `status` | MediaFileStatus | Statut du workflow de production |
| `filename` | String | Nom du fichier |
| `mimeType` | String | Type MIME |
| `size` | Int | Taille en octets |
| `width` / `height` | Int? | Dimensions (visuels) |
| `duration` | Int? | Duree en secondes (videos) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `media_file_versions`

Versions successives d'un fichier de production.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `fileId` | String | Ref vers `media_files` (cascade delete) |
| `versionNumber` | Int | Numero de version (auto-incremente par fichier) |
| `originalKey` | String | Cle S3 du fichier |
| `thumbnailKey` | String | Cle S3 du thumbnail / premiere frame |
| `notes` | String? (Text) | Notes de la version |
| `createdById` | String? | Ref vers `users` |
| `createdAt` | DateTime | Date de creation |

#### `media_comments`

Commentaires de revision sur un fichier, avec support des timecodes video.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `fileId` | String | Ref vers `media_files` (cascade delete) |
| `type` | MediaCommentType | `GENERAL` ou `TIMECODE` |
| `content` | String (Text) | Contenu du commentaire |
| `timecode` | Int? | Position en secondes (si `TIMECODE`) |
| `parentId` | String? | Ref vers `media_comments` (reponses imbriquees) |
| `authorId` | String? | Ref vers `users` (null si commentaire externe) |
| `authorName` | String? | Nom affiche (commentaires externes) |
| `authorImage` | String? | Avatar (commentaires externes) |
| `createdAt` | DateTime | Date de creation |

#### `media_share_tokens`

Tokens de partage sans authentification. Donne acces a un evenement ou un projet.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `token` | String (unique) | Token aleatoire (URL-safe) |
| `type` | MediaTokenType | `GALLERY`, `MEDIA`, `VALIDATOR`, `PREVALIDATOR` |
| `label` | String? | Etiquette (ex : "Familles") |
| `mediaEventId` | String? | Ref vers `media_events` (exclusif avec `mediaProjectId`) |
| `mediaProjectId` | String? | Ref vers `media_projects` (exclusif avec `mediaEventId`) |
| `expiresAt` | DateTime? | Expiration (null = illimite) |
| `usageCount` | Int | Nombre d'utilisations (default: 0) |
| `createdById` | String | Ref vers `users` |
| `createdAt` | DateTime | Date de creation |

#### `media_zip_jobs`

Jobs asynchrones de generation de ZIP pour le telechargement groupe.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `mediaEventId` | String | Ref vers `media_events` |
| `status` | MediaJobStatus | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `zipKey` | String? | Cle S3 du ZIP genere |
| `error` | String? (Text) | Message d'erreur si echec |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `media_settings`

Parametres globaux du module media par eglise (singleton par eglise).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String (unique) | Ref vers `churches` |
| `logoKey` | String? | Cle S3 du logo |
| `faviconKey` | String? | Cle S3 du favicon |
| `retentionDays` | Int? | Retention en jours (null = indefinie) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

### Enums media

#### `MediaEventStatus`
```
DRAFT          # Brouillon — en cours d'alimentation
PENDING_REVIEW # En revision — soumis aux validateurs
REVIEWED       # Valide
ARCHIVED       # Archive
```

#### `MediaPhotoStatus`
```
PENDING      # En attente de validation
APPROVED     # Approuvee
REJECTED     # Rejetee
PREVALIDATED # Pre-validee (par un PREVALIDATOR)
PREREJECTED  # Pre-rejetee (par un PREVALIDATOR)
```

#### `MediaFileType`
```
VIDEO   # Fichier video (MP4, MOV, WebM)
VISUAL  # Visuel statique (JPEG, PNG, WebP, SVG, PDF)
PHOTO   # Photo (usage galerie)
```

#### `MediaFileStatus`
```
DRAFT              # Brouillon — upload en cours ou non soumis
IN_REVIEW          # En cours de revision
REVISION_REQUESTED # Revision demandee par le reviseur
FINAL_APPROVED     # Valide final
REJECTED           # Rejete
PENDING            # En attente (intermediaire)
APPROVED           # Approuve (intermediaire)
PREVALIDATED       # Pre-valide
PREREJECTED        # Pre-rejete
```

#### `MediaCommentType`
```
GENERAL   # Commentaire general sur le fichier
TIMECODE  # Commentaire ancre a une position temporelle
```

#### `MediaTokenType`
```
GALLERY      # Galerie lecture seule (/media/g/[token])
MEDIA        # Telechargement photos approuvees (/media/d/[token])
VALIDATOR    # Validation/rejet des photos (/media/v/[token])
PREVALIDATOR # Pre-validation sans approbation finale (/media/v/[token])
```

#### `MediaJobStatus`
```
PENDING    # En attente de traitement
PROCESSING # En cours de generation
COMPLETED  # ZIP genere et disponible
FAILED     # Echec de generation
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
