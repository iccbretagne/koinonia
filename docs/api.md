# API

Toutes les routes API sont des [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) dans `src/app/api/`.

Toutes les routes (sauf `/api/auth/*` et `/api/cron/*`) nécessitent une session NextAuth valide.

## Format des réponses

**Succès** : JSON avec les données directement dans le body.

**Erreur** :
```json
{ "error": "Message d'erreur" }
```

Codes HTTP utilisés : `200`, `201`, `400`, `401`, `403`, `404`, `409`, `500`.

---

## Authentification

### `GET/POST /api/auth/[...nextauth]`

Géré par NextAuth. Inclut :

- `GET /api/auth/signin` — page de connexion
- `GET /api/auth/callback/google` — callback OAuth Google
- `GET /api/auth/session` — session courante
- `POST /api/auth/signout` — déconnexion

---

## Églises

### `GET /api/churches`

Liste toutes les églises avec le nombre d'utilisateurs, de ministères et d'événements.

**Permission requise** : `church:manage` (ou Super Admin)

**Réponse** : tableau d'églises avec `_count.users`, `_count.ministries`, `_count.events`.

### `POST /api/churches`

Crée une nouvelle église. Assigne automatiquement le rôle `SUPER_ADMIN` à tous les super admins existants sur cette église.

**Permission requise** : `church:manage` (ou Super Admin)

**Body** :
```json
{
  "name": "ICC Rennes",
  "slug": "icc-rennes"
}
```

- `slug` : optionnel, généré automatiquement depuis le nom si absent

**Réponse** : `201` avec l'église créée.

### `PATCH /api/churches`

Actions bulk sur plusieurs églises (suppression ou mise à jour).

**Permission requise** : `church:manage` (ou Super Admin)

**Body** :
```json
{
  "ids": ["clx...", "clx..."],
  "action": "delete"
}
```

ou pour une mise à jour :
```json
{
  "ids": ["clx...", "clx..."],
  "action": "update",
  "data": { "name": "Nouveau nom" }
}
```

**Réponse** : `{ "deleted": 2 }` ou `{ "updated": 2 }`.

### `PUT /api/churches/[churchId]`

Met à jour le nom et le slug d'une église.

**Permission requise** : `church:manage`

**Body** :
```json
{
  "name": "ICC Rennes",
  "slug": "icc-rennes"
}
```

**Réponse** : l'église mise à jour.

### `DELETE /api/churches/[churchId]`

Supprime une église. Bloquée si l'église contient des utilisateurs, ministères ou événements.

**Permission requise** : `church:manage`

**Réponse** : `{ "success": true }`.

**Erreurs** :
- `404` si l'église est introuvable
- `400` si l'église contient des données

### `POST /api/churches/onboard`

Crée une nouvelle église avec un flux d'onboarding complet : crée l'église, assigne optionnellement un admin, et ajoute le super admin courant.

**Permission requise** : `church:manage`

**Body** (valide par Zod) :
```json
{
  "name": "ICC Brest",
  "slug": "icc-brest",
  "adminEmail": "admin@iccbrest.fr"
}
```

- `slug` : doit correspondre au pattern `[a-z0-9-]+`
- `adminEmail` : optionnel ; si fourni, crée ou trouve l'utilisateur et lui assigne le rôle `ADMIN`

**Réponse** : `201` avec l'église créée.

**Erreur** : `409` si le slug est déjà utilisé.

---

## Événements

### `GET /api/events`

Liste les événements avec filtres.

**Permission requise** : `events:view`

**Query params** :
- `churchId` (optionnel) — filtre par église
- `trackedForDiscipleship=true` (optionnel) — filtre les événements suivis pour le discipolat (triés par date croissante)
- `from` (optionnel) — date ISO minimale

**Réponse** : tableau d'événements avec `church` et `eventDepts[].department`.

### `POST /api/events`

Crée un événement (ponctuel ou série récurrente).

**Permission requise** : `events:manage`

**Body** (valide par Zod) :
```json
{
  "title": "Culte du dimanche",
  "type": "CULTE",
  "date": "2026-03-01T10:00:00.000Z",
  "churchId": "clx...",
  "planningDeadline": "2026-02-28T00:00:00.000Z",
  "deadlineOffset": "2d",
  "recurrenceRule": "weekly",
  "recurrenceEnd": "2026-06-30T00:00:00.000Z"
}
```

- `planningDeadline` : date limite absolue (optionnel)
- `deadlineOffset` : offset relatif avant l'événement, format `{n}h` ou `{n}d` (optionnel, ignoré si `planningDeadline` est fourni)
- `recurrenceRule` : `"weekly"`, `"biweekly"` ou `"monthly"` (optionnel)
- `recurrenceEnd` : date de fin de la série (requis si `recurrenceRule` est fourni)

**Logique de récurrence** : l'événement principal est marque `isRecurrenceParent: true`, les événements enfants sont lies via `seriesId`.

**Réponse** : `201` avec l'événement créé (ou l'événement parent + `childrenCreated: N`).

### `PATCH /api/events`

Actions bulk sur plusieurs événements.

**Permission requise** : `events:manage`

**Body** :
```json
{
  "ids": ["clx...", "clx..."],
  "action": "delete"
}
```

ou pour une mise à jour :
```json
{
  "ids": ["clx...", "clx..."],
  "action": "update",
  "data": { "title": "Nouveau titre", "date": "2026-04-01T10:00:00.000Z" }
}
```

**Réponse** : `{ "deleted": 2 }` ou `{ "updated": 2 }`.

### `GET /api/churches/[churchId]/events`

Liste les événements d'une église, triés par date croissante.

**Parametres** : `churchId` — ID de l'église (cuid)

**Réponse** :
```json
[
  {
    "id": "clx...",
    "title": "Culte du 02/03/2026",
    "type": "CULTE",
    "date": "2026-03-02T10:00:00.000Z",
    "churchId": "clx...",
    "createdAt": "2026-02-28T...",
    "eventDepts": [
      {
        "id": "clx...",
        "eventId": "clx...",
        "departmentId": "clx...",
        "department": {
          "id": "clx...",
          "name": "Choristes",
          "ministryId": "clx...",
          "createdAt": "..."
        }
      }
    ]
  }
]
```

### `GET /api/events/[eventId]`

Détail d'un événement avec ses départements et ministères.

**Parametres** : `eventId` — ID de l'événement (cuid)

**Réponse** :
```json
{
  "id": "clx...",
  "title": "Culte du 02/03/2026",
  "type": "CULTE",
  "date": "2026-03-02T10:00:00.000Z",
  "churchId": "clx...",
  "eventDepts": [
    {
      "id": "clx...",
      "department": {
        "id": "clx...",
        "name": "Choristes",
        "ministry": {
          "id": "clx...",
          "name": "Louange"
        }
      }
    }
  ]
}
```

**Erreur** : `404` si l'événement n'existe pas.

### `PATCH /api/events/[eventId]`

Active ou désactive les annonces pour un événement.

**Permission requise** : `events:manage`

**Body** :
```json
{
  "allowAnnouncements": true
}
```

**Réponse** : `{ "id": "clx...", "allowAnnouncements": true }`.

### `POST /api/events/[eventId]/departments`

Lie un département à un événement. Supporte l'application à toute une série récurrente.

**Permission requise** : `events:manage`

**Body** :
```json
{
  "departmentId": "clx...",
  "applyToSeries": false
}
```

- `applyToSeries` : si `true`, applique à tous les événements futurs de la série (y compris le courant)

**Réponse** : `201` avec le lien `eventDept` créé (ou `{ "created": N }` si série).

### `DELETE /api/events/[eventId]/departments`

Retire le lien entre un département et un événement. Supprime les plannings associes en cascade. Supporte la série.

**Permission requise** : `events:manage`

**Body** :
```json
{
  "departmentId": "clx...",
  "applyToSeries": false
}
```

**Réponse** : `{ "success": true }`.

### `GET /api/events/[eventId]/star-view`

Vue publique d'un événement avec tous les membres en service (statuts `EN_SERVICE`, `EN_SERVICE_DEBRIEF`, `REMPLACANT`), regroupés par département.

**Authentification** : session valide uniquement (pas de permission spécifique)

**Réponse** :
```json
{
  "event": {
    "id": "clx...",
    "title": "Culte du 02/03/2026",
    "date": "2026-03-02T10:00:00.000Z",
    "church": { "name": "ICC Rennes" }
  },
  "departments": [
    {
      "id": "clx...",
      "name": "Choristes",
      "ministryName": "Louange",
      "members": [
        { "id": "clx...", "firstName": "Marie", "lastName": "Dupont", "status": "EN_SERVICE" }
      ]
    }
  ],
  "totalStars": 12
}
```

