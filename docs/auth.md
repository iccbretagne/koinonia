# Authentification & rôles

## Authentification

### Google OAuth via NextAuth v5

L'authentification utilise [NextAuth v5](https://authjs.dev/) (Auth.js) avec le provider Google.

**Flux** :
1. L'utilisateur clique "Se connecter avec Google" sur la page `/`
2. Redirection vers Google OAuth (`/api/auth/signin`)
3. Callback vers `/api/auth/callback/google`
4. NextAuth crée ou retrouve l'utilisateur en base (via PrismaAdapter)
5. Session créée, redirection vers `/dashboard`

**Première connexion** :
- L'utilisateur est créé automatiquement dans la table `users`
- Si son email est dans `SUPER_ADMIN_EMAILS`, il reçoit automatiquement le rôle `SUPER_ADMIN` sur toutes les églises existantes
- Sinon, il n'a aucun rôle (accès au dashboard mais pas de départements visibles)

### Session

La session NextAuth est enrichie dans le callback `session` avec :
- `user.id` — ID de l'utilisateur
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

**Middleware** (`src/proxy.ts`, ex `src/middleware.ts`) :
- Protège `/dashboard/*` et `/api/*` (sauf `/api/auth/*`)
- Vérifie l'existence d'une session NextAuth valide
- Redirige vers `/` si non authentifié
- Exporte `proxy` (pas `middleware`), runtime Node.js (pas Edge)

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
- `getUserDepartmentScope(session)` — retourne le périmètre départements selon le rôle
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
- `requireAudioAccess(permission, churchId)` — permission de rôle **ou** appartenance au département
  de captation audio (`isCaptureTeamMember`, `Department.function = "CAPTATION_AUDIO"`) : un STAR
  de ce département passe le contrôle quelle que soit la permission demandée
- `requireAudioUnpublishAccess(churchId)` — plus strict : `audio:manage` ou responsable/ministre du
  département de captation audio (`isCaptureTeamLead`), sans passe-droit pour un simple STAR
- `requireAudioListenAccess(churchId)` — autorise l'écoute d'un culte publié de `churchId` (spec
  036) : passe si un rôle portant `audio:listen` existe dans `churchId` (comportement historique),
  **ou** si une des propres églises de l'appelant, elle-même porteuse de `audio:listen`, figure
  comme destinataire d'un partage de bibliothèque ouvert par `churchId`
  (`listOutgoingShares` de `@/modules/audio`). Ne vérifie jamais une permission dans l'église
  propriétaire elle-même pour l'appelant — seulement l'existence du partage.

