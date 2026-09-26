# Plan technique — Refonte de la gestion des accès (ergonomie et cohérence)

- **Spec associée** : `./spec.md`
- **Annexe** : `./audit-rbac.md` (grille RBAC, décisions D1–D7 validées le 2026-09-26)
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-26

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe `integration` que via `@/modules/integration` ;
      le calcul des accès hérités vit dans `src/lib/` et interroge Prisma sans importer de module
- [x] **Sécurité** : toutes les routes modifiées restent gardées par
      `requireChurchPermission(perm, churchId)` ou par une garde de module ; le `churchId` vient
      toujours de l'objet visé (`resolveChurchId`) ou du corps validé, jamais optionnel
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) ; les droits changent dans les
      manifestes, avec la matrice figée et `CLAUDE.md` dans le même commit
- [x] **Validation** Zod : aucune nouvelle mutation ; les schémas existants sont conservés
- [x] **Migration** Prisma : aucun changement de schéma (rôles et permissions vivent dans le code)
- [x] **Enums** : `Role` depuis `@/generated/prisma/client`
- [x] **UI** : `Modal`, `Button`, `Input`, `Select`, `CheckboxGroup` de `src/components/ui/`
      remplacent les modales et boutons écrits à la main dans `AccessClient.tsx`

## Approche générale

Deux lots, livrés **dans l'ordre inverse de leur numéro** : le lot 2 (cohérence RBAC, dont les
correctifs de sécurité) part en premier, puis le lot 1 (ergonomie). C'est ce qu'impose la
décision de la spec (« livrer le correctif de sécurité sans attendre le chantier ergonomique »),
et le lot 1 s'appuie sur la matrice corrigée (descriptions de rôles, `integration:manage`).

- **Lot 2 — RBAC** : on applique D1–D7. Chaque garde vérifie la permission qui nomme
  **l'action** (`users:manage`, `access:manage`, `integration:manage`), jamais une permission
  voisine détenue par les « bons » rôles. Les gestes sur les membres appliquent le périmètre
  existant `resolveMemberDepartmentScope`. Un **test-gardien** empêche le retour du raccourci.
- **Lot 1 — Ergonomie** : `/admin/access` devient une liste de personnes, une fiche par
  personne et une vue par rôle. Les mutations réutilisent **sans changement** l'API existante
  `/api/users/[userId]/roles` (anti-escalade et périmètre Ministre déjà en place). Les libellés et
  descriptions de rôles viennent d'une source unique. Les accès hérités sont calculés par un
  service du noyau à partir d'une table déclarative.

## Modèle de données

`[Aucun changement]` — ni table ni migration. Les nouvelles données (descriptions de rôles,
table des accès hérités) sont des constantes de code.

## Lot 2 — Cohérence RBAC

### Manifestes (matrice)

| Manifeste | Changement | Décision |
|---|---|---|
| `modules/core/manifest.ts` | `users:manage` : `["SUPER_ADMIN", "ADMIN"]` ; commentaire réécrit : « gestion des comptes de l'église (liste, pré-création, suppression d'un compte jamais connecté, renommage) » | D2 |
| `modules/integration/manifest.ts` | `permissions: { "integration:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY"] }` | D4 |
| `modules/discipleship/manifest.ts` | `discipleship:export` + `ADMIN` | D5 |
| `modules/rooms/manifest.ts` | `rooms:reserve` + `SECRETARY` | D7 |

`members:manage` et `access:manage` restent inchangés (D1, D3) : ce sont les **gardes** qui
changent. D6 ne touche que la documentation.

### Gardes et routes modifiées

