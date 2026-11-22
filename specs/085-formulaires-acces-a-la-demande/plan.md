# Plan technique — Formulaires : accès à la demande

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-11-22

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe que `@/modules/forms`, `@/modules/forms/auth`, `@/modules/forms/schemas` ; `forms` n'importe toujours aucun autre module
- [x] **Sécurité** : chaque route passe par une garde du module (`requireFormManage`, `requireFormsAuthor`, `requireFormsGrantAdmin`) qui évalue toujours dans **l'église du formulaire** ou l'église courante — jamais sans `churchId`
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) ; aucune permission ajoutée (l'accès délégué est une **donnée**, comme les rôles d'événement de billetterie ou les intervenants)
- [x] **Validation** Zod sur toutes les mutations (schémas dans les `contract.ts` voisins, ADR-0023)
- [x] **Migration** Prisma : deux tables (`prisma migrate dev`)
- [x] **Enums** depuis `@/generated/prisma/client`
- [x] **UI** : `Modal`, `ConfirmModal`, `Button`, `Field`, `DataTable`, `EmptyState`, `StatusChip`, `useToast` réutilisés

## Approche générale

Un **accès délégué** est une ligne par (église, compte), sur le modèle de `media_gallery_grants`.
La **co-gestion** est une ligne par (formulaire, compte). L'auteur est la colonne existante
`Form.createdById` : aucune reprise de données.

Le fil directeur : **une seule garde change**. `getFormAccess` gagne une troisième source de
droit « gestion », et `requireFormManage` s'appuie dessus. Toutes les routes `/api/forms/[id]/*`
qui appellent déjà `requireFormManage` ou `requireFormAccess` deviennent accessibles à l'auteur et
aux co-gestionnaires sans toucher leur corps. Seules les routes de **collection** (liste,
création) et la page de liste, qui raisonnent aujourd'hui en `forms:manage`, sont adaptées.

## Modèle de données

```prisma
/// Accès délégué à l'outil de formulaires (spec 085) : ses formulaires seulement.
model FormsGrant {
  id          String   @id @default(cuid())
  churchId    String
  userId      String
  grantedById String?
  createdAt   DateTime @default(now())

  church    Church @relation(fields: [churchId], references: [id], onDelete: Cascade)
  user      User   @relation("FormsGrantee", fields: [userId], references: [id], onDelete: Cascade)
  grantedBy User?  @relation("FormsGrantor", fields: [grantedById], references: [id], onDelete: SetNull)

  @@unique([churchId, userId])
  @@index([userId])
  @@map("forms_grants")
}

/// Co-gestionnaire d'un formulaire (partagé par son auteur).
model FormManager {
  formId    String
  userId    String
  addedById String?
  createdAt DateTime @default(now())

  form    Form  @relation(fields: [formId], references: [id], onDelete: Cascade)
  user    User  @relation("FormManagerUser", fields: [userId], references: [id], onDelete: Cascade)
  addedBy User? @relation("FormManagerAddedBy", fields: [addedById], references: [id], onDelete: SetNull)

  @@id([formId, userId])
  @@index([userId])
  @@map("form_managers")
}
```

Le retrait d'un accès **ne supprime pas** les lignes `FormManager` : la garde exige un accès
délégué valide. Ses partages sont donc suspendus, puis retrouvés si l'accès est rendu (spec :
« il retrouve ses formulaires et ses partages »). « Compte qui quitte l'église » : la garde
exige aussi l'appartenance (`isChurchMember`), ce qui suffit sans nettoyage.

## Garde (module `forms`, `auth.ts`)

```ts
type FormAccess =
  | { kind: "manage"; session; churchId; via: "role" | "author" | "comanager" }
  | { kind: "facilitator"; … }            // inchangé
```

`getFormAccess(session, formId)` :
1. `forms:manage` dans l'église du formulaire ⇒ `via: "role"` (inchangé).
2. Sinon, membre de l'église **et** accès délégué dans cette église :
   - `createdById === user` ⇒ `via: "author"` ;
   - ligne `FormManager` ⇒ `via: "comanager"`.
   Pas de condition sur le statut : l'auteur garde la main après la clôture (export, purge).
3. Sinon intervenant (inchangé), sinon `null` ⇒ 404.

Nouvelles fonctions :
- `requireFormManage(formId, { owner?: true })` : renvoie `{ session, churchId, via }` ; avec
  `owner`, refuse `via: "comanager"` (404). Utilisé par `DELETE /api/forms/[id]` et la gestion
  du partage.
