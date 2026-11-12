# Authentification & rôles

## Authentification

### Google OAuth via NextAuth v5

L'authentification utilise [NextAuth v5](https://authjs.dev/) (Auth.js) avec le provider Google.

**Flux** :
1. L'utilisateur clique "Se connecter avec Google" sur la page `/`
2. Redirection vers Google OAuth (`/api/auth/signin`)
3. Callback vers `/api/auth/callback/google`
4. NextAuth crée ou retrouve l'utilisateur en base (via PrismaAdapter)
5. Session créée, retour sur `/`, qui redirige vers l'accueil `/accueil` — ou vers `/profile`
   si l'utilisateur n'a aucun rôle dans l'église courante (`src/app/page.tsx`)

**Première connexion** :
- L'utilisateur est créé automatiquement dans la table `users`
- Si son email est dans `SUPER_ADMIN_EMAILS`, il est marqué `isSuperAdmin` et reçoit le rôle
  `SUPER_ADMIN` sur toutes les églises existantes (callback `signIn`). La variable ne sert qu'à
  cet amorçage : les contrôles d'accès lisent `session.user.isSuperAdmin`, tenu en base
- Sinon, il n'a aucun rôle : il arrive sur son profil, d'où il demande un accès ou la liaison à
  sa fiche STAR

**Connexion de développement** : avec `AUTH_DEV_LOGIN=true`, `POST /api/auth/dev-login` (champ
`devUserKey`) ouvre une session sur un compte du jeu de données fictif, sans Google
([dev-onboarding.md](dev-onboarding.md)). Toujours refusée quand `NODE_ENV=production`
(`isDevLoginEnabled`).

### Session

La session NextAuth est enrichie dans le callback `session` avec :
- `user.id` — ID de l'utilisateur
- `user.isSuperAdmin`, `user.hasSeenTour` (visite guidée), `user.displayName`
- `user.pastoralProfileId`, `user.pastoralChurchIds` — profil pastoral lié (voir « Accès
  transverses entre églises »)
- `user.churchRoles[]` — tous les rôles de l'utilisateur avec les infos église et départements

```typescript
session.user.churchRoles = [
  {
    id: "clx...",
    churchId: "clx...",
    role: "ADMIN",
    church: { id: "clx...", name: "ICC Rennes", slug: "icc-rennes" },
    departments: [
      { department: { id: "clx...", name: "Choristes" } }
    ]
  }
]
```

#### Chargement des départements STAR

Pour les rôles `STAR`, le callback `session` ne consulte pas `user_departments` (vide par design) mais dérive les départements depuis la liaison membre :

```typescript
// Pseudo-code du callback session (src/lib/auth.ts)
if (cr.role === "STAR") {
  const link = await prisma.memberUserLink.findUnique({
    where: { userId_churchId: { userId, churchId: cr.churchId } },
    include: { member: { include: { departments: { include: { department: true } } } } },
  });
  // departments = link.member.departments.map(d => d.department)
}
```

Cela permet d'assigner le rôle STAR sans aucune entrée `user_departments` : les départements visibles suivent automatiquement le profil membre.

#### Notifications de liaison

- Soumission d'une `MemberLinkRequest` → notification `MEMBER_LINK_REQUEST` envoyée à tous les utilisateurs avec rôle `ADMIN`, `SECRETARY` ou `SUPER_ADMIN` dans l'église concernée
- Approbation → notification `MEMBER_LINK_APPROVED` au demandeur (lien : `/planning`)
- Rejet → notification `MEMBER_LINK_REJECTED` au demandeur avec le motif (lien : `/profile`)

### Protection des routes

**Proxy** (`src/proxy.ts`, ex `src/middleware.ts`) — intercepte toutes les adresses hors
fichiers statiques, export `proxy` (pas `middleware`), runtime Node.js (pas Edge) :
1. **Contrôle de module** (ADR-0012), avant toute notion d'identité : une adresse qu'aucun
   module actif ne déclare répond 404 (`/module-absent` pour une page, JSON pour l'API)
2. **Présence d'un cookie de session** : sans session, une route API répond `401` et une page
   redirige vers `/` — sauf les adresses ouvertes : `/`, `/api/auth/*`, `/api/cron/*` (jeton
   porteur vérifié par la route), le rapport CSP et les adresses publiques des manifestes
   (`routes.public`)
3. Pose la politique de sécurité du contenu sur les pages (ADR-0022)

Le proxy ne vérifie que la présence du cookie : la validité de la session et les permissions
sont contrôlées par chaque page et chaque route, avec les helpers ci-dessous.

**Helpers** (`src/lib/auth.ts`) :
- `requireAuth()` — vérifie la session et throw `UNAUTHORIZED` si absente
- `requireChurchPermission(permission, churchId)` — vérifie une permission **dans une église
  précise**, `churchId` obligatoire, throw `FORBIDDEN` si non autorisé
- `requireCurrentChurchPermission(permission)` — résout l'église courante (`getCurrentChurchId`)
  PUIS vérifie la permission dedans ; à utiliser dès qu'une route n'agit pas sur un objet déjà
  identifié (sinon préférer `resolveChurchId` + `requireChurchPermission` pour que l'église de
  l'objet fasse autorité, pas le contexte affiché)
- `requireSuperAdmin()` — réserve une action à l'administration de la plateforme (Super Admin
  uniquement), jamais évaluée dans une église
- `requirePlatformPermission(permission)` — permissions volontairement transverses aux églises
  (module emploi uniquement) ; la liste blanche est dans `src/lib/auth.ts` et testée par
  `src/lib/__tests__/auth-global-scopes.test.ts`
- `hasChurchPermission(session, permission, churchId)` — même règle que
  `requireChurchPermission`, renvoie un booléen (affichage conditionnel)
- `requireChurchAccess(churchId)` — exige un rôle quelconque dans l'église (garde du layout
  `/admin`)
- `getUserDepartmentScope(session, churchId)` — retourne le périmètre départements selon le rôle
- `requireDepartmentAccess(session, churchId, departmentId)` — jette `FORBIDDEN` si le
  département visé n'est pas dans le périmètre de l'appelant. Un périmètre restreint **vide**
  (STAR) refuse tout, sans code spécifique à ce rôle (ADR-0009). À appeler juste après
  `requireChurchPermission`/`resolveChurchId` sur toute route qui adresse nominativement un
  `departmentId`/`deptId`