### `POST /api/events/[eventId]/duplicate-planning`

Duplique le planning d'un événement source vers un événement cible. Seuls les départements communs aux deux événements sont copies.

**Permission requise** : `planning:edit`

**Body** :
```json
{
  "targetEventId": "clx..."
}
```

**Réponse** : `{ "copied": 15, "departments": 3 }`.

**Erreurs** :
- `400` si source et cible sont identiques
- `404` si l'événement source n'a pas de départements

### `GET /api/events/[eventId]/report`

Recupere le compte rendu d'un événement. Retourne `null` si aucun CR n'existe encore.

**Permission requise** : `events:manage` ou `reports:view`

**Réponse** :
```json
{
  "id": "clx...",
  "eventId": "clx...",
  "churchId": "clx...",
  "speaker": "Pasteur Martin",
  "messageTitle": "La foi en action",
  "notes": "Bonne participation generale.",
  "decisions": "Revoir la disposition des chaises.",
  "author": { "id": "clx...", "name": "Jean Dupont" },
  "sections": [
    {
      "id": "clx...",
      "label": "Louange",
      "position": 0,
      "departmentId": "clx...",
      "department": { "id": "clx...", "name": "Choristes", "ministry": { "name": "Louange" } },
      "stats": { "EN_SERVICE": 8, "INDISPONIBLE": 2 },
      "notes": "Bonne energie ce matin."
    }
  ]
}
```

**Erreur** : `403` si les comptes rendus ne sont pas actives pour cet événement.

### `PUT /api/events/[eventId]/report`

Crée ou remplace entièrement le compte rendu d'un événement. Les sections existantes sont supprimées et recrées à chaque appel.

**Permission requise** : `events:manage` ou `reports:edit`

**Body** (valide par Zod) :
```json
{
  "speaker": "Pasteur Martin",
  "messageTitle": "La foi en action",
  "notes": "Bonne participation generale.",
  "decisions": "Revoir la disposition des chaises.",
  "sections": [
    {
      "label": "Louange",
      "position": 0,
      "departmentId": "clx...",
      "stats": { "EN_SERVICE": 8, "INDISPONIBLE": 2 },
      "notes": "Bonne energie ce matin."
    }
  ]
}
```

- `speaker` : nom de l'orateur (optionnel)
- `messageTitle` : titre du message (optionnel)
- `notes` : notes générales du CR (optionnel)
- `decisions` : décisions prises lors de l'événement (optionnel)
- `sections` : tableau de sections (peut être vide)
  - `label` : intitulé de la section (requis)
  - `position` : ordre d'affichage (défaut : index dans le tableau)
  - `departmentId` : ID du département associe (optionnel)
  - `stats` : objet JSON libre clé/valeur numériques (optionnel). Par convention, les sections "Accueil" et "Integration" utilisent les clés `hommes`, `femmes`, `enfants`, `passage`, `convertis` pour alimenter l'export Excel.
  - `notes` : notes spécifiques à la section (optionnel)

**Réponse** : le CR complet avec ses sections.

**Erreurs** :
- `404` si l'événement est introuvable
- `403` si les comptes rendus ne sont pas actives pour cet événement

### `GET /api/events/reports/export`

Exporte les statistiques des cultes au format Excel (`.xlsx`) sur une période donnée.

**Permission requise** : `reports:view`

**Parametres** (query string) :
- `churchId` (requis) : ID de l'église
- `from` (optionnel) : date de début ISO (défaut : 1er jour du mois courant)
- `to` (optionnel) : date de fin ISO (défaut : dernier jour du mois courant)

**Réponse** : fichier Excel avec une feuille **"Statistiques cultes"** contenant 13 colonnes :

