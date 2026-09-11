# Plan technique — L'équipe Secrétariat porte les droits du Secrétariat

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-12

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import `src/app/` → module ; le changement est dans
      `src/lib/auth.ts` (infrastructure), pas dans un module
- [x] **Sécurité** : aucune garde supprimée ni assouplie ; toutes les routes gardent
      `requireChurchPermission(perm, churchId)` / `requireCurrentChurchPermission(perm)`, et le
      `churchId` reste obligatoire — c'est l'**ensemble de permissions** évalué dans l'église qui
      s'élargit, jamais la portée de la vérification
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — les manifestes ne changent pas
- [x] **Validation** Zod : aucune mutation ajoutée
- [x] **Migration** Prisma : aucun changement de schéma à l'étape 1 (le rôle subsiste)
- [x] **Enums** : `Department.function` est une `String?` libre, lue via `DEPT_FN`
      (`@/lib/department-functions`) — pas d'enum Prisma concerné
- [x] **UI** : aucun composant nouveau

## Approche générale

Le fil directeur est **de ne pas toucher aux soixante points de contrôle**.

Un relevé exhaustif (`grep rolePermissions src/`) montre que l'ensemble des permissions d'un
utilisateur est reconstruit à la main dans **~60 endroits** répartis sur une cinquantaine de
fichiers : `requireChurchPermission`, les cinq gardes média de `src/lib/auth.ts`, les gardes des
modules `agenda`/`audio`/`integration`, `src/lib/media-space.ts`, `src/lib/notifications.ts`, une
trentaine de pages serveur et une quinzaine de route handlers. Tous font la même chose :

```ts
new Set(roles.filter((r) => r.churchId === churchId).flatMap((r) => rolePermissions[r.role] ?? []))
```

Deux conséquences : (1) modifier seulement `requireChurchPermission` donnerait une parité
**partielle** — les pages et les gardes de module continueraient de refuser ; (2) migrer les 60
sites vers un résolveur commun serait un chantier à fort risque d'oubli silencieux, chaque oubli
étant un refus d'accès en production.

L'approche retenue agit donc **à la source** : dans le callback `session` de NextAuth, un
utilisateur dont la fiche STAR appartient à un département de fonction `SECRETARIAT` se voit
ajouter, pour cette église, une entrée de rôle **`SECRETARY` synthétique**. Les 60 sites la lisent
alors sans modification, et la parité est totale par construction — y compris pour
`getUserDepartmentScope`, `getUserMinistryScope` et `getDiscipleshipScope`, qui traitent
`SECRETARY` comme un rôle « non scopé » (`GLOBAL_ROLES`, `auth.ts:261`).

C'est exactement le geste déjà pratiqué dans ce même callback pour les départements : un Ministre
reçoit les départements de son ministère (`ministerDeptMap`, `auth.ts:154-164`) et un STAR ceux de
sa fiche (`starDeptMap`, `auth.ts:167-186`). On ajoute le pendant côté rôle.

Corollaire recherché : à l'**étape 2**, retirer le rôle `SECRETARY` de l'énum et des manifestes ne
changera rien pour l'équipe, puisqu'elle ne dépendra plus d'une ligne `user_church_roles`.

## Modèle de données

**[Aucun changement]** à l'étape 1 — c'est délibéré, et c'est ce qui rend l'étape réversible :
aucune migration, aucune donnée réécrite, retour arrière par simple revert.

L'appartenance se lit sur l'existant :

```prisma
// Rappel du chemin de lecture, inchangé
// User → MemberUserLink (userId, churchId) → Member → MemberDepartment → Department.function
model Department {
  function String?   // "SECRETARIAT" (cf. DEPT_FN), déjà configurable via /admin/departments/functions
}
```

L'étape 2 (spec ultérieure) portera la migration d'énum et la reprise des `user_church_roles`.

## API

**Aucun endpoint ajouté, supprimé ou modifié.** Aucune signature de garde ne change. Ce sont les
gardes existantes qui, à entrée identique, acceptent désormais un membre de l'équipe :