- `getFormsCapability(session, churchId)` : `"all" | "own" | null` (`forms:manage`, accès
  délégué, aucun). Sert à la liste, à la création, au layout.
- `requireFormsCapability()` : église courante, 403 si `null`.
- `requireFormsGrantAdmin()` : `requireCurrentChurchPermission("forms:manage")`, pour la gestion
  des accès.

## API

| Endpoint | Méthode | Garde | Entrée | Sortie |
|---|---|---|---|---|
| `/api/forms` | GET | `requireFormsCapability` | — | formulaires de l'église (`all`) ou ses formulaires (`own`) ; `author` en plus |
| `/api/forms` | POST | `requireFormsCapability` | inchangée | inchangée (`createdById` = appelant, déjà le cas) |
| `/api/forms/[id]/*` existantes | — | inchangées (la garde élargit) | — | — |
| `/api/forms/[id]` | DELETE | `requireFormManage(id, { owner })` | — | — |
| `/api/forms/[id]` (rattachement) | PATCH | + `assertLinkableEvents` reçoit la session | — | — |
| `/api/forms/[id]/managers` | GET | `requireFormManage(id)` | — | co-gestionnaires |
| `/api/forms/[id]/managers` | POST | `requireFormManage(id, { owner })` | `{ userId }` | ligne créée (idempotent) |
| `/api/forms/[id]/managers/[userId]` | DELETE | `requireFormManage(id, { owner })` | — | — |
| `/api/forms/grants` | GET | `requireFormsGrantAdmin` | — | accès (compte, accordé par, date) |
| `/api/forms/grants` | POST | `requireFormsGrantAdmin` | `{ userId }` | ligne (idempotent, aucune 2e notification) |
| `/api/forms/grants/[userId]` | DELETE | `requireFormsGrantAdmin` | — | — |
| `/api/forms/grants/users` | GET | `requireFormsGrantAdmin` | `?q=` | comptes de l'église (recherche) |

`POST /api/forms/[id]/managers` : le compte doit avoir un accès délégué **ou** `forms:manage`
dans l'église du formulaire, sinon 400 (« partage avec un compte qui n'a pas l'accès » hors
périmètre). `POST /api/forms/grants` : le compte doit appartenir à l'église (400 sinon).

`/api/forms/[id]/duplicate` : la copie est créée avec `createdById` = appelant, sans
co-gestionnaires (`duplicateForm` pose déjà `createdById` = appelant et ne copie pas les
intervenants) : aucun changement.

Chaque route : `contract.ts` voisin, déclaration dans `routes.api` du manifeste `forms`,
`npm run openapi`.

## Services / logique métier

`src/modules/forms/services/grants.ts` (nouveau, exporté par l'index) :
- `listFormsGrants(churchId)`, `grantFormsAccess(churchId, actorId, userId)`,
  `revokeFormsAccess(churchId, actorId, userId)`, `searchChurchUsersForFormsGrant(churchId, q)`
  — calqués sur `gallery-grants.ts` (le module `forms` ne peut pas l'importer : copie
  volontaire, ~40 lignes).
- `listFormManagers(formId)`, `addFormManager(formId, actorId, userId)`,
  `removeFormManager(formId, actorId, userId)`.
- Chaque geste : `logAudit` (`FormsGrant` / `FormManager`, CREATE/DELETE) et notification
  domaine `forms` à la personne (`FORMS_ACCESS_GRANTED`, `FORMS_ACCESS_REVOKED`,
  `FORM_SHARED`, `FORM_UNSHARED`). L'octroi déjà présent ⇒ rien.

`listForms(churchId, scope?: { userId })` (`builder.ts`) : filtre
`OR: [{ createdById: userId }, { managers: { some: { userId } } }]` quand `scope` est fourni ;
ajoute `createdBy { name }` à la sélection (affiché aux gestionnaires).

`signalNewResponses` (`notify.ts`) : destinataires = auteur **+ co-gestionnaires**, à défaut
Admins et Secrétaires (repli existant). Le secrétariat ne reçoit donc plus le signal d'un
formulaire de compte autorisé — déjà le cas aujourd'hui pour l'auteur, seule la co-gestion
s'ajoute.

Rattachement à un événement (`src/app/api/forms/_events.ts`) : `linkableEvents` et
`assertLinkableEvents` reçoivent la capacité de l'appelant. `all` : inchangé. Sinon : événements
d'église seulement si `events:view` dans l'église ; événements de billetterie seulement si
`ticketing:manage` ou un rôle d'événement sur cet événement (lu en base dans cette couche, comme
aujourd'hui — `forms` n'importe pas `ticketing`).

