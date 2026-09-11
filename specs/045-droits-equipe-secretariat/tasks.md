# Tâches — L'équipe Secrétariat porte les droits du Secrétariat

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : session (source) → services → API → UI → tests. Les tâches `[P]` sont
> parallélisables (fichiers indépendants).

## Prérequis

- [x] Branche créée : `feat/droits-equipe-secretariat`
- [x] `plan.md` et ADR-0014 rédigés et poussés
- [ ] Migration Prisma : **aucune** — étape 1 ne touche pas au schéma (voir `plan.md`)

## Tâches

### 1. Session — rôle synthétique (le cœur du changement)

- [ ] **T1** — Dans `src/lib/auth.ts`, étendre la déclaration `Session.user.churchRoles` (ligne
      ~53-62) avec un champ `virtual?: boolean` optionnel, pour marquer une entrée non persistée
      en base. *(fichier : `src/lib/auth.ts`)*
- [ ] **T2** — Dans le callback `session` (`src/lib/auth.ts:130-244`), après le calcul de
      `starDeptMap` (ligne 167-186), ajouter une résolution indépendante du rôle : pour chaque
      église où l'utilisateur a un `MemberUserLink`, si un des départements de sa fiche a
      `function === DEPT_FN.SECRETARIAT` (`@/lib/department-functions`), retenir le `churchId`.
      Réutiliser la requête `memberUserLink`/`member.departments` déjà chargée pour `starDeptMap`
      plutôt que d'en émettre une nouvelle (fusionner les deux boucles — voir risque « coût en
      requêtes » du plan). *(fichier : `src/lib/auth.ts`)*
- [ ] **T3** — Toujours dans le callback `session`, après la construction de
      `session.user.churchRoles` (ligne 226-242) : pour chaque église retenue à T2, si aucune
      entrée `role === "SECRETARY"` n'existe déjà pour cette église (idempotence), pousser une
      entrée synthétique `{ id: "virtual-secretariat-<churchId>", churchId, role: "SECRETARY",
      ministryId: null, church: <église>, departments: [], virtual: true }`. Ne pas fusionner de
      départements sur cette entrée (le plan précise qu'elle ne sert qu'à la matrice de
      permissions). *(fichier : `src/lib/auth.ts`)*
