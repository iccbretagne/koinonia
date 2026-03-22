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
  - `stats` : objet cle/valeur de statistiques numeriques (optionnel)
  - `notes` : notes specifiques a la section (optionnel)

**Reponse** : le CR complet avec ses sections.

**Erreurs** :
- `404` si l'evenement est introuvable
- `403` si les comptes rendus ne sont pas actives pour cet evenement

### `GET /api/events/reports/export`

Exporte les statistiques hebdomadaires des cultes au format Excel (.xlsx) sur une periode donnee.

**Permission requise** : `reports:view`

**Parametres** (query string) :
- `churchId` (requis) : ID de l'eglise
- `from` (optionnel) : date de debut (`YYYY-MM-DD`, defaut : 1er jour du mois courant)
- `to` (optionnel) : date de fin (`YYYY-MM-DD`, defaut : dernier jour du mois courant)

**Reponse** : fichier Excel (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) avec les colonnes :
- Date du culte, Eglise, Orateur, Titre du message
- Hommes, Femmes, Enfants, Total adultes, Total general
- Nouveaux arrivants (H), Nouveaux arrivants (F), De passage, Nouveaux convertis

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

Statistiques de service d'un departement sur une periode glissante.

**Permission requise** : `planning:view`

**Query params** :
- `months` (optionnel, defaut : `6`) — nombre de mois en arriere

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
  ]
}
```

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

Soumet une demande de liaison d'un compte utilisateur a un STAR (workflow de validation par un admin). Deux modes : liaison a un STAR existant ou creation d'un nouveau STAR.

**Authentification** : session valide uniquement (tout utilisateur authentifie peut soumettre)

**Body — mode lien vers STAR existant** :
```json
{
  "type": "existing",
  "memberId": "clx...",
  "churchId": "clx..."
}
```

**Body — mode creation de nouveau STAR** :
```json
{
  "type": "new",
  "firstName": "Marie",
  "lastName": "Dupont",
  "phone": "+33 6 00 00 00 00",
  "churchId": "clx..."
}
```

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

Exporte les statistiques de discipolat au format Excel (`.xlsx`) avec deux feuilles : statistiques par disciple et detail des presences par evenement.

**Permission requise** : `discipleship:export`

**Query params** :
- `churchId` (requis) — ID de l'eglise
- `from` (optionnel) — debut de periode ISO (defaut : 1er du mois courant)
- `to` (optionnel) — fin de periode ISO (defaut : dernier jour du mois courant)

**Reponse** : fichier `.xlsx` avec les headers `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` et `Content-Disposition: attachment; filename="discipolat-{mois}-{annee}.xlsx"`.

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
