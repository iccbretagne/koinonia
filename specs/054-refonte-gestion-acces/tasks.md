# Tâches — Refonte de la gestion des accès (ergonomie et cohérence)

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **Annexe** : `./audit-rbac.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Deux lots développés dans l'ordre **lot 2 puis lot 1**
> (voir plan), chacun sur sa branche de lot avec une PR vers la base
> `feat/refonte-gestion-acces`, puis **une seule PR finale** vers `main`. Aucune migration Prisma.
> Les tâches `[P]` sont parallélisables (fichiers indépendants).

## Prérequis

- [x] Branche de base créée : `feat/refonte-gestion-acces` (spec, audit, plan)
- [ ] Branche du lot 2 créée depuis la base : `feat/acces-lot2-rbac`
- [ ] Branche du lot 1 créée depuis la base **après fusion du lot 2** : `feat/acces-lot1-ergonomie`

---

## Lot 2 — Cohérence RBAC

### 2.1 Matrice (manifestes)

- [ ] **T1** — `users:manage` : `["SUPER_ADMIN", "ADMIN"]`, commentaire réécrit (comptes de
      l'église : liste, pré-création, suppression d'un compte jamais connecté, renommage) — D2.
      *(fichier : `src/modules/core/manifest.ts`)*
- [ ] **T2** [P] — Déclarer `"integration:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY"]` — D4.
      *(fichier : `src/modules/integration/manifest.ts`)*
- [ ] **T3** [P] — Ajouter `ADMIN` à `discipleship:export` — D5.
      *(fichier : `src/modules/discipleship/manifest.ts`)*
- [ ] **T4** [P] — Ajouter `SECRETARY` à `rooms:reserve` — D7.
      *(fichier : `src/modules/rooms/manifest.ts`)*
- [ ] **T5** — Mettre à jour la matrice figée et les tests de manifestes pour T1–T4 (même
      commit que T1–T4, CLAUDE.md règle 10).
      *(fichiers : `src/core/__tests__/permissions.test.ts`, `src/modules/rooms/permissions.test.ts`,
      `src/modules/__tests__/manifests.test.ts`)*

### 2.2 Services et gardes

- [ ] **T6** — Ajouter à `member-scope.ts` trois prédicats purs :
      `isMemberInScope(scope, memberDepartmentIds)` (au moins un département commun),
      `isMemberFullyInScope(scope, memberDepartmentIds)` (tous les départements dans le
      périmètre), `isLinkRequestInScope(scope, ministryIds, request)` (département demandé, ou
      ministère demandé, ou fiche existante dans le périmètre ; `scope` non restreint → vrai).
      *(fichier : `src/lib/member-scope.ts`)*
- [ ] **T7** — Gardes intégration : `requireIntegrationAccess` remplace
      `members:manage || events:manage` par `integration:manage` ; `requireIntegrationSettingsAccess`
      remplace `events:manage` par `integration:manage` ; nouvelle `requireIntegrationFullAccess`
      (refuse un périmètre restreint) dont `requireIntegrationExportAccess` devient un alias.
      Export de `requireIntegrationFullAccess` par l'index.
      *(fichiers : `src/modules/integration/auth.ts`, `src/modules/integration/index.ts`)*

### 2.3 API

- [ ] **T8** — Parcours : supprimer les trois copies de `hasAccess`/`canAccess` et appeler
      `requireIntegrationFullAccess(churchId)` sur GET/POST et GET/PATCH/DELETE (A2).
      *(fichiers : `src/app/api/integration/parcours/route.ts`,
      `src/app/api/integration/parcours/[id]/route.ts`)*
- [ ] **T9** [P] — `GET /api/users` et `DELETE /api/users/[userId]` : `users:manage` (A3).
      *(fichiers : `src/app/api/users/route.ts`, `src/app/api/users/[userId]/route.ts`)*
- [ ] **T10** [P] — `PATCH /api/users/[userId]/profile` : soi-même, ou `users:manage` (via
      `rolePermissions`) dans une église commune, à la place des rôles codés en dur.
      *(fichier : `src/app/api/users/[userId]/profile/route.ts`)*
- [ ] **T11** — Demandes d'accès : `GET` et `PATCH [id]` passent à `access:manage` ; `GET` filtre
      au périmètre du Ministre ; `PATCH` refuse (403) une demande hors périmètre
      (`isLinkRequestInScope`) (B4, D3).
      *(fichiers : `src/app/api/member-link-requests/route.ts`,
      `src/app/api/member-link-requests/[id]/route.ts`)*
- [ ] **T12** — Liaison de comptes : `POST`/`DELETE` passent à `access:manage` ; refus si
      `memberId` hors périmètre (`isMemberInScope`) ou `newMember.departmentId` hors périmètre (B3).
      *(fichier : `src/app/api/member-user-links/route.ts`)*
- [ ] **T13** [P] — `GET /api/users/search` : `access:manage` (D3).
      *(fichier : `src/app/api/users/search/route.ts`)*
- [ ] **T14** [P] — Attribution STAR en masse : `access:manage` ; ne traiter que les liens dont
      la fiche est dans le périmètre (B2).
      *(fichier : `src/app/api/admin/members/assign-star-roles/route.ts`)*
- [ ] **T15** [P] — Fusion : garder `members:manage` ; appelant restreint → 403 sauf si
      `isMemberFullyInScope` pour la source **et** la cible (B1).
      *(fichier : `src/app/api/admin/members/merge/route.ts`)*

### 2.4 Pages et navigation

- [ ] **T16** [P] — `/admin/users` et `/admin/users/new` : `requireChurchPermission("users:manage")`,
      suppression du contrôle de rôle `ADMIN` codé en dur ; `canManageRoles` dérivé de
      `users:manage`.
      *(fichiers : `src/app/(auth)/admin/users/page.tsx`, `src/app/(auth)/admin/users/new/page.tsx`)*
- [ ] **T17** [P] — Redirecteur `/admin` : `church:manage` → `/admin/churches`, `users:manage` →
      `/admin/users`, `access:manage` → `/admin/access`, sinon `FORBIDDEN` ; permissions calculées
      sur l'église courante uniquement.
      *(fichier : `src/app/(auth)/admin/page.tsx`)*
- [ ] **T18** — Menu : « Utilisateurs » sur `users:manage` (retrait de `adminOnly`), « Accès &
      rôles » sur `access:manage` ; liens Intégration (dont Paramètres) sur `integration:manage`
      au lieu de `isGlobalManager`.
      *(fichier : `src/app/(auth)/layout.tsx`)*
- [ ] **T19** — Page STAR : demandes d'accès et boutons « lier/délier » affichés si
      `access:manage`, demandes filtrées au périmètre ; bouton « Doublons » si `members:manage`.
      *(fichiers : `src/app/(auth)/admin/members/page.tsx`, `MembersClient.tsx`,
      `LinkRequestsClient.tsx`)*
- [ ] **T20** — Page doublons : membres filtrés par `resolveMemberDepartmentScope` ; action
      « attribuer STAR en masse » visible seulement avec `access:manage`.
      *(fichiers : `src/app/(auth)/admin/members/duplicates/page.tsx`, `DuplicatesView.tsx`)*
- [ ] **T21** [P] — Guide intégré : lignes de la matrice d'accès touchées par D2–D7 et par la
      perte des droits d'accueil/parcours et de validation des demandes pour Min/RD.
      *(fichier : `src/components/GuideContent.tsx`)*

### 2.5 Documentation

- [ ] **T22** — Matrice et règles : ligne `integration:manage`, `users:manage` (Ad),
      `discipleship:export` (Ad), `rooms:reserve` (Sec), `discipleship:view` (Min, D6) ;
      paragraphe du module `integration` sans raccourci ; spécificités Secrétaire / Resp.
      département (validation et liaison via `access:manage`) ; raccourcis `events:manage`
      signalés comme fragiles.
      *(fichiers : `CLAUDE.md`, `docs/auth.md`)*
- [ ] **T23** [P] — Permissions des routes modifiées (tableau « Gardes et routes » du plan).
      *(fichier : `docs/api.md`)*
- [ ] **T24** [P] — Processus d'arrivée STAR : qui valide les demandes d'accès ; « Qualificateur
      Agenda » → « Référent soins pastoraux ».
      *(fichier : `docs/processus/arrivee-star.md`)*
- [ ] **T25** [P] — ADR-0017 « Une permission n'approxime jamais un rôle » (Accepté) ; ADR-0014
      règle 5 complétée (`INTEGRATION`, `MSDP`, `PHOTOS`) ; index des ADR.
      *(fichiers : `docs/adr/0017-permission-n-approxime-pas-un-role.md`,
      `docs/adr/0014-fonctions-departement-droits-ecriture.md`, `docs/adr/README.md`)*
- [ ] **T26** [P] — Commentaire obsolète (« admins (members:manage) ») ; statut des défauts
      A1–A3, B1–B4 passé à « corrigé » dans l'annexe.
      *(fichiers : `src/app/api/discipleships/[id]/member/route.ts`,
      `specs/054-refonte-gestion-acces/audit-rbac.md`)*
- [ ] **T27** [P] — CHANGELOG, section non publiée : correctifs de sécurité et **pertes de droits
      voulues** (Min/RD hors équipe d'accueil ; RD : validation des demandes, liaison, STAR en
      masse), nouveaux droits (Sec : salles, validation ; Ad : export discipolat).
      *(fichier : `CHANGELOG.md`)*

### 2.6 Tests

- [ ] **T28** — Test-gardien : échoue si `members:manage` ou `events:manage` apparaît dans un
      fichier de `src/` (hors tests) absent d'une liste blanche où chaque entrée est justifiée ;
      les raccourcis `events:manage` sans sur-octroi y sont marqués « fragile ».
      *(fichier : `src/lib/__tests__/rbac-no-role-proxy.test.ts`)*
- [ ] **T29** — Gardes intégration : Min et RD hors équipe → `FORBIDDEN` ; Secrétaire (réelle et
      virtuelle) → global ; membre `INTEGRATION`/`MSDP` → global ; berger → restreint ;
      `requireIntegrationFullAccess` et l'export refusent le berger ; réglages : Min → refus,
      responsable `INTEGRATION` → accès.
      *(fichier : `src/modules/integration/__tests__/auth.test.ts`)*
- [ ] **T30** [P] — Parcours : Ministre hors équipe → 403 sur les cinq méthodes ; membre de
      l'équipe → 200 ; berger → 403.
      *(fichier : `src/app/api/integration/parcours/__tests__/route.test.ts` — nouveau)*
- [ ] **T31** [P] — Utilisateurs : liste et suppression → 403 pour Min/RD/Secrétaire, 200 pour
      Admin ; profil : soi-même → 200, Admin d'une église commune → 200, Min → 403.
      *(fichiers : `src/app/api/users/__tests__/route.test.ts`,
      `src/app/api/users/[userId]/__tests__/route.test.ts`,
      `src/app/api/users/[userId]/profile/__tests__/route.test.ts` — nouveau)*
- [ ] **T32** [P] — Demandes d'accès : Secrétaire valide ; Ministre valide dans son ministère et
      reçoit 403 ailleurs ; RD → 403 ; `GET` filtré pour le Ministre.
      *(fichiers : `src/app/api/member-link-requests/[id]/__tests__/route.test.ts`,
      `src/app/api/member-link-requests/__tests__/dept-scope.test.ts` — nouveau)*
- [ ] **T33** [P] — Liaison : RD → 403 ; Ministre → 403 hors ministère (fiche existante et
      nouvelle fiche) ; Secrétaire → 201.
      *(fichier : `src/app/api/member-user-links/__tests__/route.test.ts`)*
- [ ] **T34** [P] — Attribution STAR en masse (seulement le périmètre) et fusion (refus si une
      des deux fiches déborde ; accepté si tout est dans le périmètre ; Admin non restreint).
      *(fichiers : `src/app/api/admin/members/assign-star-roles/__tests__/dept-scope.test.ts`,
      `src/app/api/admin/members/merge/__tests__/dept-scope.test.ts` — nouveaux)*
- [ ] **T35** [P] — Prédicats de périmètre (dont périmètre vide, non restreint, demande sans
      ministère ni département).
      *(fichier : `src/lib/__tests__/member-scope.test.ts` — nouveau)*
- [ ] **T36** — Adapter les tests existants qui supposaient l'ancien comportement.
      *(fichiers : `src/lib/__tests__/auth-security.test.ts`, `auth-multitenant.test.ts`,
      `auth-secretariat-role.test.ts`, `src/app/api/events/[eventId]/__tests__/security.test.ts`,
      `src/app/api/room-reservations/__tests__/orphan-star-author.test.ts` — selon échecs)*

### 2.7 Vérification du lot 2

- [ ] `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`
- [ ] Critères d'acceptation RBAC de la spec (dossiers d'accueil, anti-motif généralisé,
      périmètre des gestes « membres ») vérifiés
- [ ] PR `feat/acces-lot2-rbac` → `feat/refonte-gestion-acces`

---

## Lot 1 — Ergonomie

### 1.1 Services (noyau)

- [ ] **T37** — Source unique des rôles : `ROLE_LABELS`, `ROLE_SHORT_LABELS`,
      `ROLE_DESCRIPTIONS` (rédigées d'après la matrice corrigée), `ROLE_CATEGORY`,
      `ASSIGNABLE_BY_MINISTER`. Constantes pures, sans import serveur.
      *(fichier : `src/lib/roles.ts` — nouveau)*
- [ ] **T38** — La route des rôles importe `ASSIGNABLE_BY_MINISTER` à la place de sa liste locale
      `MINISTRY_SCOPED_ROLES` (comportement inchangé).
      *(fichier : `src/app/api/users/[userId]/roles/route.ts`)*
- [ ] **T39** — Accès hérités : table `FUNCTION_ACCESS` (fonctions de l'ADR-0014 + responsables
      `INTEGRATION` et `CAPTATION_AUDIO`, filtrée par `registry.has(module)`) et
      `listInheritedAccess(churchId, userIds)` : départements via `user_departments` **et** fiche
      liée, équipe Secrétariat, profil pastoral, bergers, affectations care **ouvertes** ;
      une requête par source.
      *(fichier : `src/lib/access-overview.ts` — nouveau)*
- [ ] **T40** — `loadAccessPeople(churchId, ministryScope)` : personnes rattachées à l'église
      (rôle, fiche liée, demande — requête actuelle de la page) **plus** profil pastoral, berger,
      accompagnant care ouvert ; filtre ministère pour un Ministre conservé.
      *(fichier : `src/lib/access-overview.ts`)*

### 1.2 Libellés uniques

- [ ] **T41** [P] — Guide : `ROLE_LABELS`/`ROLE_DESCRIPTIONS` locaux remplacés par ceux de
      `src/lib/roles.ts` (la matrice d'accès du guide reste locale).
      *(fichier : `src/components/GuideContent.tsx`)*
- [ ] **T42** [P] — Tables locales remplacées par `src/lib/roles.ts`.
      *(fichiers : `src/app/(auth)/admin/users/UsersClient.tsx`,
      `src/app/(auth)/admin/members/LinkRequestsClient.tsx`, `src/app/no-access/NoAccessClient.tsx`,
      `src/app/(auth)/requests/new/RequestForm.tsx` ; vérifier et aligner « Resp. département »
      dans `absence.service.ts` et `AbsencesClient.tsx`)*

### 1.3 UI — `/admin/access`

- [ ] **T43** — Extraire l'onglet Demandes tel quel (approbation, doublons, refus, reconsidération)
      dans `RequestsPanel`, libellés via `src/lib/roles.ts`.
      *(fichier : `src/app/(auth)/admin/access/RequestsPanel.tsx` — nouveau)*
- [ ] **T44** — `ResponsibilityModal` : choix du ministère, des départements et de l'adjoint,
      extrait des deux modales actuelles, construit sur `Modal`/`Select`/`CheckboxGroup`/`Button`.
      *(fichier : `src/app/(auth)/admin/access/ResponsibilityModal.tsx` — nouveau)*
- [ ] **T45** — Page d'accueil à onglets **Personnes** (défaut) / **Par rôle** / **Demandes**
      (compteur) ; `PeopleList` : recherche nom/email, pastilles de rôles, nombre d'accès hérités,
      lien vers la fiche ; données via `loadAccessPeople` + `listInheritedAccess`.
      *(fichiers : `src/app/(auth)/admin/access/page.tsx`, `AccessTabs.tsx`, `PeopleList.tsx` — nouveaux/modifiés)*
- [ ] **T46** [P] — `RolesOverview` (onglet Par rôle) : un bloc par catégorie, chaque rôle avec
      sa description, son nombre de détenteurs et un lien vers sa page ; rôles transverses
      masqués au Ministre.
      *(fichier : `src/app/(auth)/admin/access/RolesOverview.tsx` — nouveau)*
- [ ] **T47** — Fiche personne : garde `access:manage` + périmètre (404 hors ministère) ;
      identité et fiche STAR liée ; rôles par catégorie en cases à cocher avec description,
      filtrés selon l'appelant ; responsabilités via `ResponsibilityModal` ; accès hérités en
      lecture seule avec origine (rôle Secrétaire virtuel non retirable) ; mutations via
      `/api/users/[userId]/roles` puis `router.refresh()`.
      *(fichiers : `src/app/(auth)/admin/access/users/[userId]/page.tsx`,
      `PersonAccessClient.tsx` — nouveaux)*
- [ ] **T48** — Page par rôle : `role` validé contre l'enum (404 sinon) ; détenteurs avec retrait ;
      « Ajouter une personne » parmi les personnes du périmètre ; pour Ministre et Resp.
      département, vue ministère → départements (ancien onglet « Rôles ») avec
      `ResponsibilityModal`.
      *(fichiers : `src/app/(auth)/admin/access/roles/[role]/page.tsx`,
      `RoleHoldersClient.tsx` — nouveaux)*
- [ ] **T49** — Supprimer `AccessClient.tsx` et les anciens onglets « Rôles transverses » et
      « STAR » (couverts par la fiche et la vue par rôle STAR).
      *(fichier : `src/app/(auth)/admin/access/AccessClient.tsx`)*
- [ ] **T50** [P] — Documentation des nouveaux écrans : arborescence `CLAUDE.md`, section gestion
      des accès de `docs/auth.md`, `docs/processus/arrivee-star.md` (« Où ça se passe »).
      *(fichiers : `CLAUDE.md`, `docs/auth.md`, `docs/processus/arrivee-star.md`)*

### 1.4 Tests

- [ ] **T51** [P] — Chaque valeur de l'enum `Role` a libellé, libellé court, description et
      catégorie ; `ASSIGNABLE_BY_MINISTER` ne contient ni rôle transverse ni rôle privilégié.
      *(fichier : `src/lib/__tests__/roles.test.ts` — nouveau)*
- [ ] **T52** [P] — Test-gardien libellés : aucune table de libellés de rôles
      (`DEPARTMENT_HEAD: "…"`) hors de `src/lib/roles.ts`.
      *(fichier : `src/lib/__tests__/role-labels-single-source.test.ts` — nouveau)*
- [ ] **T53** — Accès hérités : une personne par source (fonction via `user_departments`, via
      fiche liée, responsable de fonction, équipe Secrétariat, profil pastoral, berger, care
      ouvert) ; care clos exclu ; module inactif exclu ; `loadAccessPeople` inclut une bergère
      sans rôle ; exhaustivité : toute fonction citée dans `modules/*/auth.ts` et `lib/auth.ts`
      a une entrée dans `FUNCTION_ACCESS`.
      *(fichier : `src/lib/__tests__/access-overview.test.ts` — nouveau)*
- [ ] **T54** — Pages : liste filtrée au ministère d'un Ministre (test existant adapté) ; fiche
      d'une personne hors ministère → 404 ; rôle inconnu → 404 ; rôles transverses absents pour
      un Ministre.
      *(fichiers : `src/app/(auth)/admin/access/__tests__/tenant-scope.test.ts`,
      `person-and-role-pages.test.ts` — nouveau)*

### 1.5 Vérification du lot 1

- [ ] `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`
- [ ] Vérification dans le navigateur (`npm run dev`, jeu de données fictif) : Admin — liste,
      fiche, cocher un rôle puis le retrouver dans la vue par rôle et inversement ; Ministre —
      périmètre et absence de rôles transverses ; Secrétaire — valider une demande d'accès ;
      personne sans rôle mais bergère visible ; affichage mobile
- [ ] Critères d'acceptation ergonomiques de la spec vérifiés
- [ ] PR `feat/acces-lot1-ergonomie` → `feat/refonte-gestion-acces`

---

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits ; statut de la spec → `Implémentée`
- [ ] PR finale `feat/refonte-gestion-acces` → `main`

## Couverture des critères d'acceptation

| Critère de la spec | Tâches |
|---|---|
| Liste de personnes cherchable avec résumé des accès | T40, T45, T54 |
| Fiche unique avec tous les accès réels | T39, T47, T53, T54 |
| Chaque rôle proposé accompagné d'une phrase d'explication | T37, T46, T47, T51 |
| Accès hérités visibles, en lecture seule, avec origine, même sans rôle | T39, T40, T47, T53 |
| Consultation par rôle avec ajout direct | T46, T48 |
| Changement reflété entre fiche et vue par rôle | T47, T48 (Server Components + `router.refresh()`), vérification navigateur 1.5 |
| Même libellé partout (écran, guide, doc) | T37, T41, T42, T50, T52 |
| Ministre limité à son périmètre, sans rôle transverse | T38, T46, T47, T48, T54 (+ API existante) |
| Dossiers d'accueil restreints | T2, T7, T18, T29 |
| Anti-motif corrigé partout où il est confirmé | T8, T9, T10, T16, T17, T28, T30, T31 |
| Gestes « membres » dans le périmètre | T6, T11–T15, T19, T20, T32–T35 |
