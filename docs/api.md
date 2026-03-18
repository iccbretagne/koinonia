# API

Toutes les routes API sont des [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) dans `src/app/api/`.

Toutes les routes (sauf `/api/auth/*`) necessitent une session NextAuth valide.

## Format des reponses

**Succes** : JSON avec les donnees directement dans le body.

**Erreur** :
```json
{ "error": "Message d'erreur" }
```

Codes HTTP utilises : `200`, `400`, `401`, `403`, `404`, `500`.

---

## Authentification

### `GET/POST /api/auth/[...nextauth]`

Gere par NextAuth. Inclut :

- `GET /api/auth/signin` — page de connexion
- `GET /api/auth/callback/google` — callback OAuth Google
- `GET /api/auth/session` — session courante
- `POST /api/auth/signout` — deconnexion

---

## Evenements

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

---

## Utilisateurs et roles

### `POST /api/users/[userId]/roles`

Ajoute un role a un utilisateur.

**Body** :
```json
{
  "churchId": "clx...",
  "role": "MINISTER",
  "ministryId": "clx...",
  "departmentIds": ["clx...", "clx..."]
}
```

- `ministryId` : optionnel, utilise si `role` = `MINISTER`
- `departmentIds` : optionnel, utilise si `role` = `DEPARTMENT_HEAD`

**Reponse** : `201` avec le role cree (inclut `church`, `ministry`, `departments`).

### `PATCH /api/users/[userId]/roles`

Modifie l'affectation d'un role existant (ministere ou departements).

**Body** :
```json
{
  "roleId": "clx...",
  "ministryId": "clx...",
  "departmentIds": ["clx...", "clx..."]
}
```

- `ministryId` : `string | null` pour MINISTER
- `departmentIds` : `string[]` pour DEPARTMENT_HEAD (remplace les assignations existantes)

**Reponse** : `200` avec le role mis a jour.

**Erreur** : `404` si le role n'appartient pas a l'utilisateur.

### `DELETE /api/users/[userId]/roles`

Supprime un role d'un utilisateur. Supprime en cascade les `UserDepartment` associes.

**Body** :
```json
{
  "churchId": "clx...",
  "role": "DEPARTMENT_HEAD"
}
```

**Reponse** : `200` avec `{ "success": true }`.

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

**Autorisation** : gestionnaires (`events:manage`) ou proprietaire de l'annonce.

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

---

## Evenements (complement)

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

---

## Departements (complement)

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
