# API

Toutes les routes API sont des [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) dans `src/app/api/`.

Toutes les routes (sauf `/api/auth/*` et `/api/cron/*`) necessitent une session NextAuth valide.

## Format des reponses

**Succes** : JSON avec les donnees directement dans le body.

**Erreur** :
```json
{ "error": "Message d'erreur" }
```

Codes HTTP utilises : `200`, `201`, `400`, `401`, `403`, `404`, `409`, `500`.

---

## Authentification

### `GET/POST /api/auth/[...nextauth]`

Gere par NextAuth. Inclut :

- `GET /api/auth/signin` — page de connexion
- `GET /api/auth/callback/google` — callback OAuth Google
- `GET /api/auth/session` — session courante
- `POST /api/auth/signout` — deconnexion

---

## Eglises

### `GET /api/churches`

Liste toutes les eglises avec le nombre d'utilisateurs, de ministeres et d'evenements.

**Permission requise** : `church:manage` (ou Super Admin)

**Reponse** : tableau d'eglises avec `_count.users`, `_count.ministries`, `_count.events`.

### `POST /api/churches`

Cree une nouvelle eglise. Assigne automatiquement le role `SUPER_ADMIN` a tous les super admins existants sur cette eglise.

**Permission requise** : `church:manage` (ou Super Admin)

**Body** :
```json
{
  "name": "ICC Rennes",
  "slug": "icc-rennes"
}
```

- `slug` : optionnel, genere automatiquement depuis le nom si absent

**Reponse** : `201` avec l'eglise creee.

### `PATCH /api/churches`

Actions bulk sur plusieurs eglises (suppression ou mise a jour).

**Permission requise** : `church:manage` (ou Super Admin)

**Body** :
```json
{
  "ids": ["clx...", "clx..."],
  "action": "delete"
}
```

ou pour une mise a jour :
```json
{
  "ids": ["clx...", "clx..."],
  "action": "update",
  "data": { "name": "Nouveau nom" }
}
```

**Reponse** : `{ "deleted": 2 }` ou `{ "updated": 2 }`.

### `PUT /api/churches/[churchId]`

Met a jour le nom et le slug d'une eglise.

**Permission requise** : `church:manage`

**Body** :
```json
{
  "name": "ICC Rennes",
  "slug": "icc-rennes"
}
```

**Reponse** : l'eglise mise a jour.

### `DELETE /api/churches/[churchId]`

Supprime une eglise. Bloquee si l'eglise contient des utilisateurs, ministeres ou evenements.

**Permission requise** : `church:manage`

**Reponse** : `{ "success": true }`.

**Erreurs** :
- `404` si l'eglise est introuvable
- `400` si l'eglise contient des donnees

### `POST /api/churches/onboard`

Cree une nouvelle eglise avec un flux d'onboarding complet : cree l'eglise, assigne optionnellement un admin, et ajoute le super admin courant.

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
- `adminEmail` : optionnel ; si fourni, cree ou trouve l'utilisateur et lui assigne le role `ADMIN`

**Reponse** : `201` avec l'eglise creee.

**Erreur** : `409` si le slug est deja utilise.

---

## Evenements

### `GET /api/events`

Liste les evenements avec filtres.

**Permission requise** : `events:view`

**Query params** :
- `churchId` (optionnel) — filtre par eglise
- `trackedForDiscipleship=true` (optionnel) — filtre les evenements suivis pour le discipolat (tries par date croissante)
- `from` (optionnel) — date ISO minimale

**Reponse** : tableau d'evenements avec `church` et `eventDepts[].department`.

### `POST /api/events`

Cree un evenement (ponctuel ou serie recurrente).

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
- `deadlineOffset` : offset relatif avant l'evenement, format `{n}h` ou `{n}d` (optionnel, ignore si `planningDeadline` est fourni)
- `recurrenceRule` : `"weekly"`, `"biweekly"` ou `"monthly"` (optionnel)
- `recurrenceEnd` : date de fin de la serie (requis si `recurrenceRule` est fourni)

**Logique de recurrence** : l'evenement principal est marque `isRecurrenceParent: true`, les evenements enfants sont lies via `seriesId`.

**Reponse** : `201` avec l'evenement cree (ou l'evenement parent + `childrenCreated: N`).

### `PATCH /api/events`

Actions bulk sur plusieurs evenements.

