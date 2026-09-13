# Tâches — Pré-provisionnement d'un utilisateur par e-mail

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée (hors recette manuelle et ouverture de PR)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : services → API → UI → tests → documentation. Les tâches `[P]` sont
> parallélisables (fichiers indépendants).

## Prérequis

- [x] Branche créée : `feat/preprovisionnement-utilisateur`
- [ ] Migration Prisma : **aucune** (voir `plan.md`)

## Tâches

### 1. API (route handlers)

- [x] **T1** — `POST /api/member-user-links` : étendre le schéma Zod pour accepter `newMember`
      (`firstName`, `lastName`, `phone?`, `departmentId`) en alternative à `memberId`
      (mutuellement exclusifs, l'un des deux requis, cf. `plan.md`). Quand `newMember` est fourni :
      sauter la vérification `member.findFirst` (pas de `memberId` existant à valider) et la
      vérifier `existingByMember` (une nouvelle fiche ne peut pas déjà avoir de lien) ; transmettre
      `input.newMember` à `admitToChurch` dans la transaction existante.
      *(fichier : `src/app/api/member-user-links/route.ts`)*
- [x] **T2** — `GET /api/users` : ajouter `_count: { select: { accounts: true } }` à l'`include`
      Prisma ; dériver `neverConnected: boolean` (`_count.accounts === 0`) sur chaque utilisateur
      avant `successResponse`, retirer `_count` de la réponse finale.
      *(fichier : `src/app/api/users/route.ts`)*
- [x] **T3** — `/admin/users/page.tsx` (chargement SSR) : même ajout `_count`/`neverConnected` que
      T2 sur la requête `prisma.user.findMany` de la page, transmis à `UsersClient`.
      *(fichier : `src/app/(auth)/admin/users/page.tsx`)*
- [x] **T4** — Créer `DELETE /api/users/[userId]` : `requireChurchPermission("members:manage",
      churchId)` (body ou query `churchId`) ; charge l'utilisateur avec `accounts`, `churchRoles`
      (toutes églises) ; `409` si `accounts.length > 0` ; `409` si un `churchRoles` porte sur une
      église différente de `churchId` ; sinon suppression en cascade
      (`UserDepartment`→`UserChurchRole`, `MemberUserLink`, `User`) dans une transaction + `logAudit`
      (`action: "DELETE"`, `entityType: "User"`). *(fichier : `src/app/api/users/[userId]/route.ts`
      — à créer)*

### 2. UI

- [x] **T5** — Page `/admin/users/new/page.tsx` (Server Component) : même garde d'accès que
      `/admin/users` (`requireChurchPermission("members:manage", churchId)` + contrôle Admin/Super
      Admin) ; charge les `Member` de l'église courante sans lien existant
      (`userLink: null`, ou équivalent via absence de `MemberUserLink`) groupés par ministère/
      département, et les `Department` de l'église (pour la création d'une nouvelle fiche).
      *(fichier : `src/app/(auth)/admin/users/new/page.tsx` — à créer)*
- [x] **T6** — `CreateUserClient.tsx` : formulaire avec `Input` e-mail, un choix entre « Lier une
      fiche STAR existante » (recherche/sélection parmi les membres sans compte transmis par T5,
      pattern de recherche similaire à `MembersClient`) et « Créer une nouvelle fiche STAR »
      (`Input` prénom/nom/téléphone + `Select` département) ; soumission vers
      `POST /api/member-user-links` avec `email` + `confirmCreate: true` + `memberId` ou
      `newMember` ; erreurs affichées (dont le cas « déjà lié » 409 existant) ; redirection vers
      `/admin/users` après succès. *(fichier :
      `src/app/(auth)/admin/users/new/CreateUserClient.tsx` — à créer)*
- [x] **T7** [P] — `/admin/users` : ajouter un bouton « + Créer un utilisateur » (lien vers
      `/admin/users/new`) au-dessus de la liste, visible selon `canManageRoles` (même garde que le
      reste de l'écran). *(fichier : `src/app/(auth)/admin/users/UsersClient.tsx`)*
- [x] **T8** — `UsersClient.tsx` : `UserItem` gagne `neverConnected: boolean` ; badge « Jamais
      connecté » (`bg-amber-50 text-amber-700`, cohérent avec les badges existants) à côté du nom
      quand vrai ; action « Supprimer » (icône, confirmation `window.confirm` comme les autres
      suppressions du fichier) visible **uniquement** si `neverConnected`, appelant
      `DELETE /api/users/[userId]` puis retirant l'utilisateur de l'état local.
      *(fichier : `src/app/(auth)/admin/users/UsersClient.tsx`)*
- [x] **T9** — Vérifier le rendu mobile de `/admin/users/new` (deux modes lien/création, champs
      département) et du badge/action de suppression sur `/admin/users` en largeur réduite (pas de
      débordement, retour à la ligne propre).

### 3. Tests

- [x] **T10** [P] — `POST /api/member-user-links` : création avec `newMember` (succès, `Member` +
      `MemberUserLink` créés, rôle STAR attribué) ; `departmentId` hors église → 400 ; `memberId`
      **et** `newMember` fournis ensemble → 400 ; ni l'un ni l'autre → 400 ; non-régression des cas
      `memberId`/`userId`/`email` existants (inchangés).
      *(fichier : `src/app/api/member-user-links/__tests__/route.test.ts`)*
- [x] **T11** [P] — `GET /api/users` : `neverConnected: true` pour un utilisateur sans `Account`,
      `false` dès qu'une ligne `Account` existe. *(fichier :
      `src/app/api/users/__tests__/route.test.ts`)*
- [x] **T12** [P] — `DELETE /api/users/[userId]` (nouveau fichier de test) : 409 si
      `accounts.length > 0` ; 409 si rôle dans une autre église que `churchId` ; 200 + suppression
      effective + `logAudit` appelé sinon ; 403 sans permission `members:manage`.
      *(fichier : `src/app/api/users/[userId]/__tests__/route.test.ts` — à créer)*
- [x] **T13** — Mettre à jour les tests existants cassés par l'ajout de `_count`/`neverConnected`
      dans les mocks Prisma de `GET /api/users` et de la page `/admin/users` (sans affaiblir leurs
      assertions). *(fichiers concernés identifiés par `npx vitest run`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] `npm run build`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (table ci-dessous)
- [ ] Recette : créer un utilisateur (fiche existante et nouvelle fiche), vérifier le badge
      « jamais connecté », le retrait d'un compte préparé, rendu mobile
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère (spec) | Tâches |
|---|---|
| Point d'entrée dédié « Créer un utilisateur », lié ou nouvelle fiche STAR | T1, T5, T6, T10 |
| Accès STAR de base immédiat, identique au rattachement classique | T1, T10 (délègue à `admitToChurch`, inchangé) |
| Marquage visible « jamais connecté » tant qu'aucune connexion | T2, T3, T8, T11 |
| Marquage disparaît dès la première connexion (dérivé d'`accounts`, pas de champ à effacer) | T2, T11 |
| Adresse déjà associée à un compte existant réutilise ce compte | T1, T10 (chemin `memberId`/`userId`/`email` existant, inchangé) |
| Fiche STAR déjà liée ne peut pas être reliée une seconde fois | T1, T10 (`existingByMember`, inchangé) |
| Admin peut retirer un compte préparé jamais activé | T4, T8, T12 |
| Église sans usage de la fonctionnalité : aucun changement visible | T7, T8 (badge/action conditionnels), recette |
