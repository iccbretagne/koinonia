# Tâches — Galerie médias

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [ ] Branche de travail à jour depuis `main`
- [ ] Migration Prisma générée (`media_gallery_grants`)

## Tâches

### 1. Données & migration

- [ ] **T1** — Modèle `MediaGalleryGrant` (`churchId`, `userId`, `grantedById?`, `expiresAt?`,
      `@@unique([churchId, userId])`, `@@index([userId])`) + relations inverses `Church` et
      `User` (`MediaGalleryGrantee`, `MediaGalleryGrantor`) ; migration
      `media_gallery_grants` *(fichiers : `prisma/schema.prisma`, `prisma/migrations/…`)*

### 2. Droits

- [ ] **T2** — `isMediaMinister(session, churchId)` (Ministre dont `ministryId` porte un
      département `PHOTOS`/`PRODUCTION_MEDIA`/`COMMUNICATION`), `requireMediaGalleryAccess`
      (→ `{ session, grantOnly }`, accès nominatif non expiré compris) et
      `requireMediaGalleryGrantAccess` (Super Admin, `ADMIN` de l'église, Ministre média)
      *(fichier : `src/lib/auth.ts`)*
- [ ] **T3** — Champ `gallery` dans `MediaSpaceAccess`, calculé dans
      `resolveMediaSpaceAccess` ; carte `{ href: "/media/galerie", title: "Galerie" }` en 4e
      position dans `buildMediaSpaceCards` ; compteur « N médias » dans
      `getMediaSpaceCounters` et `pendingStats` de `/media/page.tsx`
      *(fichiers : `src/lib/media-space.ts`, `src/app/(auth)/media/page.tsx`)*
- [ ] **T4** — `(auth)/layout.tsx` : `gallery` dans `mediaSpaceAccess` ; requête unique
      (accès nominatif valide ou Ministre média) seulement si aucun autre accès média, pour
      afficher « Communication & Production » *(fichier : `src/app/(auth)/layout.tsx`)*

### 3. Logique métier (services)

- [ ] **T5** — `listLibraryItems(churchId, filters, cursor, limit)` : photos `APPROVED`
      (date = date d'événement), visuels `VISUAL` en `APPROVED`/`FINAL_APPROVED` (dernière
      version, date = dépôt de cette version), filtres type/période/source/recherche, tri
      asc/desc, fusion bornée + curseur opaque `date|kind|id`, vignettes signées pour la
      page, `total` *(fichier : `src/modules/media/services/library.ts`)*
- [ ] **T6** [P] — `listLibrarySources(churchId, q)` et
      `resolveLibraryZipEntries(churchId, photoIds, fileIds)` (revérifie église + statut)
      *(fichier : `src/modules/media/services/library.ts`)*
- [ ] **T7** [P] — Accès nominatifs : `listGalleryGrants`, `upsertGalleryGrant`,
      `updateGalleryGrant`, `deleteGalleryGrant`, `hasValidGalleryGrant` ; `logAudit` sur
      chaque mutation ; notification `MEDIA_GALLERY_GRANTED` (domaine `media`) à l'ajout
      *(fichier : `src/modules/media/services/gallery-grants.ts`)*
- [ ] **T8** — Exports des nouveaux services et types dans l'index du module
      *(fichier : `src/modules/media/index.ts`)*
- [ ] **T9** — Collections : `CollectionConfig` accepte `photoIds?`/`fileIds?` ;
      `resolveCollectionData` les applique ; config sans eux inchangée
      *(fichier : `src/modules/media/services/tokens.ts`)*

### 4. API (route handlers + contrats)

- [ ] **T10** — Factoriser `streamZip` et le type `ZipEntry` dans un helper partagé, utilisé
      par `collection/[token]/zip` *(fichiers : `src/app/api/media/_zip.ts`,
      `src/app/api/media/collection/[token]/zip/route.ts`)*
- [ ] **T11** — `GET /api/media/library` (filtres validés par Zod) et
      `GET /api/media/library/sources` *(fichiers : `src/app/api/media/library/route.ts`,
      `contract.ts`, `src/app/api/media/library/sources/route.ts`, `contract.ts`)*
- [ ] **T12** [P] — `GET /api/media/library/[kind]/[id]/download` : contrôle église +
      statut, redirection vers l'URL signée de l'original HD
      *(fichiers : `src/app/api/media/library/[kind]/[id]/download/route.ts`, `contract.ts`)*
- [ ] **T13** [P] — `POST /api/media/library/zip` (≤ 200 éléments, sinon 400)
      *(fichiers : `src/app/api/media/library/zip/route.ts`, `contract.ts`)*
- [ ] **T14** [P] — `GET`/`POST /api/media/library/grants`, `PATCH`/`DELETE
      /api/media/library/grants/[id]` (date future ou null, compte ayant un rôle dans
      l'église) *(fichiers : `src/app/api/media/library/grants/route.ts`, `[id]/route.ts`,
      `contract.ts`)*
- [ ] **T15** — Collections : `POST /api/admin/media/collections` accepte et vérifie
      `photoIds`/`fileIds` ; `collection/[token]/photo|file/[id]` et `collection/[token]/zip`
      les appliquent *(fichiers : `src/app/api/admin/media/collections/route.ts` +
      `contract.ts`, `src/app/api/media/collection/[token]/…`)*
- [ ] **T16** — `npm run openapi` et commit de `docs/openapi.json`

### 5. UI

- [ ] **T17** — Extraire la visionneuse de `MediaEventDetail` en
      `src/components/media/MediaLightbox.tsx` (balayage, clavier, Échap, focus piégé,
      actions passées en props) ; `MediaEventDetail` l'utilise sans changement visible
      *(fichiers : `src/components/media/MediaLightbox.tsx`,
      `src/app/(auth)/media/events/[id]/MediaEventDetail.tsx`)*
- [ ] **T18** — Page serveur `/media/galerie` (garde, première page selon `searchParams`,
      droits `canShare`/`canManageGrants`) + `loading.tsx` en `Skeleton`
      *(fichiers : `src/app/(auth)/media/galerie/page.tsx`, `loading.tsx`)*
- [ ] **T19** — `GalleryClient` : en-tête, barre de filtres collante (segment, période,
      source en `BottomSheet` mobile, recherche, tri), pastilles, état dans l'URL
      *(fichier : `src/app/(auth)/media/galerie/GalleryClient.tsx`)*
- [ ] **T20** — Grille groupée par mois, défilement continu (`IntersectionObserver`) +
      « Charger plus » en repli, états vides `EmptyState`
      *(fichier : `src/app/(auth)/media/galerie/GalleryClient.tsx`)*
- [ ] **T21** — Visionneuse dans la galerie : nom, date, origine, « Télécharger »,
      « Voir dans l'événement / le projet » si l'activité est accessible
      *(fichier : `src/app/(auth)/media/galerie/GalleryClient.tsx`)*
- [ ] **T22** — Sélection : cases, `BulkActionBar` (« Télécharger (N) » ZIP, limite 200,
      « Partager » si `canShare`) ; `CollectionBuilder` en `Modal` avec nouvelles props
      `photoIds`/`fileIds` *(fichiers : `GalleryClient.tsx`,
      `src/app/(auth)/media/collections/CollectionBuilder.tsx`)*
- [ ] **T23** [P] — Gestion des accès nominatifs : liste, ajout (recherche de compte de
      l'église + date de fin), modification, retrait avec `ConfirmModal`
      *(fichier : `src/app/(auth)/media/galerie/GalleryGrantsDialog.tsx`)*

### 6. Documentation & assistant

- [ ] **T24** [P] — Guide (section Communication & Production) et fiche de l'assistant
      (audience : accès galerie) *(fichiers : `src/components/GuideContent.tsx`,
      `src/modules/assistant/knowledge/…`)*
- [ ] **T25** [P] — `CLAUDE.md` (espace Communication & Production), `docs/database.md`,
      `CHANGELOG.md` (Non publié), statut de la spec à `Implémentée`

### 7. Tests

- [ ] **T26** — `library.test.ts` : statuts, église, filtres, tri, fusion + curseur sur 3
      pages sans doublon ni trou, dernière version et date de dépôt d'un visuel
      *(fichier : `src/modules/media/services/__tests__/library.test.ts`)*
- [ ] **T27** [P] — `gallery-grants.test.ts` : upsert, date passée refusée, journalisation,
      notification à l'ajout, expiration *(fichier :
      `src/modules/media/services/__tests__/gallery-grants.test.ts`)*
- [ ] **T28** [P] — Accès : `media:view`, chaque équipe, Ministre média, accès nominatif
      valide / expiré, autre église, Ministre d'un autre ministère ; `grantOnly` ; gestion des
      accès réservée *(fichier : `src/lib/__tests__/media-gallery-access.test.ts`)*
- [ ] **T29** [P] — Routes `library` : 403 sans droit, 400 Zod, ZIP > 200 refusé, ID d'une
      autre église ou non validé exclu, téléchargement redirigé ; routes `grants`
      *(fichier : `src/app/api/media/__tests__/library-routes.test.ts`)*
- [ ] **T30** [P] — Collections restreintes (`photoIds`/`fileIds`) et non-régression sans
      restriction *(fichier : `src/app/api/media/__tests__/zip-routes.test.ts` + test de
      `resolveCollectionData`)*
- [ ] **T31** [P] — `media-space` : carte Galerie en 4e position, champ `gallery`,
      redirection si seule carte *(fichier : `src/lib/__tests__/media-space.test.ts`)*
- [ ] **T32** — Vérification manuelle Playwright (script de scratchpad) : mobile 390 px clair
      et sombre, défilement, filtres dans l'URL, visionneuse, sélection + ZIP, partage,
      accès nominatif de bout en bout (ajout → carte seule → retrait)

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run openapi` sans diff restant
- [ ] Critères d'acceptation de `spec.md` relus un par un
- [ ] PR vers `main` (sur demande)

## Couverture des critères d'acceptation

| Critère | Tâches |
|---|---|
| Carte Galerie pour les bons accès et personne d'autre | T2, T3, T4, T28, T31 |
| Adresse directe refusée sans droit | T2, T18, T29 |
| Seulement photos approuvées et visuels validés (dernière version), église courante | T5, T26 |
| Grille par mois, tri, chargement au défilement | T5, T20, T26 |
| Filtres combinés et conservés dans l'adresse | T5, T11, T19, T32 |
| Visionneuse : navigation, téléchargement HD, lien vers l'origine | T12, T17, T21 |
| Sélection : ZIP ; partage seulement si droit | T13, T15, T22, T29, T30 |
| Accès nominatif donné/retiré par Admin ou Ministre, date de fin, notification | T7, T14, T23, T27 |
| Accès nominatif en lecture seule (téléchargement, sans partage), expire | T2, T22, T27, T28 |
| Journalisation des accès nominatifs | T7, T27 |
| Charte, thèmes clair/sombre, téléphone | T19–T23, T32 |
| Écrans existants inchangés | T10, T17, T30 |