**Permission requise** : `events:manage`

**Body** :
```json
{
  "ids": ["clx...", "clx..."],
  "action": "delete"
}
```

ou pour une mise a jour :
```json
{
  "ids": ["clx...", "clx..."],
  "action": "update",
  "data": { "title": "Nouveau titre", "date": "2026-04-01T10:00:00.000Z" }
}
```

**Reponse** : `{ "deleted": 2 }` ou `{ "updated": 2 }`.

### `GET /api/churches/[churchId]/events`

Liste les evenements d'une eglise, tries par date croissante.

**Parametres** : `churchId` — ID de l'eglise (cuid)

**Reponse** :
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

Detail d'un evenement avec ses departements et ministeres.

**Parametres** : `eventId` — ID de l'evenement (cuid)

**Reponse** :
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

**Erreur** : `404` si l'evenement n'existe pas.

### `PATCH /api/events/[eventId]`

Active ou desactive les annonces pour un evenement.

**Permission requise** : `events:manage`

**Body** :
```json
{
  "allowAnnouncements": true
}
```

**Reponse** : `{ "id": "clx...", "allowAnnouncements": true }`.

### `POST /api/events/[eventId]/departments`

Lie un departement a un evenement. Supporte l'application a toute une serie recurrente.

**Permission requise** : `events:manage`

**Body** :
```json
{
  "departmentId": "clx...",
  "applyToSeries": false
}
```

- `applyToSeries` : si `true`, applique a tous les evenements futurs de la serie (y compris le courant)

**Reponse** : `201` avec le lien `eventDept` cree (ou `{ "created": N }` si serie).

### `DELETE /api/events/[eventId]/departments`

Retire le lien entre un departement et un evenement. Supprime les plannings associes en cascade. Supporte la serie.

**Permission requise** : `events:manage`

**Body** :
```json
{
  "departmentId": "clx...",
  "applyToSeries": false
}
```

**Reponse** : `{ "success": true }`.

### `GET /api/events/[eventId]/star-view`

Vue publique d'un evenement avec tous les membres en service (statuts `EN_SERVICE`, `EN_SERVICE_DEBRIEF`, `REMPLACANT`), regroupes par departement.

**Authentification** : session valide uniquement (pas de permission specifique)

**Reponse** :
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

Duplique le planning d'un evenement source vers un evenement cible. Seuls les departements communs aux deux evenements sont copies.

**Permission requise** : `planning:edit`

**Body** :
```json
{
  "targetEventId": "clx..."
}
```

**Reponse** : `{ "copied": 15, "departments": 3 }`.

**Erreurs** :
- `400` si source et cible sont identiques
- `404` si l'evenement source n'a pas de departements

### `GET /api/events/[eventId]/report`

Recupere le compte rendu d'un evenement. Retourne `null` si aucun CR n'existe encore.

**Permission requise** : `events:manage` ou `reports:view`

**Reponse** :
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

**Erreur** : `403` si les comptes rendus ne sont pas actives pour cet evenement.

### `PUT /api/events/[eventId]/report`

Cree ou remplace entierement le compte rendu d'un evenement. Les sections existantes sont supprimees et recrées a chaque appel.

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
- `notes` : notes generales du CR (optionnel)
- `decisions` : decisions prises lors de l'evenement (optionnel)
- `sections` : tableau de sections (peut etre vide)
  - `label` : intitule de la section (requis)
  - `position` : ordre d'affichage (defaut : index dans le tableau)
  - `departmentId` : ID du departement associe (optionnel)
  - `stats` : objet JSON libre cle/valeur numeriques (optionnel). Par convention, les sections "Accueil" et "Integration" utilisent les cles `hommes`, `femmes`, `enfants`, `passage`, `convertis` pour alimenter l'export Excel.
  - `notes` : notes specifiques a la section (optionnel)

**Reponse** : le CR complet avec ses sections.

**Erreurs** :
- `404` si l'evenement est introuvable
- `403` si les comptes rendus ne sont pas actives pour cet evenement

### `GET /api/events/reports/export`

Exporte les statistiques des cultes au format Excel (`.xlsx`) sur une periode donnee.

**Permission requise** : `reports:view`

**Parametres** (query string) :
- `churchId` (requis) : ID de l'eglise
- `from` (optionnel) : date de debut ISO (defaut : 1er jour du mois courant)
- `to` (optionnel) : date de fin ISO (defaut : dernier jour du mois courant)