| Route / page | Avant | Après | Réf. |
|---|---|---|---|
| `modules/integration/auth.ts` `requireIntegrationAccess` | `members:manage \|\| events:manage` → global | `integration:manage` → global ; équipe `INTEGRATION`/`MSDP` et bergers inchangés | A1, D4 |
| idem `requireIntegrationSettingsAccess` | `events:manage` | `integration:manage` ; responsable `INTEGRATION` inchangé | D4 |
| nouvelle `requireIntegrationFullAccess(churchId)` | — | `requireIntegrationAccess` + refus si périmètre restreint (berger) ; `requireIntegrationExportAccess` lui délègue | A2 |
| `GET/POST /api/integration/parcours`, `GET/PATCH/DELETE /api/integration/parcours/[id]` | 3 copies de `hasAccess` avec raccourci | `requireIntegrationFullAccess(churchId)` (exportée par `@/modules/integration`) | A2 |
| `(auth)/layout.tsx` — liens Intégration | `isGlobalManager` (`events:manage`) | `integration:manage` | D4 |
| `GET /api/users` | `members:manage` | `users:manage` | A3, D2 |
| `DELETE /api/users/[userId]` | `members:manage` | `users:manage` | A3, D2 |
| `PATCH /api/users/[userId]/profile` | soi-même, ou rôle `SUPER_ADMIN/ADMIN/SECRETARY` codé en dur | soi-même, ou `users:manage` dans une église commune | D2 |
| `/admin/users`, `/admin/users/new` | `members:manage` + rôle `ADMIN` codé en dur | `requireChurchPermission("users:manage", churchId)` | D2 |
| `/admin` (redirecteur) | `members:manage`, puis `/admin/users` | `church:manage` → `/admin/churches` ; `users:manage` → `/admin/users` ; `access:manage` → `/admin/access` ; sinon `FORBIDDEN` | D2 |
| menu Configuration | « Utilisateurs » : `members:manage` + `adminOnly` ; « Accès & rôles » : `departments:manage` | « Utilisateurs » : `users:manage` ; « Accès & rôles » : `access:manage` (la Secrétaire voit enfin le lien) | D2, D3 |
| `GET /api/member-link-requests` | `members:manage`, toute l'église | `access:manage` ; Ministre limité à ses ministères | B4, D3 |
| `PATCH /api/member-link-requests/[id]` | `members:manage`, sans périmètre | `access:manage` + la demande (ministère/département demandé, ou fiche existante) doit être dans le périmètre | B4, D3 |
| `POST/DELETE /api/member-user-links` | `members:manage`, sans périmètre | `access:manage` + fiche (`memberId`) ou `newMember.departmentId` dans le périmètre | B3, D3 |
| `GET /api/users/search` | `members:manage` | `access:manage` (n'est appelée que pour lier un compte) | D3 |
| `POST /api/admin/members/assign-star-roles` | `members:manage`, toute l'église | `access:manage` ; seulement les liens dont la fiche est dans le périmètre | B2, D3 |
| `/admin/members/duplicates` | `members:manage`, tous les membres | `members:manage` ; membres filtrés au périmètre | B1, D1 |
| `POST /api/admin/members/merge` | `members:manage`, sans périmètre | `members:manage` ; appelant restreint : **tous** les départements des deux fiches dans son périmètre | B1, D1 |
| `/admin/members` (page) | demandes et boutons « lier » si `members:manage` | demandes et liaison si `access:manage`, filtrées au périmètre ; bouton doublons si `members:manage` | D3 |

**Périmètre** : partout, `resolveMemberDepartmentScope(session, churchId)` (`src/lib/member-scope.ts`).
Il renvoie `{ scoped: false }` pour Super Admin, Admin et Secrétaire (rôle réel ou virtuel), et
pour un Ministre les départements de ses ministères. Un Resp. département n'a pas
`access:manage` : il est déjà refusé avant le calcul du périmètre sur les routes de D3.

### Services

- `src/modules/integration/auth.ts` : `requireIntegrationFullAccess` ; suppression du raccourci
  dans les deux gardes existantes. Export par `@/modules/integration`.
- `src/lib/member-scope.ts` : ajout de deux prédicats purs, utilisés par les routes ci-dessus
  pour ne pas recopier la logique :
  - `isMemberInScope(scope, memberDepartmentIds)` : au moins un département commun (règle
    actuelle de `PATCH /api/members/[memberId]`) ;
  - `isMemberFullyInScope(scope, memberDepartmentIds)` : tous les départements dans le
    périmètre (fusion).
- Pour une demande d'accès : dans le périmètre si son `departmentId` y est, ou si son
  `ministryId` est un ministère de l'appelant, ou si sa fiche `memberId` y est.

### Documentation (même lot)

- `CLAUDE.md` et `docs/auth.md` : matrice (nouvelle ligne `integration:manage`, `users:manage`
  pour l'Admin, `discipleship:export` pour l'Admin, `rooms:reserve` pour la Secrétaire,
  `discipleship:view` pour le Ministre en D6) ; paragraphe du module `integration` réécrit (plus de
  raccourci `members:manage`/`events:manage`) ; spécificités Secrétaire et Resp. département
  (validation des demandes d'accès et liaison de comptes : `access:manage`).
- `docs/api.md` : permissions des routes du tableau ci-dessus.
- `docs/processus/arrivee-star.md` : qui valide les demandes d'accès ; « Qualificateur Agenda »
  remplacé par « Référent soins pastoraux ».
- `docs/adr/0014` : liste de la règle 5 complétée (`INTEGRATION`, `MSDP`, `PHOTOS` confèrent déjà
  des droits d'écriture et n'y figuraient pas).
- **ADR-0017** (nouveau) — voir « Décisions ».
- Guide intégré (`src/components/GuideContent.tsx`) : lignes de la matrice d'accès touchées par
  D2–D7.
- Commentaire obsolète `api/discipleships/[id]/member/route.ts:15`.

## Lot 1 — Ergonomie

### Source unique des rôles — `src/lib/roles.ts`

Constantes pures (aucun import serveur, utilisables par les composants client) :

- `ROLE_LABELS: Record<Role, string>` — libellés canoniques : Super Admin, Admin, Secrétaire,
  Ministre, Responsable de département, Faiseur de disciples, Reporter, STAR, Référent soins
  pastoraux, Comptable. Le libellé court « Resp. département » n'est autorisé que via
  `ROLE_SHORT_LABELS` (tableaux étroits).
- `ROLE_DESCRIPTIONS: Record<Role, string>` — la phrase affichée à l'attribution (critère de la
  spec), réécrite à partir de la matrice corrigée du lot 2.
- `ROLE_CATEGORY: Record<Role, "administration" | "responsabilite" | "fonction" | "membre">` —
  regroupement de la fiche et de la vue par rôle.
- `ASSIGNABLE_BY_MINISTER` : reprend `MINISTRY_SCOPED_ROLES` de la route des rôles, qui l'importe
  désormais d'ici (une seule liste).

Remplace les six tables locales : `GuideContent.tsx`, `AccessClient.tsx` (deux tables),
`UsersClient.tsx`, `LinkRequestsClient.tsx`, `NoAccessClient.tsx`, `RequestForm.tsx`.

### Accès hérités — `src/lib/access-overview.ts`

```ts
type InheritedAccess = {
  source: "department-function" | "department-head-function" | "secretariat-team"
        | "pastoral-profile" | "family-leader" | "care-assignment";
  label: string;   // ce que ça donne, en clair
  origin: string;  // d'où ça vient : « Membre du département Accueil (fonction Intégration) »
};

listInheritedAccess(churchId: string, userIds: string[]): Promise<Map<string, InheritedAccess[]>>
```

- **Table déclarative** `FUNCTION_ACCESS: Partial<Record<DeptFunction, { module; label; headLabel? }>>`
  pour les fonctions qui confèrent des droits (ADR-0014) : `SECRETARIAT`, `PROTOCOLE`,
  `INTEGRATION` (+ responsable : délais de relance), `MSDP`, `CAPTATION_AUDIO` (+ responsable :
  dépublier), `PRODUCTION_MEDIA`, `COMMUNICATION`, `PHOTOS`. Une entrée n'est retenue que si son
  module est actif (`registry.has(module)`).
- **Départements d'une personne** : union des `user_departments` (tous rôles) et des
  `member_departments` de la fiche liée (`MemberUserLink`). C'est exactement ce que voient les
  gardes via la session.
- **Affectations nominatives** : `PastoralProfile.userId` (lecture pastorale et agenda),
  `FamilyLeaderAssignment` (berger / co-berger : N familles), demandes care ouvertes où la personne
  est accompagnant (`AppointmentRequest.assignedMemberId` ou profil `assignedTo`,
  `MsdpFollowUp.assignedConseillerMsdpId` ou `assignedProfile`).
- **Requêtes groupées** : une requête par source pour toute la liste de personnes, pas une par
  personne.

### Pages et composants

`AccessClient.tsx` (1 164 lignes) est découpé ; ses modales écrites à la main passent par `Modal`.

| Page | Contenu | Garde |
|---|---|---|
| `/admin/access` | Onglets **Personnes** (par défaut), **Par rôle**, **Demandes** (compteur). Personnes : recherche par nom/email, chaque ligne résume les rôles (pastilles `ROLE_LABELS`) et le nombre d'accès hérités | `access:manage` ; liste filtrée au ministère pour un Ministre (requête actuelle conservée). Le rattachement à l'église est **élargi** aux personnes qui n'ont qu'un accès hérité : profil pastoral, affectation de berger, accompagnant d'une demande care ouverte (critère de la spec) |
| `/admin/access/users/[userId]` | Fiche personne : identité et fiche STAR liée ; **Rôles d'église** par catégorie, cases à cocher + `ROLE_DESCRIPTIONS` ; **Responsabilités** (ministère, départements, adjoint) ; **Accès hérités** en lecture seule avec origine | `access:manage` + personne dans le périmètre de l'appelant, sinon 404 ; rôles proposés filtrés (Ministre : `ASSIGNABLE_BY_MINISTER` ; Admin/Secrétaire : pas les rôles privilégiés, sauf Super Admin) |
| `/admin/access/roles/[role]` | Détenteurs du rôle + « Ajouter une personne » (sélection parmi les personnes du périmètre). Pour Ministre et Resp. département : vue structurée ministère → départements (l'actuel onglet « Rôles », conservé) | idem ; `role` validé contre l'enum `Role` (404 sinon) ; rôles transverses masqués au Ministre |

Composants (`src/app/(auth)/admin/access/`) : `AccessTabs`, `PeopleList`, `RolesOverview`,
`RequestsPanel` (onglet Demandes actuel, extrait tel quel), `PersonAccessClient`,
`RoleHoldersClient`, `ResponsibilityModal` (choix ministère / départements / adjoint, extrait des
deux modales actuelles et partagé par la fiche et la vue par rôle).

**Propagation immédiate** : les trois pages sont des Server Components qui lisent la base ; après
chaque mutation le client appelle `router.refresh()`. Il n'y a pas de cache entre la fiche et la
vue par rôle, donc ce qui change d'un côté apparaît de l'autre.

**Routes** : le préfixe `/admin/access` du manifeste `core` couvre les sous-pages ; rien à
déclarer (ADR-0012). `users/` et `roles/` sont des segments statiques, sans conflit entre segments
dynamiques.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| *(lot 1)* `/api/users/[userId]/roles` | POST/PATCH/DELETE | `access:manage` (inchangé) | schémas Zod existants | inchangée |
| *(lot 2)* routes du tableau « Gardes et routes modifiées » | — | voir tableau | schémas existants | inchangée |

Aucun nouvel endpoint : la fiche et la vue par rôle chargent leurs données côté serveur.

## Décisions & alternatives écartées

- **Choix** : livrer le lot 2 avant le lot 1 — *Pourquoi* : c'est l'intention de la spec
  (correctif de sécurité sans attendre) ; en plus, les descriptions de rôles du lot 1 décrivent
  la matrice corrigée.
- **Choix** : `integration:manage` plutôt qu'une liste de rôles dans la garde — *Pourquoi* :
  l'accès devient visible dans la grille et sur la fiche personne ; même modèle que `care`.
- **Choix** : réutiliser `resolveMemberDepartmentScope` — *Pourquoi* : c'est déjà le périmètre des
  routes `/api/members/*` ; un second calcul divergerait.
- **Choix** : fusion autorisée à un appelant restreint seulement si **tous** les départements des
  deux fiches sont dans son périmètre — *Pourquoi* : la fusion supprime la fiche source et déplace
  ses affiliations ; une fiche partagée avec un autre département engage un autre responsable.
  Plus strict que la modification (un département commun suffit), qui préserve les affiliations
  hors périmètre.
- **Choix** : table déclarative des accès hérités dans `src/lib/` — *Pourquoi* : ADR-0014 exige
  déjà que ces droits soient nommés et énumérés ; la table en est la version code, et `lib` peut
  interroger toutes les tables sans importer de module.
- **Écarté** : faire déclarer les accès hérités par chaque manifeste (nouveau champ du
  `ModuleRegistry`) — *Raison* : plus juste à terme, mais change le contrat des manifestes (ADR
  structurante) pour huit entrées ; à reconsidérer si la table grossit.
- **Écarté** : dériver les accès hérités en rejouant les gardes pour un utilisateur donné —
  *Raison* : les gardes lisent la **session** de l'appelant ; les rejouer pour un tiers
  demanderait une fausse session, fragile et coûteuse.
- **Écarté** : fusionner `/admin/users` dans la nouvelle page Accès — *Raison* : le cycle de vie
  des comptes (pré-création, suppression, renommage) relève de `users:manage`, distinct de
  l'attribution de rôles ; hors périmètre de la spec. `/admin/users` garde ses fonctions et prend
  les libellés communs.
- **Écarté** : scinder `members:manage` (D1-B) — voir `audit-rbac.md`.
- **ADR-0017 — « Une permission n'approxime jamais un rôle »** (nouvelle, structurante et
  transverse) : (1) une garde vérifie la permission qui nomme l'action ; (2) un module aux règles
  d'accès propres déclare ses permissions au lieu d'emprunter celles d'un autre ; (3) le
  test-gardien ci-dessous l'impose ; (4) les accès hors grille sont décrits dans la table des
  accès hérités, qui alimente la fiche personne. Numéro 0017 : 0016 est pris sur la branche
  `feat/preferences-notifications-email`, pas encore fusionnée.

## Risques & points d'attention

- **Perte de droits annoncée** (voulue) : les Ministres et Resp. département hors équipe
  d'accueil perdent l'accueil et les parcours ; les Resp. département perdent la validation des
  demandes d'accès, la liaison de comptes et l'attribution STAR en masse. Demandes en attente :
  seuls Admin, Secrétaire et Ministre du bon ministère pourront les traiter. À écrire dans le
  CHANGELOG et à signaler aux responsables avant le déploiement.
- **Demande d'accès sans ministère ni département** : visible et traitable uniquement par
  Admin, Secrétaire et Super Admin (déjà le cas dans la page Accès actuelle).
- **Rôle Secrétaire virtuel** (spec 045) : l'équipe Secrétariat obtient `integration:manage`,
  `users:manage` non. Pas de changement de fond : elle avait déjà `events:manage`.
- **`users:manage` change de sens** (plateforme → comptes de l'église). Aucun usage existant, donc
  pas de régression ; le commentaire du manifeste et `docs/auth.md` doivent le dire.
- **Table des accès hérités qui dérive** des gardes réelles : couverte par un test (voir
  ci-dessous), mais une garde écrite sans passer par une fonction de département peut échapper
  au contrôle. ADR-0017 le signale.
- **Découpage de `AccessClient.tsx`** : risque de régression sur l'onglet Demandes (approbation
  avec détection de doublons). Il est extrait sans être réécrit.
- **Livraison en deux PR vers `main`** : voir « Point à arbitrer ».

## Point à arbitrer (constitution V)

La constitution prévoit, pour une feature longue, **une seule PR finale** `feat/X → main`. La
décision de la spec (sortir le correctif de sécurité sans attendre l'ergonomie) demande **deux
PR vers `main`**, une par lot, depuis la même base `feat/refonte-gestion-acces` :

1. `feat/acces-lot2-rbac` → `feat/refonte-gestion-acces` → **`main`** (spec, plan, lot 2) ;
2. `feat/acces-lot1-ergonomie` (repartie de `main`) → `feat/refonte-gestion-acces` → **`main`**.

L'alternative conforme (une seule PR finale) retarde le correctif de sécurité jusqu'à la fin du
lot 1.

## Stratégie de tests

**Lot 2**
- `src/core/__tests__/permissions.test.ts` : matrice figée mise à jour (`users:manage`,
  `integration:manage`, `discipleship:export`, `rooms:reserve`) ; `modules/rooms/permissions.test.ts`.
- **Test-gardien** `src/lib/__tests__/rbac-no-role-proxy.test.ts` : parcourt `src/` (hors tests)
  et échoue si `members:manage` ou `events:manage` apparaît dans un fichier absent d'une liste
  blanche commentée (chaque entrée dit pourquoi l'usage est légitime ; les raccourcis
  `events:manage` sans sur-octroi y figurent comme fragiles). Même principe que
  `auth-global-scopes.test.ts`.
- Gardes intégration (`modules/integration/__tests__`) : Ministre et Resp. département hors
  équipe → `FORBIDDEN` ; Secrétaire → global ; membre `INTEGRATION`/`MSDP` → global ; berger →
  restreint ; `requireIntegrationFullAccess` refuse le berger.
- Parcours (`api/integration/parcours/__tests__`) : 403 pour un Ministre hors équipe sur
  GET/POST/PATCH/DELETE.
- Utilisateurs (`api/users/__tests__`, `[userId]/__tests__`, `profile`) : Ministre et Resp.
  département → 403 ; Admin → 200 ; Secrétaire → 403 sur la suppression.
- Périmètre, un test `dept-scope` par route (patron existant) : `member-link-requests` (Secrétaire
  valide ; Ministre valide dans son ministère et pas ailleurs ; Resp. département → 403),
  `member-user-links`, `assign-star-roles`, `merge` (refus si une des deux fiches déborde du
  périmètre), page doublons (liste filtrée).
- `member-scope.test.ts` : `isMemberInScope`, `isMemberFullyInScope`.

**Lot 1**
- `src/lib/__tests__/roles.test.ts` : chaque valeur de l'enum `Role` a un libellé, une description
  et une catégorie ; `ASSIGNABLE_BY_MINISTER` ne contient aucun rôle transverse.
- **Test-gardien libellés** : aucune table `DEPARTMENT_HEAD: "…"` hors de `src/lib/roles.ts`.
- `src/lib/__tests__/access-overview.test.ts` : chaque source (fonction de département via
  `user_departments` **et** via fiche liée, responsable de fonction, équipe Secrétariat, profil
  pastoral, berger, affectation care ouverte ; affectation close exclue ; module inactif exclu) ;
  exhaustivité : toute fonction citée dans une garde (`modules/*/auth.ts`, `lib/auth.ts`) a une
  entrée dans `FUNCTION_ACCESS`.
- Pages (patron `admin/access/__tests__/tenant-scope.test.ts`) : fiche d'une personne hors du
  ministère d'un Ministre → 404 ; rôle inconnu → 404 ; rôles transverses absents pour un Ministre ;
  personne sans aucun rôle mais bergère → présente dans la liste avec son accès hérité.