- `getUserMinistryScope(session, churchId)` — symétrique de `getUserDepartmentScope` pour le
  ministère : `{ scoped: false }` (Super Admin/Admin/Secrétaire) ou `{ scoped: true, ministryIds }`
  (Ministre, borné à `UserChurchRole.ministryId` de l'église courante) ; utilisé par
  `POST/PATCH/DELETE /api/users/[userId]/roles` pour cantonner un Ministre à son ministère
- `getDiscipleshipScope(session, churchId)` — portée discipolat (scoped ou non)
- `resolveChurchId(type, resourceId)` — retrouve le `churchId` d'une ressource
- `getCurrentChurchId(session)` — église active (cookie `current-church` ou première de la liste).
  Contexte d'**affichage**, jamais une autorisation à lui seul : la valeur peut venir d'un cookie
  posé par le client. Toute décision d'autorisation doit vérifier la permission **dans** l'église
  ainsi désignée (`requireCurrentChurchPermission`), jamais s'y fier seule.
- Gardes de l'espace Communication & Production : `isMediaTeamMember(session, churchId, domain)`
  (équipe Photos ou Production Média, avec repli sur Production Média quand aucun département ne
  porte la fonction `PHOTOS`), `requireMediaAccess`/`requireMediaUploadAccess`/
  `requireMediaManageAccess`/`requireMediaReviewAccess(churchId, domain)`, `getMediaShareScope`

Les gardes propres à un module vivent dans le module : `@/modules/audio/auth` (ci-dessous),
`@/modules/agenda/auth`, `@/modules/integration/auth`, `@/modules/care/auth`.


`audio:listen` (bibliothèque d'écoute, spec 021) est accordée à **tous les rôles** — le détail des routes audio est dans la référence OpenAPI (`docs/openapi.json`, tag `audio`).

### Accès transverses entre églises

Le multi-tenant est strict par défaut (ADR-0002) : un rôle dans une église ne donne accès qu'à
cette église. Deux mécanismes dérogent volontairement à cette règle, sur des axes différents :

| | Profil pastoral | Partage de bibliothèque audio |
|---|---|---|
| Introduit par | historique | spec 036 |
| Axe | **par personne** — `session.user.pastoralChurchIds` | **par église** — `AudioLibraryShare` |
| Portée | lecture seule, `PASTORAL_READ_PERMISSIONS` (`events:view`, `discipleship:view`, `planning:view`, `members:view`, `accounting:stats`) | écoute seule, `audio:listen` uniquement |
| Vérifie dans | `requireChurchPermission` — garde générique du multi-tenant | `requireAudioListenAccess` — garde dédié, borné au module audio |
| Qui l'accorde | l'administration (attribution du profil pastoral à une personne) | un Admin/Super Admin de l'église **propriétaire**, à une église entière |

Les permissions d'un profil pastoral **s'ajoutent** à celles d'un éventuel rôle classique dans la
même église (berger également STAR, par exemple) : auparavant, la présence d'un rôle les
écartait et la navigation proposait des pages refusées (FORBIDDEN). Elles restent bornées aux
églises de `pastoralChurchIds`.

Le partage de bibliothèque audio est le **deuxième** axe d'accès transverse inter-églises du
projet. Il ne passe volontairement **pas** par `requireChurchPermission` ni par
`PASTORAL_READ_PERMISSIONS` : élargir le garde générique qui protège tout le multi-tenant pour un
besoin propre à un seul module aurait un rayon d'explosion disproportionné (plan.md, spec 036).
`requireAudioListenAccess` est un helper dédié, sur le modèle de `requireAudioAccess`, dont l'effet
est strictement borné à la lecture des cultes publiés.

**Ce que le partage ne donne jamais** à un membre de l'église destinataire, sur l'église
propriétaire :
- aucune écriture (dépôt, publication, dépublication, paramètres) ;
- aucune génération de lien de partage public (`POST .../share` reste gardé par
  `requireChurchPermission("audio:listen", …)`, qui échoue naturellement pour un invité sans rôle
  dans l'église propriétaire — aucun code dédié n'est nécessaire pour ce refus) ;
- aucune autre permission ni donnée de l'église propriétaire (planning, membres, événements,
  comptes rendus...) - `requireChurchPermission` reste inchangé et continue de refuser tout le
  reste.
- aucune réciprocité ni transitivité : ouvrir sa bibliothèque à une église ne donne rien en retour,
  et un partage sortant ne compte pas comme un partage entrant (`listAccessibleLibraryChurchIds`,
  `src/modules/audio/services/sharing.ts`).

---

### Connexion des assistants IA (MCP, spec 081, ADR-0029)

Seule exception à « la session NextAuth est la seule authentification » : le serveur MCP
(`/api/mcp/server`) accepte un **jeton d'accès OAuth** délivré par Koinonia lui-même, et rien
d'autre n'accepte ce jeton.

- Découverte : `/.well-known/oauth-protected-resource` (RFC 9728) et
  `/.well-known/oauth-authorization-server` (RFC 8414) ; enregistrement dynamique
  `/api/mcp/oauth/register` (clients publics, adresses de redirection exactes en https ou en
  boucle locale) ; autorisation `/api/mcp/oauth/authorize` → écran `/mcp/autoriser` (session
  NextAuth, choix d'**une** église où la fonction est active) ; jetons `/api/mcp/oauth/token`
  (code + PKCE S256, rafraîchissement avec rotation ; un code ou un refresh rejoué révoque la
  connexion) ; révocation `/api/mcp/oauth/revoke`.
- La page de connexion accepte `?next=` **uniquement** vers `/mcp/autoriser?…` (pas de
  redirection ouverte). La décision part en `fetch` même origine (`Origin` obligatoire) : un
  formulaire classique serait bloqué par `form-action` au moment de revenir vers l'assistant.
- À chaque appel : jeton valide, connexion non révoquée, fonction active (instance et église),
  compte toujours membre de l'église ; la session est reconstruite depuis la base
  (`buildSessionForUser`, même code que le callback NextAuth) puis passe par les questions de
  données de l'assistant, qui revérifient le droit de chaque écran. 60 appels/min/compte.
- **Actions confirmées** (lot 2) : portée `write`, accordée **seulement** par la case cochée
  par la personne sur l'écran d'autorisation (un assistant qui demande `write` ne l'obtient pas
  seul). Deux actions, pour sa propre fiche STAR (`listLinkedMemberIds`) : déclarer une absence
  (`declareAbsence`) et répondre à une demande de disponibilité (`saveResponses`). Chacune en deux
  appels : `…_preview` ne modifie rien et fige l'action derrière un jeton à usage unique (5 min,
  lié à la connexion et à l'action, `mcp_confirmations`) ; `…_confirm` revérifie la fiche puis
  exécute par le service de l'application, avec `logAudit` (`details.via = "mcp"`).
- **Actions des responsables** (lot 3a) : avec la même case, et seulement avec `planning:edit`
  dans l'église et le département dans le périmètre (`requireDepartmentAccess`), revérifiés à
  l'aperçu et à la confirmation : remplir ou recopier un planning, relancer les sans-réponse,
  publier une consigne. Exécutées par le code de l'écran (`_core.ts` voisin de la route) ; la
  date limite de planification s'applique comme dans la grille. Une empreinte de l'état lu à
  l'aperçu (grille, disponibilités, consigne) doit être identique à la confirmation.
- Révocation : par la personne (« Mon profil › Assistants connectés »), par l'Admin de l'église
  (`church:settings`), ou en coupant la fonction (Super Admin pour l'instance, Admin pour l'église).

---

### Gardes propres au module audio (`@/modules/audio/auth`)

Ces trois gardes sont des règles du domaine audio, pas de l'infrastructure d'authentification :
elles vivent dans le module, comme celles d'`agenda` et d'`integration` (chantier 4 de
`docs/roadmap-modularite.md`). Leur comportement est inchangé.

- `requireAudioAccess(permission, churchId)` — permission de rôle **ou** appartenance à l'un des
  départements de captation audio (`isCaptureTeamMember`, `Department.function = "CAPTATION_AUDIO"`,
  éventuellement plusieurs départements — spec 046) : un STAR de l'un de ces départements passe le
  contrôle quelle que soit la permission demandée
- `requireAudioUnpublishAccess(churchId)` — plus strict : `audio:manage` ou responsable/ministre
  d'un département de captation audio (`isCaptureTeamLead`), sans passe-droit pour un simple STAR
- `requireAudioListenAccess(churchId)` — autorise l'écoute d'un culte publié de `churchId` (spec
  036) : passe si un rôle portant `audio:listen` existe dans `churchId` (comportement historique),
  **ou** si une des propres églises de l'appelant, elle-même porteuse de `audio:listen`, figure
  comme destinataire d'un partage de bibliothèque ouvert par `churchId`
  (`listOutgoingShares` de `@/modules/audio`). Ne vérifie jamais une permission dans l'église
  propriétaire elle-même pour l'appelant — seulement l'existence du partage.

## Rôles

### Hiérarchie

| Role | Code Prisma | Périmètre |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | Toutes les églises |
| Admin église | `ADMIN` | Une église |
| Secrétariat | `SECRETARY` | Une église |
| Ministre | `MINISTER` | Un ministère d'une église |
| Responsable département | `DEPARTMENT_HEAD` | Un ou plusieurs départements |
| Accompagnateur discipolat | `DISCIPLE_MAKER` | Suivi des relations de discipolat et gestion des présences |
| Rapporteur | `REPORTER` | Accès en lecture/écriture aux comptes rendus d'événements |
| Membre actif | `STAR` | Consultation du planning personnel uniquement |
| Référent soins pastoraux | `PASTORAL_CARE_REFERENT` | Qualification et affectation des demandes de RDV pastoral et des suivis de nouveaux convertis (module `care`, spec 052) |
| Comptable | `ACCOUNTANT` | Traitement des demandes financières et statistiques comptables |

Un utilisateur peut avoir **plusieurs rôles** dans **plusieurs églises** via la table `user_church_roles`.

### Attribution

- **Super Admin** : automatique à la première connexion si l'email est dans `SUPER_ADMIN_EMAILS`
- **Autres rôles** : via l'interface admin (`/admin/access`), avec affectation optionnelle de ministère (MINISTER) ou départements (DEPARTMENT_HEAD). Admin et Secrétaire : par un Admin de l'église ou un Super Admin (`access:admins`) ; Super Admin : par un Super Admin uniquement
- **isDeputy** : la table `user_departments` (liaison `DEPARTMENT_HEAD` ↔ départements) dispose d'un flag `isDeputy` pour distinguer le responsable principal du responsable adjoint (deputy)
- **STAR** : attribué depuis la fiche personne ou la page du rôle STAR dans `/admin/access` ; les
  départements visibles sont dérivés automatiquement depuis `MemberUserLink → Member →
  MemberDepartment` — aucune entrée `user_departments` n'est créée

### Gestion des accès (`/admin/access`, spec 054)

Trois onglets (`AccessTabs`), garde `access:manage` :

- **Personnes** (`PeopleList`) — recherche par nom/email, rôles et nombre d'accès hérités par
  personne (`loadAccessPeople`/`listInheritedAccess`, `src/lib/access-overview.ts`), lien vers la
  fiche de chacune
- **Par rôle** (`RolesOverview`) — un bloc par catégorie de rôle (`ROLE_CATEGORY` de
  `src/lib/roles.ts`), chaque rôle avec sa description et son nombre de détenteurs ; masque les
  rôles transverses à un Ministre au périmètre restreint
- **Demandes** (`RequestsPanel`) — approbation/refus/reconsidération des demandes d'accès
  (comportement inchangé, extrait à l'identique de l'ancien `AccessClient.tsx`)

Deux pages dédiées, chacune 404 (jamais 403) quand la cible échappe au périmètre de l'appelant —
un Ministre restreint ne doit pas pouvoir distinguer « inexistant » de « hors périmètre » :

- **Fiche personne** (`/admin/access/users/[userId]`, `PersonAccessClient`) — identité, fiche
  STAR liée, rôles par catégorie (cases à cocher, description au survol), responsabilités
  (ministère/départements via `ResponsibilityModal`), et les **accès hérités** de la personne en
  lecture seule, avec leur origine
- **Détenteurs d'un rôle** (`/admin/access/roles/[role]`, `RoleHoldersClient`) — liste des
  détenteurs avec retrait, ajout direct parmi les personnes du périmètre appelant ; pour
  MINISTER/DEPARTMENT_HEAD, vue structurée ministère → départements

**Accès hérités** (`listInheritedAccess`, `src/lib/access-overview.ts`) : droits qui ne passent
par aucun rôle d'église — appartenance à un département de fonction (ADR-0014, table
`FUNCTION_ACCESS`, filtrée par `registry.has(module)`), droit supplémentaire du responsable d'un
département de fonction (ex. dépublier un culte), rôle Secrétaire virtuel (spec 045), profil
pastoral lié, berger/co-berger de famille, accompagnant en charge d'un suivi pastoral **ouvert**
(spec 052). Toujours affichés en lecture seule, jamais retirables depuis cet écran (sauf le rôle
Secrétaire virtuel qui, lui, n'est de toute façon jamais retirable).

Les libellés/descriptions/catégories de rôle (`ROLE_LABELS`, `ROLE_SHORT_LABELS`,
`ROLE_DESCRIPTIONS`, `ROLE_CATEGORY`, `ASSIGNABLE_BY_MINISTER`, `PRIVILEGED_ROLES`, `ALL_ROLES`)
ont une source unique : `src/lib/roles.ts`, importée par le guide (`GuideContent.tsx`),
`/admin/users`, `/admin/access`, les demandes d'accès et `RequestForm.tsx` — un test-gardien
(`role-labels-single-source.test.ts`) empêche la réapparition d'une table locale.

---

## Permissions

La matrice rôle-permissions est **dérivée dynamiquement** depuis les manifestes de modules (`src/modules/*/manifest.ts`) via `buildRolePermissions(registry)`. La source de vérité est les blocs `permissions` de chaque manifeste. L'ancien helper `src/lib/permissions.ts` (`hasPermission`) a été supprimé : il ne connaissait que 4 modules sur 11 et ne servait plus qu'à un test. La matrice attendue est désormais figée en dur dans `src/core/__tests__/permissions.test.ts`, qui échoue à toute modification de droits non répercutée ici.

Le singleton `rolePermissions` (pré-calculé au démarrage dans `src/lib/registry.ts`) est utilisé directement dans les routes API et composants :

```typescript
import { rolePermissions } from "@/lib/registry";

const userPermissions = new Set(
  session.user.churchRoles.flatMap((r) => rolePermissions[r.role] ?? [])
);
```

Matrice résultante — un sous-tableau par module (`src/modules/*/index.ts`). Toutes les
colonnes portent les dix rôles de l'enum Prisma `Role` ; une cellule vide signifie que le rôle
n'a pas la permission.

Légende des colonnes : SA = Super Admin, Ad = Admin, Sec = Secrétaire, Min = Ministre,
RD = Resp. département, FD = Faiseur de Disciples, Rep = Reporter, STAR = STAR,
RSP = Référent soins pastoraux, Compt = Comptable.

#### Module `core`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `church:manage` | x | | | | | | | | | |
| `church:settings` | x | x | | | | | | | | |
| `users:manage` | x | x | | | | | | | | |
| `access:manage` | x | x | x | x | | | | | | |
| `access:admins` | x | x | | | | | | | | |

`church:manage` reste la permission de la **plateforme** (créer, onboarder, supprimer une église ;
en changer le nom, l'adresse publique ou le superviseur). `church:settings` couvre la configuration
d'**une** église par son Admin : profils pastoraux, paramètres (`PUT /api/churches/[churchId]`
hors nom/slug/superviseur), historique des modifications. `access:admins` s'ajoute à
`access:manage` pour attribuer ou retirer les rôles Admin et Secrétaire (`canGrantRole`,
`src/lib/roles.ts`) ; le rôle Super Admin ne s'attribue que par un Super Admin.

#### Module `planning`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `planning:view` | x | x | x | x | x | | | x | | |
| `planning:edit` | x | x | | x | x | | | | | |
| `planning:department` | x | x | x | x | x | | | | | |
| `members:view` | x | x | x | x | x | | | | | |
| `members:manage` | x | x | | x | x | | | | | |
| `events:view` | x | x | x | x | x | | x | | | |
| `events:manage` | x | x | x | | | | | | | |
| `departments:view` | x | x | x | x | x | | | | | |
| `departments:manage` | x | x | | x | | | | | | |
| `reports:view` | x | x | x | | | | x | | | |
| `reports:edit` | x | x | x | | | | x | | | |
| `absences:view` | x | x | x | x | x | | | | | |
| `absences:manage` | x | x | x | x | x | | | | | |
| `availability:settings` | x | x | x | | | | | | | |

#### Module `discipleship`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `discipleship:view` | x | x | x | x | x | x | | | | |
| `discipleship:manage` | x | x | x | | | x | | | | |
| `discipleship:export` | x | x | x | | | | | | | |

#### Module `audio`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `audio:listen` | x | x | x | x | x | x | x | x | x | x |
| `audio:view` | x | x | x | | | | | | | |
| `audio:upload` | x | x | x | | | | | | | |
| `audio:review` | x | x | | | | | | | | |
| `audio:manage` | x | x | | | | | | | | |

#### Module `media`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `media:view` | x | x | x | | | | | | | |
| `media:upload` | x | x | x | | | | | | | |
| `media:review` | x | x | | | | | | | | |
| `media:manage` | x | x | | | | | | | | |

#### Module `accounting`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `accounting:submit` | x | x | | x | x | | | | | |
| `accounting:view` | x | x | | x | x | | | | | x |
| `accounting:manage` | x | x | | | | | | | | x |
| `accounting:stats` | x | x | x | | | | | | | x |

#### Module `giving` (dons, spec 065)

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `giving:manage` | x | x | x | | | | | | | x |
| `messages:publish` | x | x | x | | | | | | | |
| `shuttle:manage` | x | x | | | | | | | | x |
| `treasury:manage` | x | x | | | | | | | | x |
| `treasury:reopen` | x | x | | | | | | | | |
| `ticketing:manage` | x | x | x | | | | | | | |

#### Module `agenda`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `agenda:view` | x | x | x | | | | | | | |
| `agenda:manage` | x | x | x | | | | | | | |

Depuis la spec 052 (ADR-0015), `agenda` ne porte plus la qualification des demandes de RDV : le
module ne garde que les profils pastoraux, le calendrier et la planification (par Admin/Secrétaire
ou le Protocole, membre d'un département de fonction `PROTOCOLE`, via `isProtocoleMember`).
`PATCH /api/agenda/requests/[id]/schedule` et `PATCH`/`DELETE /api/agenda/entries/[id]` restent des
routes `agenda` mais orchestrent, dans la même transaction, le service `care` qui possède la
demande.

#### Module `care`

Suivi et rendez-vous pastoraux (spec 052, [ADR-0015](adr/0015-module-suivi-rendez-vous-pastoraux.md)) —
absorbe la qualification des demandes de RDV (ex-`agenda`) et le suivi des nouveaux convertis MSDP
(ex-`integration`).

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `care:qualify` | x | x | | | | | | | x | |
| `care:view` | x | x | x | | | | | | x | |
| `care:delete` | x | x | | | | | | | | |

`requireCareQualify()`/`getCareAccess()` (`src/modules/care/auth.ts`) résolvent ces deux
permissions **uniquement** via `rolePermissions` — à la différence de `requireIntegrationAccess()`
ci-dessous, aucune approximation par `members:manage`/`events:manage` (décision #583, un Ministre
ou un Resp. département n'a donc aucun accès à `care`, même avec `members:manage`). Un
accompagnant (profil pastoral, ou membre d'un département de fonction `MSDP`) sans
`care:qualify`/`care:view` n'accède qu'aux demandes/suivis dont il est l'accompagnant en charge —
vérifié objet par objet (`isCurrentAssignee`, `src/modules/care/services/assignee.ts`), pas par la
garde d'entrée.

La confidentialité du contenu (`message`, `subject`) est appliquée une seule fois, par
`projectRequest()` (`src/modules/care/services/projection.ts`) : fiche complète pour le référent,
Admin, Super Admin, ou l'accompagnant en charge ; libellé neutre « Rendez-vous pastoral » pour
tous les autres lecteurs (Secrétaire, Protocole, équipe intégration, accompagnant dessaisi).

Depuis la spec 052 lot 2, l'affectation choisit entre deux populations d'accompagnants — un
profil pastoral ou un STAR accompagnant (`AssigneeSelection`,
`src/modules/care/services/assignee.ts`) — réservée à `care:qualify` (validation, réaffectation).
Les étapes de suivi (fixer la date, renseigner le compte rendu, rendre au référent) sont réservées à
l'accompagnant **en charge**, pas à toute l'équipe. `GET/PUT /api/care/settings`
(`/care/parametres`) et `GET /api/care/stats` (`/care/stats`), ajoutés au lot 3, réutilisent ces
deux mêmes permissions sans en introduire de nouvelle : réglages des délais de relance réservés à
`care:qualify`, statistiques ouvertes à `care:view`.

Le STAR accompagnant (spec 056, `src/modules/care/services/companions.ts`) est un vivier
**calculé** — membre d'un département de fonction `MSDP` (appartenance de fiche STAR ou
responsabilité de département) — auquel `care:qualify` peut déclarer des exceptions par église
(`CareCompanion`) : `EXCLUDED` écarte un membre du MSDP, `ADDED` ajoute un STAR hors MSDP (ou le
garde après son départ). `isEligibleCompanion()` applique cette règle à la fois pour la liste
proposée (`GET /api/care/companions`) et pour la vérification à l'affectation (`resolveAssignee`),
volontairement la même fonction des deux côtés (#616 : ces deux usages avaient divergé). Réglage
dans `/care/parametres` (`PUT /api/care/companions`), réservé à `care:qualify`.

`care:delete` (spec 057, Admin/Super Admin seuls) permet de supprimer définitivement une demande
de rendez-vous pastoral ou un suivi de nouveau converti (`DELETE /api/care/requests/[id]`,
`DELETE /api/care/followups/[id]`, garde `requireCareDelete(churchId)` évaluée dans l'église de
l'objet). Le Référent soins pastoraux ne l'a pas : il rejette ou clôture. La suppression efface
aussi l'historique et les notifications de l'objet (ADR-0019), et est refusée pour un rendez-vous
dont est issu un suivi.

#### Module `rooms` (salles)

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `rooms:view` | x | x | x | x | x | | | | | |
| `rooms:reserve` | x | x | x | x | x | | | | | |
| `rooms:manage` | x | x | | | | | | | | |

#### Module `serving` (candidatures au service, spec 077)

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `serving:manage` | x | x | | | | | | | | |

La permission ne décrit que l'administration de l'église. L'accès réel aux candidatures se
résout objet par objet dans `@/modules/serving/auth` et `services/access.ts`, sans ouverture
globale par rôle (le Secrétaire n'y a pas accès) :

- **Étude et traitement avant affectation** : `serving:manage`, Super Admin, ou tout rôle dont
  les départements comptent un département de fonction `VIE_DES_STAR` (équipe PVS : responsable,
  STAR du PVS dont le compte est lié, Ministre du ministère du PVS).
- **Lecture de la fiche par un département** : responsable (principal ou adjoint) du
  département ou Ministre de son ministère, tant que l'affectation est en attente, en
  observation ou confirmée — plus après un renvoi au PVS.
- **Vue du STAR** (D8) : compte lié (lien validé) à la fiche STAR de la candidature, une fois
  accueilli dans un département ; vue réduite, sans informations internes.
- **Réglages** (durées, adresse email du PVS) : Super Admin, `serving:manage`, ou responsable
  d'un département PVS.

Chaque consultation de fiche est journalisée (`VIEW`), chaque téléchargement du PDF aussi
(`EXPORT`).

#### Module `jobs` (emploi)

Transversal — ouvert à tous les rôles authentifiés pour la consultation/candidature, modération
réservée à Admin/Secrétaire :

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `jobs:view` | x | x | x | x | x | x | x | x | x | x |
| `jobs:post` | x | x | x | x | x | x | x | x | x | x |
| `jobs:seek` | x | x | x | x | x | x | x | x | x | x |
| `jobs:freelance` | x | x | x | x | x | x | x | x | x | x |
| `jobs:manage` | x | x | x | | | | | | | |

Ces permissions sont **transverses aux églises** : `requirePlatformPermission` les accorde si
l'un des rôles de l'utilisateur, dans n'importe quelle église, les porte (liste blanche testée par
`auth-global-scopes.test.ts`). Un modérateur (`canManageJobs`, `src/modules/jobs/services/access.ts` :
Super Admin ou `jobs:manage` via `rolePermissions`) voit les publications retirées et peut retirer,
republier ou supprimer toute publication. L'auteur modifie, clôture (pourvue, a trouvé,
indisponible) et supprime la sienne ; il retire et republie lui-même une offre d'emploi, mais ne
remet jamais en ligne une mission ou un profil retiré par la modération (spec 064).

#### Module `integration`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `integration:manage` | x | x | x | | | | | | | |
| `integration:delete` | x | x | | | | | | | | |

`integration:delete` (spec 057, Admin/Super Admin seuls) : suppression définitive d'une demande
d'intégration (`DELETE /api/integration/requests/[id]`, `requireIntegrationDelete(churchId)`),
refusée tant qu'un rendez-vous ou un suivi `care` en est issu. Ni l'équipe
`INTEGRATION`/`MSDP` ni les bergers n'y ont accès, contrairement à la consultation.

Accès complet aux dossiers d'accueil et aux « parcours » (coordonnées personnelles, export),
résolu par `requireIntegrationAccess()`/`requireIntegrationFullAccess()`
(`src/modules/integration/auth.ts`), qui accorde en plus un accès complet à tout membre du
département fonction `INTEGRATION`/`MSDP`, et un accès restreint (à ses familles, sans export ni
« parcours ») à un berger ou conseiller MSDP assigné via `FamilyLeaderAssignment`.
`requireIntegrationExportAccess()`/`requireIntegrationFullAccess()` sont strictement réservés aux
accès non restreints (pas de berger/conseiller au périmètre limité) — un berger n'a donc jamais
accès aux dossiers « parcours », contrairement aux dossiers d'accueil qu'il peut consulter pour
ses familles.

Le périmètre restreint du berger (`isInIntegrationScope`) est le même dans la liste et sur chaque
demande (détail, actions, historique) : une demande encore **sans famille** n'en fait pas partie.
La gestion des bergers (lister, affecter, retirer — `/api/integration/leaders*`) exige l'accès
complet : sinon un berger pourrait s'affecter à d'autres familles et élargir son propre périmètre.

Depuis la spec 054 (issue #583), `integration:manage` **remplace** l'ancienne approximation par
`members:manage`/`events:manage` dans ces deux gardes, et dans les routes `/api/integration/parcours*`
qui la recopiaient. Jusque-là, tout Ministre et tout Resp. département y accédait quel que soit
son département — un accès plus large que ce que cette documentation a toujours décrit.

`requireIntegrationSettingsAccess()` garde le réglage des délais de relance (spec 051,
`/integration/parametres` et `GET/PUT /api/integration/settings`) : Super Admin, `integration:manage`,
ou `DEPARTMENT_HEAD` rattaché à un département de fonction `INTEGRATION`.

Au sein d'une demande, les droits par action sont calculés par la machine à états
(`computeFamilyTransitionData`, `src/modules/integration/services/family-state.ts`) :
affectation et réouverture réservées à l'équipe ; mise en attente de recontact et renvoi à
l'équipe ouverts au berger assigné dès « famille affectée » ; transmission au département
mission réservée à l'équipe ; levée d'une attente soumise au même droit que sa pose.

#### Module `storage`

Infrastructure pure (client S3, jetons opaques), aucune permission propre — consommé par
`media` et `audio`.

**Spécificités du Secrétaire** :
- Voit tous les départements de son église (même périmètre que Admin)
- Planning en lecture seule (pas de `planning:edit`)
- Membres en lecture seule dans l'admin (pas de `members:manage`) — mais valide les demandes
  d'accès et lie/délie un compte à une fiche STAR (`access:manage`, spec 054/#583)
- Gère les accès complets à l'accueil et aux parcours d'intégration (`integration:manage`)
- Peut réserver une salle (`rooms:reserve`, spec 054/#583)
- Peut exporter les données discipolat (`discipleship:export`)
- Accès en lecture/écriture aux comptes rendus (`reports:view` + `reports:edit`)
- Accès complet à l'agenda pastoral (`agenda:view` + `agenda:manage`)
- Voit les demandes de RDV pastoral et les suivis de nouveaux convertis (`care:view`), mais ne
  les qualifie ni ne les affecte (`care:qualify`, réservée au Référent soins pastoraux)
- Voit les statistiques comptables (`accounting:stats`) mais ne traite pas les demandes
  (`accounting:manage`)

**Spécificités du Responsable de département** (spec 054/#583) :
- Gère ses fiches STAR (`members:manage`) dans son périmètre de responsabilité
  (`user_departments`), incluant le repérage et la fusion de doublons — mais seulement quand les
  **deux** fiches sont entièrement dans son périmètre (`isMemberFullyInScope`,
  `src/lib/member-scope.ts`) : une fiche partagée avec un autre département engagerait un autre
  responsable, plus strict que la modification d'une fiche (`isMemberInScope`, un département
  commun suffit)
- N'a pas `access:manage` : ne valide plus les demandes d'accès, ne lie/délie plus de compte à
  une fiche STAR, et n'attribue plus le rôle STAR en masse — ces trois gestes étaient jusque-là
  ouverts par `members:manage`, sans respecter le périmètre ni cette restriction
- N'a pas `integration:manage` : perd l'accès aux dossiers d'accueil et aux « parcours » hors de
  son département, sauf appartenance par ailleurs à l'équipe dédiée (fonction `INTEGRATION`/`MSDP`)

**Spécificités du Reporter** :
- Accès aux événements en lecture (`events:view`) et aux comptes rendus (`reports:view` + `reports:edit`)
- Pas d'accès au planning, aux membres, au discipolat ni à la section admin

**Spécificités du STAR** (spec 031, issues #462/#463) :
- Permission `planning:view` — accède à « Mon planning » (vue macro personnelle), ses
  événements (`/planning/events`) et l'auto-déclaration d'absences
- N'a **pas** `planning:department` : pas d'accès à `/dashboard` (grille par département), ni
  aux routes API de département (tâches, consignes, membres, stats, planning mensuel/hebdomadaire)
- Aucun accès au module salles : ni `rooms:view` ni `rooms:reserve`
- Pas d'accès aux sections membres, événements (liste/calendrier), admin, discipolat
- Conserve `audio:listen` et les permissions transverses du module emploi (`jobs:*`, hors
  `jobs:manage`)
- `getUserDepartmentScope` renvoie `{ scoped: true, departmentIds: [] }` pour ce rôle — la chaîne
  d'appartenance (`MemberUserLink → Member → MemberDepartment`) n'est volontairement pas fusionnée
  avec le périmètre de responsabilité (`user_departments`) : voir ADR-0009
- Attribution requiert une liaison compte-membre valide (`MemberUserLink`)

**Événements d'équipe** (spec 044, issue #522) : rendez-vous internes à un département
(répétition, réunion, formation), distincts des événements d'église. Gestion via les permissions
existantes `planning:department`/`planning:edit` + `requireDepartmentAccess` (aucune permission
propre) ; visibilité en lecture seule par les membres du département dans leur agenda personnel
via `listTeamEventsForMember` (`src/modules/planning/services/team-event.service.ts`), un
**périmètre d'appartenance** distinct du périmètre de responsabilité ci-dessus — voir
[ADR-0013](adr/0013-perimetre-appartenance-lecture-seule.md), qui formalise pourquoi ce
périmètre ne doit jamais être fusionné avec `getUserDepartmentScope`/`requireDepartmentAccess`
(ADR-0009).

**Spécificités du Référent soins pastoraux** (`PASTORAL_CARE_REFERENT`, ex-`AGENDA_QUALIFIER`
renommé spec 052) :
- Permissions propres : `care:qualify` (qualifie, affecte, rejette les demandes de RDV pastoral
  et les suivis de nouveaux convertis) et `care:view`
- N'a **pas** `agenda:view` ni `agenda:manage` : aucun accès à la vue agenda hebdomadaire ni à
  la planification des demandes validées (réservées à Admin/Secrétaire, ou au Protocole via la
  fonction de département)
- Conserve `audio:listen` et les permissions transverses du module emploi (`jobs:*`, hors
  `jobs:manage`)

**Spécificités du module dons** (spec 065) :
- `giving:manage` (Super Admin, Admin, Secrétaire, Comptable) ouvre `/dons` : paramétrage de la
  page publique `/donner/<slug>` (sections activables, coordonnées bancaires, verset, adresse
  courte) et slide de projection `/dons/slide` (QR code, PNG, plein écran)
- La page publique est sans connexion et ne montre que les sections activées ; une page
  désactivée, absente ou une église inconnue répondent le même « page non disponible »
- Intégrité : IBAN vérifié (longueur par pays, clé mod 97), liens en https uniquement ; toute
  modification est journalisée (`GivingPage`), et un changement de coordonnées de paiement ou une
  désactivation alerte la comptabilité (`church.accountingEmails`), à défaut les Admins (domaine
  de notification `giving`)
- Nom et logo de l'église (spec 066) : nom affiché ou masqué et taille (Petit, Moyen, Grand)
  réglés séparément pour la page et pour la slide ; un logo unique pour fond sombre (PNG/JPEG/WebP
  ≤ 2 Mo, réencodé en PNG, jamais de SVG) déposé dans `/dons`, enregistré dès son dépôt et
  affiché par support selon son interrupteur. Déposer, remplacer ou retirer le logo est journalisé
  et alerte la comptabilité comme un changement d'IBAN ; le logo est servi par Koinonia
  (`/api/giving/public/<slug>/logo`, page active uniquement)
- Organisation de l'écran `/dons` (spec 067) : bloc « Publication » en tête (pastille sur la
  version enregistrée, « Sera publiée / retirée à l'enregistrement » tant que le brouillon diffère),
  onglets « Page publique » / « Slide de projection » (`?support=slide`) qui pilotent formulaire et
  aperçu — l'aperçu de la slide réutilise la vraie scène via `toSlideProps`, seule traduction
  contenu → slide. Modifications non enregistrées signalées dans la barre collante, garde à la
  sortie (lien interne, fermeture, rechargement ; ni bouton « Précédent » ni palette ⌘K)

**Spécificités du module navette** (spec 073) — extension de la comptabilité, désactivable seule
(`ENABLED_MODULES`) :
- `shuttle:manage` (Super Admin, Admin, Comptable) : registre complet de la navette sous
  `/accounting/navette` — solde de départ, abondements, correction ou suppression de n'importe
  quelle ligne à tout moment, signalements, cautions non restituées, seuil de solde bas, export
- **Équipe navette** = membres d'un département de fonction `NAVETTE` (fiche liée), ses
  responsables et adjoints (`user_departments`) et le Ministre de son ministère
  (`getShuttleAccess`, `@/modules/shuttle/auth`), quel que soit le rôle, STAR compris. Droits
  d'écriture énumérés (ADR-0014, règle 5) : déclarer dépenses, restitutions de caution et
  remboursements du loueur avec justificatif (photo ou document, type vérifié sur le contenu),
  gérer les locations, corriger ou supprimer **ses** lignes pendant 48 h, demander le
  remboursement de **ses** avances personnelles. Composer ce département est une décision de
  sécurité
- Déclaratif, sans approbation : registre à montants signés (`shuttle_entries`), solde et solde
  courant calculés à la lecture, suppression logique, historique par `logAudit` (avant/après).
  Toute mutation par l'équipe notifie la compta (domaine `shuttle` : Comptables, à défaut
  Admins) ; le franchissement du seuil de solde bas alerte aussi les responsables
- Liens avec `accounting` (via son index, jamais l'inverse) : note de frais créée depuis une ligne
  « avance personnelle » (`createLinkedExpenseReport`, justificatif copié, ouverte à l'auteur même
  STAR), avances de budget versées au département Navette **lues** comme entrées du registre, et
  notes de frais de la Navette hors registre ajoutables par la compta

**Spécificités du module trésorerie** (spec 076) — extension de la comptabilité, désactivable
seule (`ENABLED_MODULES`) :
- `treasury:manage` (Super Admin, Admin, Comptable) ouvre `/accounting/tresorerie` : comptes de
  trésorerie (caisse, coffre, en ligne ; solde de départ daté, archivage), registre des entrées
  et sorties (montant positif + sens, solde après chaque ligne, calculé à la lecture en
  centimes), catégories et objets d'offrandes spéciales, collecte de culte (espèces par catégorie,
  chèques un par un, deux compteurs), remise au compte commun (bordereau, chèques cochés),
  transferts entre comptes (ni recette ni dépense), budget annuel, rapports, export. La
  Secrétaire n'y a **aucun** accès. `treasury:reopen` (Super Admin, Admin) rouvre un mois
  clôturé, avec un motif journalisé
- **Mois clôturé** (`treasury_closures`) : aucune écriture datée de ce mois, y compris les
  reprises — `assertTreasuryDateOpen` est appelé par les routes de paiement et de navette
- **Reprises par lecture** ([ADR-0027](adr/0027-reprise-par-lecture-entre-modules.md)) :
  `FinancialPayment.treasuryAccountId` (« Payé depuis » à la remise d'un paiement) et
  `ShuttleEntry.treasuryAccountId` (« Remis depuis » sur un abondement) sont posés et validés par
  la couche `src/app` ; le registre les **lit** (`listTreasuryPayments` de `accounting`, table
  `shuttle_entries` gardée par `registry.has("shuttle")`) en lecture seule. `accounting` et
  `shuttle` n'importent jamais `treasury`. Le compte bancaire commun n'est pas suivi

**Spécificités du module assistant** (spec 075, [ADR-0028](adr/0028-assistant-moteur-interchangeable.md))
— désactivable (`ENABLED_MODULES`), **aucune permission propre** :
- Tout compte connecté de l'église courante pose ses questions (`/api/assistant/ask`, 30 par
  minute) si l'assistant est actif : module, instance (`assistant_settings`, Super Admin) et
  église non coupée (`assistant_church_settings`, `church:settings`). Sinon 404 et aucune bulle
  (`AssistantLauncher`, en bas à droite, au-dessus de la barre du bas et des barres marquées
  `data-k-bottom-bar`) ; le guide reste dans le menu du compte
- Les fiches sont filtrées **avant** classement par module actif et par audience (rôles,
  permissions, prédicats — `linkedStar`, `shuttleTeam`, `ticketing`… — calculés côté serveur par
  `src/app/api/assistant/_viewer.ts`) ; une fiche hors du rôle ne peut donner que son refus, sans
  donnée
- Questions de données : composées dans `src/app/api/assistant/_data-questions.ts`, elles relisent
  les chargeurs et règles de périmètre des écrans (`loadMyPlanning`, `getUserDepartmentScope`,
  `resolveRequestQueueAccess`, `getShuttleAccess`…) et revérifient le droit de l'écran ; jamais de
  coordonnée d'autrui ni de donnée `care` (texte libre passé par `anonymize`)
- Administration de la base (`/admin/assistant`, `/api/assistant/admin/*`, `/api/assistant/settings`) :
  `requireSuperAdmin()` — la base et les questions remontées sont d'instance, sans compte ni église

**Spécificités du module billetterie** (spec 074) — désactivable (`ENABLED_MODULES`) :
- `ticketing:manage` (Super Admin, Admin, Secrétaire) ouvre `/billetterie` et la création
  d'événements ; son détenteur est **organisateur implicite** de tous les événements de son
  église
- **Rôles d'événement** (`ticketing_event_roles`) : Organisateur, Trésorier, Accueil / sécurité,
  Restauration, Observateur, cumulables, attribués à n'importe quel compte de l'église (STAR
  compris) et éteints à la clôture. Ce sont des **données** vérifiées objet par objet
  (`getEventAccess`/`requireEventAction`, `@/modules/ticketing/auth`, matrice `EVENT_ACTIONS`) ;
  l'église qui fait foi est celle de l'événement (autre église : 404). L'accueil ne reçoit jamais
  l'email, le téléphone du contact ni les montants d'option ; la restauration compose le menu
  (plats, allergènes, stock, fermeture) mais pas le prix ni les règles de l'option
- **Public sans compte** (`routes.public`) : `/inscription/<église>/<événement>` (Turnstile, débit
  limité), `/reservation/<jeton>` (gestion), `/billet/<jeton>` (ce billet seul). Jetons dérivés
  (HMAC de `TICKETING_TOKEN_SECRET`, à défaut `AUTH_SECRET`), seule leur **empreinte** SHA-256
  est stockée ; QR : billet = URL, réservation `KOINONIA-RESA:`, badge `KOINONIA-BADGE:`,
  étiquette `KOINONIA-REPAS:` (jamais accepté au contrôle d'entrée)
- Koinonia n'encaisse rien : Wero, Revolut, virement sur un IBAN **propre à l'événement** (jamais
  celui de l'église), espèces, chèque. État de paiement **par élément** (entrée, option) ;
  « J'ai payé » → déclaré → confirmé ou refusé par le trésorier ; encaissement direct borné par
  rôle ; annulation libre, remboursement selon les règles de chaque élément
- Emails au contact : `sendEmail` direct s'il n'a pas de compte (liste blanche), sinon
  `createNotification` (domaine `ticketing`). Tâche cron `ticketing` (15 min) : relance avant la
  date limite des options, libération des options non réglées (sauf paiement sur place), rappel
  de la veille, clôture 24 h après la fin, purge des données nominatives après la durée de
  conservation
- Écrans de terrain **hors ligne** ([ADR-0026](docs/adr/0026-ecrans-hors-ligne.md)) :
  `/billetterie/[id]/controle` (accueil) et `/billetterie/[id]/restauration` — instantané
  d'empreintes, file IndexedDB, synchronisation idempotente (`…/sync`), présences **calculées** à
  partir des passages, seuils de jauge 90 % et 100 % notifiés une fois. L'équipe (postes,
  affectations, badges) est propre à l'événement ; « Mon planning » la lit seulement

**Spécificités du module messages** (spec 071) :
- `messages:publish` (Super Admin, Admin, Secrétaire) ouvre `/admin/messages` : publier, programmer,
  corriger et retirer un **message système** dans son église. Un message pour **toute l'instance**
  (`churchId` nul) exige en plus le Super Admin (`requireMessageAuthorAccess`,
  `@/modules/messages/auth`) ; pour un message existant, l'église qui fait foi est celle du message
- Public décrit par critères (rôles, ministères, départements, « responsables seulement »), stocké
  en JSON validé par Zod, **évalué à l'affichage** (bandeau, détail, reçus) et **résolu une fois**
  au début de la période pour la notification (`resolveRecipients`, `isInAudience` : même règle).
  Ministère ou département = ses responsables (`user_departments`, Ministre du ministère) et, sauf
  « responsables seulement », ses membres (fiche STAR liée au compte)
- Bandeau sous la barre supérieure (`SystemMessageBanner`, prop `banner` d'`AuthLayoutShell`) ;
  « fermé » est un reçu en base (`system_message_receipts`) donc vaut sur tous les appareils ;
  un message Urgent ne se ferme pas. Statistiques globales (visées, vues, fermées), jamais de
  liste nominative
- Notification au début de la période (envoi immédiat à la publication, tâche cron
  `system-messages` pour les messages programmés et en rattrapage ; `notifiedAt` pris de façon
  atomique) dans le domaine « Messages de l'administration » (`system-messages`). **Exception
  Urgent** : `notifyUsers(…, { emailPolicy: "always" })` envoie l'email malgré la préférence
  ([ADR-0025](adr/0025-email-urgent-hors-preference.md)) — seul usage autorisé de cette
  option ; la notification native suit toujours la préférence

**Spécificités du Comptable** (`ACCOUNTANT`) :
- Seul rôle (hors Super Admin/Admin) à avoir `accounting:manage` : traite les demandes
  financières (validation, rejet, saisie des paiements)
- A aussi `accounting:view` (consultation globale) et `accounting:stats`
- Pas d'accès au planning, aux membres, aux événements, au discipolat ni à la section admin
- Conserve `audio:listen` et les permissions transverses du module emploi (`jobs:*`, hors
  `jobs:manage`)

### Utilisation dans le code

```typescript
// Dans un route handler (protection + permission)
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // L'église de l'objet fait autorité, jamais le contexte d'église affiché
    const churchId = await resolveChurchId("member", id);
    const session = await requireChurchPermission("members:manage", churchId);
    // ... logique
  } catch (error) {
    return errorResponse(error); // 401 ou 403 automatique
  }
}
```

```typescript
// Test de permission dans un composant serveur
import { rolePermissions } from "@/lib/registry";

const canManage = session.user.isSuperAdmin || session.user.churchRoles
  .filter((r) => r.churchId === churchId)
  .flatMap((r) => rolePermissions[r.role] ?? [])
  .includes("events:manage");
```

### Cas particulier : PATCH departments/[id] (function)

L'endpoint `PATCH /api/departments/[departmentId]` qui assigne une fonction départementale (String) est protégé par `events:manage`. Ce choix reflète que la configuration des fonctions est liée au workflow des annonces et événements, non à la gestion structurelle des départements.

### Visibilité des départements

- **Super Admin / Admin / Secrétaire** : voient tous les départements de leur église (lecture globale)
- **Ministre** : voit les départements du ministère qui lui est assigné
- **Responsable de département** : voit uniquement les départements qui lui sont assignés via `user_departments`
- **Disciple Maker** : pas d'accès au planning ni à la grille des départements ; périmètre limité au module discipolat
- **Reporter** : pas d'accès au planning, aux membres ni à la section admin ; voit uniquement les événements et les comptes rendus qui lui sont accessibles
- **STAR** : restriction totale sur les données de département (`requireDepartmentAccess` refuse
  systématiquement) ; accès conservé uniquement à « Mon planning », ses événements et ses absences

Cette logique est implémentée dans `src/app/(auth)/layout.tsx` et
`getUserDepartmentScope()`/`requireDepartmentAccess()` dans `src/lib/auth.ts` — voir ADR-0009.