| Surface | Garde inchangée | Effet du changement |
|---|---|---|
| `/api/events`, `/api/events/[eventId]`, `…/departments` | `requireChurchPermission("events:manage", churchId)` | acceptée pour l'équipe |
| `/api/welcome-duty/**` | `requireChurchPermission("events:manage", churchId)` | acceptée |
| `/api/events/[eventId]/report` | `reports:edit` / `events:manage` | acceptée |
| `/api/users/[userId]/roles` | `requireChurchPermission("access:manage", churchId)` | acceptée, anti-escalade `PRIVILEGED_ROLES` → `isSuperAdmin` **inchangée** |
| `/api/announcements/**`, `/api/requests/**` | `events:manage` | acceptée |
| `/api/discipleships/**` | `discipleship:*` | acceptée (dont `export`) |
| Agenda pastoral, audio, médias, salles, emploi, stats compta | gardes de module existantes | acceptées |

## Services / logique métier

1. **`src/lib/auth.ts` — callback `session`** : une requête supplémentaire résout, par église, si
   la fiche liée au compte appartient à un département de fonction `SECRETARIAT`, puis pousse une
   entrée synthétique dans `session.user.churchRoles`.

   Points de conception :
   - la résolution part de `member_user_links` → `member_departments`, **indépendamment du rôle
     détenu**. On n'utilise pas `starDeptMap` : il n'est alimenté que pour `role === "STAR"`, donc
     une personne de l'équipe portant un autre rôle (Faiseur de Disciples, Reporter…) serait
     oubliée. C'est le même chemin que `canDepositAnnouncementSheet` (spec 040) ;
   - l'entrée synthétique est **marquée** (`virtual: true` sur le type de session) afin qu'aucun
     écran listant les rôles ne la présente comme attribuée, et qu'aucune écriture ne la persiste ;
   - elle ne porte ni `ministryId` ni `departments` : elle ne sert qu'à la matrice de permissions ;
   - si une entrée `SECRETARY` réelle existe déjà pour cette église, on n'ajoute rien (idempotence).

2. **`src/modules/planning/services/announcement-sheet.service.ts` et `opening-closing.service.ts`** :
   aucun changement de code, mais les commentaires qui assimilent `!scope.scoped` à
   « `events:manage` — déjà unscoped pour SUPER_ADMIN/ADMIN/SECRETARY » deviennent incomplets ;
   ils doivent mentionner l'équipe Secrétariat. Ces deux services continuent de fonctionner : un
   membre de l'équipe passe désormais par la branche « non scopé », en amont de leur test
   d'appartenance — résultat identique, chemin plus court.

3. **`src/app/api/users/[userId]/roles/route.ts`** : vérifier explicitement qu'un rôle synthétique
   ne peut jamais être créé, modifié ou retiré (il n'existe pas en base ; la garde doit refuser
   proprement plutôt que d'échouer sur une contrainte).

## UI / composants

- **Aucune page ni composant nouveau.** La navigation (`src/app/(auth)/layout.tsx:130-133`) dérive
  déjà ses entrées de `churchRoles` → `rolePermissions` : les sections Événements, Service
  d'accueil, Comptes rendus, Agenda pastoral, Discipolat apparaissent sans une ligne de code.
- **À amender** : les écrans qui **listent** les rôles d'un utilisateur doivent masquer l'entrée
  synthétique, sans quoi ils afficheraient un rôle inexistant en base —
  `src/app/(auth)/admin/access/AccessClient.tsx`, `src/app/(auth)/admin/users/UsersClient.tsx`.
  À la place, l'appartenance à l'équipe peut être présentée comme telle (mention, pas rôle).
- **Guide et visite guidée** : `src/components/GuideContent.tsx` (52 occurrences de `SECRETARY`) et
  `src/lib/tour-steps.ts` décrivent les droits par rôle ; le texte doit dire que ces droits
  viennent aussi de l'appartenance à l'équipe. Cosmétique, mais c'est la documentation que lisent
  les utilisateurs.

## Décisions & alternatives écartées

- **Choix** : rôle `SECRETARY` **synthétique** injecté dans la session — *Pourquoi* : c'est le seul
  point unique qui couvre les ~60 sites de calcul de permissions, les trois fonctions de périmètre
  (`GLOBAL_ROLES`) et la navigation, sans les modifier. Il rend l'étape 2 neutre par construction.
  Il reproduit un geste déjà admis dans le même callback (`ministerDeptMap`, `starDeptMap`).
- **Écarté** : *résolveur commun `getChurchPermissions(session, churchId)` et migration des ~60
  sites* — *Raison* : chantier étendu à fort risque d'oubli, chaque oubli produisant un refus
  d'accès silencieux en production ; plusieurs sites sont synchrones (`media-space.ts:53`) et
  devraient devenir asynchrones, avec effet de bord sur leurs appelants. À reconsidérer comme
  chantier de fond, indépendamment de cette feature.
- **Écarté** : *ajouter l'équipe Secrétariat dans les manifestes* — *Raison* : un manifeste associe
  une permission à des **rôles**, il ne sait pas parler d'appartenance à un département. Il
  faudrait inventer un pseudo-rôle dans la matrice figée, ce qui brouillerait la source de vérité.
- **Écarté** : *garde composite dédiée par surface, sur le modèle de `canDepositAnnouncementSheet`*
  — *Raison* : c'est le bon patron pour **une** règle ponctuelle (spec 040, 041), pas pour une
  parité portant sur 28 permissions ; il faudrait écrire et tester une garde par surface.
- **Écarté** : *n'ouvrir que `events:manage`* — *Raison* : contredit la cible validée (remplacement
  du rôle) et rendrait l'étape 2 impossible sans une seconde migration des droits.