**Reponse** : fichier Excel avec une feuille **"Statistiques cultes"** contenant 13 colonnes :

| Colonne | Source |
|---|---|
| Date du culte | `event.date` formate `fr-FR` |
| Eglise | nom de l'eglise |
| Orateur | `report.speaker` |
| Titre du message | `report.messageTitle` |
| Hommes | `section["Accueil"].stats.hommes` |
| Femmes | `section["Accueil"].stats.femmes` |
| Enfants | `section["Accueil"].stats.enfants` |
| Total adultes | `hommes + femmes` (null si l'un manque) |
| Total general | `totalAdultes + enfants` (null si l'un manque) |
| Nouveaux arrivants (H) | `section["Integration"].stats.hommes` |
| Nouveaux arrivants (F) | `section["Integration"].stats.femmes` |
| De passage | `section["Integration"].stats.passage` |
| Nouveaux convertis | `section["Integration"].stats.convertis` |

**Convention des sections** : les sections sont localisees par leur `label` de maniere insensible a la casse et aux accents (NFD normalization). La section "Accueil" est recherchee par correspondance exacte (`label` normalise = `"accueil"`). La section "Integration" est recherchee par prefixe (`label` normalise commence par `"integration"`).

Si la section ou la cle est absente, la colonne vaut `null` dans le fichier.

**Securite Excel** : les valeurs commencant par `=`, `+`, `-`, `@`, tabulation ou retour chariot sont prefixees d'une apostrophe pour prevenir l'injection de formules.

**Nom du fichier** : `statistiques-cultes-{mois}-{annee}.xlsx` (ou plage si multi-mois)

**Erreurs** :
- `400` si `churchId` est manquant
- `403` si l'utilisateur n'a pas la permission `reports:view`

---

## Departements

### `GET /api/departments/[departmentId]/members`

Liste les membres d'un departement, tries par nom.

**Parametres** : `departmentId` — ID du departement (cuid)

**Reponse** :
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

Assigne ou retire la fonction speciale d'un departement (`DepartmentFunction`).

**Permission requise** : `events:manage` (et non `departments:manage`)

**Body** :
```json
{
  "function": "SECRETARIAT"
}
```

Valeurs possibles : `"SECRETARIAT"`, `"COMMUNICATION"`, `"PRODUCTION_MEDIA"`, `null` (pour retirer la fonction).

**Regle metier** : une seule fonction par type est autorisee par eglise. Si un autre departement de la meme eglise possede deja cette fonction, elle lui est retiree automatiquement.

**Reponse** : `{ "id": "clx...", "name": "Secretariat Rennes", "function": "SECRETARIAT" }`.

### `GET /api/departments/[departmentId]/stats`

Statistiques de service d'un departement sur une periode donnee.

**Permission requise** : `planning:view`

**Query params** :
- `months` (optionnel, defaut : `6`) — periode glissante en mois en arriere depuis aujourd'hui (ignore si `from`/`to` sont fournis)
- `from` (optionnel) — debut de periode ISO, ex : `2026-01-01` (prend le pas sur `months`)
- `to` (optionnel) — fin de periode ISO, ex : `2026-03-31`

**Reponse** :
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
- `members[].services` — nombre d'evenements ou le statut de planning est `EN_SERVICE` ou `EN_SERVICE_DEBRIEF`
- `members[].indisponible` — nombre d'evenements ou le statut est `INDISPONIBLE`
- `members[].rate` — `round(services / totalEvents * 100)`, vaut `0` si `totalEvents === 0`
- `trend[].enService` — nombre de creneaux EN_SERVICE ou EN_SERVICE_DEBRIEF pour le mois
- `trend[].totalSlots` — nombre total de creneaux de planning (toutes lignes du tableau)
- `taskStats.tasks[].count` — nombre total d'affectations de la tache sur la periode
- `taskStats.memberTasks[].totalAssignments` — somme de toutes les affectations de taches pour le membre

Les listes `members` et `memberTasks` sont triees par valeur decroissante (`services` et `totalAssignments` respectivement).

**Erreur** : `404` si le departement est introuvable.

### `GET /api/departments/[departmentId]/tasks`

Liste les taches configurees pour un departement.

**Permission requise** : `planning:view`

**Reponse** : tableau de taches `{ id, name, description, departmentId, createdAt }`.

### `POST /api/departments/[departmentId]/tasks`

Cree une nouvelle tache pour un departement.

**Permission requise** : `planning:edit`

**Body** :
```json
{
  "name": "Régisseur son",
  "description": "Responsable de la console de mixage"
}
```

**Reponse** : `201` avec la tache creee.

**Erreur** : `409` si une tache avec ce nom existe deja dans ce departement.

### `DELETE /api/departments/[departmentId]/tasks`

Supprime une tache d'un departement.

**Permission requise** : `planning:edit`

**Body** :
```json
{
  "taskId": "clx..."
}
```

**Reponse** : `{ "success": true }`.

### `GET /api/departments/[departmentId]/monthly-planning`

Vue mensuelle du planning d'un departement (membres en service et leurs taches).

**Authentification** : session valide uniquement (pas de permission specifique)

**Query params** :
- `month` (optionnel) — mois au format `YYYY-MM` (defaut : mois courant)

**Reponse** :
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

Recupere le planning d'un departement pour un evenement.
Retourne tous les membres du departement avec leur statut.

**Parametres** :
- `eventId` — ID de l'evenement (cuid)
- `deptId` — ID du departement (cuid)

**Reponse** :
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

**Erreur** : `404` si le lien evenement-departement n'existe pas.

### `PUT /api/events/[eventId]/departments/[deptId]/planning`

Met a jour le planning d'un departement pour un evenement.
Cree le lien evenement-departement s'il n'existe pas.

**Parametres** :
- `eventId` — ID de l'evenement (cuid)
- `deptId` — ID du departement (cuid)

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

**Regle metier** : un seul membre par departement par evenement peut avoir le statut `EN_SERVICE_DEBRIEF`.

**Reponse** : tableau des plannings upserted.

**Erreurs** :
- `400` si plus d'un `EN_SERVICE_DEBRIEF`
- `400` si le body ne passe pas la validation Zod

### `GET /api/events/[eventId]/departments/[deptId]/tasks`

Liste les taches du departement pour un evenement avec leurs assignations.

**Permission requise** : `planning:view`

**Reponse** : tableau de taches avec `assignments[].member` (membres assignes pour cet evenement).

### `PUT /api/events/[eventId]/departments/[deptId]/tasks`

Assigne des membres a une tache pour un evenement. Remplace les assignations existantes.

**Permission requise** : `planning:edit`

**Body** :
```json
{
  "taskId": "clx...",
  "memberIds": ["clx...", "clx..."]
}
```

**Regle metier** : seuls les membres avec le statut `EN_SERVICE` ou `EN_SERVICE_DEBRIEF` pour cet evenement peuvent etre assignes.

**Reponse** : la tache mise a jour avec ses assignations.

**Erreurs** :
- `400` si un membre n'est pas en service pour cet evenement
- `404` si la tache ou le lien evenement-departement est introuvable

---

## Utilisateurs et roles

### `GET /api/users`

Liste les utilisateurs avec leurs roles par eglise.

**Permission requise** : `members:manage`

**Query params** :
- `churchId` (optionnel) — filtre par eglise

**Reponse** : tableau d'utilisateurs avec `churchRoles[].church`.

### `GET /api/users/search`

Recherche d'utilisateurs par nom pour l'autocomplete (non documente separement, utilise dans la gestion des roles).

### `PATCH /api/users/[userId]/profile`

Met a jour le nom d'affichage d'un utilisateur.

**Autorisation** : l'utilisateur peut modifier son propre profil ; les roles `SUPER_ADMIN`, `ADMIN` et `SECRETARY` peuvent modifier n'importe quel profil.

**Body** :
```json
{
  "displayName": "Marie Dupont"
}
```

**Reponse** : `{ "id": "clx...", "displayName": "Marie Dupont" }`.

### `POST /api/users/[userId]/roles`

Ajoute un role a un utilisateur dans une eglise.

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
- `ministryId` : optionnel, utilise si `role` = `"MINISTER"`
- `departments` : format enrichi `{ id, isDeputy }[]` pour `DEPARTMENT_HEAD` — distingue responsable principal (`isDeputy: false`) et adjoint (`isDeputy: true`)
- `departmentIds` : format legacy `string[]`, equivalent a `departments` avec `isDeputy: false` pour tous

Les roles privilegies (`SUPER_ADMIN`, `ADMIN`, `SECRETARY`) ne peuvent etre assignes que par un `SUPER_ADMIN`.

**Reponse** : `201` avec le role cree (inclut `church`, `ministry`, `departments`).

### `PATCH /api/users/[userId]/roles`

Modifie l'affectation d'un role existant (ministere ou departements).

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
- `departments` / `departmentIds` : meme logique que pour POST (remplace les assignations existantes)

**Reponse** : `200` avec le role mis a jour.

**Erreur** : `404` si le role n'appartient pas a l'utilisateur.

### `DELETE /api/users/[userId]/roles`

Supprime un role d'un utilisateur. Supprime en cascade les `UserDepartment` associes.

**Permission requise** : `users:manage` ou `departments:manage`

**Body** :
```json
{
  "churchId": "clx...",
  "role": "DEPARTMENT_HEAD"
}
```

**Reponse** : `200` avec `{ "success": true }`.

---

## Membres (STAR)

### `GET /api/members/search`

Recherche de STAR par nom pour l'autocomplete (utilisee depuis la page de liaison de compte). Retourne uniquement les membres sans lien utilisateur existant.
La recherche est insensible aux accents et a la casse (normalisation NFD cote serveur).

**Authentification** : session valide uniquement (pas de permission specifique)

**Query params** :
- `q` (requis) — terme de recherche (minimum 2 caracteres)
- `churchId` (requis) — ID de l'eglise

**Reponse** : tableau de membres `{ id, firstName, lastName }` (max 10 resultats).

---

## Liaison compte utilisateur / STAR

### `POST /api/member-user-links`

Cree un lien direct entre un utilisateur et un STAR (sans workflow de validation). Met a jour le nom d'affichage de l'utilisateur avec le nom du STAR.

**Permission requise** : `members:manage`

**Body** :
```json
{
  "memberId": "clx...",
  "userId": "clx...",
  "churchId": "clx..."
}
```

**Reponse** : `201` avec le lien cree.

**Erreurs** :
- `404` si le STAR ou l'utilisateur est introuvable
- `409` si le STAR est deja lie a un compte ou si l'utilisateur est deja lie a un STAR dans cette eglise

### `POST /api/member-link-requests`

Soumet une demande de liaison d'un compte utilisateur a un STAR (workflow de validation par un admin). Trois modes : liaison a un STAR existant, creation d'un nouveau STAR, ou role transverse sans carte STAR.

**Authentification** : session valide uniquement (tout utilisateur authentifie peut soumettre)

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

**Body — mode creation de nouveau STAR** :
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

**Body — mode role transverse (sans carte STAR)** :
```json
{
  "type": "no_star",
  "churchId": "clx...",
  "requestedRole": "DISCIPLE_MAKER",
  "notes": "Faiseur de disciples"
}
```

Champs optionnels communs :
- `departmentId` — departement associe (requis pour DEPARTMENT_HEAD / DEPUTY)
- `ministryId` — ministere associe (requis pour MINISTER)
- `requestedRole` — role demande : `DEPARTMENT_HEAD`, `DEPUTY`, `MINISTER`, `DISCIPLE_MAKER`, `REPORTER`, ou null (membre regulier)
- `notes` — notes libres

**Reponse** : `201` avec la demande creee.

**Erreurs** :
- `409` si une demande `PENDING` existe deja pour cet utilisateur
- `409` si l'utilisateur est deja lie a un STAR dans cette eglise
- `409` si le STAR vise est deja lie a un autre compte

### `GET /api/member-link-requests`

Liste les demandes de liaison, filtrees par statut.

**Permission requise** : `members:manage`

**Query params** :
- `churchId` (optionnel) — filtre par eglise
- `status` (optionnel, defaut : `"PENDING"`) — `"PENDING"`, `"APPROVED"` ou `"REJECTED"`

**Reponse** : tableau de demandes avec `user`, `member` (si existant) et `church`.

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

- `departmentId` : requis uniquement si `action` = `"approve"` et la demande est de type `"new"` (creation d'un nouveau STAR)

**Logique d'approbation** :
- Si le STAR existait : cree le lien `MemberUserLink` directement
- Si c'est une nouvelle demande : cree le STAR dans le departement specifie, puis cree le lien
- Met a jour le `displayName` de l'utilisateur avec le nom du STAR dans tous les cas
- **Creation de roles automatique selon `requestedRole`** :
  - `null` → `MemberUserLink` uniquement (membre regulier, pas de role admin)
  - `DEPARTMENT_HEAD` / `DEPUTY` → `UserChurchRole(DEPARTMENT_HEAD)` + `UserDepartment` (adjoint si `DEPUTY`)
  - `MINISTER` → `UserChurchRole(MINISTER)` avec `ministryId`
  - `DISCIPLE_MAKER` / `REPORTER` → `UserChurchRole` uniquement (pas de `MemberUserLink` pour le type `no_star`)

**Reponse** : `{ "approved": true }` ou la demande mise a jour (si rejet).

**Erreur** : `409` si la demande a deja ete traitee.

---

## Annonces

### `GET /api/announcements`

Liste les annonces. Les utilisateurs avec `events:manage` voient toutes les annonces de l'eglise ; les autres voient uniquement leurs propres soumissions.

**Query params** :
- `churchId` (requis) — ID de l'eglise

**Reponse** : tableau d'annonces avec `submittedBy`, `department`, `ministry`, `targetEvents` et `serviceRequests` (hors demandes enfants).

### `POST /api/announcements`

Soumet une nouvelle annonce et genere automatiquement les `ServiceRequest` correspondants selon les canaux coches.

**Permission requise** : `planning:view` (tout utilisateur authentifie peut soumettre)

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
- `isSaveTheDate` : calcule automatiquement si `eventDate` est dans plus de 21 jours

**Logique de generation des ServiceRequests** :
- Canal INTERNE : cree `DIFFUSION_INTERNE` (assigne au dept Secretariat) + `VISUEL` (assigne au dept Production Media, format : Slide/Affiche, lie au `DIFFUSION_INTERNE`)
- Canal EXTERNE : cree `RESEAUX_SOCIAUX` (assigne au dept Communication) + `VISUEL` (assigne au dept Production Media, format : Story/Post, lie au `RESEAUX_SOCIAUX`)
- Multicanal : 4 `ServiceRequest` crees

**Reponse** : `201` avec l'annonce creee.

### `GET /api/announcements/[id]`

Detail d'une annonce avec ses `serviceRequests` (avec enfants VISUEL).

**Erreur** : `404` si introuvable.

### `PATCH /api/announcements/[id]`

Met a jour une annonce (statut, titre, contenu, urgence).

**Autorisation** :
- Gestionnaires (`events:manage`) : peuvent modifier tous les champs et tous les statuts
- Proprietaire de l'annonce : peut uniquement passer le statut a `"ANNULEE"` (annulation)

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
Le proprietaire est restreint a `"ANNULEE"` uniquement.

**Annulation en cascade** : si `status` = `"ANNULEE"`, toutes les `ServiceRequest` liees a l'annonce (`announcementId`) sont automatiquement annulees dans la meme transaction (y compris les demandes VISUEL enfants).

### `DELETE /api/announcements/[id]`

Supprime une annonce. Autorise pour les gestionnaires ou le proprietaire.

**Reponse** : `200` avec `{ "deleted": "clx..." }`.

---

## Demandes de service

### `GET /api/service-requests`

Liste les demandes de service. Les gestionnaires (`events:manage`) voient tout ; les autres voient leurs propres demandes.

**Query params** :
- `churchId` (requis) — ID de l'eglise
- `type` (optionnel) — filtre par type : `VISUEL`, `DIFFUSION_INTERNE`, `RESEAUX_SOCIAUX`
- `assignedDeptId` (optionnel) — filtre par departement assigne

**Reponse** : tableau de demandes parentes (hors demandes enfants VISUEL), avec `submittedBy`, `department`, `ministry`, `assignedDept`, `announcement`, `childRequests`.

### `POST /api/service-requests`

Cree une demande de service `VISUEL` standalone (sans annonce liee).

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

La demande est automatiquement assignee au departement ayant la fonction `PRODUCTION_MEDIA`.

**Reponse** : `201` avec la demande creee.

### `GET /api/service-requests/[id]`

Detail d'une demande avec `submittedBy`, `assignedDept`, `reviewedBy`, `announcement`, `parentRequest`, `childRequests`.

**Erreur** : `404` si introuvable.

### `PATCH /api/service-requests/[id]`

Met a jour une demande de service (statut, lien de livraison, notes de revue, format, brief, deadline).

**Autorisation** : gestionnaires (`events:manage`), membre du departement assigne ou proprietaire de la demande.

**Body** (tous les champs sont optionnels) :
```json
{
  "status": "LIVRE",
  "deliveryLink": "https://drive.google.com/...",
  "reviewNotes": "Livraison conforme",
  "format": "Story 1080x1920",
  "brief": "Description mise a jour",
  "deadline": "2026-04-01T00:00:00.000Z"
}
```

Valeurs possibles pour `status` : `"EN_ATTENTE"`, `"EN_COURS"`, `"LIVRE"`, `"ANNULE"`.

Lors d'un changement de statut, `reviewedById` et `reviewedAt` sont automatiquement renseignes.

**Annulation en cascade** : si `status` = `"ANNULE"` et que la demande est de type `DIFFUSION_INTERNE` ou `RESEAUX_SOCIAUX`, la demande `VISUEL` enfant (liee via `parentRequestId`) est automatiquement annulee dans la meme transaction.

---

## Discipolat

Les endpoints de discipolat utilisent deux permissions specifiques :
- `discipleship:view` — lecture des relations et statistiques
- `discipleship:manage` — creation, modification, suppression
- `discipleship:export` — export Excel

Le perimetre est controle par `getDiscipleshipScope()` : les roles `DISCIPLE_MAKER` voient et gerent uniquement leurs propres disciples ; les admins ont acces a tout.

### `GET /api/discipleships`

Liste les relations de discipolat d'une eglise.

**Permission requise** : `discipleship:view`

**Query params** :
- `churchId` (requis) — ID de l'eglise

**Reponse** : tableau de relations avec `disciple`, `discipleMaker` et `firstMaker`.

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

Cree une nouvelle relation de discipolat. Supporte deux modes : liaison a un STAR existant ou creation d'un nouveau STAR (place dans le departement systeme).

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
- Un `DISCIPLE_MAKER` ne peut creer des relations que pour lui-meme

**Reponse** : `201` avec la relation creee.

**Erreurs** :
- `400` si le disciple et le FD sont la meme personne
- `409` si le STAR a deja un FD dans cette eglise

### `PATCH /api/discipleships/[id]`

Change le FD courant d'une relation de discipolat en conservant le `firstMakerId` d'origine. Remet `startedAt` a la date courante.

**Permission requise** : `discipleship:manage`

**Body** :
```json
{
  "discipleMakerId": "clx..."
}
```

**Reponse** : la relation mise a jour avec `disciple` et `discipleMaker`.

**Erreur** : `400` si le nouveau FD est le disciple lui-meme.

### `DELETE /api/discipleships/[id]`

Supprime une relation de discipolat. Un `DISCIPLE_MAKER` ne peut supprimer que ses propres relations.

**Permission requise** : `discipleship:manage`

**Reponse** : `{ "deleted": true }`.

### `PATCH /api/discipleships/[id]/member`

Met a jour le profil (nom, email, telephone) du disciple d'une relation. Un `DISCIPLE_MAKER` ne peut modifier que ses propres disciples.

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

**Reponse** : le membre mis a jour avec son departement et ministere.

### `GET /api/discipleships/attendance`

Liste les presences enregistrees pour un evenement suivi.

**Permission requise** : `discipleship:view`

**Query params** :
- `eventId` (requis) — ID de l'evenement

**Reponse** : tableau `{ memberId, present }`.

### `PUT /api/discipleships/attendance`

Enregistre les presences pour un evenement suivi. Remplace les presences existantes.

**Permission requise** : `discipleship:manage`

**Comportement selon le perimetre** :
- `DISCIPLE_MAKER` : met a jour uniquement les presences de ses propres disciples
- Admin/Secretaire : remplace toutes les presences de l'evenement

**Body** :
```json
{
  "eventId": "clx...",
  "presentMemberIds": ["clx...", "clx..."]
}
```

Les membres absents de `presentMemberIds` sont automatiquement marques absents.

**Reponse** : `{ "saved": true }`.

**Erreurs** :
- `404` si l'evenement est introuvable
- `400` si l'evenement n'est pas suivi pour le discipolat (`trackedForDiscipleship: false`)

### `GET /api/discipleships/stats`

Statistiques de participation aux evenements de discipolat sur une periode glissante.

**Permission requise** : `discipleship:view`

**Query params** :
- `churchId` (requis) — ID de l'eglise
- `from` (optionnel) — debut de periode ISO (defaut : 1er du mois courant)
- `to` (optionnel) — fin de periode ISO (defaut : dernier jour du mois courant)

**Reponse** :
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
- `stats.present` — nombre d'evenements ou une presence `present: true` est enregistree pour le disciple
- `stats.absent` — `totalEvents - present`
- `stats.rate` — `round(present / totalEvents * 100)`, vaut `null` si `totalEvents === 0`
- Le perimetre est controle par `getDiscipleshipScope()` : un `DISCIPLE_MAKER` ne voit que ses propres disciples
```

### `GET /api/discipleships/tree`

Arbre de lignee recursif (profondeur illimitee) via requete SQL `WITH RECURSIVE`.

**Permission requise** : `discipleship:view`

**Query params** :
- `churchId` (requis) — ID de l'eglise
- `mode` (optionnel) — `"primary"` (lignee via `firstMakerId`, defaut) ou `"current"` (structure actuelle via `discipleMakerId`)
- `rootId` (optionnel) — ID du membre racine ; si absent, part des racines naturelles de l'arbre. Ignore pour les `DISCIPLE_MAKER` (ancre sur leur propre noeud)

**Reponse** : tableau de noeuds enrichis, tries par profondeur :
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

Exporte les statistiques de discipolat au format Excel (`.xlsx`) sur une periode donnee.

**Permission requise** : `discipleship:export`

**Query params** :
- `churchId` (requis) — ID de l'eglise
- `from` (optionnel) — debut de periode ISO (defaut : 1er du mois courant)
- `to` (optionnel) — fin de periode ISO (defaut : dernier jour du mois courant)

**Reponse** : fichier `.xlsx` (`Content-Disposition: attachment; filename="discipolat-{mois}-{annee}.xlsx"`) avec deux feuilles :

**Feuille 1 — "Statistiques"** (une ligne par disciple, triee par FD puis disciple) :

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

**Securite Excel** : valeurs commencant par `=`, `+`, `-`, `@`, tabulation ou retour chariot prefixees d'une apostrophe.

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
  "filename": "video-clip.mp4",
  "contentType": "video/mp4",
  "size": 52428800,
  "type": "VIDEO",
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
  "originalKey": "media-projects/clx.../files/clx.../v1/video.mp4"
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
  "contentType": "video/mp4",
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

## Notifications

### `GET /api/notifications`

Liste les 20 dernieres notifications de l'utilisateur courant avec le nombre de non-lues.

**Authentification** : session valide uniquement

**Reponse** :
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

**Body** — marquer des notifications specifiques :
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

**Reponse** : `{ "success": true }`.

---

## Journaux d'audit

### `GET /api/audit-logs`

Liste les journaux d'audit de l'eglise courante, pagines.

**Permission requise** : `church:manage`

**Query params** :
- `page` (optionnel, defaut : `1`) — numero de page
- `limit` (optionnel, defaut : `50`, max : `100`) — nombre de resultats par page

**Reponse** :
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

## Eglise courante

### `POST /api/current-church`

Definit l'eglise active de l'utilisateur via un cookie HTTP-only (duree : 30 jours).

**Authentification** : session valide uniquement

**Body** :
```json
{
  "churchId": "clx..."
}
```

**Reponse** : `{ "churchId": "clx..." }`.

**Erreur** : `403` si l'utilisateur n'a pas acces a cette eglise.

---

## Taches CRON

### `POST /api/cron/reminders`

Envoie les rappels de service (emails + notifications in-app) pour les evenements a J-1 et J-3.

**Authentification** : token secret via header `Authorization: Bearer {CRON_SECRET}`

**Comportement** :
- Identifie les evenements ayant lieu dans 1 ou 3 jours
- Pour chaque membre en service (`EN_SERVICE` ou `EN_SERVICE_DEBRIEF`) : envoie un email si SMTP est configure et si le membre a une adresse email
- Pour chaque responsable de departement concerne : cree une notification in-app

**Reponse** :
```json
{
  "emailsSent": 5,
  "notificationsCreated": 8
}
```

---

## Utilisateur — preferences

### `PATCH /api/user/tour-seen`

Marque le tutoriel de decouverte comme vu pour l'utilisateur courant.

**Authentification** : session valide uniquement

**Reponse** : `{ "hasSeenTour": true }`.
