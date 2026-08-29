# Tâches — Périmètres d'accès

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
>
> **Ordre imposé** : les permissions (§1) avant les helpers (§2), les helpers avant les routes
> (§3), les routes avant l'UI (§4). Motif : chaque étage consomme le précédent, et corriger l'UI
> avant le serveur reproduirait exactement le défaut que cette spec corrige — *masquer sans
> interdire*.

## Prérequis

- [ ] Branche créée : `feat/perimetres-acces`
- [ ] Migration Prisma : **aucune** — cette feature ne touche pas le schéma (voir `plan.md`)

## Tâches

### 1. Modèle de permissions (manifestes de modules)

- [ ] **T1** — Déclarer `planning:department` : `SUPER_ADMIN, ADMIN, SECRETARY, MINISTER,
      DEPARTMENT_HEAD` (**sans `STAR`**). Ne **pas** toucher à `planning:view`, qui reste
      accordée au STAR. *(fichier : `src/modules/planning/index.ts`)*
- [ ] **T2** — Basculer l'entrée de navigation « Planning » (`/dashboard`) du manifeste sur
      `planning:department`. *(fichier : `src/modules/planning/index.ts`)*
- [ ] **T3** [P] — Déclarer `access:manage` : `SUPER_ADMIN, ADMIN, SECRETARY, MINISTER`.
      *(fichier : `src/modules/core/index.ts`)*
- [ ] **T4** [P] — Retirer `STAR` de `rooms:view` **et** de `rooms:reserve`.
      *(fichier : `src/modules/rooms/index.ts`)*

### 2. Helpers de périmètre (`src/lib/auth.ts`)

- [ ] **T5** — Ajouter `requireDepartmentAccess(session, churchId, departmentId)` : ne retourne
      rien, jette `FORBIDDEN` si `getUserDepartmentScope` est `scoped` et ne contient pas le
      département. Un périmètre restreint **vide** refuse tout — c'est ce qui applique la
      restriction totale du STAR sans code spécifique à ce rôle.
      *(fichier : `src/lib/auth.ts`)*
- [ ] **T6** — Ajouter `getUserMinistryScope(session, churchId)`, symétrique de
      `getUserDepartmentScope` : `{ scoped: false }` pour Super Admin et rôles globaux
      (`ADMIN`, `SECRETARY`), sinon `{ scoped: true, ministryIds }` construit depuis
      `UserChurchRole.ministryId` de l'**église courante uniquement**. Un Ministre sans
      ministère obtient une liste vide. *(fichier : `src/lib/auth.ts`)*

### 3. API (route handlers)