## Risques & points d'attention

- **Élargissement silencieux** : le rôle synthétique accorde d'un coup les 28 permissions, dont
  `access:manage` (attribution de rôles) et `discipleship:export` (export de données
  personnelles). C'est la décision explicite de la spec, mais toute personne ajoutée au
  département Secrétariat obtient dès lors ces droits : **la composition de ce département devient
  une décision de sécurité**. À dire dans le guide.
- **Coût en requêtes** : une requête supplémentaire par résolution de session. À fusionner avec la
  requête `starDeptMap` existante plutôt que de l'ajouter à côté.
- **Rôle fantôme dans l'UI** : si un écran listant les rôles oublie de filtrer l'entrée
  synthétique, un administrateur croira pouvoir la retirer. D'où le marquage explicite.
- **Personne sans fiche liée** : un membre de l'équipe dont le compte n'est pas lié à sa fiche STAR
  ne gagne rien (contrainte connue, ADR-0013). C'est le point à instrumenter avant l'étape 2.
- **ADR-0013** : sa règle 1 (« l'appartenance ne confère jamais un droit de création, modification
  ou suppression ») est frontalement contredite. Elle est **amendée par ADR-0014**, créé avec ce
  plan. Sans cet amendement, l'implémentation violerait une décision acceptée.
- **Les manifestes ne bougent pas**, donc la matrice figée de `src/core/__tests__/permissions.test.ts`
  reste verte — c'est voulu : le changement ne porte pas sur ce que fait un rôle, mais sur qui
  l'obtient.

## Stratégie de tests

Unitaires (Vitest), au plus près de la règle :

- **Résolution de l'équipe** (nouveau) : membre d'un département `SECRETARIAT` → entrée synthétique
  présente ; membre d'un autre département → absente ; compte sans fiche liée → absente ; église B
  → absente pour une appartenance en église A (cloisonnement) ; entrée `SECRETARY` réelle déjà
  présente → pas de doublon.
- **Parité** : un test paramétré qui, pour **chacune des 28 permissions** du rôle, vérifie que
  `requireChurchPermission` accepte un membre de l'équipe. C'est le test qui garantit que l'étape 2
  sera sans effet — il doit échouer si une permission est oubliée.
- **Périmètres** : `getUserDepartmentScope`, `getUserMinistryScope` et `getDiscipleshipScope`
  renvoient `{ scoped: false }` pour un membre de l'équipe (sinon il ne verrait que son propre
  département, et la parité serait fausse alors même que les permissions seraient là).
- **Non-régression des refus** : un STAR d'un autre département, un Responsable de département, un
  Ministre et un Reporter continuent d'être refusés sur les mêmes surfaces.
- **Anti-escalade** : un membre de l'équipe ne peut pas attribuer `SUPER_ADMIN`/`ADMIN`/`SECRETARY`
  (`PRIVILEGED_ROLES` → `isSuperAdmin`), ni créer/retirer une entrée synthétique.
- **Services existants** : les tests de `announcement-sheet.service` et `opening-closing.service`
  doivent rester verts sans modification — vérification que le chemin « non scopé » ne casse pas
  leur séquence de mocks.
