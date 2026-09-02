# Base de données

MariaDB 10.11 via Docker. ORM Prisma avec connecteur MySQL.
Tous les IDs sont des `String @default(cuid())`.

## Schéma relationnel

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

## Modèles

### NextAuth (gestion automatique)

| Table | Description |
|---|---|
| `accounts` | Comptes OAuth liés à un utilisateur (Google) |
| `sessions` | Sessions actives |
| `verification_tokens` | Tokens de vérification email |

### Domaine

#### `churches`

Tenant principal. Chaque église est un espace isolé.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `name` | String | Nom de l'église |
| `slug` | String (unique) | Identifiant URL |
| `createdAt` | DateTime | Date de création |
| `updatedAt` | DateTime | Dernière modification |

> `slug` sert aussi d'**identifiant public de partage** pour le module audio (spec 036) : une
> église le communique hors application à une autre pour que celle-ci ouvre sa bibliothèque
> publiée (`audio_library_shares`, voir Module Audio). Deux relations inverses portent ce
> partage sur `churches` : `audioSharesGranted` (partages accordés, côté propriétaire) et
> `audioSharesReceived` (partages reçus, côté invitée).

#### `users`

Utilisateurs de l'application. Créés automatiquement à la première connexion Google via NextAuth.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `email` | String (unique) | Adresse email |
| `name` | String? | Nom affiché (fourni par Google) |
| `displayName` | String? | Nom d'affichage personnalisé (défini par l'utilisateur) |
| `image` | String? | URL avatar Google |
| `emailVerified` | DateTime? | Date de vérification (NextAuth) |
| `isSuperAdmin` | Boolean | Super administrateur global (default: false) |
| `hasSeenTour` | Boolean | Indique si l'utilisateur a vu la visite guidée (default: false) |
| `createdAt` | DateTime | Date de création |
| `updatedAt` | DateTime | Dernière modification |

#### `user_church_roles`

Association utilisateur-église-rôle. Un utilisateur peut avoir plusieurs rôles dans plusieurs églises.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `userId` | String | Ref vers `users` |
| `churchId` | String | Ref vers `churches` |
| `role` | Role (enum) | `SUPER_ADMIN`, `ADMIN`, `SECRETARY`, `MINISTER`, `DEPARTMENT_HEAD`, `DISCIPLE_MAKER`, `REPORTER`, `STAR` |
| `ministryId` | String? | Ref vers `ministries` (pour MINISTER) |

Contrainte unique : `[userId, churchId, role]`

#### `user_departments`

Départements assignés à un rôle utilisateur-église.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `userChurchRoleId` | String | Ref vers `user_church_roles` |
| `departmentId` | String | Ref vers `departments` |
| `isDeputy` | Boolean | `true` = responsable adjoint, `false` = responsable principal (default: false) |

Contrainte unique : `[userChurchRoleId, departmentId]`

#### `ministries`

Ministères d'une église (Accueil, Louange, Communication...).

| Champ | Type | Description |
|---|---|---|
| `name` | String | Nom du ministère |
| `churchId` | String | Ref vers `churches` |

#### `departments`

Départements d'un ministère (Choristes, Musiciens, Son...).

| Champ | Type | Description |
|---|---|---|
| `name` | String | Nom du département |
| `ministryId` | String | Ref vers `ministries` |
| `function` | String? | Fonction spéciale : `SECRETARIAT`, `COMMUNICATION`, `PRODUCTION_MEDIA`, ou valeur personnalisée (nullable) |

#### `members`

Membres d'un département (les personnes planifiées). Appelés **STAR** (Serviteur Travaillant Activement pour le Royaume).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `firstName` | String | Prénom |
| `lastName` | String | Nom |
| `email` | String? | Adresse email (optionnel) |
| `phone` | String? | Numéro de téléphone (optionnel) |
| `departmentId` | String | Ref vers `departments` |
| `createdAt` | DateTime | Date de création |

