# Tâches — Ergonomie des espaces à onglets et rangement Photos / Visuels

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée (T31 — vérification manuelle navigateur — non effectuée dans cette session)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/ergonomie-espaces-onglets`
- [x] Migration Prisma générée pour `MediaShareToken.churchId`

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter `churchId String?` + relation `church` + `@@index([churchId])` sur
      `MediaShareToken` ; générer la migration (`npm run db:migrate`) avec le backfill SQL :
      événement → `media_events.churchId`, projet → `media_projects.churchId`, collection →
      première source trouvée dans `config.eventIds`/`config.projectIds` (résolue via une jointure
      applicative dans le script de migration, pas en SQL brut JSON si non trivial en MariaDB).
      *(fichier : `prisma/schema.prisma`, `prisma/migrations/…`)*
- [x] **T2** — Ajouter `PHOTOS: "PHOTOS"` à `DEPT_FN` et `"Photos"` à `DEPT_FN_LABEL` dans
      `src/lib/department-functions.ts`. Aucune migration : `Department.function` est une chaîne
      libre. *(fichier : `src/lib/department-functions.ts`)*

### 2. Logique métier (services)

- [x] **T3** — Dans `src/lib/auth.ts` : introduire `type MediaDomain = "PHOTOS" | "VISUELS"` et
      `isMediaTeamMember(session, churchId, domain)` (remplace `isProductionMediaMember`) — via
      `getFunctionDepartmentIds` : `VISUELS` → `PRODUCTION_MEDIA` ; `PHOTOS` → fonction `PHOTOS`
      si au moins un département de l'église la porte, sinon repli sur `PRODUCTION_MEDIA`.
      *(fichier : `src/lib/auth.ts`)*
- [x] **T4** — Ajouter le paramètre obligatoire `domain: MediaDomain` à `requireMediaAccess`,
      `requireMediaUploadAccess`, `requireMediaReviewAccess`, `requireMediaManageAccess` ;
      remplacer en interne l'appel à `isProductionMediaMember` par `isMediaTeamMember(…, domain)`.
      La branche Communication (`isCommunicationMember`) et `media:*` restent inchangées.
      *(fichier : `src/lib/auth.ts`)*
- [x] **T5** — Ajouter `getMediaShareScope(session, churchId): Promise<{photos: boolean; visuels:
      boolean}>` (`media:manage` ou Communication → les deux ; sinon `isMediaTeamMember` par
      activité) ; mettre à jour `requireMediaCollectionAccess` pour passer si l'un des deux
      périmètres est vrai. Supprimer `isProductionMediaMember` une fois T6–T9 terminées.
      *(fichier : `src/lib/auth.ts`)*
- [x] **T6** — Réécrire `src/lib/media-space.ts` : `MediaSpaceAccess = { photos; visuels;
      visualRequests; social; share }` ; `buildMediaSpaceCards(access)` (ordre fixe Photos ·
      Visuels · Réseaux sociaux, carte Visuels si `visuels || visualRequests`) ;
      `buildVisualsTabs(access)` (Projets / Demandes) ; `resolveMediaSpaceAccess` mis à jour pour
      calculer les 4 booléens (ajout de la fonction `PHOTOS` à la requête `serviceDepts`).
      *(fichier : `src/lib/media-space.ts`)*
- [x] **T7** [P] — Créer `getMediaSpaceCounters(churchId, access)` dans `src/lib/media-space.ts` :
      photos `PENDING`/`PREVALIDATED` (fonction résolue), fichiers `VISUAL` `PENDING`, demandes
      `VISUEL` et `RESEAUX_SOCIAUX` en attente — uniquement pour les cartes visibles.
      *(fichier : `src/lib/media-space.ts`)*
- [x] **T8** [P] — Créer `getAudioSpaceCards(churchId)` dans `src/app/(auth)/audio/tabs.ts`,
      réutilisant `getAccessibleAudioTabs` + compteurs : (re)Écouter = cultes publiés (30 j),
      Production = cultes en attente de dépôt/nommage, Paramètres = aucun compteur.
      *(fichier : `src/app/(auth)/audio/tabs.ts`)*
- [x] **T9** — Créer `src/modules/media/services/shares.ts` (import Prisma dynamique, pattern
      `audio/services/service.ts`) : `listActiveShares(churchId, scope)`, `countActiveShares
      (churchId, scope)` (filtre `expiresAt` nul/futur + périmètre par type de lien),
      `revokeShare(id, session)` (résolution église + contrôles d'upload/manage selon le type,
      collection = périmètre couvrant toutes ses sources, puis suppression + `logAudit`) ; exporter
      les trois depuis `src/modules/media/index.ts`. Mettre à jour `createMediaShareToken`
      (`services/tokens.ts`) pour exiger et persister `churchId`, et migrer tous ses appelants.
      *(fichiers : `src/modules/media/services/shares.ts`, `services/tokens.ts`, `index.ts`)*

### 3. API (route handlers)

- [x] **T10** — Mettre à jour tous les appels aux 4 gardes médias avec le `domain` correct :
      `media-events/**` → `PHOTOS`, `media-projects/**` → `VISUELS`,
      `media/files/[id]/**` et `upload/sign` → activité déduite de la cible (`mediaEventId` ⇒
      `PHOTOS`, `mediaProjectId` ⇒ `VISUELS`). *(fichiers : `src/app/api/media-events/**/route.ts`,
      `src/app/api/media-projects/**/route.ts`, `src/app/api/media/files/**/route.ts`)*
- [x] **T11** — Dans `src/app/api/admin/media/collections/route.ts` : valider via
      `getMediaShareScope` que `eventIds` non vide exige `scope.photos` et `projectIds` non vide
      exige `scope.visuels` (`403` sinon) ; passer `churchId` à `createMediaShareToken`.
      *(fichier : `src/app/api/admin/media/collections/route.ts`)*
- [x] **T12** — Créer `GET /api/media/shares` : église courante + `requireMediaCollectionAccess`,
      renvoie `listActiveShares` avec libellés de sources résolus.
      *(fichier : `src/app/api/media/shares/route.ts`)*
- [x] **T13** [P] — Créer `DELETE /api/media/shares/[id]` : résout l'église depuis le lien, appelle
      `revokeShare`. Les deux routes tombent sous le préfixe `/api/media` déjà déclaré dans
      `src/modules/media/manifest.ts` (ADR-0012) — aucun changement de manifeste requis, à
      vérifier avec `route-exhaustiveness.test.ts`.
      *(fichier : `src/app/api/media/shares/[id]/route.ts`)*

### 4. UI

- [x] **T14** — Créer `src/components/SpaceHome.tsx` (server-friendly) : titre, action d'en-tête
      optionnelle, grille de cartes `{ href, title, team?, stats[] }` (2 colonnes desktop, 1
      mobile), style `border-2 rounded-lg`, compteurs en pastille `icc-jaune`.
      *(fichier : `src/components/SpaceHome.tsx`)*
- [x] **T15** — Réécrire `src/app/(auth)/media/page.tsx` : accueil `SpaceHome` à partir de
      `buildMediaSpaceCards` + `getMediaSpaceCounters` ; redirection directe si une seule carte ;
      bouton « Partages (N liens actifs) » si `access.share`, via `countActiveShares`.
      *(fichier : `src/app/(auth)/media/page.tsx`)*
- [x] **T16** [P] — Créer `src/app/(auth)/media/SharesDrawer.tsx` (client) : `Modal` listant
      `GET /api/media/shares` (type, sources, expiration, copier le lien, révoquer via `DELETE` si
      `canRevoke`). *(fichier : `src/app/(auth)/media/SharesDrawer.tsx`)*
- [x] **T17** — Simplifier `media/layout.tsx` et `communication/layout.tsx` : suppression de la
      barre d'onglets globale (`SpaceTabs` sur tout l'espace), fil d'Ariane « Communication &
      Production › {activité} » avec lien retour à l'accueil.
      *(fichiers : `src/app/(auth)/media/layout.tsx`, `src/app/(auth)/communication/layout.tsx`)*
- [x] **T18** [P] — Ajouter un layout de groupe de routes pour Visuels appliquant
      `buildVisualsTabs` (`SpaceTabs`) à `/media/projects/**` et `/media/requests`, sans changer
      leurs URLs. *(fichier : nouveau layout sous `src/app/(auth)/media/`)*
- [x] **T19** — Renommer les titres/actions visibles : « Photos » sur `media/events/page.tsx`
      (« + Nouvel événement photo »), « Visuels » sur `media/projects/page.tsx` (« + Nouveau
      projet visuel ») ; mettre à jour `canUpload`/`canManage` dans ces pages et
      `events/[id]`/`projects/[id]` pour utiliser `isMediaTeamMember` avec la bonne activité.
      *(fichiers : `media/events/page.tsx`, `media/events/[id]/page.tsx`,
      `media/projects/page.tsx`, `media/projects/[id]/page.tsx`)*
- [x] **T20** — Ajouter la sélection multiple et l'action « Partager une sélection » (ouvre
      `CollectionBuilder` dans un `Modal`, présélectionné, sources limitées au périmètre) dans
      `MediaEventsList.tsx` et `MediaProjectsList.tsx` ; adapter `CollectionBuilder.tsx` avec les
      props `initialEventIds`, `initialProjectIds`, `scope`, `onCreated`.
      *(fichiers : `media/MediaEventsList.tsx`, `media/MediaProjectsList.tsx`,
      `media/collections/CollectionBuilder.tsx`)*
- [x] **T21** — Remplacer `src/app/(auth)/media/collections/page.tsx` par
      `redirect("/media")` ; supprimer les liens vers `/media/collections` restants dans l'UI (le
      cas échéant). *(fichier : `src/app/(auth)/media/collections/page.tsx`)*
- [x] **T22** [P] — Réécrire `src/app/(auth)/audio/page.tsx` (accueil `SpaceHome` via
      `getAudioSpaceCards`, redirection si une seule carte) et simplifier `audio/layout.tsx`
      (suppression de la barre d'onglets globale, fil d'Ariane vers l'accueil).
      *(fichiers : `src/app/(auth)/audio/page.tsx`, `src/app/(auth)/audio/layout.tsx`)*
- [x] **T23** [P] — Dans `DeptFunctionsClient.tsx` : ajouter l'entrée « Photos » (description :
      dépôt/validation/partage des photos d'événements, repli sur Production Média si non
      configurée) ; ajuster la description de Production Média (visuels + demandes de visuels).
      *(fichier : `src/app/(auth)/admin/departments/functions/DeptFunctionsClient.tsx`)*
- [x] **T24** [P] — Mettre à jour les textes du guide utilisateur et du tour guidé qui mentionnent
      Projets / Événements médias / Collections (`/guide`, `tour-steps`).
      *(fichiers : à identifier via `grep -rn "Événements médias\|Collections" src/app/(auth)/guide src/lib/tour-steps.ts`)*

### 5. Tests

- [x] **T25** — `src/lib/__tests__/auth-media-domain.test.ts` (nouveau) : `isMediaTeamMember` —
      membre `PHOTOS` (photos oui / visuels non), membre `PRODUCTION_MEDIA` avec et sans
      département `PHOTOS` configuré dans l'église, Communication (deux activités), `media:manage`,
      église tierce. *(fichier : `src/lib/__tests__/auth-media-domain.test.ts`)*
- [x] **T26** [P] — Mettre à jour les tests existants des gardes/routes à la nouvelle signature à
      `domain` obligatoire : `auth-media-collections.test.ts`, `media/files/[id]/__tests__/*`,
      `media/files/upload/__tests__/sign.test.ts`, `media-events/[id]/share/__tests__/security.test.ts`
      + cas « membre PHOTOS refusé sur un fichier de projet ».
      *(fichiers : tests listés)*
- [x] **T27** [P] — Mettre à jour `src/lib/__tests__/media-space.test.ts` : ordre et filtrage des
      cartes, carte Visuels visible via demandes seules, onglets internes Visuels.
      *(fichier : `src/lib/__tests__/media-space.test.ts`)*
- [x] **T28** — `src/modules/media/services/__tests__/shares.test.ts` (nouveau) : filtre actif
      (expiration passée exclue), filtre église, filtre périmètre (collection mixte masquée pour
      l'équipe Photos), `revokeShare` refusé hors périmètre et pour lien sensible sans `manage`.
      *(fichier : `src/modules/media/services/__tests__/shares.test.ts`)*
- [x] **T29** [P] — Ajouter un test sur `POST /api/admin/media/collections` : `403` si `eventIds`
      fourni sans périmètre photos (et symétrique pour `projectIds`/visuels).
      *(fichier : `src/app/api/admin/media/collections/__tests__/route.test.ts`)*
- [x] **T30** — Exécuter `npm run test` en entier et confirmer que `route-exhaustiveness.test.ts`
      passe toujours sans changement de manifeste (nouvelles routes `/api/media/shares` couvertes
      par le préfixe `/api/media`). *(vérification, pas de fichier dédié)*
- [ ] **T31** — Vérification manuelle dans le navigateur (dev-login + un département de fixture
      portant `PHOTOS`) : accueil Admin (3 cartes + bouton Partages), membre Photos (arrivée
      directe sur Photos, partage limité aux photos), Communication (partage mixte photos+visuels),
      STAR sur `/audio` (redirection directe vers (re)Écouter), anciens liens `/media/collections`,
      `/media/events/[id]` et `/media/projects/[id]`, rendu mobile des accueils et du tiroir
      Partages. *(vérification manuelle)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` (167 fichiers / 1770 tests, dont `routes-exhaustivite.test.ts`)
- [x] `bash scripts/check-prisma-boundary.sh`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits :
  - [x] Fonction « Photos » attribuable, distincte de Production Média (T2, T23)
  - [x] Équipe Photos seule : gère les photos, pas les visuels (T3, T4, T10, T19)
  - [x] Équipe Production Média seule : gère les visuels + demandes, pas les photos (T3, T4, T10, T19)
  - [x] Repli sur Production Média si fonction Photos non configurée (T3)
  - [x] Libellés métier Photos / Visuels / Partages (T15, T17, T19, T21)
  - [x] Accueil à cartes filtrées pour Communication & Production et Audio (T14, T15, T22)
  - [x] Redirection directe si une seule activité accessible (T15, T22)
  - [x] Partage en action dans Photos et Visuels, plus de « Collections » (T20, T21)
  - [x] Bouton Partages + compteur + liste (T15, T16, T9, T12)
  - [ ] Offres inchangé (aucune tâche ne le touche — vérification négative en T31, **non effectuée**)
  - [x] Partage limité au périmètre de la personne (T5, T9, T11, T20)
  - [x] Aucune régression de droits hors ajout Photos (T25, T26 — couverture automatisée ;
        T31 manuel non effectué)
  - [x] Anciens liens internes et externes fonctionnels (T18, T19, T21 — redirections/route
        groups vérifiés par le code et les tests ; confirmation visuelle T31 non effectuée)
- [ ] PR ouverte vers `main`