| Colonne | Source |
|---|---|
| Date du culte | `event.date` formaté `fr-FR` |
| Église | nom de l'église |
| Orateur | `report.speaker` |
| Titre du message | `report.messageTitle` |
| Hommes | `section["Accueil"].stats.hommes` |
| Femmes | `section["Accueil"].stats.femmes` |
| Enfants | `section["Accueil"].stats.enfants` |
| Total adultes | `hommes + femmes` (null si l'un manque) |
| Total général | `totalAdultes + enfants` (null si l'un manque) |
| Nouveaux arrivants (H) | `section["Integration"].stats.hommes` |
| Nouveaux arrivants (F) | `section["Integration"].stats.femmes` |
| De passage | `section["Integration"].stats.passage` |
| Nouveaux convertis | `section["Integration"].stats.convertis` |

**Convention des sections** : les sections sont localisées par leur `label` de manière insensible à la casse et aux accents (NFD normalization). La section "Accueil" est recherchée par correspondance exacte (`label` normalisé = `"accueil"`). La section "Integration" est recherchée par préfixe (`label` normalisé commence par `"integration"`).

Si la section ou la clé est absente, la colonne vaut `null` dans le fichier.

**Sécurité Excel** : les valeurs commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot sont préfixées d'une apostrophe pour prévenir l'injection de formules.

**Nom du fichier** : `statistiques-cultes-{mois}-{annee}.xlsx` (ou plage si multi-mois)

**Erreurs** :
- `400` si `churchId` est manquant
- `403` si l'utilisateur n'a pas la permission `reports:view`

---

## Départements

### `GET /api/departments/[departmentId]/members`

Liste les membres d'un département, triés par nom.

**Parametres** : `departmentId` — ID du département (cuid)

**Réponse** :
```json
[
  {
    "id": "clx...",
    "firstName": "Marie",
    "lastName": "Dupont",
    "departmentId": "clx...",
    "createdAt": "..."
  }
]
```

### `PATCH /api/departments/[departmentId]`

Assigne ou retire la fonction spéciale d'un département (`DepartmentFunction`).

**Permission requise** : `events:manage` (et non `departments:manage`)

**Body** :
```json
{
  "function": "SECRETARIAT"
}
```

Valeurs possibles : `"SECRETARIAT"`, `"COMMUNICATION"`, `"PRODUCTION_MEDIA"`, `null` (pour retirer la fonction).

**Règle métier** : une seule fonction par type est autorisée par église. Si un autre département de la même église possède déjà cette fonction, elle lui est retirée automatiquement.

**Réponse** : `{ "id": "clx...", "name": "Secretariat Rennes", "function": "SECRETARIAT" }`.

### `GET /api/departments/[departmentId]/stats`

Statistiques de service d'un département sur une période donnée.

**Permission requise** : `planning:view`

**Query params** :
- `months` (optionnel, défaut : `6`) — période glissante en mois en arrière depuis aujourd'hui (ignoré si `from`/`to` sont fournis)
- `from` (optionnel) — début de période ISO, ex : `2026-01-01` (prend le pas sur `months`)
- `to` (optionnel) — fin de période ISO, ex : `2026-03-31`

**Réponse** :
```json
{
  "department": { "id": "clx...", "name": "Choristes" },
  "totalEvents": 12,
  "months": 6,
  "members": [
    {
      "id": "clx...",
      "name": "Marie Dupont",
      "services": 10,
      "indisponible": 1,
      "rate": 83
    }
  ],
  "trend": [
    { "month": "2026-01", "enService": 8, "totalSlots": 10 }
  ],
  "taskStats": {
    "tasks": [
      { "id": "clx...", "name": "Régisseur son", "count": 7 }
    ],
    "memberTasks": [
      {
        "id": "clx...",
        "name": "Marie Dupont",
        "totalAssignments": 5,
        "tasks": [
          { "taskId": "clx...", "taskName": "Régisseur son", "count": 3 },
          { "taskId": "clx...", "taskName": "Coordination", "count": 2 }
        ]
      }
    ]
  }
}
```

**Calculs** :
- `members[].services` — nombre d'événements ou le statut de planning est `EN_SERVICE` ou `EN_SERVICE_DEBRIEF`
- `members[].indisponible` — nombre d'événements ou le statut est `INDISPONIBLE`
- `members[].rate` — `round(services / totalEvents * 100)`, vaut `0` si `totalEvents === 0`
- `trend[].enService` — nombre de creneaux EN_SERVICE ou EN_SERVICE_DEBRIEF pour le mois
- `trend[].totalSlots` — nombre total de creneaux de planning (toutes lignes du tableau)
- `taskStats.tasks[].count` — nombre total d'affectations de la tâche sur la période
- `taskStats.memberTasks[].totalAssignments` — somme de toutes les affectations de tâches pour le membre

Les listes `members` et `memberTasks` sont triées par valeur décroissante (`services` et `totalAssignments` respectivement).

**Erreur** : `404` si le département est introuvable.

### `GET /api/departments/[departmentId]/tasks`

Liste les tâches configurées pour un département.

**Permission requise** : `planning:view`

**Réponse** : tableau de tâches `{ id, name, description, departmentId, createdAt }`.

### `POST /api/departments/[departmentId]/tasks`

Crée une nouvelle tâche pour un département.

**Permission requise** : `planning:edit`

**Body** :
```json
{
  "name": "Régisseur son",
  "description": "Responsable de la console de mixage"
}
```

**Réponse** : `201` avec la tâche créée.

**Erreur** : `409` si une tâche avec ce nom existe déjà dans ce département.

### `DELETE /api/departments/[departmentId]/tasks`

Supprime une tâche d'un département.

**Permission requise** : `planning:edit`

**Body** :
```json
{
  "taskId": "clx..."
}
```

**Réponse** : `{ "success": true }`.

### `GET /api/departments/[departmentId]/monthly-planning`

Vue mensuelle du planning d'un département (membres en service et leurs tâches).

**Authentification** : session valide uniquement (pas de permission spécifique)

**Query params** :
- `month` (optionnel) — mois au format `YYYY-MM` (défaut : mois courant)

**Réponse** :
```json
{
  "events": [
    {
      "id": "clx...",
      "title": "Culte du 02/03/2026",
      "date": "2026-03-02T10:00:00.000Z",
      "members": [
        {
          "id": "clx...",
          "firstName": "Marie",
          "lastName": "Dupont",
          "status": "EN_SERVICE",
          "tasks": ["Régisseur son"]
        }
      ]
    }
  ]
}
```

---

## Planning

### `GET /api/events/[eventId]/departments/[deptId]/planning`

Recupere le planning d'un département pour un événement.
Retourne tous les membres du département avec leur statut.

**Parametres** :
- `eventId` — ID de l'événement (cuid)
- `deptId` — ID du département (cuid)

**Réponse** :
```json
{
  "eventDepartment": {
    "id": "clx...",
    "eventId": "clx...",
    "departmentId": "clx..."
  },
  "members": [
    {
      "id": "clx...",
      "firstName": "Marie",
      "lastName": "Dupont",
      "departmentId": "clx...",
      "createdAt": "...",
      "status": "EN_SERVICE",
      "planningId": "clx..."
    },
    {
      "id": "clx...",
      "firstName": "Jean",
      "lastName": "Martin",
      "departmentId": "clx...",
      "createdAt": "...",
      "status": null,
      "planningId": null
    }
  ]
}
```

**Erreur** : `404` si le lien événement-département n'existe pas.

### `PUT /api/events/[eventId]/departments/[deptId]/planning`

Met à jour le planning d'un département pour un événement.
Crée le lien événement-département s'il n'existe pas.

**Parametres** :
- `eventId` — ID de l'événement (cuid)
- `deptId` — ID du département (cuid)

**Body** (valide par Zod) :
```json
{
  "plannings": [
    { "memberId": "clx...", "status": "EN_SERVICE" },
    { "memberId": "clx...", "status": "EN_SERVICE_DEBRIEF" },
    { "memberId": "clx...", "status": null }
  ]
}
```

Valeurs possibles pour `status` : `"EN_SERVICE"`, `"EN_SERVICE_DEBRIEF"`, `"INDISPONIBLE"`, `"REMPLACANT"`, `null`.

**Règle métier** : un seul membre par département par événement peut avoir le statut `EN_SERVICE_DEBRIEF`.

**Réponse** : tableau des plannings upserted.

**Erreurs** :
- `400` si plus d'un `EN_SERVICE_DEBRIEF`
- `400` si le body ne passe pas la validation Zod

### `GET /api/events/[eventId]/departments/[deptId]/tasks`

Liste les tâches du département pour un événement avec leurs assignations.

**Permission requise** : `planning:view`

**Réponse** : tableau de tâches avec `assignments[].member` (membres assignés pour cet événement).

### `PUT /api/events/[eventId]/departments/[deptId]/tasks`

Assigne des membres à une tâche pour un événement. Remplace les assignations existantes.

**Permission requise** : `planning:edit`

**Body** :
```json
{
  "taskId": "clx...",
  "memberIds": ["clx...", "clx..."]
}
```

**Règle métier** : seuls les membres avec le statut `EN_SERVICE` ou `EN_SERVICE_DEBRIEF` pour cet événement peuvent être assignés.

**Réponse** : la tâche mise à jour avec ses assignations.

**Erreurs** :
- `400` si un membre n'est pas en service pour cet événement
- `404` si la tâche ou le lien événement-département est introuvable

---

## Utilisateurs et rôles

### `GET /api/users`

Liste les utilisateurs avec leurs rôles par église.

**Permission requise** : `members:manage`

**Query params** :
- `churchId` (optionnel) — filtre par église

**Réponse** : tableau d'utilisateurs avec `churchRoles[].church`.

### `GET /api/users/search`

Recherche d'utilisateurs par nom pour l'autocomplete (non documenté séparément, utilisé dans la gestion des rôles).

### `PATCH /api/users/[userId]/profile`

Met à jour le nom d'affichage d'un utilisateur.

**Autorisation** : l'utilisateur peut modifier son propre profil ; les rôles `SUPER_ADMIN`, `ADMIN` et `SECRETARY` peuvent modifier n'importe quel profil.

**Body** :
```json
{
  "displayName": "Marie Dupont"
}
```

**Réponse** : `{ "id": "clx...", "displayName": "Marie Dupont" }`.

### `POST /api/users/[userId]/roles`

Ajoute un rôle à un utilisateur dans une église.

**Permission requise** : `users:manage` ou `departments:manage`

**Body** :
```json
{
  "churchId": "clx...",
  "role": "MINISTER",
  "ministryId": "clx...",
  "departmentIds": ["clx...", "clx..."],
  "departments": [
    { "id": "clx...", "isDeputy": false },
    { "id": "clx...", "isDeputy": true }
  ]
}
```

- `role` : valeurs possibles : `"SUPER_ADMIN"`, `"ADMIN"`, `"SECRETARY"`, `"MINISTER"`, `"DEPARTMENT_HEAD"`, `"DISCIPLE_MAKER"`, `"REPORTER"`
- `ministryId` : optionnel, utilisé si `role` = `"MINISTER"`
- `departments` : format enrichi `{ id, isDeputy }[]` pour `DEPARTMENT_HEAD` — distingue responsable principal (`isDeputy: false`) et adjoint (`isDeputy: true`)
- `departmentIds` : format legacy `string[]`, équivalent à `departments` avec `isDeputy: false` pour tous

Les rôles privilégiés (`SUPER_ADMIN`, `ADMIN`, `SECRETARY`) ne peuvent être assignés que par un `SUPER_ADMIN`.

**Réponse** : `201` avec le rôle créé (inclut `church`, `ministry`, `departments`).

### `PATCH /api/users/[userId]/roles`

Modifie l'affectation d'un rôle existant (ministère ou départements).

**Permission requise** : `users:manage` ou `departments:manage`

**Body** :
```json
{
  "roleId": "clx...",
  "ministryId": "clx...",
  "departmentIds": ["clx...", "clx..."],
  "departments": [
    { "id": "clx...", "isDeputy": false }
  ]
}
```

- `ministryId` : `string | null` pour MINISTER
- `departments` / `departmentIds` : même logique que pour POST (remplace les assignations existantes)

**Réponse** : `200` avec le rôle mis à jour.

**Erreur** : `404` si le rôle n'appartient pas à l'utilisateur.

### `DELETE /api/users/[userId]/roles`

Supprime un rôle d'un utilisateur. Supprime en cascade les `UserDepartment` associes.

**Permission requise** : `users:manage` ou `departments:manage`

**Body** :
```json
{
  "churchId": "clx...",
  "role": "DEPARTMENT_HEAD"
}
```

**Réponse** : `200` avec `{ "success": true }`.

---

## Membres (STAR)

### `GET /api/members/search`

Recherche de STAR par nom pour l'autocomplete (utilisée depuis la page de liaison de compte). Retourne uniquement les membres sans lien utilisateur existant.
La recherche est insensible aux accents et à la casse (normalisation NFD côté serveur).

**Authentification** : session valide uniquement (pas de permission spécifique)

**Query params** :
- `q` (requis) — terme de recherche (minimum 2 caractères)
- `churchId` (requis) — ID de l'église

**Réponse** : tableau de membres `{ id, firstName, lastName }` (max 10 résultats).

---

## Liaison compte utilisateur / STAR

### `POST /api/member-user-links`

Crée un lien direct entre un utilisateur et un STAR (sans workflow de validation). Met à jour le nom d'affichage de l'utilisateur avec le nom du STAR.

**Permission requise** : `members:manage`

**Body** :
```json
{
  "memberId": "clx...",
  "userId": "clx...",
  "churchId": "clx..."
}
```

**Réponse** : `201` avec le lien créé.

**Erreurs** :
- `404` si le STAR ou l'utilisateur est introuvable
- `409` si le STAR est déjà lié à un compte ou si l'utilisateur est déjà lié à un STAR dans cette église

### `POST /api/member-link-requests`

Soumet une demande de liaison d'un compte utilisateur à un STAR (workflow de validation par un admin). Trois modes : liaison à un STAR existant, création d'un nouveau STAR, ou rôle transverse sans carte STAR.

**Authentification** : session valide uniquement (tout utilisateur authentifié peut soumettre)

**Body — mode lien vers STAR existant** :
```json
{
  "type": "existing",
  "memberId": "clx...",
  "churchId": "clx...",
  "departmentId": "clx...",
  "requestedRole": "DEPARTMENT_HEAD",
  "notes": "Responsable des choristes"
}
```

**Body — mode création de nouveau STAR** :
```json
{
  "type": "new",
  "firstName": "Marie",
  "lastName": "Dupont",
  "phone": "+33 6 00 00 00 00",
  "churchId": "clx...",
  "departmentId": "clx...",
  "requestedRole": null,
  "notes": "Nouvelle choriste"
}
```

**Body — mode rôle transverse (sans carte STAR)** :
```json
{
  "type": "no_star",
  "churchId": "clx...",
  "requestedRole": "DISCIPLE_MAKER",
  "notes": "Faiseur de disciples"
}
```

Champs optionnels communs :
- `departmentId` — département associe (requis pour DEPARTMENT_HEAD / DEPUTY)
- `ministryId` — ministère associe (requis pour MINISTER)
- `requestedRole` — rôle demande : `DEPARTMENT_HEAD`, `DEPUTY`, `MINISTER`, `DISCIPLE_MAKER`, `REPORTER`, ou null (membre régulier)
- `notes` — notes libres

**Réponse** : `201` avec la demande créée.

**Erreurs** :
- `409` si une demande `PENDING` existe déjà pour cet utilisateur
- `409` si l'utilisateur est déjà lié à un STAR dans cette église
- `409` si le STAR visé est déjà lié à un autre compte

### `GET /api/member-link-requests`

Liste les demandes de liaison, filtrées par statut.

**Permission requise** : `members:manage`

**Query params** :
- `churchId` (optionnel) — filtre par église
- `status` (optionnel, défaut : `"PENDING"`) — `"PENDING"`, `"APPROVED"` ou `"REJECTED"`

**Réponse** : tableau de demandes avec `user`, `member` (si existant) et `church`.

### `PATCH /api/member-link-requests/[id]`

Approuve ou rejette une demande de liaison.

**Permission requise** : `members:manage`

**Body** :
```json
{
  "action": "approve",
  "departmentId": "clx..."
}
```

ou pour un rejet :
```json
{
  "action": "reject",
  "rejectReason": "STAR introuvable dans notre base"
}
```

- `departmentId` : requis uniquement si `action` = `"approve"` et la demande est de type `"new"` (création d'un nouveau STAR)

**Logique d'approbation** :
- Si le STAR existait : crée le lien `MemberUserLink` directement
- Si c'est une nouvelle demande : crée le STAR dans le département spécifié, puis crée le lien
- Met à jour le `displayName` de l'utilisateur avec le nom du STAR dans tous les cas
- **Création de rôles automatique selon `requestedRole`** :
  - `null` → `MemberUserLink` uniquement (membre régulier, pas de rôle admin)
  - `DEPARTMENT_HEAD` / `DEPUTY` → `UserChurchRole(DEPARTMENT_HEAD)` + `UserDepartment` (adjoint si `DEPUTY`)
  - `MINISTER` → `UserChurchRole(MINISTER)` avec `ministryId`
  - `DISCIPLE_MAKER` / `REPORTER` → `UserChurchRole` uniquement (pas de `MemberUserLink` pour le type `no_star`)

**Réponse** : `{ "approved": true }` ou la demande mise à jour (si rejet).

**Erreur** : `409` si la demande a déjà été traitée.

---

## Annonces

### `GET /api/announcements`

Liste les annonces. Les utilisateurs avec `events:manage` voient toutes les annonces de l'église ; les autres voient uniquement leurs propres soumissions.

**Query params** :
- `churchId` (requis) — ID de l'église

**Réponse** : tableau d'annonces avec `submittedBy`, `department`, `ministry`, `targetEvents` et `serviceRequests` (hors demandes enfants).

### `POST /api/announcements`

Soumet une nouvelle annonce et génère automatiquement les `ServiceRequest` correspondants selon les canaux cochés.

**Permission requise** : `planning:view` (tout utilisateur authentifié peut soumettre)

**Body** (valide par Zod) :
```json
{
  "churchId": "clx...",
  "title": "Concert de Noel",
  "content": "Rejoignez-nous pour...",
  "eventDate": "2026-12-24T18:00:00.000Z",
  "channelInterne": true,
  "channelExterne": false,
  "isUrgent": false,
  "departmentId": "clx...",
  "ministryId": "clx...",
  "targetEventIds": ["clx..."]
}
```

- `channelInterne` et/ou `channelExterne` : au moins un des deux est requis
- `isSaveTheDate` : calculé automatiquement si `eventDate` est dans plus de 21 jours

**Logique de génération des ServiceRequests** :
- Canal INTERNE : crée `DIFFUSION_INTERNE` (assigne au dept Secrétariat) + `VISUEL` (assigne au dept Production Media, format : Slide/Affiche, lié au `DIFFUSION_INTERNE`)
- Canal EXTERNE : crée `RESEAUX_SOCIAUX` (assigne au dept Communication) + `VISUEL` (assigne au dept Production Media, format : Story/Post, lié au `RESEAUX_SOCIAUX`)
- Multicanal : 4 `ServiceRequest` créés

**Réponse** : `201` avec l'annonce créée.

### `GET /api/announcements/[id]`

Détail d'une annonce avec ses `serviceRequests` (avec enfants VISUEL).

**Erreur** : `404` si introuvable.

### `PATCH /api/announcements/[id]`

Met à jour une annonce (statut, titre, contenu, urgence).

**Autorisation** :
- Gestionnaires (`events:manage`) : peuvent modifier tous les champs et tous les statuts
- Propriétaire de l'annonce : peut uniquement passer le statut à `"ANNULEE"` (annulation)

**Body** (tous les champs sont optionnels) :
```json
{
  "status": "EN_COURS",
  "title": "Nouveau titre",
  "content": "Nouveau contenu",
  "isUrgent": true
}
```

Valeurs possibles pour `status` : `"EN_ATTENTE"`, `"EN_COURS"`, `"TRAITEE"`, `"ANNULEE"`.
Le propriétaire est restreint à `"ANNULEE"` uniquement.

**Annulation en cascade** : si `status` = `"ANNULEE"`, toutes les `ServiceRequest` liées à l'annonce (`announcementId`) sont automatiquement annulées dans la même transaction (y compris les demandes VISUEL enfants).

### `DELETE /api/announcements/[id]`

Supprime une annonce. Autorisé pour les gestionnaires ou le propriétaire.

**Réponse** : `200` avec `{ "deleted": "clx..." }`.

---

## Demandes de service

### `GET /api/service-requests`

Liste les demandes de service. Les gestionnaires (`events:manage`) voient tout ; les autres voient leurs propres demandes.

**Query params** :
- `churchId` (requis) — ID de l'église
- `type` (optionnel) — filtre par type : `VISUEL`, `DIFFUSION_INTERNE`, `RESEAUX_SOCIAUX`
- `assignedDeptId` (optionnel) — filtre par département assigne

**Réponse** : tableau de demandes parentes (hors demandes enfants VISUEL), avec `submittedBy`, `department`, `ministry`, `assignedDept`, `announcement`, `childRequests`.

### `POST /api/service-requests`

Crée une demande de service `VISUEL` standalone (sans annonce liée).

**Permission requise** : `planning:view`

**Body** (valide par Zod) :
```json
{
  "churchId": "clx...",
  "title": "Visuel pour affiche",
  "brief": "Description du visuel souhaite",
  "format": "Affiche A3",
  "deadline": "2026-04-01T00:00:00.000Z",
  "departmentId": "clx...",
  "ministryId": "clx..."
}
```

La demande est automatiquement assignée au département ayant la fonction `PRODUCTION_MEDIA`.

**Réponse** : `201` avec la demande créée.

### `GET /api/service-requests/[id]`

Détail d'une demande avec `submittedBy`, `assignedDept`, `reviewedBy`, `announcement`, `parentRequest`, `childRequests`.

**Erreur** : `404` si introuvable.

### `PATCH /api/service-requests/[id]`

Met à jour une demande de service (statut, lien de livraison, notes de revue, format, brief, deadline).

**Autorisation** : gestionnaires (`events:manage`), membre du département assigne ou propriétaire de la demande.

**Body** (tous les champs sont optionnels) :
```json
{
  "status": "LIVRE",
  "deliveryLink": "https://drive.google.com/...",
  "reviewNotes": "Livraison conforme",
  "format": "Story 1080x1920",
  "brief": "Description mise à jour",
  "deadline": "2026-04-01T00:00:00.000Z"
}
```

Valeurs possibles pour `status` : `"EN_ATTENTE"`, `"EN_COURS"`, `"LIVRE"`, `"ANNULE"`.

Lors d'un changement de statut, `reviewedById` et `reviewedAt` sont automatiquement renseignés.

**Annulation en cascade** : si `status` = `"ANNULE"` et que la demande est de type `DIFFUSION_INTERNE` ou `RESEAUX_SOCIAUX`, la demande `VISUEL` enfant (liée via `parentRequestId`) est automatiquement annulée dans la même transaction.

---

## Discipolat

Les endpoints de discipolat utilisent deux permissions spécifiques :
- `discipleship:view` — lecture des relations et statistiques
- `discipleship:manage` — création, modification, suppression
- `discipleship:export` — export Excel

Le périmètre est contrôlé par `getDiscipleshipScope()` : les rôles `DISCIPLE_MAKER` voient et gèrent uniquement leurs propres disciples ; les admins ont accès à tout.

### `GET /api/discipleships`

Liste les relations de discipolat d'une église.

**Permission requise** : `discipleship:view`

**Query params** :
- `churchId` (requis) — ID de l'église

**Réponse** : tableau de relations avec `disciple`, `discipleMaker` et `firstMaker`.

```json
[
  {
    "id": "clx...",
    "discipleId": "clx...",
    "discipleMakerId": "clx...",
    "firstMakerId": "clx...",
    "churchId": "clx...",
    "disciple": {
      "id": "clx...",
      "firstName": "Paul",
      "lastName": "Leroy",
      "department": { "name": "Choristes", "ministry": { "name": "Louange" } }
    },
    "discipleMaker": { "id": "clx...", "firstName": "Jean", "lastName": "Dupont" },
    "firstMaker": { "id": "clx...", "firstName": "Jean", "lastName": "Dupont" }
  }
]
```

### `POST /api/discipleships`

Crée une nouvelle relation de discipolat. Supporte deux modes : liaison à un STAR existant ou création d'un nouveau STAR (place dans le département système).

**Permission requise** : `discipleship:manage`

**Body — mode STAR existant** :
```json
{
  "discipleId": "clx...",
  "discipleMakerId": "clx...",
  "churchId": "clx...",
  "firstMakerId": "clx..."
}
```

**Body — mode nouveau STAR** :
```json
{
  "newMember": { "firstName": "Paul", "lastName": "Leroy" },
  "discipleMakerId": "clx...",
  "churchId": "clx...",
  "firstMakerId": "clx..."
}
```

- `firstMakerId` : optionnel ; si absent, prend la valeur de `discipleMakerId`
- Un `DISCIPLE_MAKER` ne peut créer des relations que pour lui-même

**Réponse** : `201` avec la relation créée.

**Erreurs** :
- `400` si le disciple et le FD sont la même personne
- `409` si le STAR a déjà un FD dans cette église

### `PATCH /api/discipleships/[id]`

Change le FD courant d'une relation de discipolat en conservant le `firstMakerId` d'origine. Remet `startedAt` à la date courante.

**Permission requise** : `discipleship:manage`

**Body** :
```json
{
  "discipleMakerId": "clx..."
}
```

**Réponse** : la relation mise à jour avec `disciple` et `discipleMaker`.

**Erreur** : `400` si le nouveau FD est le disciple lui-même.

### `DELETE /api/discipleships/[id]`

Supprime une relation de discipolat. Un `DISCIPLE_MAKER` ne peut supprimer que ses propres relations.

**Permission requise** : `discipleship:manage`

**Réponse** : `{ "deleted": true }`.

### `PATCH /api/discipleships/[id]/member`

Met à jour le profil (nom, email, téléphone) du disciple d'une relation. Un `DISCIPLE_MAKER` ne peut modifier que ses propres disciples.

**Permission requise** : `discipleship:manage`

**Body** :
```json
{
  "firstName": "Paul",
  "lastName": "Leroy",
  "email": "paul.leroy@example.com",
  "phone": "+33 6 00 00 00 00"
}
```

**Réponse** : le membre mis à jour avec son département et ministère.

### `GET /api/discipleships/attendance`

Liste les présences enregistrées pour un événement suivi.

**Permission requise** : `discipleship:view`

**Query params** :
- `eventId` (requis) — ID de l'événement

**Réponse** : tableau `{ memberId, present }`.

### `PUT /api/discipleships/attendance`

Enregistre les présences pour un événement suivi. Remplace les présences existantes.

**Permission requise** : `discipleship:manage`

**Comportement selon le périmètre** :
- `DISCIPLE_MAKER` : met à jour uniquement les présences de ses propres disciples
- Admin/Secrétaire : remplace toutes les présences de l'événement

**Body** :
```json
{
  "eventId": "clx...",
  "presentMemberIds": ["clx...", "clx..."]
}
```

Les membres absents de `presentMemberIds` sont automatiquement marqués absents.

**Réponse** : `{ "saved": true }`.

**Erreurs** :
- `404` si l'événement est introuvable
- `400` si l'événement n'est pas suivi pour le discipolat (`trackedForDiscipleship: false`)

### `GET /api/discipleships/stats`

Statistiques de participation aux événements de discipolat sur une période glissante.

**Permission requise** : `discipleship:view`

**Query params** :
- `churchId` (requis) — ID de l'église
- `from` (optionnel) — début de période ISO (défaut : 1er du mois courant)
- `to` (optionnel) — fin de période ISO (défaut : dernier jour du mois courant)

**Réponse** :
```json
{
  "period": { "from": "2026-03-01T00:00:00.000Z", "to": "2026-03-31T23:59:59.000Z" },
  "trackedEvents": [
    { "id": "clx...", "title": "Reunion disciples", "date": "2026-03-15T10:00:00.000Z" }
  ],
  "stats": [
    {
      "discipleshipId": "clx...",
      "disciple": { "id": "clx...", "firstName": "Paul", "lastName": "Leroy", "department": { "name": "Choristes", "ministry": { "name": "Louange" } } },
      "discipleMaker": { "id": "clx...", "firstName": "Jean", "lastName": "Dupont" },
      "firstMaker": { "id": "clx...", "firstName": "Jean", "lastName": "Dupont" },
      "stats": { "totalEvents": 3, "present": 2, "absent": 1, "rate": 67 }
    }
  ]
}
```

**Calculs** :
- `stats.present` — nombre d'événements où une présence `present: true` est enregistrée pour le disciple
- `stats.absent` — `totalEvents - present`
- `stats.rate` — `round(present / totalEvents * 100)`, vaut `null` si `totalEvents === 0`
- Le périmètre est contrôlé par `getDiscipleshipScope()` : un `DISCIPLE_MAKER` ne voit que ses propres disciples

### `GET /api/discipleships/tree`

Arbre de lignée récursif (profondeur illimitée) via requête SQL `WITH RECURSIVE`.

**Permission requise** : `discipleship:view`

**Query params** :
- `churchId` (requis) — ID de l'église
- `mode` (optionnel) — `"primary"` (lignée via `firstMakerId`, défaut) ou `"current"` (structure actuelle via `discipleMakerId`)
- `rootId` (optionnel) — ID du membre racine ; si absent, part des racines naturelles de l'arbre. Ignoré pour les `DISCIPLE_MAKER` (ancre sur leur propre noeud)

**Réponse** : tableau de noeuds enrichis, triés par profondeur :
```json
[
  {
    "id": "clx...",
    "discipleId": "clx...",
    "discipleMakerId": "clx...",
    "firstMakerId": "clx...",
    "depth": 0,
    "path": "clx-disciple-id",
    "disciple": { "id": "clx...", "firstName": "Paul", "lastName": "Leroy", "department": { "name": "Choristes", "ministry": { "name": "Louange" } } },
    "discipleMaker": { "id": "clx...", "firstName": "Jean", "lastName": "Dupont" },
    "firstMaker": { "id": "clx...", "firstName": "Jean", "lastName": "Dupont" }
  }
]
```

### `GET /api/discipleships/export`

Exporte les statistiques de discipolat au format Excel (`.xlsx`) sur une période donnée.

**Permission requise** : `discipleship:export`

**Query params** :
- `churchId` (requis) — ID de l'église
- `from` (optionnel) — début de période ISO (défaut : 1er du mois courant)
- `to` (optionnel) — fin de période ISO (défaut : dernier jour du mois courant)

**Réponse** : fichier `.xlsx` (`Content-Disposition: attachment; filename="discipolat-{mois}-{annee}.xlsx"`) avec deux feuilles :

**Feuille 1 — "Statistiques"** (une ligne par disciple, triée par FD puis disciple) :

| Colonne | Description |
|---|---|
| Disciple (Nom) | Nom de famille du disciple |
| Disciple (Prénom) | Prénom du disciple |
| Ministère | Ministère du département principal |
| Département | Département principal du disciple |
| FD actuel | `{prénom} {nom}` du faiseur de disciples courant |
| Premier FD | `{prénom} {nom}` du premier faiseur de disciples |
| Présences | Nombre d'événements suivis où le disciple était présent |
| Événements suivis | Nombre total d'événements trackés sur la période |
| Absences | `Événements suivis - Présences` |
| Taux (%) | `round(Présences / Événements suivis * 100)`, vide si aucun événement |

**Feuille 2 — "Détail présences"** (une ligne par couple disciple × événement, absente si aucun événement tracké) :

| Colonne | Description |
|---|---|
| Disciple | `{prénom} {nom}` du disciple |
| FD actuel | `{prénom} {nom}` du FD courant |
| Événement | Titre de l'événement |
| Date | Date formatée `fr-FR` |
| Présent | `"Oui"` ou `"Non"` |

**Sécurité Excel** : valeurs commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot préfixées d'une apostrophe.

**Erreurs** :
- `400` si `churchId` est manquant
- `403` si l'utilisateur n'a pas la permission `discipleship:export`

---

## Médias

Le module média gère les galeries photos (événements) et les projets de production (vidéos, visuels). Il expose deux familles d'endpoints : des routes authentifiées (admin/upload) et des routes publiques accessibles via token de partage.

### Permissions

| Permission | Rôles | Description |
|---|---|---|
| `media:view` | SUPER_ADMIN, ADMIN, SECRETARY | Consulter événements, projets, fichiers |
| `media:upload` | SUPER_ADMIN, ADMIN, SECRETARY | Uploader, supprimer photos et fichiers |
| `media:review` | SUPER_ADMIN, ADMIN | Valider / rejeter photos et fichiers |
| `media:manage` | SUPER_ADMIN, ADMIN | Créer/supprimer événements et projets, gérer les tokens |

---

### Événements médias

#### `GET /api/media-events`

Liste les événements médias de l'église courante.

**Permission requise** : `media:view`

**Réponse** : tableau d'événements avec `_count.photos`, `_count.files`, `createdBy`, `planningEvent`.

#### `POST /api/media-events`

Crée un événement média.

**Permission requise** : `media:manage`

**Body** :
```json
{
  "churchId": "clx...",
  "name": "Culte de Pâques 2026",
  "date": "2026-04-05T10:00:00.000Z",
  "description": "Photos du culte pascal",
  "planningEventId": "clx..."
}
```

- `planningEventId` : optionnel — lie l'événement média à un événement planning

**Réponse** : `201` avec l'événement créé.

#### `GET /api/media-events/[id]`

Détail d'un événement avec `photos`, `shareTokens`, `createdBy`, `planningEvent`, `_count`.

**Permission requise** : `media:view`

#### `PATCH /api/media-events/[id]`

Met à jour le nom, la date, la description ou le statut d'un événement.

**Permission requise** : `media:manage`

**Body** (champs optionnels) :
```json
{
  "name": "Nouveau nom",
  "status": "PENDING_REVIEW"
}
```

Valeurs possibles pour `status` : `DRAFT`, `PENDING_REVIEW`, `REVIEWED`, `ARCHIVED`.

#### `DELETE /api/media-events/[id]`

Supprime un événement et toutes ses photos (S3 + BDD).

**Permission requise** : `media:manage`

---

#### `GET /api/media-events/[id]/photos`

Liste les photos d'un événement avec URLs signées des thumbnails (valables ~1h).

**Permission requise** : `media:view`

**Réponse** : tableau de photos avec `thumbnailUrl` (URL signée S3).

#### `POST /api/media-events/[id]/photos`

Upload une ou plusieurs photos (multipart/form-data).

**Permission requise** : `media:upload`

**Body** : `multipart/form-data`, champ `files` (plusieurs fichiers acceptés).

Formats acceptés : JPEG, PNG, WebP. Chaque photo est redimensionnée (original + thumbnail WebP) avant upload vers S3.

**Réponse** : `201` avec `{ uploaded: [{ id, filename }], errors: [...] }`.

#### `PATCH /api/media-events/[id]/photos`

Mise à jour de statut en masse.

**Permission requise** : `media:review`

**Body** :
```json
{
  "photoIds": ["clx...", "clx..."],
  "status": "APPROVED"
}
```

Valeurs possibles : `PENDING`, `APPROVED`, `REJECTED`, `PREVALIDATED`, `PREREJECTED`.

**Réponse** : `{ updated: N }`.

#### `DELETE /api/media-events/[id]/photos`

Supprime une ou plusieurs photos (S3 + BDD).

**Permission requise** : `media:upload`

**Query params** : `photoIds=id1,id2,...`

**Réponse** : `{ deleted: N }`.

---

#### `POST /api/media-events/[id]/share`

Crée un token de partage pour l'événement.

**Permission requise** : `media:manage`

**Body** :
```json
{
  "type": "GALLERY",
  "label": "Familles",
  "expiresInDays": 7
}
```

Types de token :

| Type | URL publique | Usage |
|---|---|---|
| `GALLERY` | `/media/g/[token]` | Galerie lecture seule |
| `MEDIA` | `/media/d/[token]` | Téléchargement des photos approuvées |
| `VALIDATOR` | `/media/v/[token]` | Validation/rejet des photos |
| `PREVALIDATOR` | `/media/v/[token]` | Pré-validation (sans approbation finale) |

- `expiresInDays` : optionnel (absent = illimité)

**Réponse** : `201` avec le token créé.

#### `DELETE /api/media-events/[id]/share`

Supprime un token de partage.

**Permission requise** : `media:manage`

**Query params** : `tokenId=clx...`

---

### Projets médias

#### `GET /api/media-projects`

Liste les projets médias de l'église courante.

**Permission requise** : `media:view`

**Réponse** : tableau de projets avec `_count.files`, `createdBy`.

#### `POST /api/media-projects`

Crée un projet média.

**Permission requise** : `media:manage`

**Body** :
```json
{
  "churchId": "clx...",
  "name": "Clip de louange avril 2026",
  "description": "Montage vidéo du concert"
}
```

**Réponse** : `201` avec le projet créé.

#### `GET /api/media-projects/[id]`

Détail d'un projet avec `files` (et leur `versions[0]`), `shareTokens`, `createdBy`, `_count`.

**Permission requise** : `media:view`

#### `PATCH /api/media-projects/[id]`

Met à jour le nom ou la description d'un projet.

**Permission requise** : `media:manage`

#### `DELETE /api/media-projects/[id]`

Supprime un projet et tous ses fichiers (S3 + BDD).

**Permission requise** : `media:manage`

#### `POST /api/media-projects/[id]/share`

Identique à `POST /api/media-events/[id]/share` — crée un token de partage projet.

#### `DELETE /api/media-projects/[id]/share`

Supprime un token de partage projet. **Query params** : `tokenId=clx...`

---

### Fichiers médias

#### `POST /api/media/files/upload/sign`

Demande une URL pré-signée S3 pour un upload direct depuis le navigateur (évite le transit serveur).

**Permission requise** : `media:upload`

**Body** :
```json
{
  "filename": "vidéo-clip.mp4",
  "contentType": "vidéo/mp4",
  "size": 52428800,
  "type": "VIDÉO",
  "mediaProjectId": "clx..."
}
```

- `type` : `VIDEO`, `VISUAL` ou `PHOTO`
- `mediaProjectId` ou `mediaEventId` : l'un des deux est requis

**Réponse** : `{ fileId, uploadUrl, key }` — `uploadUrl` est utilisé pour un `PUT` direct vers S3 avec `Content-Type` correspondant.

Après upload S3 : confirmer via `PATCH /api/media/files/[fileId]` avec `{ originalKey: key }`.

#### `GET /api/media/files/[id]`

Détail d'un fichier avec sa dernière version.

**Permission requise** : `media:view`

#### `PATCH /api/media/files/[id]`

Met à jour le statut ou l'`originalKey` (confirmation post-upload).

**Permission requise** : `media:upload` (confirmation) ou `media:review` (changement de statut)

**Body** (champs optionnels) :
```json
{
  "status": "IN_REVIEW",
  "originalKey": "media-projects/clx.../files/clx.../v1/vidéo.mp4"
}
```

Valeurs possibles pour `status` : `DRAFT`, `IN_REVIEW`, `REVISION_REQUESTED`, `FINAL_APPROVED`, `REJECTED`.

#### `DELETE /api/media/files/[id]`

Supprime un fichier et toutes ses versions (S3 + BDD).

**Permission requise** : `media:upload`

---

#### `GET /api/media/files/[id]/versions`

Liste les versions d'un fichier avec URLs de streaming (signées, ~1h).

**Permission requise** : `media:view`

**Réponse** : `{ data: [{ id, versionNumber, streamUrl, notes, createdAt, createdBy }] }`

#### `POST /api/media/files/[id]/versions`

Crée une nouvelle version et retourne une URL pré-signée S3 pour l'upload direct.

**Permission requise** : `media:upload`

**Body** :
```json
{
  "filename": "clip-v2.mp4",
  "contentType": "vidéo/mp4",
  "size": 54000000,
  "notes": "Correction du générique"
}
```

**Réponse** : `{ versionId, uploadUrl, key }`.

---

#### `GET /api/media/files/[id]/comments`

Liste les commentaires d'un fichier (avec réponses imbriquées).

**Permission requise** : `media:view`

**Réponse** : `{ data: [{ id, type, content, timecode, author, replies, createdAt }] }`

#### `POST /api/media/files/[id]/comments`

Ajoute un commentaire sur un fichier.

**Permission requise** : `media:view`

**Body** :
```json
{
  "content": "Le générique est trop long",
  "type": "TIMECODE",
  "timecode": 12
}
```

- `type` : `GENERAL` ou `TIMECODE`
- `timecode` : secondes depuis le début (requis si `type = TIMECODE`)
- `parentId` : ID d'un commentaire parent pour les réponses (optionnel)

---

### Paramètres du module média

#### `GET /api/media/settings`

Récupère les paramètres globaux du module média pour l'église courante.

**Permission requise** : `media:view`

#### `PUT /api/media/settings`

Met à jour les paramètres du module.

**Permission requise** : `media:manage`

---

### Accès publics via token (sans authentification)

Ces routes sont accessibles sans session — le token de partage fait office d'authentification.

#### `GET /api/media/gallery/[token]`

Données de la galerie publique : liste des photos approuvées avec URLs signées.

**Réponse** : `{ token, event, photos: [{ id, filename, thumbnailUrl, size, width, height }] }`

#### `GET /api/media/validate/[token]`

Données pour la page de validation : liste des photos avec statuts et URLs signées.

#### `POST /api/media/validate/[token]/photo/[photoId]`

Valide ou rejette une photo depuis un lien validateur.

**Body** :
```json
{ "action": "approve" }
```

ou `{ "action": "reject" }` / `{ "action": "prevalidate" }` / `{ "action": "prereject" }`.

Le type du token détermine les actions autorisées : `VALIDATOR` → approve/reject, `PREVALIDATOR` → prevalidate/prereject.

#### `GET /api/media/download/[token]`

Données pour la page de téléchargement.

#### `GET /api/media/download/[token]/photo/[photoId]`

Génère une URL de téléchargement signée pour une photo approuvée.

**Réponse** : `{ downloadUrl }` (URL S3 signée avec `Content-Disposition: attachment`).

---

## Audio des cultes

Publication des enregistrements de culte (dépôt des séquences, nommage/ordonnancement, rendu
sonore normalise, diffusion via un lien public — voir
[ADR-0007](adr/0007-worker-hors-nextjs-table-jobs.md) pour le traitement asynchrone) et
bibliothèque d'écoute ouverte à tout membre (spec 021), servie depuis un cache disque local
(voir [ADR-0008](adr/0008-cache-disque-renditions-audio.md)).

L'espace `/audio` est à onglets à droits distincts : **(re)Écouter** (`audio:listen`, tous les
rôles), **Production** (`audio:view`) et **Paramètres** (`audio:manage`).

### Permissions

- `audio:listen` — écoute des cultes publiés (bibliothèque + fiche d'événement), **tous les rôles**
- `audio:view` — file d'attente et détail d'un culte
- `audio:upload` — dépôt et suppression de séquences
- `audio:review` — publication / depublication
- `audio:manage` — parametres du module

Le contrôle passe par `requireAudioAccess()`, qui accepte **aussi** un membre du département de
captation audio (`Department.function = "CAPTATION_AUDIO"`, configuré dans
`/admin/departments/functions`), sans rôle dédié. La dépublication utilise
`requireAudioUnpublishAccess()`, plus strict (voir [auth.md](auth.md)).

### Cultes

| Méthode | Endpoint | Permission | Rôle |
|---|---|---|---|
| `GET` | `/api/audio/services` | `audio:view` | File d'attente des cultes de l'église |
| `POST` | `/api/audio/services` | `audio:upload` | Crée un culte (titre, orateur, date, rattachable à un événement) |
| `GET` | `/api/audio/services/events` | `audio:upload` | Événements de l'église à une date donnée, pour proposer un rattachement au dépôt |
| `GET` | `/api/audio/services/[id]` | `audio:view` | Détail : sources, segments, rendus |
| `PATCH` | `/api/audio/services/[id]` | `audio:review` | Modifie titre, orateur, date, rattachement, couverture |
| `DELETE` | `/api/audio/services/[id]` | *(voir ci-dessus)* | Supprime le culte entier (tant qu'il n'est pas publié) |
| `PUT` | `/api/audio/services/[id]/sequences` | `audio:upload` | Enregistre l'ordre et les titres |
| `DELETE` | `/api/audio/services/[id]/sources/[sourceId]` | `audio:upload` | Supprime une séquence déposée (tant que le culte n'est pas publié) |
| `POST` | `/api/audio/services/[id]/publish` | `audio:review` | Crée les jobs `RENDER` manquants et publie |
| `POST` | `/api/audio/services/[id]/unpublish` | *(voir ci-dessus)* | Rend les liens partagés inopérants |

> Le culte passe en `READY` à la publication tant que des rendus restent à calculer, puis en
> `PUBLISHED` automatiquement quand le worker a terminé — aucune seconde action manuelle.

### Dépôt (upload multipart S3)

| Méthode | Endpoint | Rôle |
|---|---|---|
| `POST` | `/api/audio/services/[id]/upload/sign` | Crée l'`AudioSource` et renvoie une URL signée par part |
| `GET` | `/api/audio/services/[id]/upload/parts` | Parts déjà reçues (reprise après coupure) |
| `POST` | `/api/audio/services/[id]/upload/complete` | Finalise le multipart et programme le job `PROBE` |

Le navigateur envoie chaque part directement à S3. Le bucket doit exposer l'en-tête `ETag`
(CORS `ExposeHeaders`), faute de quoi la finalisation échoue.

### Écoute (bibliothèque, membre authentifié)

| Méthode | Endpoint | Permission | Rôle |
|---|---|---|---|
| `GET` | `/api/audio/services/[id]/stream/[segmentId]` | `requireAudioListenAccess` (+ église du culte) | Flux audio (`Range` HTTP, `200`/`206`) depuis le cache disque |
| `POST` | `/api/audio/services/[id]/play` | `requireAudioListenAccess` | Incrémente `AudioSegment.playCount` |
| `POST` | `/api/audio/services/[id]/share` | `audio:listen` (rôle dans l'église du culte, inchangé) | Réutilise ou crée un lien de partage (culte entier ou segment) |

Le culte doit être `PUBLISHED` (sinon `410`) ; appartenir à une autre église répond `403`
(écart au 404 uniforme initialement envisagé — cohérent avec `requireAudioAccess` ailleurs
dans le module, voir `specs/021-audio-bibliotheque-ecoute/plan.md`). Pas de route de liste :
l'onglet **(re)Écouter** est un Server Component qui lit directement le service `library.ts`.

`play` et `stream` passent par `requireAudioListenAccess()` (spec 036) plutôt que
`requireChurchPermission("audio:listen", …)` : le contrôle passe si l'appelant a `audio:listen`
dans l'église du culte **ou** si son église figure comme destinataire d'un partage de
bibliothèque ouvert par l'église du culte (voir *Partage de bibliothèque entre églises*
ci-dessous et [auth.md](auth.md)). `share` reste volontairement sur
`requireChurchPermission("audio:listen", …)` : un membre invité par un partage n'a aucun rôle
dans l'église propriétaire, donc échoue naturellement — générer un lien de partage public sur
le contenu d'une autre église est refusé sans code dédié.

### Parametres

| Méthode | Endpoint | Permission |
|---|---|---|
| `GET` / `PUT` | `/api/audio/settings` | `audio:manage` |

Couverture par défaut et modèle de noms de séquences. Le département de captation audio n'y est
plus configuré — voir *Permissions* ci-dessus.

### Partage de bibliothèque entre églises (spec 036)

Une église (Super Admin/Admin, `audio:manage`) peut ouvrir sa bibliothèque de cultes publiés à
une autre église de la plateforme, identifiée par son identifiant public (`Church.slug`). Le
partage est unilatéral : ouvrir sa bibliothèque à une église ne donne aucun accès retour, et
aucune route n'expose la liste des églises de la plateforme — le noeud se fait par saisie d'un
identifiant communiqué hors application.

#### `GET /api/audio/shares`

Liste les églises auxquelles l'église courante a ouvert sa bibliothèque, avec le propre
identifiant (slug) de l'église courante à communiquer à une église destinataire.

**Permission requise** : `audio:manage` (église courante)

**Réponse** :
```json
{
  "ownSlug": "icc-rennes",
  "shares": [
    { "id": "clx...", "churchName": "ICC Brest", "churchSlug": "icc-brest", "createdAt": "2026-09-02T10:00:00.000Z" }
  ]
}
```

#### `POST /api/audio/shares`

Résout un identifiant (slug) d'église puis, si confirmé, ouvre la bibliothèque de l'église
courante à l'église résolue. Résolution en deux temps sur un seul endpoint (plutôt qu'un
endpoint de résolution séparé) pour n'exposer qu'une seule surface d'énumération
identifiant → nom, gardée par `audio:manage` et limitée en débit.

**Permission requise** : `audio:manage` (église courante) — **limite en débit**
(`RATE_LIMIT_SENSITIVE`, clé par utilisateur)

**Body** (valide par Zod) :
```json
{ "slug": "icc-brest", "confirm": false }
```

- `slug` : identifiant de l'église à inviter
- `confirm` : `false` résout le slug et renvoie le nom de l'église **sans rien créer** (étape de
  vérification avant confirmation) ; `true` crée le partage

**Réponse** :
- `confirm: false` → `200` avec `{ "churchName": "ICC Brest" }`
- `confirm: true` → `201` avec `{ "id": "clx...", "churchName": "ICC Brest", "churchId": "clx...", "createdAt": "..." }`

**Erreurs** :
- `404` si le slug ne correspond à aucune église
- `400` si le slug saisi est celui de l'église courante (une église ne peut pas s'ouvrir sa
  bibliothèque à elle-même)
- `409` si l'église résolue est déjà destinataire d'un partage

Une création réussie (`confirm: true`) est journalisée dans l'historique des modifications
(`AuditLog`, `entityType: "AudioLibraryShare"`, `churchId` = église propriétaire).

#### `DELETE /api/audio/shares/[id]`

Révoque un partage de bibliothèque : l'église destinataire perd immédiatement l'accès aux
cultes publiés de l'église courante.

**Permission requise** : `audio:manage` (église courante) — le partage doit appartenir à
l'église courante (`404` sinon si l'ID ne correspond à aucun partage de l'église courante,
jamais confiance dans l'ID seul)

**Réponse** : `200` avec `{ "ok": true }`

Révocation journalisée dans l'historique des modifications au même titre que la création.

### Accès public via token (sans authentification)

| Méthode | Endpoint | Rôle |
|---|---|---|
| `GET` | `/api/audio/public/[token]` | Culte publié et ses segments |
| `POST` | `/api/audio/public/[token]/play` | Journalise une écoute (limite en débit) |
| `GET` | `/api/audio/public/[token]/stream/[segmentId]` | Flux audio (`Range` HTTP) depuis le cache disque — **modifié** (spec 021) : servait auparavant une redirection `302` vers une URL S3 signée |

Page de lecture associée : `/ecouter/[token]`, qui réutilise le même composant `<AudioPlayer>`
que la bibliothèque interne.

---

## Notifications

### `GET /api/notifications`

Liste les 20 dernières notifications de l'utilisateur courant avec le nombre de non-lues.

**Authentification** : session valide uniquement

**Réponse** :
```json
{
  "notifications": [
    {
      "id": "clx...",
      "type": "PLANNING_REMINDER",
      "title": "Rappel : Culte du dimanche",
      "message": "Marie Dupont est en service pour Choristes demain",
      "link": "/dashboard?dept=clx...&event=clx...",
      "read": false,
      "createdAt": "2026-03-01T08:00:00.000Z"
    }
  ],
  "unreadCount": 3
}
```

### `PATCH /api/notifications`

Marque des notifications comme lues.

**Authentification** : session valide uniquement

**Body** — marquer des notifications spécifiques :
```json
{
  "ids": ["clx...", "clx..."]
}
```

**Body** — marquer toutes les notifications comme lues :
```json
{
  "all": true
}
```

**Réponse** : `{ "success": true }`.

---

## Journaux d'audit

### `GET /api/audit-logs`

Liste les journaux d'audit de l'église courante, paginés.

**Permission requise** : `church:manage`

**Query params** :
- `page` (optionnel, défaut : `1`) — numéro de page
- `limit` (optionnel, défaut : `50`, max : `100`) — nombre de résultats par page

**Réponse** :
```json
{
  "logs": [
    {
      "id": "clx...",
      "action": "CREATE_DISCIPLESHIP",
      "entityType": "Discipleship",
      "entityId": "clx...",
      "churchId": "clx...",
      "createdAt": "2026-03-01T10:00:00.000Z",
      "user": { "id": "clx...", "name": "Jean Dupont", "displayName": "Jean Dupont", "email": "jean@example.com" }
    }
  ],
  "total": 145,
  "page": 1,
  "totalPages": 3
}
```

---

## Église courante

### `POST /api/current-church`

Définit l'église active de l'utilisateur via un cookie HTTP-only (durée : 30 jours).

**Authentification** : session valide uniquement

**Body** :
```json
{
  "churchId": "clx..."
}
```

**Réponse** : `{ "churchId": "clx..." }`.

**Erreur** : `403` si l'utilisateur n'a pas accès à cette église.

---

## Tâches CRON

### `POST /api/cron/reminders`

Envoie les rappels de service (emails + notifications in-app) pour les événements à J-1 et J-3.

**Authentification** : token secret via header `Authorization: Bearer {CRON_SECRET}`

**Comportement** :
- Identifie les événements ayant lieu dans 1 ou 3 jours
- Pour chaque membre en service (`EN_SERVICE` ou `EN_SERVICE_DEBRIEF`) : envoie un email si SMTP est configuré et si le membre a une adresse email
- Pour chaque responsable de département concerné : crée une notification in-app

**Réponse** :
```json
{
  "emailsSent": 5,
  "notificationsCreated": 8
}
```

---

## Utilisateur — préférences

### `PATCH /api/user/tour-seen`

Marque le tutoriel de découverte comme vu pour l'utilisateur courant.

**Authentification** : session valide uniquement

**Réponse** : `{ "hasSeenTour": true }`.