- [ ] **T4** — Vérifier que `GLOBAL_ROLES` (`src/lib/auth.ts:261`) traite déjà `SECRETARY` comme
      non scopé : confirmer que `getUserDepartmentScope`, `getUserMinistryScope` et
      `getDiscipleshipScope` renvoient `{ scoped: false }` pour l'entrée synthétique sans
      modification de code (elles filtrent par `role`, pas par `virtual`). Si l'une d'elles
      utilise un chemin différent (ex. lecture de `departments` sur l'entrée), corriger pour
      qu'elle ignore les entrées `virtual: true` de la même façon qu'un `SECRETARY` réel.
      *(fichier : `src/lib/auth.ts`)*

### 2. Anti-escalade et intégrité du rôle synthétique

- [ ] **T5** — Dans `src/app/api/users/[userId]/roles/route.ts`, vérifier que `POST`/`PATCH`/
      `DELETE` ne peuvent jamais cibler une entrée dont l'`id` correspond au motif
      `virtual-secretariat-*` (l'entrée n'existe pas en base — s'assurer que la route répond une
      erreur claire (`ApiError` 404/400) plutôt que d'échouer sur une contrainte Prisma
      silencieuse si un id de ce type lui était soumis). *(fichier :
      `src/app/api/users/[userId]/roles/route.ts`)*
- [ ] **T6** — Confirmer (par lecture, sans modification si déjà correct) que l'anti-escalade
      `PRIVILEGED_ROLES` → `isSuperAdmin` (`route.ts:116-117` et `:351-352`) s'applique bien à un
      appelant dont la session ne contient l'entrée `SECRETARY` qu'à l'état `virtual: true` — la
      vérification porte sur `session.user.isSuperAdmin`, indépendante de l'origine de l'entrée de
      rôle, donc aucun changement attendu ; documenter la conclusion en commentaire si utile.
      *(fichier : `src/app/api/users/[userId]/roles/route.ts`)*

### 3. UI — ne jamais présenter le rôle synthétique comme attribué [P]

- [ ] **T7** [P] — Dans `src/app/(auth)/admin/access/AccessClient.tsx`, filtrer/annoter les
      entrées `virtual: true` : ne pas les proposer au retrait ni à la modification ; afficher à
      la place une mention d'appartenance à l'équipe Secrétariat. *(fichier :
      `src/app/(auth)/admin/access/AccessClient.tsx`)*
- [ ] **T8** [P] — Même traitement dans `src/app/(auth)/admin/users/UsersClient.tsx` : une entrée
      synthétique ne doit pas apparaître comme un rôle `SECRETARY` attribuable/retirable.
      *(fichier : `src/app/(auth)/admin/users/UsersClient.tsx`)*
- [ ] **T9** [P] — Mettre à jour `src/components/GuideContent.tsx` et `src/lib/tour-steps.ts`
      (textes décrivant les droits du rôle Secrétaire) pour mentionner que ces droits viennent
      aussi de l'appartenance à l'équipe Secrétariat (département de fonction Secrétariat).
      Cosmétique, sans impact fonctionnel. *(fichiers : `src/components/GuideContent.tsx`,
      `src/lib/tour-steps.ts`)*
- [ ] **T10** [P] — Mettre à jour les commentaires de
      `src/modules/planning/services/announcement-sheet.service.ts` et
      `opening-closing.service.ts` qui assimilent `!scope.scoped` à « déjà unscoped pour
      SUPER_ADMIN/ADMIN/SECRETARY » : mentionner l'équipe Secrétariat comme nouvelle source
      possible de ce chemin. Aucun changement de logique. *(fichiers :
      `src/modules/planning/services/announcement-sheet.service.ts`,
      `src/modules/planning/services/opening-closing.service.ts`)*

### 4. Tests

- [ ] **T11** — Test de résolution de session (nouveau fichier, ex.
      `src/lib/__tests__/auth-secretariat-role.test.ts`) : membre d'un département `SECRETARIAT`
      → entrée synthétique présente ; membre d'un autre département → absente ; compte sans fiche
      liée → absente ; appartenance en église A → absente pour l'église B (cloisonnement) ; entrée
      `SECRETARY` réelle déjà présente → pas de doublon. *(fichier :
      `src/lib/__tests__/auth-secretariat-role.test.ts`)*
- [ ] **T12** — Test paramétré de parité : pour chacune des 28 permissions du rôle `SECRETARY`
      (dérivées de `rolePermissions.SECRETARY` via `@/lib/registry`), vérifier que
      `requireChurchPermission` accepte une session portant l'entrée synthétique. Ce test doit
      échouer si une permission est oubliée — c'est la garantie que l'étape 2 sera neutre.
      *(fichier : `src/lib/__tests__/auth-secretariat-role.test.ts` ou nouveau fichier dédié)*
- [ ] **T13** — Test des fonctions de périmètre : `getUserDepartmentScope`,
      `getUserMinistryScope`, `getDiscipleshipScope` renvoient `{ scoped: false }` pour une
      session ne portant que l'entrée synthétique. *(fichier :
      `src/lib/__tests__/auth-secretariat-role.test.ts`)*
- [ ] **T14** — Tests de non-régression : un STAR d'un autre département, un Responsable de
      département, un Ministre et un Reporter restent refusés sur les surfaces listées dans le
      tableau API du plan (`events:manage`, `access:manage`, `discipleship:*`, etc.). *(fichier :
      `src/lib/__tests__/auth-secretariat-role.test.ts` ou tests existants complétés)*
- [ ] **T15** — Test anti-escalade : un membre de l'équipe (session avec entrée synthétique
      uniquement, `isSuperAdmin: false`) ne peut pas attribuer `SUPER_ADMIN`/`ADMIN`/`SECRETARY`
      via `/api/users/[userId]/roles`, et une tentative de cibler l'id `virtual-secretariat-*`
      échoue proprement (T5). *(fichier : tests de
      `src/app/api/users/[userId]/roles/route.test.ts`, existant ou nouveau)*
- [ ] **T16** — Confirmer sans modification que les tests existants de
      `announcement-sheet.service.test.ts` et `opening-closing.service.test.ts` restent verts
      (chemin « non scopé » emprunté plus tôt, résultat identique). *(fichiers : tests existants
      de `src/modules/planning/services/`)*
- [ ] **T17** — Confirmer sans modification que `src/core/__tests__/permissions.test.ts` (matrice
      figée par rôle) reste vert — aucun manifeste ne change. *(fichier :
      `src/core/__tests__/permissions.test.ts`)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run build` (le changement touche `src/lib/auth.ts`, partagé serveur/pages — voir
      `feedback_build_verifie_frontiere_client_serveur.md`)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (les 12 items de la checklist)
- [ ] Statut de la spec passé à `Implémentée`
- [ ] PR ouverte vers `main`, référençant `specs/045-droits-equipe-secretariat/`