- [ ] **T7** — Remplacer la garde de périmètre recopiée à la main par `requireDepartmentAccess`,
      sans changement de comportement. C'est la route de référence : elle valide le helper avant
      qu'on l'étende.
      *(fichier : `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)*
- [ ] **T8** — `tasks` de département : `GET` passe à `planning:department` ; `POST` et `DELETE`
      gardent `planning:edit` ; les trois appellent `requireDepartmentAccess`.
      *(fichier : `src/app/api/departments/[departmentId]/tasks/route.ts`)*
- [ ] **T9** — `notices` de département : `GET` passe à `planning:department` ; `PUT` et `DELETE`
      gardent `planning:edit` ; les trois appellent `requireDepartmentAccess`.
      *(fichier : `src/app/api/departments/[departmentId]/notices/route.ts`)*
- [ ] **T10** [P] — `members` de département : garde `members:view`, ajouter
      `requireDepartmentAccess`. *(fichier : `src/app/api/departments/[departmentId]/members/route.ts`)*
- [ ] **T11** [P] — `stats` de département : passer à `planning:department` + `requireDepartmentAccess`.
      *(fichier : `src/app/api/departments/[departmentId]/stats/route.ts`)*
- [ ] **T12** [P] — `monthly-planning` : passer à `planning:department` + `requireDepartmentAccess`.
      *(fichier : `src/app/api/departments/[departmentId]/monthly-planning/route.ts`)*
- [ ] **T13** [P] — `tasks` par événement : `GET` passe à `planning:department`, `PUT` garde
      `planning:edit` ; les deux appellent `requireDepartmentAccess`.
      *(fichier : `src/app/api/events/[eventId]/departments/[deptId]/tasks/route.ts`)*
- [ ] **T14** — `planning/weekly` : passer à `planning:department` et **filtrer** la liste sur le
      périmètre (ici la ressource est une liste : on filtre, on ne refuse pas — voir `plan.md`).
      *(fichier : `src/app/api/planning/weekly/route.ts`)*
- [ ] **T15** — Gestion des rôles : remplacer `events:manage` par `access:manage` sur `POST`,
      `PATCH` et `DELETE`, et supprimer le commentaire qui justifiait l'emprunt.
      **Conserver strictement l'anti-escalade `PRIVILEGED_ROLES` → `isSuperAdmin`.**
      *(fichier : `src/app/api/users/[userId]/roles/route.ts`)*
- [ ] **T16** — Même fichier : appliquer `getUserMinistryScope`. Un appelant au périmètre
      restreint ne peut agir que sur un rôle rattachable (`MINISTER`, `DEPARTMENT_HEAD`, `STAR`),
      dans **ses** ministères, et jamais sur un rôle transverse à l'église (`ADMIN`, `SECRETARY`,
      `REPORTER`, `ACCOUNTANT`, `DISCIPLE_MAKER`, `AGENDA_QUALIFIER`).
      *(fichier : `src/app/api/users/[userId]/roles/route.ts`)*

### 4. UI (pages et layout)

- [ ] **T17** — Dissocier les trois usages aujourd'hui confondus : `hasPlanningAccess` bascule sur
      `planning:department` (entrée « Planning ») ; `hasMyPlanning` et `showStarEvents` sont
      redéfinis sur `planning:view` afin que le STAR conserve « Mon planning », ses événements et
      ses absences. *(fichier : `src/app/(auth)/layout.tsx`)*
- [ ] **T18** — Ajouter à `/dashboard` la garde de permission **absente** : exiger
      `planning:department` dans l'église courante (la page n'exige aujourd'hui qu'une session).
      *(fichier : `src/app/(auth)/dashboard/page.tsx`)*
- [ ] **T19** — Même fichier : `userPermissions` est calculé sur **toutes** les églises de
      l'utilisateur ; le filtrer sur l'église courante, comme le fait déjà `layout.tsx`
      (spec 024). Sans quoi un responsable de l'église A obtient `planning:edit` dans l'église B.
      *(fichier : `src/app/(auth)/dashboard/page.tsx`)*
- [ ] **T20** — Gestion des accès : garde alignée sur `access:manage` (le Secrétaire peut alors
      ouvrir l'écran), **et** remplacement du `where: {}` par un filtre d'appartenance à l'église
      courante — union de : rôle dans l'église, lien de membre, demande de liaison (en attente ou
      refusée). *(fichier : `src/app/(auth)/admin/access/page.tsx`)*
- [ ] **T21** — Même page : pour un appelant au périmètre de ministère restreint, ne transmettre
      que les personnes et les ministères de son périmètre, et signaler au composant client qu'il
      doit masquer les rôles transverses.
      *(fichiers : `src/app/(auth)/admin/access/page.tsx`, `src/app/(auth)/admin/access/AccessClient.tsx`)*
- [ ] **T22** — Vérifier le parcours **pastoral** : le bloc qui injecte des permissions
      transverses ajoute `planning:view` mais pas `planning:department`. Déterminer si un
      utilisateur pastoral accède à `/dashboard` et trancher explicitement (ajouter la permission,
      ou constater qu'il est redirigé vers `/pastoral` et ne rien changer). Consigner la décision
      dans `plan.md`. *(fichier : `src/app/(auth)/layout.tsx`)*

### 5. Tests

- [ ] **T23** — Helpers : périmètre non restreint (Super Admin, Admin, Secrétaire) ; restreint et
      contenant ; restreint et ne contenant pas ; **restreint et vide** (STAR) ; multi-église (un
      rôle global dans A ne donne rien dans B) ; adjoint (`isDeputy`) inclus ; cumul de rôles =
      union. Idem pour `getUserMinistryScope`, dont le cas « Ministre sans ministère ».
      **Importer les vraies fonctions** — ne pas réimplémenter la logique dans le test comme le
      fait `dept-scope.test.ts`. *(fichier : `src/lib/__tests__/scope.test.ts`)*
- [ ] **T24** — Périmètre par département, pour chacun des accès de T8 à T14 : un
      `DEPARTMENT_HEAD` hors périmètre est refusé ; le même dans son périmètre est accepté ; un
      `STAR` est refusé ; un `ADMIN` est accepté.
      *(fichier : `src/app/api/departments/__tests__/dept-scope.test.ts`)*
- [ ] **T25** [P] — Périmètre par ministère : un Ministre agit dans son ministère ; est refusé
      hors de son ministère ; est refusé sur un rôle transverse ; un Ministre sans ministère est
      refusé partout ; **l'anti-escalade Super Admin existante ne régresse pas**.
      *(fichier : `src/app/api/users/[userId]/roles/__tests__/ministry-scope.test.ts`)*
- [ ] **T26** [P] — Étanchéité inter-églises de la page de gestion des accès : aucun utilisateur
      étranger à l'église n'est renvoyé ; les trois catégories de rattachement (rôle, lien membre,
      demande de liaison) le sont bien.
      *(fichier : `src/app/(auth)/admin/access/__tests__/tenant-scope.test.ts`)*
- [ ] **T27** [P] — Table des permissions assertée : le STAR n'a **pas** `planning:department`,
      n'a **ni** `rooms:view` **ni** `rooms:reserve`, et **conserve** `planning:view`. C'est le
      test qui empêche une régression par simple édition d'un manifeste.
      *(fichiers : `src/modules/planning/permissions.test.ts`, `src/modules/rooms/permissions.test.ts`)*
- [ ] **T28** — Réservations orphelines : une réservation créée par un STAR reste visible et
      gérable par un rôle compétent, sans erreur d'affichage, alors que son auteur n'a plus accès
      au module. *(fichier : `src/app/api/room-reservations/__tests__/security.test.ts`)*
- [ ] **T29** — Non-régression du parcours STAR conservé : « Mon planning », la vue événements
      hebdomadaire et l'auto-déclaration d'absence restent accessibles à un STAR après le
      basculement de `hasPlanningAccess`. Ce critère de la spec est le seul qui porte sur ce qui
      **ne doit pas** changer côté STAR — sans ce test, la dissociation de T17 peut le casser
      sans que rien ne le signale.
      *(fichier : `src/app/(auth)/__tests__/star-navigation.test.ts`)*
- [ ] **T30** — Faire passer les tests de non-régression existants sans autre modification que
      l'ajustement des rôles attendus.
      *(fichiers : `src/app/api/absences/__tests__/security.test.ts`,
      `src/app/api/room-reservations/__tests__/security.test.ts`,
      `src/app/api/users/[userId]/roles/__tests__/scope.test.ts`)*

### 6. Documentation

- [ ] **T31** — Rédiger l'**ADR-0009 « Garde de périmètre explicite au point d'entrée »**
      (statut `Accepté`) et l'ajouter à l'index. *(fichiers : `docs/adr/0009-garde-perimetre-explicite.md`,
      `docs/adr/README.md`)*
- [ ] **T32** [P] — Mettre à jour le tableau des rôles et permissions : ajouter
      `planning:department` et `access:manage`, retirer le STAR des salles, et documenter les
      deux helpers de périmètre aux côtés de `getUserDepartmentScope`.
      *(fichiers : `CLAUDE.md`, `docs/auth.md`)*
- [ ] **T33** [P] — Ouvrir une **issue de suivi** pour les six pages hors périmètre qui calculent
      leurs permissions sur toutes les églises (`media/requests`, `secretariat/requests`,
      `communication/requests`, `admin/discipleship`, `admin/members`,
      `admin/events/[eventId]/report`) — même défaut que T19, modules explicitement hors spec.
      *(GitHub)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] **Vérification manuelle en recette** : un responsable de département réel ne perd aucun
      département qu'il gère légitimement (risque n° 1 du plan : bloquer à tort, pas laisser
      passer)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] Issues #462, #463 et #467 référencées dans la PR pour fermeture automatique
- [ ] PR ouverte vers `main`
