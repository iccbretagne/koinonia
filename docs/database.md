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
| `createdAt` | DateTime | Date de création |

Départements d'appartenance : `member_departments` (un ou plusieurs, dont un principal).

#### `member_user_links`

Liaison entre un membre (STAR) et un compte utilisateur. Permet au membre de se connecter et d'accéder à son planning personnel.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `memberId` | String (unique) | Ref vers `members` (un membre ne peut avoir qu'un seul lien, cascade delete) |
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
| `assignedDeptId` | String? | **Obsolète (spec 046)** — n'est plus renseigné à la création ; conservé pour compatibilité historique. Le destinataire d'une demande se déduit désormais de son `type` via `functionForRequestType` (`src/lib/department-functions.ts`), puis des départements portant actuellement cette fonction (`getFunctionDepartmentsMap`) — une demande suit la fonction, pas un département résolu une fois pour toutes |
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

#### `team_events`

Rendez-vous internes à un département (répétition, réunion, formation), distincts des
événements d'église : ni planning de service, ni compte rendu, ni audio/médias/salles (spec 044,
issue #522).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `departmentId` | String | Ref vers `departments` (`onDelete: Cascade`) |
| `title` | String | Titre |
| `startsAt` | DateTime | Début |
| `endsAt` | DateTime | Fin |
| `location` | String? | Lieu (optionnel) |
| `description` | String? (Text) | Description (optionnel) |
| `recurrenceRule` | String? | `"weekly"` \| `"biweekly"` \| `"monthly"` — mêmes valeurs que `events.recurrenceRule` |
| `seriesId` | String? | Id de la première occurrence de la série ; toutes les occurrences (la première comprise) partagent ce `seriesId` — schéma « plat », distinct du couple `seriesId`/`isRecurrenceParent` de `events` |
| `createdById` | String | Ref vers `users` |
| `createdAt` | DateTime | Date de création |
| `updatedAt` | DateTime | Dernière modification |

Index : `[churchId]`, `[departmentId, startsAt]`, `[seriesId]`

> Visibilité : gérée par `planning:department`/`planning:edit` + `requireDepartmentAccess`
> (aucune permission propre). Visible en lecture seule par les membres du département dans leur
> agenda personnel via un périmètre d'**appartenance** distinct du périmètre de responsabilité
> ci-dessus — voir [ADR-0013](adr/0013-perimetre-appartenance-lecture-seule.md).

#### `absences`