## UI / composants

- **Layout** (`(auth)/layout.tsx`) : `hasForms` ajoute « accès délégué dans l'église courante »
  (une requête `count`, dans le même style que le test intervenant).
- **`/formulaires`** : `getFormsCapability`. `own` ⇒ même page que les gestionnaires, liste
  filtrée, bouton « Nouveau formulaire », sans le bouton « Accès ». `all` ⇒ colonne/mention
  « Créé par » et bouton **« Accès »** qui ouvre un `Modal` : liste des accès (compte, accordé
  par, date, bouton Retirer avec `ConfirmModal`), recherche d'un compte, bouton Accorder.
- **`/formulaires/[id]`** : `getFormAccess` renvoie déjà `kind: "manage"`. Ajout d'un panneau
  **« Partage »** (à côté de `FacilitatorsEditor`, même ergonomie) visible pour l'auteur et les
  gestionnaires ; lecture seule pour un co-gestionnaire. Bouton Supprimer masqué pour un
  co-gestionnaire (la route refuse de toute façon).
- Blocs `EventFormsBlock` des pages événement / billetterie : inchangés (`forms:manage`) — hors
  périmètre de la spec.

## Décisions & alternatives écartées

- **Choix** : accès délégué = donnée, garde du module — *Pourquoi* : même modèle que les rôles
  d'événement (ADR-0014) et les intervenants ; un rôle ou une permission ne sait pas exprimer
  « ses formulaires seulement ».
- **Choix** : élargir `getFormAccess`/`requireFormManage` plutôt que chaque route — *Pourquoi* :
  une seule règle, et les 12 routes existantes suivent sans modification de leur corps.
- **Choix** : auteur = `Form.createdById` existant — *Pourquoi* : déjà renseigné par
  `createForm`, pas de reprise.
- **Choix** : lignes de partage conservées au retrait de l'accès — *Pourquoi* : la spec demande
  de les retrouver ; la garde suffit à les neutraliser.
- **Écarté** : nouvelle permission `forms:own` attribuée aux rôles Ministre / Resp. — *Raison* :
  la spec exige un octroi nominatif.
- **Écarté** : réutiliser `media_gallery_grants` avec un champ « type » — *Raison* : couplerait
  deux modules et leurs règles d'expiration.
- **Pas d'ADR** : on applique un pattern déjà acté (droit-donnée vérifié objet par objet).

## Risques & points d'attention

- **Fuite par la liste** : `GET /api/forms` et la page doivent filtrer côté serveur ; un test le
  verrouille.
- **Routes qui supposent `forms:manage`** hors `requireFormManage` : `formulaires/page.tsx`,
  `admin/events/[eventId]`, `billetterie/[id]`, `_events.ts`. Seuls les deux derniers usages
  concernés sont adaptés ; un `grep forms:manage` fait partie de la revue.
- **Contrats OpenAPI** : `access: "forms:manage"` des contrats existants devient inexact ;
  le mettre à jour (« forms:manage, ou auteur / co-gestionnaire avec accès délégué »).
- **Matrice des permissions** : inchangée (aucune permission ajoutée), mais `CLAUDE.md` et la
  doc du module mentionnent l'accès délégué.
- **Assistant / MCP** : aucune question de données « formulaires » : rien à faire.

## Stratégie de tests

- `auth.test.ts` (module forms) : `getFormAccess` — gestionnaire, auteur avec accès, auteur sans
  accès (404), co-gestionnaire avec accès, co-gestionnaire dont l'accès est retiré, compte hors
  église, intervenant inchangé ; `requireFormManage({ owner })` refuse le co-gestionnaire.
- `grants.test.ts` : octroi idempotent (une notification), retrait, recherche limitée à
  l'église, partage refusé vers un compte sans accès, journal écrit.
- `builder` : `listForms` avec `scope` ne renvoie que ses formulaires et ceux partagés.
- `notify` : `signalNewResponses` inclut les co-gestionnaires, repli inchangé.
- Routes (`routes.test.ts`) : `GET /api/forms` filtré, `POST` autorisé à un compte délégué,
  `DELETE` refusé au co-gestionnaire, `/api/forms/grants` refusé hors `forms:manage`.
- `route-exhaustiveness.test.ts` et `openapi.test.ts` passent (nouvelles routes déclarées).