#### `member_user_links`

Liaison entre un membre (STAR) et un compte utilisateur. Permet au membre de se connecter et d'accéder à son planning personnel.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `memberId` | String (unique) | Ref vers `members` (un membre ne peut avoir qu'un seul lien) |
| `userId` | String | Ref vers `users` |
| `churchId` | String | Ref vers `churches` |
| `validatedAt` | DateTime? | Date de validation de la liaison (null = en attente) |
| `validatedById` | String? | Ref vers `users` (administrateur validateur) |

Contraintes : `memberId` unique ; `[userId, churchId]` unique (un utilisateur ne peut être lié qu'à un seul membre par église).

#### `member_link_requests`

Demandes de liaison entre un compte utilisateur et un profil membre. Soumises par l'utilisateur, validées par un administrateur.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `userId` | String | Ref vers `users` (demandeur) |
| `memberId` | String? | Ref vers `members` (membre sélectionné, nullable si inconnu) |
| `firstName` | String? | Prénom saisi manuellement (si memberId absent) |
| `lastName` | String? | Nom saisi manuellement (si memberId absent) |
| `phone` | String? | Téléphone saisi manuellement (si memberId absent) |
| `churchId` | String | Ref vers `churches` |
| `status` | MemberLinkRequestStatus | `PENDING`, `APPROVED`, `REJECTED` (default: `PENDING`) |
| `rejectReason` | String? | Motif de rejet (renseigné si `REJECTED`) |
| `departmentId` | String? | Ref vers `departments` (département sélectionné lors de l'onboarding) |
| `ministryId` | String? | Ref vers `ministries` (ministère sélectionné lors de l'onboarding) |
| `requestedRole` | String? | Rôle demandé : `DEPARTMENT_HEAD`, `DEPUTY`, `MINISTER`, `DISCIPLE_MAKER`, `REPORTER`, ou null (membre régulier) |
| `notes` | String? (Text) | Notes libres du demandeur |
| `createdAt` | DateTime | Date de soumission |
| `reviewedAt` | DateTime? | Date de traitement |
| `reviewedById` | String? | Ref vers `users` (administrateur traitant) |

#### `events`

Événements d'une église.

| Champ | Type | Description |
|---|---|---|
| `title` | String | Titre de l'événement |
| `type` | String | `CULTE`, `PRIERE`, `PARLONS_PAROLE`, `CONFERENCE` |
| `date` | DateTime | Date et heure |
| `churchId` | String | Ref vers `churches` |
| `allowAnnouncements` | Boolean | Autorise la soumission d'annonces pour cet événement (default: false) |
| `planningDeadline` | DateTime? | Date limite de modification du planning |
| `recurrenceRule` | String? | Règle de récurrence (format iCal RRULE) |
| `seriesId` | String? | ID de l'événement parent de la série |
| `isRecurrenceParent` | Boolean | Indique si cet événement est le parent d'une série |
| `trackedForDiscipleship` | Boolean | Événement suivi pour la présences discipolat (default: false) |
| `reportEnabled` | Boolean | Activation du compte-rendu pour cet événement (default: false) |
| `statsEnabled` | Boolean | Activation des stats départementales dans le CR (default: false) |

#### `event_departments`

Quels départements sont concernés par un événement.

| Champ | Type | Description |
|---|---|---|
| `eventId` | String | Ref vers `events` |
| `departmentId` | String | Ref vers `departments` |

Contrainte unique : `[eventId, departmentId]`

#### `plannings`

Statut d'un membre pour un département à un événement donné.

| Champ | Type | Description |
|---|---|---|
| `eventDepartmentId` | String | Ref vers `event_departments` |
| `memberId` | String | Ref vers `members` |
| `status` | ServiceStatus? | Statut (nullable = non renseigné) |
| `updatedAt` | DateTime | Dernière modification |

Contrainte unique : `[eventDepartmentId, memberId]`

#### `tasks`

Tâches définies par département (ex : "Animation debrief", "Accueil enfants"). Servent à structurer les responsabilités lors d'un événement.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `departmentId` | String | Ref vers `departments` |
| `name` | String | Nom de la tâche |
| `description` | String? (Text) | Description détaillée (optionnel) |
| `createdAt` | DateTime | Date de création |

Contrainte unique : `[departmentId, name]`

#### `task_assignments`

Affectation d'un membre à une tâche pour un événement donné.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `taskId` | String | Ref vers `tasks` (cascade delete) |
| `memberId` | String | Ref vers `members` |
| `eventId` | String | Ref vers `events` |
| `assignedAt` | DateTime | Date d'affectation |

Contrainte unique : `[taskId, eventId, memberId]`

#### `discipleships`

Relation de discipolat entre deux membres (disciple et faiseur de disciples). Un seul enregistrement actif par disciple par église.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `discipleId` | String | Ref vers `members` (le disciple) |
| `discipleMakerId` | String | Ref vers `members` (le faiseur de disciples courant) |
| `firstMakerId` | String | Ref vers `members` (premier faiseur de disciples — ne change jamais, sert pour la lignée) |
| `churchId` | String | Ref vers `churches` |
| `startedAt` | DateTime | Date de début de la relation (default: now) |

Contrainte unique : `[discipleId, churchId]` — un seul FD courant par disciple par église.

#### `discipleship_attendances`

Présences des membres suivis pour le discipolat lors des événements tracés (`trackedForDiscipleship = true`).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `memberId` | String | Ref vers `members` |
| `eventId` | String | Ref vers `events` |
| `present` | Boolean | Présence effective (default: true) |

Contrainte unique : `[memberId, eventId]`

#### `event_reports`

Compte-rendu d'un événement. Un seul CR par événement.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `eventId` | String (unique) | Ref vers `events` (un seul CR par événement) |
| `churchId` | String | Ref vers `churches` |
| `speaker` | String? | Nom de l'orateur |
| `messageTitle` | String? | Titre du message |
| `notes` | String? (Text) | Notes générales du CR |
| `decisions` | String? (Text) | Décisions prises lors de l'événement |
| `authorId` | String? | Ref vers `users` (auteur du CR, nullable) |
| `createdAt` | DateTime | Date de création |
| `updatedAt` | DateTime | Dernière modification |

#### `event_report_sections`

Sections d'un compte-rendu, organisées par département ou libres. Chaque section peut contenir des statistiques JSON et des notes texte.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `reportId` | String | Ref vers `event_reports` (cascade delete) |
| `departmentId` | String? | Ref vers `departments` (null = section libre) |
| `label` | String | Libellé de la section |
| `position` | Int | Ordre d'affichage (default: 0) |
| `stats` | Json? | Statistiques spécifiques au département (structure libre) |
| `notes` | String? (Text) | Notes texte de la section |

#### `announcements`

Annonces soumises par les référents des départements ou ministères.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `submittedById` | String | Ref vers `users` (soumetteur) |
| `departmentId` | String? | Ref vers `departments` (optionnel) |
| `ministryId` | String? | Ref vers `ministries` (optionnel) |
| `title` | String | Titre de l'annonce |
| `content` | String (Text) | Contenu de l'annonce |
| `eventDate` | DateTime? | Date de l'événement concerné (optionnel) |
| `isSaveTheDate` | Boolean | Calculé auto : true si `eventDate` > 21 jours |
| `isUrgent` | Boolean | Marquée comme urgente |
| `channelInterne` | Boolean | Canal de diffusion interne |
| `channelExterne` | Boolean | Canal de diffusion externe (réseaux sociaux) |
| `status` | AnnouncementStatus | Statut : `EN_ATTENTE`, `EN_COURS`, `TRAITEE`, `ANNULEE` |
| `submittedAt` | DateTime | Date de soumission |
| `updatedAt` | DateTime | Dernière modification |

Index : `[churchId, status]`

#### `announcement_events`

Table de jointure Announcement ↔ Event (événements ciblés par l'annonce).

| Champ | Type | Description |
|---|---|---|
| `announcementId` | String | Ref vers `announcements` (cascade delete) |
| `eventId` | String | Ref vers `events` |

Clé primaire composite : `[announcementId, eventId]`

#### `requests`

Modèle unifié pour toutes les demandes : annonces (DIFFUSION_INTERNE, RESEAUX_SOCIAUX, VISUEL) et demandes métier (AJOUT_EVENEMENT, MODIFICATION_EVENEMENT, ANNULATION_EVENEMENT, MODIFICATION_PLANNING, DEMANDE_ACCES).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `type` | RequestType | Type de demande (voir enum ci-dessous) |
| `status` | RequestStatus | Statut (voir enum ci-dessous) |
| `title` | String | Titre de la demande |
| `payload` | Json | Données spécifiques au type (brief, eventId, changes, etc.) |
| `submittedById` | String | Ref vers `users` (soumetteur) |
| `departmentId` | String? | Ref vers `departments` (département source) |
| `ministryId` | String? | Ref vers `ministries` (ministère source) |
| `assignedDeptId` | String? | Ref vers `departments` (département traitant, résolu via fonction) |
| `announcementId` | String? | Ref vers `announcements` (si liée à une annonce) |
| `parentRequestId` | String? | Ref vers `requests` (auto-référentiel : lie un VISUEL à son canal parent) |
| `reviewNotes` | String? (Text) | Notes du traitant |
| `reviewedById` | String? | Ref vers `users` (traitant) |
| `reviewedAt` | DateTime? | Date de traitement |
| `executedAt` | DateTime? | Date d'exécution automatique (demandes métier) |
| `executionError` | String? (Text) | Message d'erreur si exécution échouée |
| `submittedAt` | DateTime | Date de soumission |
| `updatedAt` | DateTime | Dernière modification |

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

#### Fonctions départementales (`department.function`)

Champ `String?` sur le modèle `Department` (plus un enum Prisma depuis v1.0). Valeurs conventionnelles :

```
SECRETARIAT       # Departement traitant les diffusions internes et demandes
COMMUNICATION     # Departement traitant les publications reseaux sociaux
PRODUCTION_MEDIA  # Departement traitant les demandes de visuels
CAPTATION_AUDIO   # Departement de captation audio — pilote isCaptureTeamMember/Lead (module audio)
```

Des valeurs personnalisées sont possibles. Un seul département par fonction et par église. Assigné via `PATCH /api/departments/[id]`. Constantes définies dans `src/lib/department-functions.ts`.

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

### Module Média

#### `media_events`

Galerie photos liée à un événement planning (ou autonome).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `name` | String | Nom de l'événement média |
| `date` | DateTime | Date de l'événement |
| `description` | String? (Text) | Description optionnelle |
| `status` | MediaEventStatus | Statut : `DRAFT`, `PENDING_REVIEW`, `REVIEWED`, `ARCHIVED` |
| `planningEventId` | String? (unique) | Ref vers `events` (lien optionnel au planning) |
| `createdById` | String | Ref vers `users` |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `media_photos`

Photos appartenant à un événement média.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `mediaEventId` | String | Ref vers `media_events` (cascade delete) |
| `filename` | String | Nom du fichier original |
| `mimeType` | String | Type MIME (image/jpeg, image/webp…) |
| `size` | Int | Taille en octets |
| `width` / `height` | Int? | Dimensions en pixels |
| `originalKey` | String | Clé S3 de l'original (JPEG haute résolution) |
| `thumbnailKey` | String | Clé S3 du thumbnail (WebP 400px) |
| `status` | MediaPhotoStatus | Statut de validation |
| `validatedAt` | DateTime? | Date de validation |
| `validatedBy` | String? | Identifiant du validateur (token ou user) |
| `uploadedAt` | DateTime | Date d'upload |

#### `media_projects`

Conteneur de fichiers de production (vidéos, visuels) sans lien planning.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `name` | String | Nom du projet |
| `description` | String? (Text) | Description optionnelle |
| `createdById` | String | Ref vers `users` |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `media_files`

Fichier de production (vidéo ou visuel) appartenant à un projet.

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
| `duration` | Int? | Durée en secondes (vidéos) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `media_file_versions`

Versions successives d'un fichier de production.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `fileId` | String | Ref vers `media_files` (cascade delete) |
| `versionNumber` | Int | Numéro de version (auto-incrémenté par fichier) |
| `originalKey` | String | Clé S3 du fichier |
| `thumbnailKey` | String | Clé S3 du thumbnail / première frame |
| `notes` | String? (Text) | Notes de la version |
| `createdById` | String? | Ref vers `users` |
| `createdAt` | DateTime | Date de création |

#### `media_comments`

Commentaires de révision sur un fichier, avec support des timecodes vidéo.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `fileId` | String | Ref vers `media_files` (cascade delete) |
| `type` | MediaCommentType | `GENERAL` ou `TIMECODE` |
| `content` | String (Text) | Contenu du commentaire |
| `timecode` | Int? | Position en secondes (si `TIMECODE`) |
| `parentId` | String? | Ref vers `media_comments` (réponses imbriquées) |
| `authorId` | String? | Ref vers `users` (null si commentaire externe) |
| `authorName` | String? | Nom affiché (commentaires externes) |
| `authorImage` | String? | Avatar (commentaires externes) |
| `createdAt` | DateTime | Date de création |

#### `media_share_tokens`

Tokens de partage sans authentification. Donne accès à un événement ou un projet.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `token` | String (unique) | Token aléatoire (URL-safe) |
| `type` | MediaTokenType | `GALLERY`, `MEDIA`, `VALIDATOR`, `PREVALIDATOR` |
| `label` | String? | Étiquette (ex : "Familles") |
| `mediaEventId` | String? | Ref vers `media_events` (exclusif avec `mediaProjectId`) |
| `mediaProjectId` | String? | Ref vers `media_projects` (exclusif avec `mediaEventId`) |
| `expiresAt` | DateTime? | Expiration (null = illimité) |
| `usageCount` | Int | Nombre d'utilisations (default: 0) |
| `createdById` | String | Ref vers `users` |
| `createdAt` | DateTime | Date de création |

#### `media_zip_jobs`

Jobs asynchrones de génération de ZIP pour le téléchargement groupé.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `mediaEventId` | String | Ref vers `media_events` |
| `status` | MediaJobStatus | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `zipKey` | String? | Clé S3 du ZIP généré |
| `error` | String? (Text) | Message d'erreur si échec |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `media_settings`

Paramètres globaux du module média par église (singleton par église).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String (unique) | Ref vers `churches` |
| `logoKey` | String? | Clé S3 du logo |
| `faviconKey` | String? | Clé S3 du favicon |
| `retentionDays` | Int? | Rétention en jours (null = indéfinie) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

### Enums média

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

### Module Audio

Publication des enregistrements de culte (le traitement `PROBE`/`RENDER` est asynchrone : la
table `audio_jobs` est le **seul canal** entre l'application et le worker, voir
[ADR-0007](adr/0007-worker-hors-nextjs-table-jobs.md)) et bibliothèque d'écoute ouverte à tout
membre (spec 021), servie depuis un cache disque local
([ADR-0008](adr/0008-cache-disque-renditions-audio.md)). Une église peut aussi ouvrir sa
bibliothèque publiée à une autre église de la plateforme (`audio_library_shares`, spec 036) :
octroi dirigé, sans passer par l'annuaire des églises (réservé à l'administration de la
plateforme).

#### `audio_settings`

Configuration du module par église.

| Champ | Type | Description |
|---|---|---|
| `churchId` | String (unique) | Ref vers `churches` |
| `defaultCoverKey` | String? | Pochette par défaut (clé S3) |
| `sequenceTemplate` | Json? | Noms de séquences usuels proposés au nommage |

> Le département de captation audio n'est plus une colonne dédiée ici — depuis la spec 021, il
> se pilote via `departments.function = "CAPTATION_AUDIO"` (voir `departments` ci-dessous),
> ramené dans le mécanisme commun des fonctions de département (`SECRETARIAT`, `COMMUNICATION`…).
> Migration `move_capture_department_to_function` : les données existantes sont reportées avant
> la suppression de la colonne.

#### `audio_services`

Un culte enregistré.

| Champ | Type | Description |
|---|---|---|
| `churchId` | String | Ref vers `churches` |
| `planningEventId` | String? (unique) | Rattachement facultatif à un événement planning |
| `serviceDate` | DateTime | Saisie si aucun `planningEventId` |
| `title` / `speaker` | String? | Titre et prédicateur |
| `series` | String? | Nom de la série / podcast d'origine (import Audiobookshelf, spec 022) — `null` hors série |
| `type` | String | Nomenclature `EVENT_TYPES` (`@/lib/event-types`) — recopiée depuis `Event.type` au dépôt/rattachement, saisie sinon (default: `AUTRE`) |
| `coverKey` | String? | Pochette spécifique, sinon `AudioSettings.defaultCoverKey` |
| `status` | AudioServiceStatus | `DRAFT`, `PENDING_REVIEW`, `READY`, `PUBLISHED`, `UNPUBLISHED` |
| `publishedAt` / `publishedById` | DateTime? / String? | Horodatage et auteur de la publication |
| `openCount` | Int | Nombre d'ouvertures du lien public |

#### `audio_sources`

Fichier déposé. Un seul `kind` est émis en P1 : `SEQUENCE`.

| Champ | Type | Description |
|---|---|---|
| `serviceId` | String | Ref vers `audio_services` |
| `kind` | AudioSourceKind | `SEQUENCE` (P1) ; `MIX`, `ENVELOPES`, `SOURCE` réservés |
| `channelKey` | String? | `null` pour `MIX`/`SEQUENCE` ; nom du canal pour `ENVELOPES`/`SOURCE` (P2) |
| `s3Key` | String(512) | Clé S3 — nommée d'après l'id de la source |
| `originalFilename` | String(255)? | Nom du fichier tel que déposé, affiché pendant le nommage |
| `uploadId` | String(255)? | Identifiant du multipart S3 en cours (reprise après coupure) |
| `etag` | String(255)? | ETag S3 final — base du `sourceHash` (idempotence du rendu) |
| `durationMs` / `sizeBytes` | Int? / BigInt? | Renseignés par le job `PROBE` / à l'envoi |
| `uploadStatus` | String | `PENDING` puis `DONE` |
| `purgeableAt` | DateTime? | Archive FLAC, purge manuelle (P2, réservé) |

> `sizeBytes` est un `BigInt` : il **doit** être converti avant toute sérialisation JSON
> (`toJsonSafeAudioSource`), `NextResponse.json` ne sachant pas sérialiser ce type.

#### `audio_segments`

Séquence nommée et ordonnée au sein d'un culte.

| Champ | Type | Description |
|---|---|---|
| `serviceId` | String | Ref vers `audio_services` |
| `sourceId` | String? (unique) | Ref vers `audio_sources` (P1 : toujours renseigné) |
| `order` | Int | Rang d'affichage — unique par culte |
| `kind` | AudioSegmentKind | `SEQUENCE` (publiée) ou `DISCARDED` (non diffusée) |
| `title` | String | Nom saisi (modèle ou libre) |
| `startMs` / `endMs` | Int | `0` et durée de la source en P1 (découpage en P1.5) |
| `confidence` | Float? | Confiance de la détection automatique (P2) ; `null` en P1 (placement manuel) |
| `detectedBy` | String? | `"deposit"` en P1 ; `"manual"` en P1.5 ; nom de l'algo en P2 |
| `playCount` | Int | Nombre d'écoutes |

#### `audio_renditions`

Rendu sonore normalisé d'un segment (une par segment).

| Champ | Type | Description |
|---|---|---|
| `segmentId` | String (unique) | Ref vers `audio_segments` |
| `s3Key` | String(512) | MP3 normalisé |
| `lufs` / `truePeakDb` | Float | Niveau cible (−16 LUFS) et crête vraie mesurée |
| `sourceHash` | String | Hash de l'ETag source — évite de re-rendre à l'identique |

#### `audio_jobs`

File de traitement consommée par le worker via `SELECT … FOR UPDATE SKIP LOCKED`.

| Champ | Type | Description |
|---|---|---|
| `serviceId` | String | Ref vers `audio_services` |
| `type` | AudioJobType | `PROBE`, `RENDER` (P1) ; `ALIGN`, `TRANSCRIBE` réservés |
| `status` | AudioJobStatus | `PENDING`, `RUNNING`, `DONE`, `FAILED` |
| `attempts` | Int | 3 tentatives avant `FAILED` |
| `leasedUntil` | DateTime? | Bail (30 min) — permet la reprise si le worker meurt en plein rendu |
| `payload` / `error` | Json? / Text? | Paramètres du job et message d'échec |

#### `audio_share_tokens`

| Champ | Type | Description |
|---|---|---|
| `serviceId` | String | Ref vers `audio_services` |
| `segmentId` | String? | `null` = lien vers le culte entier ; sinon lien direct vers une séquence |
| `token` | String (unique) | Utilisé par `/ecouter/[token]` |
| `revokedAt` | DateTime? | Dépublier révoque les liens déjà partagés |

#### `audio_service_templates`

Déroulés types par église et type d'événement (`sequenceNames`, `mixingProfile` réservé P2).

#### `audio_library_shares`

Octroi **dirigé** d'une église (propriétaire) à une autre (invitée) : la bibliothèque des cultes
publiés de la première devient visible dans l'espace « (re)Écouter » de la seconde (spec 036).
Geste unilatéral et volontaire — pas de hiérarchie entre églises, pas de réciprocité automatique
(ouvrir A → B ne donne aucun accès de B vers A).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `ownerChurchId` | String | Ref vers `churches` — église qui ouvre sa bibliothèque |
| `guestChurchId` | String | Ref vers `churches` — église qui reçoit l'accès en lecture |
| `createdAt` | DateTime | Date d'octroi |

Contraintes : `[ownerChurchId, guestChurchId]` unique (pas de doublon pour un même couple) ;
`onDelete: Cascade` sur les deux relations vers `churches` (supprimer l'église propriétaire ou
l'église invitée supprime le partage). Index sur `guestChurchId` — lecture chaude « qui m'a
ouvert sa bibliothèque ? », interrogée à chaque chargement de la bibliothèque d'écoute pour
calculer la liste d'églises accessibles.

> Le partage référence l'**église** (`ownerChurchId`/`guestChurchId`), jamais son `slug` : un
> renommage de l'identifiant public d'une église (voir `churches` ci-dessus) ne rompt donc aucun
> partage déjà noué. L'auteur de l'octroi n'est pas stocké dans cette table — la trace nommée
> exigée par la spec est portée par `audit_logs` (`entityType: "AudioLibraryShare"`, `churchId`
> = église propriétaire), à l'ouverture comme à la révocation.

### Enums audio

#### `AudioServiceStatus`
```
DRAFT          # Depot incomplet ou en cours
PENDING_REVIEW # Sources deposees, en attente de nommage
READY          # Nommage valide, rendu en cours
PUBLISHED      # Lien public actif
UNPUBLISHED    # Depublie — liens partages inoperants
```

> Le dépôt reste éditable (redéposer, supprimer une séquence, renommer/réordonner) dans tous
> ces statuts **sauf `PUBLISHED`** — voir `EDITABLE_SERVICE_STATUSES` dans
> `src/modules/audio/services/service.ts`. `READY` en fait partie : un rendu peut échouer (objet
> S3 absent, ffmpeg en erreur) et laisser le culte bloqué dans cet état sans jamais atteindre
> `PUBLISHED` — sans cela, aucune correction ni sortie par l'interface n'était possible.

#### `AudioSourceKind`
```
SEQUENCE  # Sequence deja mixee, deposee telle quelle (seul kind emis en P1)
MIX       # Mix stereo a decouper (P1.5, reserve)
ENVELOPES # Enveloppes d'energie par canal (P2, reserve)
SOURCE    # Multipiste FLAC archive (P2, reserve)
```

#### `AudioSegmentKind`
```
SEQUENCE  # Publiee
DISCARDED # Marquee non diffusee (repetition, temps mort)
```

#### `AudioJobType`
```
PROBE      # Duree + niveau
RENDER     # loudnorm (−16 LUFS) + reencodage MP3
ALIGN      # Detection des frontieres (P2, reserve)
TRANSCRIBE # Transcription (P3, reserve)
```

#### `AudioJobStatus`
```
PENDING # En attente de bail
RUNNING # Bail pris par un worker
DONE    # Termine
FAILED  # Echec apres 3 tentatives
```

## Seed (données initiales)

Le script `prisma/seed.ts` crée :

- **1 église** : ICC Rennes (`icc-rennes`)
- **7 ministères** avec leurs départements :
  - Accueil (Accueil, Protocole, Parking)
  - Louange (Choristes, Musiciens, Son, Vidéo/Régie)
  - Communication (Réseaux sociaux, Design, Photographie, Vidéographie)
  - Intercession (Intercession culte, Intercession permanente)
  - Enseignement (École du dimanche, Adolescents, Jeunes adultes)
  - Technique (Son, Lumière, Multimédia, Streaming)
  - Service d'ordre (Sécurité, Premiers secours)
- **3-5 membres fictifs** par département
- **4 cultes hebdomadaires** + **1 soirée de prière**
- **Tous les départements** liés au premier événement

## Migrations

Depuis v0.5.0, le projet utilise **Prisma Migrate** pour gérer les évolutions du schéma.

### Workflow développement

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

La migration `0_init` contient le schéma complet initial. Pour une base existante (pré-v0.5.0), marquer cette migration comme déjà appliquée :

```bash
npx prisma migrate resolve --applied 0_init
```

### Ajouter une migration

1. Modifier `prisma/schema.prisma`
2. Lancer `npm run db:migrate` — Prisma génère le SQL et l'applique
3. Committer le dossier `prisma/migrations/` avec le code

### Règle : ne jamais toucher à `_prisma_migrations`

`_prisma_migrations` (**un seul** underscore) est la table interne où Prisma tient l'historique
des migrations appliquées. Aucune migration ne doit la créer, la modifier ni la supprimer :
Prisma la gère seul, avant et après chaque migration.

Une migration écrite à la main a un jour créé une table `__prisma_migrations` (**deux**
underscores) — un decoy sans aucun lien avec Prisma, qu'une migration ultérieure a ensuite
supprimé. Inoffensif en pratique, mais suffisamment ressemblant pour faire croire à une
corruption de l'historique. Les deux lignes ont été retirées (issue #499).

Pour vérifier qu'un historique se rejoue proprement sans toucher à la base de dev, déployer sur
une base jetable :

```bash
docker exec koinonia-db-1 mariadb -uroot -proot -e "CREATE DATABASE koinonia_check;"
# puis un prisma.config.ts temporaire pointant sur koinonia_check
npx prisma migrate deploy --config <config-temporaire>
```