Indisponibilité déclarée par ou pour un STAR, sur deux axes de ciblage indépendants (spec 050,
issue #557) : **quand** (`kind`) et **pour quels départements** (`allDepartments`). Les valeurs
par défaut (`kind: PERIOD`, `allDepartments: true`) reproduisent le comportement d'avant la
spec 050 — aucune migration de données n'a été nécessaire.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `memberId` | String | Ref vers `members` (STAR concerné, cascade delete) |
| `churchId` | String | Ref vers `churches` |
| `kind` | `AbsenceKind` | `PERIOD` (période) ou `EVENTS` (liste d'événements précis) |
| `startDate` / `endDate` | DateTime? | Renseignés ssi `kind = PERIOD`, nuls ssi `kind = EVENTS` |
| `allDepartments` | Boolean | `true` = tous les départements actuels du STAR (y compris ceux rejoints après coup, calculé à la lecture) ; `false` = ciblage explicite via `targetDepartments` |
| `reason` | String? (Text) | Motif (optionnel) |
| `status` | `AbsenceStatus` | `ACTIVE` \| `CANCELLED` |
| `createdById` / `cancelledById` | String / String? | Ref vers `users` |
| `createdAt` / `updatedAt` / `cancelledAt` | DateTime | Horodatages |

Relations : `backups` (`AbsenceBackup[]`), `targetDepartments` (`AbsenceDepartment[]`),
`targetEvents` (`AbsenceEvent[]`).

La couverture effective (« cette absence s'applique-t-elle à ce département/cet événement ? »)
n'est jamais dénormalisée : elle se calcule à la lecture via `absenceCovers`/`absenceCoverageWhere`
(`src/modules/planning/services/absence-targeting.ts`), seule source de vérité utilisée par le
badge de planning, la détection de conflits, l'avertissement d'ouverture/fermeture, la visibilité
et l'export. Un événement déplacé ou un STAR qui change de département sont donc reflétés sans
écriture supplémentaire.

#### `absence_departments`

Départements explicitement visés par une absence ciblée (`allDepartments = false`).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `absenceId` | String | Ref vers `absences` (`onDelete: Cascade`) |
| `departmentId` | String | Ref vers `departments` (`onDelete: Cascade`) |

Contrainte unique : `[absenceId, departmentId]`.

#### `absence_events`

Événements précis visés par une absence ciblée (`kind = EVENTS`).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `absenceId` | String | Ref vers `absences` (`onDelete: Cascade`) |
| `eventId` | String? | Ref vers `events` (`onDelete: SetNull`) — `NULL` si l'événement a été supprimé |
| `eventTitle` | String | Instantané du titre au moment du ciblage |
| `eventDate` | DateTime | Instantané de la date au moment du ciblage |

L'instantané (`eventTitle`/`eventDate`) sert uniquement à afficher « événement supprimé » dans
l'historique quand `eventId` est `NULL` — jamais à calculer un effet sur le planning : tant que
l'événement existe, sa date est relue en direct sur `events.date` (l'absence suit l'événement
s'il est déplacé). Contrainte unique : `[absenceId, eventId]`.

> **Visibilité** (spec 050) : un responsable de département/ministre ne voit une absence ciblée
> que si l'un de ses départements est concerné (`absenceVisibilityWhere`) — une absence ciblée
> uniquement sur des départements hors de son périmètre lui est invisible, y compris s'il gérait
> le STAR par ailleurs.

#### `absence_backups`

Inchangé par la spec 050 — voir le modèle `AbsenceBackup` du schéma pour le détail des deux
types (`STAR` / `RESPONSIBLE`).

#### Disponibilités (spec 058, ADR-0020)

La disponibilité d'un STAR est **dérivée**, jamais stockée comme statut de planning. Ordre de
précédence, pour un événement et un département : réponse explicite > période d'indisponibilité
active (`absences` de type `PERIOD`) > « Sans réponse » si la disponibilité a été demandée (en
retard après l'échéance : compte comme indisponible) > « Non demandée ».

| Table | Rôle | Clés |
|---|---|---|
| `availability_settings` | Réglage par église : `enabled` (défaut `true`), `openMonthsBefore` (2), `closeDaysBefore` (7), `relanceDaysBefore` (3), `planningNoticeDelayMinutes` (15, de 5 à 120 : délai avant l'envoi des changements de planning, spec 060). Aucune ligne = valeurs par défaut | `churchId` unique |
| `availability_collections` | Collecte commune d'un mois : `openedAt`, `closesAt` (figée à l'ouverture), `notifiedAt`, `relanceSentAt` | unique `[churchId, month]` |
| `availability_responses` | Réponse `AVAILABLE` / `IF_NEEDED` / `UNAVAILABLE` d'un STAR pour un événement et un département ; `enteredById` renseigné si saisie par un tiers | unique `[memberId, eventId, departmentId]` |
| `availability_asks` | Demande ciblée (`EVENT_ADDED`, `EVENT_MOVED`, `LEADER`) : `dueAt`, `notifiedAt`, `relanceSentAt`, `manualRelanceAt` | unique `[eventId, departmentId]` |
| `availability_reminder_logs` | Garde-fou : une seule relance par STAR, événement et jour | unique `[memberId, eventId, sentOn]` |
| `planning_change_notices` | Changement de planning en attente de notification regroupée (spec 060) : `previousStatus` (statut d'avant la première modification de la fenêtre, `null` = absent) et `lastChangedAt` (alignée sur toutes les lignes du STAR). Supprimée à l'envoi. **Sans relations** : survit au retrait d'un département, ne bloque aucune suppression de structure ; une ligne orpheline est écartée à l'envoi | unique `[memberId, eventId, departmentId]` |
| `service_withdrawals` | Désistement d'un STAR sur un service (spec 061) : le STAR est retiré du planning à la création, `originalStatus` garde le statut repris par le remplaçant (ou restauré à l'annulation) ; `status` `PENDING` (à remplacer) / `REPLACED` / `CANCELLED` / `CLOSED`, `message`, `replacementMemberId`, `relanceSentAt` (relance unique 48 h avant), `absenceId` (période d'absence à l'origine du désistement, spec 062 — `SET NULL` à la suppression de l'absence). Cascade sur l'événement, le département et le membre désisté | index `[eventId, departmentId, status]`, `[memberId, status]`, `[churchId, status]`, `[absenceId, status]` |

**Reprise (migration `add_availability_collection`)** : les absences `EVENTS` actives deviennent
des réponses `UNAVAILABLE` (puis sont supprimées) et les plannings `INDISPONIBLE` deviennent des
réponses `UNAVAILABLE` sans auteur (puis sont supprimés). `ServiceStatus.INDISPONIBLE` et
`AbsenceKind.EVENTS` restent dans les enums pour l'historique, mais ne sont plus écrits ni créés.

#### `member_departments`

Rattachement d'une fiche STAR à un département (appartenance). Un membre peut appartenir à plusieurs départements, dont un seul est marqué principal. Cette chaîne d'appartenance est distincte du périmètre de responsabilité (`user_departments`, voir ADR-0009 et ADR-0013).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `memberId` | String | Ref vers `members` (cascade delete) |
| `departmentId` | String | Ref vers `departments` |
| `isPrimary` | Boolean | Département principal du membre (défaut `false`) |

Unicité : `[memberId, departmentId]`

#### `department_notices`

Consigne rédigée par un département pour un événement donné (texte libre). Une seule consigne par couple département × événement.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `departmentId` | String | Ref vers `departments` (cascade delete) |
| `eventId` | String | Ref vers `events` (cascade delete) |
| `content` | String (Text) | Contenu de la consigne |
| `authorId` | String | Ref vers `users` (auteur) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[eventId]` ; unicité : `[departmentId, eventId]`

#### `welcome_duty_families`

Famille inscrite dans le pool de rotation du service d'accueil (module service d'accueil). `familyId` est l'identifiant de la famille dans l'application externe `familles.iccrennes.fr`.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `familyId` | Int | Identifiant de la famille dans `familles.iccrennes.fr` |
| `familyName` | String (VarChar 100) | Nom de la famille |
| `active` | Boolean | Famille active dans la rotation (défaut `true`) |
| `createdAt` | DateTime | Date de création |

Index : `[churchId]` ; unicité : `[churchId, familyId]`

#### `welcome_duty_assignments`

Affectation d'une famille du pool au service d'accueil d'un événement. Une famille ne peut être affectée qu'une fois à un même événement.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `eventId` | String | Ref vers `events` (cascade delete) |
| `welcomeDutyFamilyId` | String | Ref vers `welcome_duty_families` (cascade delete) |
| `note` | String? (VarChar 500) | Note libre |
| `createdAt` | DateTime | Date de création |

Index : `[churchId]` ; unicité : `[eventId, welcomeDutyFamilyId]`

#### `opening_closing_assignments`

Affectation d'un membre au service d'ouverture ou de fermeture de l'église pour un événement (spec 041).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `eventId` | String | Ref vers `events` (cascade delete) |
| `slot` | `DutySlot` | `OPENING` \| `CLOSING` |
| `memberId` | String | Ref vers `members` (cascade delete) |
| `note` | String? (VarChar 500) | Note libre |
| `createdById` | String | Ref vers `users` (auteur de l'affectation) |
| `createdAt` | DateTime | Date de création |

Index : `[churchId]`, `[memberId]` ; unicité : `[eventId, slot, memberId]`

#### `announcement_sheets`

Feuille d'annonces d'un culte (spec 040) : une seule par événement, remplacée à chaque dépôt (le fichier S3 précédent est supprimé, pas d'historique versionné). Types acceptés : PDF ou docx, 20 Mo maximum.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `eventId` | String | Ref vers `events` (cascade delete), unique |
| `key` | String | Clé de l'objet dans le stockage S3 |
| `filename` | String | Nom du fichier d'origine |
| `mimeType` | String | Type MIME |
| `uploadedById` | String | Ref vers `users` |
| `uploadedAt` | DateTime | Date de dépôt |

Index : `[churchId]` ; unicité : `[eventId]`

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
INDISPONIBLE        # Historique : n'est plus écrit (spec 058) — voir « Disponibilités »
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

#### `AbsenceKind`

```
PERIOD  # Absence sur une plage de dates (defaut, retro-compatible)
EVENTS  # Historique : plus créé (spec 058), repris en réponses de disponibilité
```

#### `AbsenceBackupType`

Type de remplaçant/relais désigné sur une absence (`absence_backups.type`).

| Valeur | Description |
|---|---|
| `STAR` | Le relais est un STAR (`memberId` renseigné) |
| `RESPONSIBLE` | Le relais est un responsable (`userChurchRoleId` renseigné) |

#### `AvailabilityAnswer`

Réponse de disponibilité d'un membre pour un événement et un département (`availability_responses.answer`, spec 058, ADR-0020).

| Valeur | Description |
|---|---|
| `AVAILABLE` | Disponible |
| `IF_NEEDED` | Disponible en cas de besoin |
| `UNAVAILABLE` | Indisponible |

#### `AvailabilityAskReason`

Motif d'une demande de disponibilité ciblée (`availability_asks.reason`, spec 058).

| Valeur | Description |
|---|---|
| `EVENT_ADDED` | Un événement a été ajouté |
| `EVENT_MOVED` | Un événement a été déplacé |
| `LEADER` | Demande émise à l'initiative d'un responsable |

#### `ServiceWithdrawalStatus`

État d'un désistement d'un STAR sur un service (`service_withdrawals.status`, spec 061).

| Valeur | Description |
|---|---|
| `PENDING` | Désistement ouvert, en attente de remplacement (valeur par défaut) |
| `REPLACED` | Un remplaçant a repris le service |
| `CANCELLED` | Désistement annulé (statut d'origine restauré) |
| `CLOSED` | « Ne pas remplacer » : le service n'est plus à remplacer, le STAR désisté en est informé |

#### `DutySlot`

| Valeur | Description |
|---|---|
| `OPENING` | Service d'ouverture de l'église |
| `CLOSING` | Service de fermeture de l'église |

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
| `mediaFileId` | String | Ref vers `media_files` (cascade delete) |
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
| `mediaFileId` | String | Ref vers `media_files` (cascade delete) |
| `type` | MediaCommentType | `GENERAL` ou `TIMECODE` |
| `content` | String (Text) | Contenu du commentaire |
| `timecode` | Int? | Position en secondes (si `TIMECODE`) |
| `parentId` | String? | Ref vers `media_comments` (réponses imbriquées, cascade delete) |
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
| `churchId` | String? | Ref vers `churches` (cascade delete) : église propriétaire, pour lister les partages actifs (spec 049) |
| `mediaEventId` | String? | Ref vers `media_events` (exclusif avec `mediaProjectId`, cascade delete) |
| `mediaProjectId` | String? | Ref vers `media_projects` (exclusif avec `mediaEventId`, cascade delete) |
| `expiresAt` | DateTime? | Expiration (null = illimité) |
| `config` | Json? | Paramètres du partage (sélection, sources d'une collection) |
| `lastUsedAt` | DateTime? | Dernière utilisation |
| `usageCount` | Int | Nombre d'utilisations (default: 0) |
| `createdAt` | DateTime | Date de création |

#### `media_zip_jobs`

Jobs asynchrones de génération de ZIP pour le téléchargement groupé.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `mediaEventId` | String | Ref vers `media_events` |
| `status` | MediaJobStatus | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `downloadKey` | String? | Clé S3 du ZIP généré |
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
| `ownerChurchId` | String | Ref vers `churches` (cascade delete) — église qui ouvre sa bibliothèque |
| `guestChurchId` | String | Ref vers `churches` (cascade delete) — église qui reçoit l'accès en lecture |
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

### Module Suivi pastoral et agenda pastoral (`care`, `agenda`)

#### `care_companions`

Exception déclarée au vivier calculé des accompagnants STAR des demandes de rendez-vous pastoral
et des suivis de nouveaux convertis (spec 056). Sans ligne pour un utilisateur, la règle par
défaut s'applique : membre d'un département MSDP (par fiche STAR ou par responsabilité) =
accompagnant possible. Voir `src/modules/care/services/companions.ts`.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` (cascade delete) |
| `userId` | String | Ref vers `users` (cascade delete) — unique par église (`@@unique([churchId, userId])`) |
| `mode` | CareCompanionMode | `ADDED` (ajouté hors MSDP, ou gardé après départ) ou `EXCLUDED` (membre MSDP écarté) |
| `createdById` | String? | Ref vers `users`, qui a déclaré l'exception (`SetNull`) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

#### `pastoral_profiles`

Profil pastoral d'une église (pasteur, assistant, berger), éventuellement lié à un compte utilisateur. Destinataire des entrées d'agenda et accompagnant possible d'une demande de rendez-vous ou d'un suivi de nouveau converti ; peut aussi être le responsable pastoral ou le superviseur d'une église (`churches.responsibleProfileId` / `supervisorProfileId`).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `name` | String | Nom affiché |
| `email` | String? | Email du profil |
| `role` | `PastoralRole` | `PASTEUR` \| `ASSISTANT_PASTEUR` \| `BERGER` |
| `userId` | String? | Ref vers `users` (compte lié, optionnel) |
| `createdAt` | DateTime | Horodatage de création |

Relations : `agenda_entries`, `appointment_requests`, `msdp_follow_ups` (accompagnant), églises dont il est responsable ou superviseur.

#### `appointment_requests`

Demande de rendez-vous pastoral (module `care`, spec 052). Cycle : qualification par le référent, affectation à un accompagnant (profil pastoral **ou** membre du département MSDP, exclusif — vérifié par le service), planification, puis clôture avec une issue consignée. Peut naître d'une demande d'accueil (soin pastoral coché) et être rapprochée d'autres demandes de la même personne via `person_journeys`.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `userId` | String? | Ref vers `users` (demandeur connecté, optionnel) |
| `firstName` / `lastName` | String | Identité du demandeur |
| `email` / `phone` | String? | Coordonnées |
| `subject` | String | Objet de la demande |
| `message` | String (Text) | Message du demandeur |
| `preferredDays` | String? | Jours souhaités |
| `status` | `AppointmentRequestStatus` | `PENDING` \| `VALIDATED` \| `SCHEDULED` \| `CLOSED` \| `REJECTED` (défaut `PENDING`) |
| `assignedToId` | String? | Ref vers `pastoral_profiles` (accompagnant profil pastoral) |
| `assignedMemberId` | String? | Ref vers `users` (accompagnant membre MSDP, `SetNull`) |
| `assignedById` | String? | Ref vers `users`, qui a affecté (`SetNull`) |
| `assignedAt` | DateTime? | Date d'affectation, base de la relance « confiée non planifiée » |
| `qualifiedById` | String? | Ref vers `users`, qui a qualifié |
| `qualifiedAt` | DateTime? | Date de qualification |
| `qualificationNote` | String? | Note de qualification |
| `rejectReason` | String? | Commentaire libre de rejet |
| `rejectReasonCode` | `AppointmentRejectReason`? | Motif qualifié du rejet (liste fixe) |
| `scheduledById` | String? | Ref vers `users`, qui a planifié |
| `scheduledAt` | DateTime? | Date de planification |
| `scheduledFor` | DateTime? | Date du rendez-vous, quel que soit l'accompagnant |
| `outcome` | `AppointmentOutcome`? | Issue du rendez-vous |
| `outcomeAt` | DateTime? | Date de consignation de l'issue |
| `sourceIntegrationRequestId` | String? | Demande d'accueil source (unique ; reprend en sens inverse l'ancienne colonne de `family_integration_requests`) |
| `personJourneyId` | String? | Ref vers `person_journeys` (`SetNull`) — rapprochement des demandes d'une même personne |
| `updatedById` | String? | Ref vers `users`, dernier modificateur |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[churchId, status, createdAt]`, `[assignedMemberId]`, `[personJourneyId]` ; unicité : `[sourceIntegrationRequestId]`

Relations : `agenda_entries` (0..1), `msdp_follow_ups` (suivi issu d'une orientation, 0..1).

#### `agenda_entries`

Entrée de l'agenda pastoral d'un profil pastoral : activité ou rendez-vous. Un rendez-vous planifié par le protocole est rattaché à sa demande (`requestId`, unique).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `recipientId` | String | Ref vers `pastoral_profiles` (profil concerné) |
| `type` | `AgendaEntryType` | `ACTIVITY` \| `APPOINTMENT` |
| `title` | String | Titre |
| `description` | String? (Text) | Description |
| `startsAt` | DateTime | Début |
| `endsAt` | DateTime? | Fin |
| `location` | String? | Lieu |
| `requestId` | String? | Ref vers `appointment_requests` (unique) |
| `createdById` | String | Ref vers `users` |
| `updatedById` | String? | Ref vers `users` |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[churchId, recipientId, startsAt]`, `[churchId, startsAt]` ; unicité : `[requestId]`

#### `msdp_follow_ups`

Suivi d'un nouveau converti par le MSDP (module `care`, spec 052). Né d'une demande d'accueil avec appel au salut ou d'un rendez-vous orienté vers un suivi ; l'identité est recopiée de la source ou portée directement. Les liens vers les sources sont en `SetNull` : archiver ou supprimer la demande d'origine n'emporte pas le suivi.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `requestId` | String? | Ref vers `family_integration_requests` (unique, `SetNull`) |
| `sourceAppointmentId` | String? | Ref vers `appointment_requests` (unique, `SetNull`) — rendez-vous à l'origine |
| `firstName` / `lastName` | String (100) | Identité |
| `phone` | String? (30) | Téléphone |
| `email` | String? (255) | Email |
| `status` | `MsdpStatus` | `SUBMITTED` \| `ASSIGNED` \| `CONTACTED` \| `IN_FORMATION` \| `COMPLETED` \| `ABANDONED` (défaut `SUBMITTED`) |
| `assignedConseillerMsdpId` | String? | Ref vers `users` (conseiller MSDP, `SetNull`) |
| `assignedProfileId` | String? | Ref vers `pastoral_profiles` (`SetNull`) — exclusif avec le conseiller MSDP, vérifié par le service |
| `assignedById` | String? | Ref vers `users`, qui a affecté (`SetNull`) |
| `personJourneyId` | String? | Ref vers `person_journeys` (`SetNull`) |
| `assignedAt` / `contactedAt` / `inFormationAt` / `completedAt` / `abandonedAt` | DateTime? | Horodatages d'étape, pour les indicateurs de délais |
| `notes` | String? (Text) | Notes |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[churchId, status]`, `[assignedConseillerMsdpId]`, `[assignedProfileId]`, `[personJourneyId]` ; unicité : `[requestId]`, `[sourceAppointmentId]`

#### `care_settings`

Délais de relance du module `care` (`/care/parametres`), une ligne par église.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` (unique) |
| `unassignedDelayDays` | Int | Délai avant alerte aux référents pour une demande reçue non confiée (défaut 7) |
| `unscheduledDelayDays` | Int | Délai avant alerte à l'accompagnant pour une demande confiée non planifiée (défaut 14) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Unicité : `[churchId]`

### Enums suivi pastoral et agenda

#### `PastoralRole`

| Valeur | Description |
|---|---|
| `PASTEUR` | Pasteur |
| `ASSISTANT_PASTEUR` | Assistant pasteur |
| `BERGER` | Berger |

#### `AppointmentRequestStatus`

| Valeur | Description |
|---|---|
| `PENDING` | Demande reçue, en attente de qualification |
| `VALIDATED` | Demande validée (qualifiée) |
| `SCHEDULED` | Rendez-vous planifié |
| `CLOSED` | Terminée, issue consignée (spec 052) |
| `REJECTED` | Rejetée |

#### `AppointmentOutcome`

| Valeur | Description |
|---|---|
| `HELD` | Le rendez-vous a eu lieu, clôturé |
| `REFERRED_TO_FOLLOWUP` | A eu lieu, orienté vers un suivi de nouveau converti |
| `NO_SHOW` | La personne n'est pas venue, clôturé sans suite |

#### `AppointmentRejectReason`

| Valeur | Description |
|---|---|
| `OUT_OF_SCOPE` | Hors du champ pastoral |
| `DUPLICATE` | Doublon |
| `WITHDRAWN` | Demande retirée par la personne |
| `UNREACHABLE` | Personne injoignable |
| `REDIRECTED` | Orientée vers un autre service |
| `OTHER` | Autre motif |

#### `AgendaEntryType`

| Valeur | Description |
|---|---|
| `ACTIVITY` | Activité de l'agenda |
| `APPOINTMENT` | Rendez-vous |

#### `MsdpStatus`

| Valeur | Description |
|---|---|
| `SUBMITTED` | Appel reçu, en attente d'assignation |
| `ASSIGNED` | Conseiller MSDP assigné |
| `CONTACTED` | Premier contact établi |
| `IN_FORMATION` | Intégré à la formation nouveaux convertis (PCNC) |
| `COMPLETED` | Suivi terminé |
| `ABANDONED` | Suivi abandonné |

### Notifications

#### `notifications` — rattachement à un objet (spec 057)

Deux colonnes nullables rattachent une notification in-app à l'objet métier dont elle parle,
pour pouvoir l'effacer avec lui (ADR-0019). Renseignées par les notifications `care` et
`integration` émises à propos d'une demande ou d'un suivi ; vides pour les notifications
antérieures et celles sans objet précis. Index `[entityType, entityId]`.

| Champ | Type | Description |
|---|---|---|
| `entityType` | String? (50) | `AppointmentRequest`, `MsdpFollowUp` ou `FamilyIntegrationRequest` (mêmes valeurs que `audit_logs.entityType`) |
| `entityId` | String? | Identifiant de l'objet |

#### `notification_email_preferences`

Préférence d'envoi d'email d'un utilisateur, par domaine de notification (spec 053, ADR-0016). Clé primaire composite.

| Champ | Type | Description |
|---|---|---|
| `userId` | String | Ref vers `users` (cascade delete) |
| `domain` | String | Clé de domaine déclarée par un manifeste de module (`planning`, `care`…), ou `*` pour l'interrupteur général ; validée par le registre à l'écriture (Zod), pas par un enum |
| `enabled` | Boolean | Emails activés pour ce domaine |
| `updatedAt` | DateTime | Dernière modification |

Clé primaire : `[userId, domain]`

### Plateforme

#### `cron_task_runs` — planificateur des tâches planifiées (ADR-0021)

Une ligne par tâche déclarée dans `POST /api/cron`, créée à son premier passage. Donnée de
plateforme, **sans `churchId`** : les tâches parcourent elles-mêmes les églises.

| Champ | Type | Description |
|---|---|---|
| `key` | String (PK) | Identifiant de la tâche (`reminders`, `planning-digest`, `availability`…) |
| `lastStartedAt` | DateTime? | Début du dernier passage ; décide si la tâche est due et sert de jeton de concurrence |
| `lastFinishedAt` | DateTime? | Fin du dernier passage |
| `lastDurationMs` | Int? | Durée du dernier passage |
| `lastError` | Text? | Message de la dernière erreur, `null` après un passage réussi |
| `lockedUntil` | DateTime? | Verrou : aucun autre appel ne relance la tâche avant cette date |

### Module Intégration

#### `family_integration_requests`

Demande d'intégration dans une famille d'impact, issue du formulaire public d'accueil. Une suggestion de famille est calculée depuis l'adresse (point dans un polygone, référentiel externe `familles.iccrennes.fr`), puis une famille et un berger sont affectés. La spec 051 ajoute le motif qualifié d'abandon, le consentement au contact et la mémoire de l'état d'attente pour les relances (`waitingFrom` ne vaut que `SUBMITTED` ou `CONTACTED`). La demande de rendez-vous pastoral vit désormais dans le module `care`. Archivage doux à 12 mois (`archivedAt`).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `firstName` / `lastName` | String (100) | Identité |
| `email` | String? (255) | Email |
| `phone` | String? (30) | Téléphone |
| `address` | String? (500) | Adresse |
| `city` | String? (100) | Ville |
| `lat` / `lng` | Float? | Coordonnées géographiques |
| `ageRange` | `FamilyAgeRange` | `YOUTH` \| `YOUNG_ADULT` \| `ADULT` \| `SENIOR` |
| `churchStatus` | `FamilyChurchStatus` | `VISITOR` \| `REGULAR` \| `ENGAGED` (défaut `VISITOR`) |
| `memberId` | String? | Ref vers `members` (`SetNull`) — membre existant lié |
| `salvationCall` | Boolean | Appel au salut coché sur le formulaire (défaut `false`) |
| `eventId` | String? | Ref vers `events` (`SetNull`) — culte lié, pour corrélation avec les comptes rendus |
| `pastoralCareRequested` | Boolean | Soin pastoral demandé (défaut `false`) |
| `suggestedFamilyId` / `suggestedFamilyName` | Int? / String? (100) | Famille suggérée automatiquement |
| `assignedFamilyId` / `assignedFamilyName` | Int? / String? (100) | Famille confirmée |
| `assignedBergerId` | String? | Ref vers `users` (`SetNull`) — berger assigné, notifié à l'affectation |
| `status` | `FamilyIntegrationStatus` | Statut du workflow (défaut `SUBMITTED`) |
| `submittedAt` | DateTime | Date de soumission (défaut maintenant) |
| `assignedAt` / `contactedAt` / `whatsappAddedAt` / `integratedAt` / `abandonedAt` | DateTime? | Horodatages d'étape |
| `abandonReason` | String? (500) | Commentaire libre d'abandon |
| `abandonReasonCode` | `IntegrationAbandonReason`? | Motif qualifié (obligatoire à l'abandon depuis la spec 051 ; `null` pour les abandons antérieurs) |
| `contactConsent` | `IntegrationContactConsent` | `NOW` \| `LATER` (défaut `NOW`) |
| `waitingFrom` | `FamilyIntegrationStatus`? | Statut d'origine de l'état d'attente |
| `waitingSince` | DateTime? | Début de l'attente, fonde l'échéance de relance |
| `lastRelanceAt` | DateTime? | Dernière relance |
| `notes` | String? (Text) | Notes internes de l'équipe intégration |
| `archivedAt` | DateTime? | Archivage doux |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[churchId, status]`, `[churchId, assignedFamilyId]`, `[churchId, submittedAt]`, `[assignedBergerId]`, `[memberId]`, `[eventId]`

Relations : `msdp_follow_ups` (0..1), `person_journeys` (0..1, dossier de parcours créé à la soumission ou manuellement).

#### `family_leader_assignments`

Rattachement d'un utilisateur comme berger ou co-berger d'une famille d'impact (identifiée par son ID dans le référentiel externe `familles.iccrennes.fr`).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `userId` | String | Ref vers `users` (cascade delete) |
| `familyId` | Int | ID de la famille dans le référentiel externe |
| `familyName` | String (100) | Nom de la famille |
| `role` | `FamilyLeaderRole` | `BERGER` \| `CO_BERGER` |
| `createdAt` | DateTime | Horodatage de création |

Index : `[churchId, familyId]` ; unicité : `[churchId, userId, familyId]`

#### `integration_settings`

Délais de relance du module intégration (spec 051, `/integration/parametres`), une ligne par église.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` (unique) |
| `recontactDelayDays` | Int | Attente de recontact, en jours (défaut 60) |
| `missionDelayDays` | Int | Attente de décision du département mission, en jours (défaut 30) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Unicité : `[churchId]`

#### `person_journeys`

Dossier de parcours d'une personne, en quatre jalons : intégration dans une famille d'impact, suivi PCNC (Parcours de Croissance de la Nouvelle Création), serviteur actif (STAR), suivi de discipolat. Créé automatiquement à la soumission d'une demande d'accueil ou manuellement (`createdById` nul si automatique). Sert aussi, depuis la spec 052, à rapprocher les demandes de rendez-vous et les suivis MSDP d'une même personne.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `firstName` / `lastName` | String (100) | Identité |
| `phone` | String? (30) | Téléphone |
| `email` | String? (255) | Email |
| `sourceRequestId` | String? | Ref vers `family_integration_requests` (unique, `SetNull`) |
| `integratedInFamily` | Boolean | Jalon 1 : intégré dans une famille d'impact (défaut `false`) |
| `familyIntegratedAt` | DateTime? | Date du jalon 1 |
| `followsPcnc` | Boolean | Jalon 2 : suit le PCNC (défaut `false`) |
| `pcncStartedAt` | DateTime? | Date du jalon 2 |
| `isStar` | Boolean | Jalon 3 : serviteur actif (défaut `false`) |
| `starSince` | DateTime? | Date du jalon 3 |
| `inDiscipleship` | Boolean | Jalon 4 : suivi de discipolat (défaut `false`) |
| `discipleshipSince` | DateTime? | Date du jalon 4 |
| `notes` | String? (Text) | Notes |
| `createdById` | String? | Ref vers `users` (`SetNull`) — auteur, nul si création automatique |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[churchId, createdAt]`, `[churchId, integratedInFamily]`, `[churchId, followsPcnc]`, `[churchId, isStar]`, `[churchId, inDiscipleship]` ; unicité : `[sourceRequestId]`

Relations : `appointment_requests`, `msdp_follow_ups`.

### Enums intégration

#### `FamilyIntegrationStatus`

| Valeur | Description |
|---|---|
| `SUBMITTED` | Demande soumise |
| `WAITING_RECONTACT` | En attente : la personne souhaite être recontactée plus tard (spec 051) |
| `WAITING_MISSION` | En attente : adresse hors zone, décision du département mission (spec 051) |
| `ASSIGNED` | Famille affectée (automatiquement ou manuellement) |
| `CONTACTED` | Le berger a pris contact |
| `WHATSAPP_ADDED` | Ajouté au groupe WhatsApp |
| `INTEGRATED` | Intégration terminée (clôturé) |
| `ABANDONED` | Abandonné |

#### `IntegrationAbandonReason`

| Valeur | Description |
|---|---|
| `UNKNOWN_NUMBER` | Numéro inconnu ou erroné |
| `UNREACHABLE` | Injoignable après relances |
| `NO_LONGER_INTERESTED` | Ne souhaite plus être contacté·e |
| `OTHER_CHURCH` | A rejoint une autre église |
| `MOVED` | A déménagé |
| `DUPLICATE` | Doublon |
| `OTHER` | Autre (précisé en commentaire) |

#### `IntegrationContactConsent`

| Valeur | Description |
|---|---|
| `NOW` | La personne accepte d'être contactée maintenant |
| `LATER` | La personne souhaite être recontactée plus tard |

#### `FamilyAgeRange`

| Valeur | Description |
|---|---|
| `YOUTH` | Moins de 18 ans (famille d'impact jeunes) |
| `YOUNG_ADULT` | 18 à 30 ans |
| `ADULT` | 30 à 60 ans |
| `SENIOR` | 60 ans et plus |

#### `FamilyChurchStatus`

| Valeur | Description |
|---|---|
| `VISITOR` | Visiteur |
| `REGULAR` | Membre régulier |
| `ENGAGED` | Membre engagé |

#### `FamilyLeaderRole`

| Valeur | Description |
|---|---|
| `BERGER` | Berger de la famille |
| `CO_BERGER` | Co-berger de la famille |

### Module Comptabilité

#### `financial_series`

Série de demandes financières récurrentes (toutes les N semaines ou N mois) : à chaque échéance, une demande `financial_requests` est générée à partir de la série. Une série peut être active, en pause ou annulée.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `departmentId` | String | Ref vers `departments` |
| `submittedById` | String | Ref vers `users` (demandeur) |
| `type` | `FinancialRequestType` | `EXPENSE_REPORT` \| `BUDGET_ADVANCE` |
| `label` | String (VarChar 200) | Libellé |
| `description` | String? (Text) | Description (optionnel) |
| `amount` | Decimal(10,2) | Montant de chaque occurrence |
| `recurrenceEvery` | Int | Intervalle de récurrence (en `recurrenceUnit`) |
| `recurrenceUnit` | `RecurrenceUnit` | `WEEK` \| `MONTH` |
| `status` | `SeriesStatus` | `ACTIVE` (défaut) \| `PAUSED` \| `CANCELLED` |
| `nextOccurrenceDate` | DateTime | Date de la prochaine occurrence à générer |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Relations : `requests` (demandes générées)

Index : `[churchId, status]`, `[nextOccurrenceDate, status]`

#### `financial_requests`

Demande financière : note de frais (dépense déjà effectuée) ou avance de budget (dépense à venir), soumise par un demandeur et traitée par la comptabilité. Une demande sans département est une note de frais personnelle ; elle peut appartenir à une série (`seriesId`) ou corriger une demande rejetée (`correctionOfId`).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `churchId` | String | Ref vers `churches` |
| `departmentId` | String? | Ref vers `departments` ; null = note de frais personnelle (sans département) |
| `submittedById` | String | Ref vers `users` (demandeur) |
| `seriesId` | String? | Ref vers `financial_series` ; null si demande one-shot |
| `occurrenceNumber` | Int? | Rang dans la série |
| `correctionOfId` | String? | Ref vers `financial_requests` : demande rejetée que celle-ci corrige |
| `type` | `FinancialRequestType` | `EXPENSE_REPORT` \| `BUDGET_ADVANCE` |
| `label` | String (VarChar 200) | Libellé |
| `description` | String? (Text) | Description (optionnel) |
| `amount` | Decimal(10,2) | Montant demandé |
| `status` | `FinancialRequestStatus` | `SUBMITTED` (défaut) \| `PROCESSING` \| `APPROVED` \| `REJECTED` \| `CANCELLED` |
| `priority` | `FinancialPriority?` | `URGENT` \| `NORMAL` (renseignée par la comptabilité) |
| `priorityNote` | String? (VarChar 500) | Précision sur la priorité |
| `rejectionReason` | String? (Text) | Motif de rejet (obligatoire en cas de rejet) |
| `processedById` | String? | Ref vers `users` (comptable ayant traité) |
| `processedAt` | DateTime? | Date de traitement |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Relations : `corrections`, `attachments`, `payments`

Index : `[churchId, status]`, `[churchId, departmentId, status]`, `[submittedById]`, `[seriesId]`

#### `financial_attachments`

Pièce jointe (justificatif) stockée sur S3, déposée par un utilisateur, éventuellement avant son rattachement à une demande. L'église de dépôt (`churchId`) fait autorité pour toute décision d'accès : elle ne dépend jamais du rattachement à une demande, que l'appelant peut lui-même provoquer (spec 025).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `requestId` | String? | Ref vers `financial_requests` (cascade delete) ; null tant que non rattachée |
| `uploadedById` | String? | Ref vers `users` |
| `churchId` | String | Ref vers `churches` (église de dépôt) |
| `s3Key` | String (VarChar 512) | Clé de l'objet S3 |
| `filename` | String (VarChar 255) | Nom du fichier |
| `mimeType` | String (VarChar 100) | Type MIME |
| `size` | Int | Taille en octets |
| `uploadedAt` | DateTime | Date de dépôt |

Index : `[requestId]`, `[churchId]`

#### `financial_payments`

Échéance du plan de paiement d'une demande validée : montant et date prévus, puis remise effective confirmée par le comptable (le montant remis peut être inférieur au montant prévu).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `requestId` | String | Ref vers `financial_requests` (cascade delete) |
| `amount` | Decimal(10,2) | Montant prévu |
| `scheduledDate` | DateTime | Date prévue |
| `releasedAt` | DateTime? | Date de remise ; null = pas encore versé |
| `releasedAmount` | Decimal(10,2)? | Montant effectivement remis (peut être inférieur à `amount`) |
| `releasedById` | String? | Ref vers `users` (comptable ayant confirmé la remise) |
| `note` | String? (VarChar 500) | Note |
| `createdAt` | DateTime | Date de création |

Index : `[requestId]`

### Enums comptabilité

#### `FinancialRequestType`

| Valeur | Description |
|---|---|
| `EXPENSE_REPORT` | Note de frais : dépense déjà effectuée |
| `BUDGET_ADVANCE` | Avance de budget : dépense à venir |

#### `FinancialRequestStatus`

| Valeur | Description |
|---|---|
| `SUBMITTED` | Soumise, en attente de traitement (défaut) |
| `PROCESSING` | En cours de traitement par la comptabilité |
| `APPROVED` | Validée, plan de paiement défini |
| `REJECTED` | Rejetée (motif obligatoire) |
| `CANCELLED` | Annulée par le demandeur (seulement si `SUBMITTED`) |

#### `FinancialPriority`

| Valeur | Description |
|---|---|
| `URGENT` | Délai de traitement engagé par la comptabilité |
| `NORMAL` | Traitée dans les meilleurs délais |

#### `RecurrenceUnit`

| Valeur | Description |
|---|---|
| `WEEK` | Récurrence en semaines |
| `MONTH` | Récurrence en mois |

#### `SeriesStatus`

| Valeur | Description |
|---|---|
| `ACTIVE` | Série active (défaut) |
| `PAUSED` | Série en pause |
| `CANCELLED` | Série annulée |

### Module Salles

#### `rooms`

Salle d'une église, réservable. Elle peut être partagée avec d'autres églises via `room_accesses`.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `name` | String | Nom de la salle |
| `churchId` | String | Ref vers `churches` (église propriétaire) |
| `capacity` | Int? | Capacité d'accueil (optionnel) |
| `location` | String? | Emplacement (optionnel) |
| `isActive` | Boolean | Salle active (défaut `true`) |
| `createdAt` | DateTime | Date de création |

Relations : `sharedWith` (`room_accesses`), `reservations`

Index : `[churchId]`

#### `room_accesses`

Partage d'une salle avec une autre église que sa propriétaire, autorisée à la réserver.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `roomId` | String | Ref vers `rooms` (cascade delete) |
| `churchId` | String | Ref vers `churches` : église autorisée (autre que la propriétaire) |

Unicité : `[roomId, churchId]`

#### `room_reservations`

Réservation d'une salle sur un créneau, par une église, éventuellement liée à un événement. Peut être récurrente (`recurrenceRule`, utilisée seulement si la réservation n'est pas liée à un événement lui-même récurrent) ; les occurrences d'une série partagent un `seriesId`.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `roomId` | String | Ref vers `rooms` |
| `churchId` | String | Ref vers `churches` (église qui réserve) |
| `eventId` | String? | Ref vers `events` (optionnel) |
| `title` | String | Titre |
| `startAt` | DateTime | Début |
| `endAt` | DateTime | Fin |
| `status` | `RoomReservationStatus` | `CONFIRMED` (défaut) \| `CANCELLED` |
| `recurrenceRule` | String? | `"weekly"` \| `"biweekly"` \| `"monthly"` |
| `seriesId` | String? | Identifiant de la série de récurrence |
| `isRecurrenceParent` | Boolean | Première occurrence de la série (défaut `false`) |
| `createdById` | String | Ref vers `users` |
| `createdAt` | DateTime | Date de création |
| `cancelledAt` | DateTime? | Date d'annulation |
| `cancelledById` | String? | Ref vers `users` (auteur de l'annulation) |

Relations : `checklist` (une seule, optionnelle)

Index : `[roomId, startAt, endAt]`, `[churchId, startAt]`, `[seriesId]`

#### `room_checklists`

Fiche d'ouverture et de fermeture d'une réservation (une par réservation) : remise des clés, état de la salle à l'ouverture, déclaration de fermeture par l'utilisateur, puis validation (ou signalement d'incident) par un responsable.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `reservationId` | String | Ref vers `room_reservations` (cascade delete), unique |
| `status` | `RoomChecklistStatus` | `PENDING` (défaut) \| `OPENED` \| `CLOSED_DECLARED` \| `VALIDATED` \| `ISSUE_REPORTED` |
| `openedById` | String? | Ref vers `users` (ouverture) |
| `openedAt` | DateTime? | Date d'ouverture |
| `keyReceivedFromId` | String? | Ref vers `users` : personne ayant remis la clé |
| `keyReceivedFromName` | String? | Nom de la personne ayant remis la clé (texte libre) |
| `openingNotes` | String? (Text) | Notes d'ouverture |
| `closedById` | String? | Ref vers `users` (fermeture) |
| `closedAt` | DateTime? | Date de fermeture |
| `closedProperly` | Boolean? | Fermeture correcte (déclarée) |
| `cleaned` | Boolean? | Salle nettoyée (déclaré) |
| `equipmentOk` | Boolean? | Équipement en bon état (déclaré) |
| `equipmentNotes` | String? (Text) | Notes sur l'équipement |
| `keyReturnedToId` | String? | Ref vers `users` : personne à qui la clé est rendue |
| `keyReturnedToName` | String? | Nom de la personne à qui la clé est rendue (texte libre) |
| `closingNotes` | String? (Text) | Notes de fermeture |
| `validatedById` | String? | Ref vers `users` (validation) |
| `validatedAt` | DateTime? | Date de validation |
| `validatedClosedProperly` | Boolean? | Fermeture correcte (constat du validateur) |
| `validatedCleaned` | Boolean? | Salle nettoyée (constat du validateur) |
| `validatedEquipmentOk` | Boolean? | Équipement en bon état (constat du validateur) |
| `incidentNotes` | String? (Text) | Notes d'incident |
| `closedWithoutDeclaration` | Boolean | Fermée sans déclaration de l'utilisateur (défaut `false`) |

Unicité : `[reservationId]`

### Enums salles

#### `RoomReservationStatus`

| Valeur | Description |
|---|---|
| `CONFIRMED` | Réservation confirmée (défaut) |
| `CANCELLED` | Réservation annulée |

#### `RoomChecklistStatus`

| Valeur | Description |
|---|---|
| `PENDING` | Fiche créée, salle pas encore ouverte (défaut) |
| `OPENED` | Salle ouverte |
| `CLOSED_DECLARED` | Fermeture déclarée par l'utilisateur, en attente de validation |
| `VALIDATED` | Fermeture validée |
| `ISSUE_REPORTED` | Incident signalé |

### Module Emploi

#### `job_offers`

Offre d'emploi, de stage ou d'alternance publiée par un membre. Une relance « toujours d'actualité ? » peut être envoyée à l'auteur (spec 034).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `title` | String (VarChar 200) | Titre |
| `type` | `JobOfferType` | `EMPLOI` \| `STAGE` \| `ALTERNANCE` |
| `company` | String (VarChar 150) | Entreprise |
| `location` | String? (VarChar 150) | Lieu |
| `description` | String (Text) | Description |
| `duration` | String? (VarChar 100) | Durée |
| `deadline` | DateTime? | Date limite de candidature |
| `contactEmail` | String? (VarChar 150) | Email de contact |
| `contactUrl` | String? (VarChar 500) | Lien de contact |
| `status` | `JobOfferStatus` | `PUBLISHED` (défaut) \| `ARCHIVED` |
| `authorId` | String | Ref vers `users` |
| `renewalRequestedAt` | DateTime? | Date d'envoi de la relance « toujours d'actualité ? » restée sans réponse ; NULL = aucune relance en cours, remis à NULL par toute modification de l'offre, qui vaut confirmation (spec 034) |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[status, type]`, `[authorId]`, `[status, renewalRequestedAt]`

#### `job_notification_subscriptions`

Préférences d'alerte d'un utilisateur sur le module Emploi (une ligne par utilisateur) : canaux (in-app, email) et catégories suivies. Indépendant du domaine de notification `jobs`, les deux réglages s'appliquant en cumul.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `userId` | String | Ref vers `users` (cascade delete), unique |
| `inApp` | Boolean | Alerte in-app (défaut `true`) |
| `email` | Boolean | Alerte par email (défaut `false`) |
| `wantEmploi` | Boolean | Suivre les offres d'emploi (défaut `true`) |
| `wantStage` | Boolean | Suivre les offres de stage (défaut `true`) |
| `wantAlternance` | Boolean | Suivre les offres d'alternance (défaut `true`) |
| `wantSeekers` | Boolean | Suivre les profils de chercheurs d'emploi (défaut `false`) |
| `wantFreelanceMissions` | Boolean | Suivre les missions freelance (défaut `false`) |
| `wantFreelanceProfiles` | Boolean | Suivre les profils freelance (défaut `false`) |

Unicité : `[userId]`

#### `job_seekers`

Annonce d'un membre à la recherche d'un emploi, d'un stage ou d'une alternance.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `title` | String (VarChar 200) | Titre |
| `wantEmploi` | Boolean | Recherche un emploi (défaut `false`) |
| `wantStage` | Boolean | Recherche un stage (défaut `false`) |
| `wantAlternance` | Boolean | Recherche une alternance (défaut `false`) |
| `sector` | String? (VarChar 150) | Secteur |
| `location` | String? (VarChar 150) | Lieu |
| `remote` | Boolean | Télétravail accepté (défaut `false`) |
| `availableFrom` | DateTime? | Disponible à partir du |
| `description` | String (Text) | Description |
| `contactEmail` | String? (VarChar 150) | Email de contact |
| `contactUrl` | String? (VarChar 500) | Lien de contact |
| `status` | `JobSeekerStatus` | `ACTIVE` (défaut) \| `FOUND` \| `ARCHIVED` |
| `authorId` | String | Ref vers `users` |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[status]`, `[authorId]`

#### `job_last_seen`

Dernière consultation du module Emploi par un utilisateur (une ligne par utilisateur), pour repérer les nouveautés depuis sa dernière visite.

| Champ | Type | Description |
|---|---|---|
| `userId` | String (clé primaire) | Ref vers `users` (cascade delete) |
| `seenAt` | DateTime | Date de dernière consultation (défaut maintenant) |

#### `freelance_missions`

Mission freelance proposée par un membre.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `title` | String (VarChar 200) | Titre |
| `domain` | String (VarChar 150) | Domaine |
| `duration` | String? (VarChar 100) | Durée |
| `dailyRate` | String? (VarChar 100) | Taux journalier (texte libre) |
| `hourlyRate` | String? (VarChar 100) | Taux horaire (texte libre) |
| `modality` | `FreelanceModality` | `REMOTE` (défaut) \| `ONSITE` \| `HYBRID` |
| `location` | String? (VarChar 150) | Lieu |
| `description` | String (Text) | Description |
| `contactEmail` | String? (VarChar 150) | Email de contact |
| `contactUrl` | String? (VarChar 500) | Lien de contact |
| `status` | `FreelanceMissionStatus` | `ACTIVE` (défaut) \| `FILLED` \| `ARCHIVED` |
| `authorId` | String | Ref vers `users` |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[status]`, `[authorId]`

#### `freelance_profiles`

Profil de freelance proposant ses services.

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `title` | String (VarChar 200) | Titre |
| `domain` | String (VarChar 150) | Domaine |
| `dailyRate` | String? (VarChar 100) | Taux journalier (texte libre) |
| `hourlyRate` | String? (VarChar 100) | Taux horaire (texte libre) |
| `modality` | `FreelanceModality` | `REMOTE` (défaut) \| `ONSITE` \| `HYBRID` |
| `location` | String? (VarChar 150) | Lieu |
| `availableFrom` | DateTime? | Disponible à partir du |
| `description` | String (Text) | Description |
| `contactEmail` | String? (VarChar 150) | Email de contact |
| `contactUrl` | String? (VarChar 500) | Lien de contact |
| `status` | `FreelanceProfileStatus` | `ACTIVE` (défaut) \| `UNAVAILABLE` \| `ARCHIVED` |
| `authorId` | String | Ref vers `users` |
| `createdAt` / `updatedAt` | DateTime | Horodatages |

Index : `[status]`, `[authorId]`

### Enums emploi

#### `JobOfferType`

| Valeur | Description |
|---|---|
| `EMPLOI` | Offre d'emploi |
| `STAGE` | Offre de stage |
| `ALTERNANCE` | Offre d'alternance |

#### `JobOfferStatus`

| Valeur | Description |
|---|---|
| `PUBLISHED` | Offre publiée (défaut) |
| `ARCHIVED` | Offre archivée |

#### `JobSeekerStatus`

| Valeur | Description |
|---|---|
| `ACTIVE` | Recherche en cours (défaut) |
| `FOUND` | Le chercheur a trouvé |
| `ARCHIVED` | Annonce archivée |

#### `FreelanceModality`

| Valeur | Description |
|---|---|
| `REMOTE` | À distance (défaut) |
| `ONSITE` | Sur site |
| `HYBRID` | Hybride |

#### `FreelanceMissionStatus`

| Valeur | Description |
|---|---|
| `ACTIVE` | Mission ouverte (défaut) |
| `FILLED` | Mission pourvue |
| `ARCHIVED` | Mission archivée |

#### `FreelanceProfileStatus`

| Valeur | Description |
|---|---|
| `ACTIVE` | Profil actif (défaut) |
| `UNAVAILABLE` | Freelance indisponible |
| `ARCHIVED` | Profil archivé |


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
# DATABASE_URL surcharge .env (dotenv ne remplace pas une variable déjà définie)
export DATABASE_URL="mysql://root:root@127.0.0.1:3306/koinonia_check"
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
docker exec koinonia-db-1 mariadb -uroot -proot -e "DROP DATABASE koinonia_check;"
```

La CI fait exactement cela à chaque PR (job `migrations` de `.github/workflows/ci.yml`, #500) :
une migration invalide, un historique qui ne se rejoue pas ou un `schema.prisma` modifié sans
migration fait échouer le build.