`audio:listen` (bibliothèque d'écoute, spec 021) est accordée à **tous les rôles** — voir
[api.md](api.md#audio-des-cultes).

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
| Qualificateur agenda | `AGENDA_QUALIFIER` | Qualification des demandes de RDV pastoral en attente |
| Comptable | `ACCOUNTANT` | Traitement des demandes financières et statistiques comptables |

Un utilisateur peut avoir **plusieurs rôles** dans **plusieurs églises** via la table `user_church_roles`.

### Attribution

- **Super Admin** : automatique à la première connexion si l'email est dans `SUPER_ADMIN_EMAILS`
- **Autres rôles** : via l'interface admin (`/admin/users`), avec affectation optionnelle de ministère (MINISTER) ou départements (DEPARTMENT_HEAD)
- **isDeputy** : la table `user_departments` (liaison `DEPARTMENT_HEAD` ↔ départements) dispose d'un flag `isDeputy` pour distinguer le responsable principal du responsable adjoint (deputy)
- **STAR** : attribué depuis `/admin/access` (onglet STAR) ; les départements visibles sont dérivés automatiquement depuis `MemberUserLink → Member → MemberDepartment` — aucune entrée `user_departments` n'est créée

---

## Permissions

La matrice rôle-permissions est **dérivée dynamiquement** depuis les manifestes de modules (`src/modules/*/index.ts`) via `buildRolePermissions(registry)`. La source de vérité est les blocs `permissions` de chaque manifeste, pas le fichier `src/lib/permissions.ts` (deprecated).

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
QA = Qualificateur agenda, Compt = Comptable.

#### Module `core`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `church:manage` | x | | | | | | | | | |
| `users:manage` | x | | | | | | | | | |
| `access:manage` | x | x | x | x | | | | | | |

#### Module `planning`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
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

#### Module `discipleship`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `discipleship:view` | x | x | x | | x | x | | | | |
| `discipleship:manage` | x | x | x | | | x | | | | |
| `discipleship:export` | x | | x | | | | | | | |

#### Module `audio`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `audio:listen` | x | x | x | x | x | x | x | x | x | x |
| `audio:view` | x | x | x | | | | | | | |
| `audio:upload` | x | x | x | | | | | | | |
| `audio:review` | x | x | | | | | | | | |
| `audio:manage` | x | x | | | | | | | | |

#### Module `media`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `media:view` | x | x | x | | | | | | | |
| `media:upload` | x | x | x | | | | | | | |
| `media:review` | x | x | | | | | | | | |
| `media:manage` | x | x | | | | | | | | |

#### Module `accounting`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `accounting:submit` | x | x | | x | x | | | | | |
| `accounting:view` | x | x | | x | x | | | | | x |
| `accounting:manage` | x | x | | | | | | | | x |
| `accounting:stats` | x | x | x | | | | | | | x |

#### Module `agenda`

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `agenda:view` | x | x | x | | | | | | | |
| `agenda:manage` | x | x | x | | | | | | | |
| `agenda:qualify` | x | x | | | | | | | x | |

#### Module `rooms` (salles)

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `rooms:view` | x | x | x | x | x | | | | | |
| `rooms:reserve` | x | x | | x | x | | | | | |
| `rooms:manage` | x | x | | | | | | | | |

#### Module `jobs` (emploi)

Transversal — ouvert à tous les rôles authentifiés pour la consultation/candidature, modération
réservée à Admin/Secrétaire :

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | QA | Compt |
|---|---|---|---|---|---|---|---|---|---|---|
| `jobs:view` | x | x | x | x | x | x | x | x | x | x |
| `jobs:post` | x | x | x | x | x | x | x | x | x | x |
| `jobs:seek` | x | x | x | x | x | x | x | x | x | x |
| `jobs:freelance` | x | x | x | x | x | x | x | x | x | x |
| `jobs:manage` | x | x | x | | | | | | | |

#### Module `integration`

Ce module ne déclare **aucune** permission dans son manifeste (`permissions: {}`) : l'accès
n'est pas régi par `rolePermissions` mais par `requireIntegrationAccess()`
(`src/modules/integration/auth.ts`), qui accorde un accès complet à Super Admin, à tout rôle
possédant `members:manage` ou `events:manage` (Admin, Secrétaire), ou à un membre du
département fonction `INTEGRATION`/`MSDP`, et un accès restreint (à ses familles) à un berger
ou conseiller MSDP assigné via `FamilyLeaderAssignment`. `requireIntegrationExportAccess()` est
strictement réservé aux accès non restreints (pas de berger/conseiller au périmètre limité).

#### Module `storage`

Infrastructure pure (client S3, jetons opaques), aucune permission propre — consommé par
`media` et `audio`.

**Spécificités du Secrétaire** :
- Voit tous les départements de son église (même périmètre que Admin)
- Planning en lecture seule (pas de `planning:edit`)
- Membres en lecture seule dans l'admin (pas de `members:manage`)
- Peut gérer les événements (`events:manage`)
- Peut exporter les données discipolat (`discipleship:export`)
- Accès en lecture/écriture aux comptes rendus (`reports:view` + `reports:edit`)
- Accès complet à l'agenda pastoral (`agenda:view` + `agenda:manage`), mais pas à la
  qualification des demandes (`agenda:qualify`, réservée au Qualificateur agenda)
- Voit les statistiques comptables (`accounting:stats`) mais ne traite pas les demandes
  (`accounting:manage`)

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

**Spécificités du Qualificateur agenda** (`AGENDA_QUALIFIER`) :
- Seule permission propre : `agenda:qualify` — qualifie les demandes de RDV pastoral à l'état
  `PENDING`
- N'a **pas** `agenda:view` ni `agenda:manage` : aucun accès à la vue agenda hebdomadaire ni à
  la planification des demandes validées (réservées à Admin/Secrétaire, ou au Protocole via la
  fonction de département)
- Conserve `audio:listen` et les permissions transverses du module emploi (`jobs:*`, hors
  `jobs:manage`)

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
import { requireChurchPermission } from "@/lib/auth";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
