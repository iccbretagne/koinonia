# Plan technique — Galerie médias

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-11-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe que `@/modules/media` (index) ; aucune
      nouvelle dépendance entre modules (`media` dépend déjà de `core`, `storage`)
- [x] **Sécurité** : toutes les routes passent par `requireAuth()` puis une garde dédiée
      `requireMediaGalleryAccess(churchId)` / `requireMediaGalleryGrantAccess(churchId)` ;
      `churchId` résolu par `getCurrentChurchId` (jamais optionnel) ; chaque média est filtré
      par `churchId` de son événement ou projet
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune nouvelle permission
- [x] **Validation** Zod sur les mutations (accès nominatifs, ZIP) et sur les filtres (query)
- [x] **Migration** Prisma : une table `media_gallery_grants`
- [x] **Enums** depuis `@/generated/prisma/client`
- [x] **UI** : `PageHeader`, `Button`, `IconButton`, `EmptyState`, `Skeleton`, `BottomSheet`,
      `BulkActionBar`, `Modal`/`ConfirmModal`, `Toast` réutilisés ; `CollectionBuilder`
      réutilisé pour « Partager une sélection »

## Approche générale

La galerie est une **vue de lecture** de plus sur les données existantes (`MediaPhoto`,
`MediaFile` + `MediaFileVersion`) : aucun média n'est copié, aucun statut ne change. Elle
s'ajoute comme **4e carte** de l'accueil `/media` (`buildMediaSpaceCards`), avec un champ
`gallery` dans `MediaSpaceAccess`, calculé aux trois endroits qui calculent déjà cet objet
(`resolveMediaSpaceAccess`, `(auth)/layout.tsx`, et la garde serveur).

La seule donnée nouvelle est l'**accès nominatif** (`MediaGalleryGrant`). Le reste est un
service de requête paginée (curseur) qui fusionne photos et visuels approuvés, triés par date.

Le partage d'une sélection **réutilise les collections** (`MediaShareToken` de type
`COLLECTION`) en ajoutant à leur configuration JSON deux listes facultatives `photoIds` /
`fileIds` qui restreignent la collection aux éléments choisis — rétrocompatible, sans
migration.

## Modèle de données

```prisma
/// Accès nominatif à la galerie médias (spec 080) : lecture et téléchargement, sans partage.
model MediaGalleryGrant {
  id          String    @id @default(cuid())
  churchId    String
  church      Church    @relation(fields: [churchId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation("MediaGalleryGrantee", fields: [userId], references: [id], onDelete: Cascade)
  grantedById String?
  grantedBy   User?     @relation("MediaGalleryGrantor", fields: [grantedById], references: [id], onDelete: SetNull)
  expiresAt   DateTime? // null = sans date de fin ; accès valide tant que expiresAt > now
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([churchId, userId])
  @@index([userId])
  @@map("media_gallery_grants")
}
```

- Retrait = suppression de la ligne (l'historique est dans `audit_logs` via `logAudit`).
- Expiration évaluée **à la lecture** (`expiresAt > now`) : pas de tâche cron. Les lignes
  expirées restent visibles dans la gestion (« expiré le … »), supprimables.
- Index de lecture pour la grille : `media_photos(status, uploadedAt)` existe partiellement ;
  on ajoute `@@index([mediaEventId, status, uploadedAt])` seulement si l'analyse de requête le
  justifie (voir Risques). Pas d'autre changement.
- Migration : `prisma migrate dev --name media_gallery_grants`.

## Droits

`MediaSpaceAccess.gallery` (nouveau) est vrai si :

1. Super Admin, ou permission `media:view` dans l'église (Admin, Secrétaire) ;
2. membre d'une équipe Photos, Production Média ou Communication (`isMediaTeamMember` ×2,
   `isCommunicationMember`) ;
3. **Ministre** dont `UserChurchRole.ministryId` est le ministère d'un département de fonction
   `PHOTOS`, `PRODUCTION_MEDIA` ou `COMMUNICATION` de l'église ;
4. titulaire d'un `MediaGalleryGrant` non expiré dans l'église.

Gardes ajoutées dans `src/lib/auth.ts` (même famille que `requireMediaAccess`) :

- `requireMediaGalleryAccess(churchId)` → `{ session, grantOnly: boolean }` — `grantOnly`
  vrai quand seul le point 4 s'applique (masque le partage).
- `requireMediaGalleryGrantAccess(churchId)` — gérer les accès nominatifs : Super Admin,
  rôle `ADMIN` de l'église, ou Ministre au sens du point 3.
- `isMediaMinister(session, churchId)` — point 3, une requête `department.count`.

Le **partage** reste gouverné par `requireMediaCollectionAccess` + `getMediaShareScope`
(inchangés) : un Ministre ou un titulaire d'accès nominatif sans équipe n'a pas de bouton
« Partager ». Le **téléchargement** (unitaire et ZIP) est ouvert à tout accès galerie.

Navigation : le lien « Communication & Production » de `(auth)/layout.tsx` doit apparaître
quand seule la carte Galerie est accessible. Le layout calcule déjà l'appartenance aux équipes
sans requête supplémentaire ; on y ajoute **une** requête légère (existence d'un
`MediaGalleryGrant` valide + Ministre média), uniquement si les autres conditions sont fausses.
Avec une seule carte, `/media` redirige déjà directement (`cards.length === 1`).

## API

Préfixe `/api/media/library` (le préfixe `/api/media/gallery` est **public**, pris par les
liens de partage par jeton — à ne pas réutiliser). Chaque route a son `contract.ts`.

| Endpoint | Méthode | Garde | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/media/library` | GET | `requireMediaGalleryAccess` | query : `type` (`all`/`photos`/`visuals`), `from`, `to` (dates ISO), `sourceType` + `sourceId` (événement/projet), `q` (≤ 100 car.), `order` (`desc`/`asc`), `cursor`, `limit` (≤ 60) | `{ items: GalleryItem[], nextCursor, total }` |
| `/api/media/library/sources` | GET | `requireMediaGalleryAccess` | `q` | événements et projets ayant au moins un média approuvé (filtre « Événement ou projet ») |
| `/api/media/library/[kind]/[id]/download` | GET | `requireMediaGalleryAccess` | `kind` ∈ `photo`/`file` | redirection 302 vers `getSignedDownloadUrl` (original HD) |
| `/api/media/library/zip` | POST | `requireMediaGalleryAccess` | `{ photoIds: string[], fileIds: string[] }` (≤ 200 au total) | ZIP en flux (`archiver`, même code que la collection) |
| `/api/media/library/grants` | GET | `requireMediaGalleryGrantAccess` | — | accès nominatifs de l'église (nom, email, date de fin, accordé par, expiré ?) |
| `/api/media/library/grants` | POST | `requireMediaGalleryGrantAccess` | `{ userId, expiresAt?: date future \| null }` | grant créé ou mis à jour (upsert) — 400 si le compte n'a aucun rôle dans l'église |
| `/api/media/library/grants/[id]` | PATCH | idem | `{ expiresAt: date future \| null }` | grant |
| `/api/media/library/grants/[id]` | DELETE | idem | — | 204 |

`GalleryItem` : `{ kind: "photo" | "file", id, filename, date, width, height, thumbnailUrl,
source: { type: "event" | "project", id, name } }`.

Modifiée (rétrocompatible) :

- `POST /api/admin/media/collections` accepte `photoIds?`/`fileIds?` ; vérifie qu'ils
  appartiennent aux `eventIds`/`projectIds` fournis et à l'église (400 sinon).
- `resolveCollectionData`, `collection/[token]/photo|file/[id]`, `collection/[token]/zip` :
  quand `photoIds`/`fileIds` sont présents dans la config, ils restreignent les éléments
  visibles et téléchargeables.

Après ajout des contrats : `npm run openapi`. Routes déclarées : `/media/galerie` est couvert
par `authenticated: [{ path: "/media" }]`, `/api/media/library` par `api: [{ path: "/api/media" }]`
— aucun nouveau préfixe, `route-exhaustiveness.test.ts` reste vert.

## Services / logique métier

`src/modules/media/services/library.ts` (exporté par l'index) :

- `listLibraryItems(churchId, filters, cursor)` :
  - photos : `MediaPhoto` `status = APPROVED`, `mediaEvent.churchId = churchId` ; date de
    référence = `mediaEvent.date` (spec) ;
  - visuels : `MediaFile` `type = VISUAL`, statut ∈ `APPROVED_FILE_STATUSES`
    (`APPROVED`, `FINAL_APPROVED`, déjà utilisé par les partages — voir Décisions), rattaché
    à un projet ou événement de l'église ; dernière version (`versions` desc, take 1) ; date
    de référence = `createdAt` de cette dernière version (« date de dépôt », spec) ;
  - fusion triée côté serveur : deux requêtes bornées à `limit + 1` chacune, ordonnées par
    `(date, id)`, fusionnées puis coupées à `limit` ; curseur opaque encodé
    `base64(date|kind|id)` → reprise stable sans doublon ;
  - URL de vignette signée (`getSignedThumbnailUrl`, 1 h) calculée pour la page seulement ;
  - `total` : deux `count` avec les mêmes filtres.
- `listLibrarySources(churchId, q)` : événements/projets avec au moins un média approuvé.
- `resolveLibraryZipEntries(churchId, photoIds, fileIds)` : revérifie église et statut, rend
  `ZipEntry[]` ; le flux ZIP est factorisé avec `collection/[token]/zip` (fonction
  `streamZip` déplacée dans `src/app/api/media/_zip.ts`).
- `listGalleryGrants`, `upsertGalleryGrant`, `updateGalleryGrant`, `deleteGalleryGrant`,
  `hasValidGalleryGrant(churchId, userId)` — chaque mutation `logAudit`
  (`entityType: "MediaGalleryGrant"`), et l'ajout notifie la personne via
  `createNotification({ domain: "media", type: "MEDIA_GALLERY_GRANTED", title, message,
  link: "/media/galerie" })` (préférence email respectée, push selon spec 068).

`src/lib/media-space.ts` : champ `gallery` dans `MediaSpaceAccess` ; carte
`{ href: "/media/galerie", title: "Galerie" }` en 4e position ; compteur de la carte =
nombre de médias disponibles (`getMediaSpaceCounters`, une requête `count` × 2).

## UI / composants

Page `src/app/(auth)/media/galerie/page.tsx` (serveur) : garde, première page de résultats
rendue côté serveur (filtres lus dans `searchParams`), droits (`canShare`, `canManageGrants`)
passés au client. `loading.tsx` en `Skeleton` de grille.

`GalleryClient.tsx` (client) :

- **En-tête** `PageHeader` « Galerie » + compteur ; bouton « Gérer les accès » si
  `canManageGrants`.
- **Barre de filtres** collante : segment Tous / Photos / Visuels ; « Période » et
  « Événement ou projet » en `BottomSheet` sur mobile, menu déroulant sur desktop ; champ de
  recherche ; tri (plus récent / plus ancien). Filtres actifs en pastilles retirables.
  L'état vit dans l'URL (`router.replace` + `useSearchParams`), donc partageable.
- **Grille** : groupes par mois (`Intl.DateTimeFormat("fr-FR", { month: "long", year:
  "numeric" })`), 3 colonnes mobile → 4/6 desktop, vignettes carrées `object-cover`
  (`next/image` non optimisé, comme les écrans existants), `loading="lazy"`. Défilement
  continu par `IntersectionObserver` sur une sentinelle, avec bouton « Charger plus » en
  repli (accessibilité, absence d'IO).
- **Visionneuse** : extraite de `PhotoLightbox` (`MediaEventDetail.tsx`) en un composant
  partagé `src/components/media/MediaLightbox.tsx` (balayage tactile, flèches clavier,
  Échap, focus piégé) — fond toujours sombre (exception `eslint-disable` déjà documentée
  pour les visionneuses). Pied : nom, date, origine, « Télécharger », « Voir dans
  l'événement / le projet » (si l'utilisateur a accès à cette activité).
- **Sélection** : bouton « Sélectionner » → cases sur les vignettes, `BulkActionBar` en bas :
  « Télécharger (N) » (ZIP, désactivé au-delà de 200 avec message), « Partager » si
  `canShare` → `CollectionBuilder` en `Modal`, prérempli (`initialEventIds`,
  `initialProjectIds`, nouvelles props `photoIds`/`fileIds`, `lockedScope` selon la
  sélection et le périmètre).
- **Gestion des accès** : `Modal` (ou `BottomSheet` mobile) listant les accès ; ajout par
  recherche de compte de l'église (route existante de recherche d'utilisateurs de l'église,
  sinon `listChurchUsers` minimal dans la route grants) + date de fin facultative ;
  modification de la date ; retrait avec `ConfirmModal`.
- **États vides** : `EmptyState` « Aucun média validé pour l'instant » / « Aucun résultat »
  + « Effacer les filtres ».

Intégration :

- `buildMediaSpaceCards` : carte Galerie (4e) ; `MediaHomeClient` inchangé (rend les cartes).
- `GuideContent.tsx` : une phrase sur la galerie dans la section Communication & Production.
- Assistant : fiche KB (`src/modules/assistant/knowledge/`), audience = accès galerie.
- `CLAUDE.md` (spécificités espace Communication & Production), `docs/database.md`,
  `CHANGELOG.md`.

## Décisions & alternatives écartées

- **Choix** : visuels = `APPROVED` **et** `FINAL_APPROVED` (`APPROVED_FILE_STATUSES`). —
  *Pourquoi* : c'est la définition de « visuel validé » déjà appliquée par tous les partages
  (collection, téléchargement) ; un visuel approuvé par le lien de validation (`APPROVED`)
  sans passage en finale serait sinon partageable mais absent de la galerie. **Écart avec la
  spec** (« approuvés définitivement ») à valider.
- **Choix** : accès nominatif dans une table dédiée, pas un rôle. — *Pourquoi* : la spec veut
  un accès à une seule fonction, daté, donné par un Ministre ; un rôle d'église serait trop
  large et hors de portée du Ministre (`canGrantRole`).
- **Écarté** : un lien de partage `GALLERY` sans expiration pour les personnes nommées. —
  *Raison* : c'est précisément ce que la spec veut supprimer (liens à entretenir, accès sans
  compte, pas de retrait nominatif).
- **Choix** : pagination par curseur, fusion de deux requêtes. — *Pourquoi* : `OFFSET` se
  dégrade et produit des doublons quand des médias arrivent pendant le défilement ; une vue
  SQL `UNION` imposerait du SQL brut pour un gain faible.
- **Écarté** : pré-générer toutes les URLs signées (comme `events/[id]/page.tsx`). —
  *Raison* : volume illimité ; on signe seulement la page servie.
- **Choix** : ZIP synchrone en flux plafonné à 200 éléments. — *Pourquoi* : même mécanisme
  éprouvé que les collections ; `MediaZipJob` (asynchrone) est lié à un jeton et un
  événement unique.
- **Choix** : restreindre une collection par `photoIds`/`fileIds` dans sa config JSON. —
  *Pourquoi* : le partage d'une **sélection** fine n'existe pas (collections = événements
  entiers) ; l'extension est rétrocompatible, sans nouveau type de jeton ni migration.
- **Écarté** : nouvelle permission `media:gallery`. — *Raison* : l'accès est une
  combinaison d'équipes, de Ministre et d'accès nominatifs, comme le reste de l'espace
  (spec 049) ; une permission de rôle ne l'exprime pas.
- **Pas d'ADR** : décision interne au module `media`, sans nouveau pattern transverse.

## Risques & points d'attention

- **Performance de la fusion** sur de gros volumes : vérifier les plans de requête
  (`EXPLAIN`) sur les données de démo multipliées ; ajouter l'index composé seulement si
  nécessaire.
- **Tri des photos par date d'événement** : toutes les photos d'un événement ont la même
  date ; ordre secondaire stable par `uploadedAt` puis `id`.
- **Navigation** : une requête de plus dans `(auth)/layout.tsx` (chemin chaud) — limitée aux
  comptes sans autre accès média, et indexée (`@@unique([churchId, userId])`).
- **Rétrocompatibilité des collections** : une config sans `photoIds`/`fileIds` doit se
  comporter exactement comme avant (tests existants `zip-routes.test.ts` et ajout).
- **Fuite entre églises** : toute requête filtre `churchId` via l'événement ou le projet ;
  les IDs reçus (ZIP, collection, grants) sont revérifiés.
- **Visionneuse extraite** : ne pas régresser `MediaEventDetail` (actions de suppression
  passées en props).
- **Accès en lecture du Ministre au clic « Voir dans l'événement »** : il n'a pas forcément
  accès à l'écran Photos/Visuels ; le lien n'est affiché que si l'activité est accessible.

## Stratégie de tests

Vitest, mocks Prisma comme les tests média existants :

- `library.test.ts` : filtrage par statut (photos `APPROVED` seulement ; visuels
  `APPROVED`/`FINAL_APPROVED`, `VISUAL` seulement), filtre église, filtres type / période /
  source / recherche, tri asc/desc, fusion + curseur (pas de doublon ni de trou sur 3 pages),
  dernière version d'un visuel et sa date de dépôt.
- `gallery-access.test.ts` : chaque chemin d'accès (media:view, équipes, Ministre média,
  grant valide, grant expiré refusé, autre église refusée, Ministre d'un autre ministère
  refusé) ; `grantOnly` ; gestion des accès réservée à Admin / Ministre média / Super Admin.
- Routes `library` : 403 sans droit, Zod des filtres (400), ZIP > 200 refusé, ZIP d'un ID
  d'une autre église ou non approuvé ignoré/refusé, téléchargement redirige vers une URL
  signée.
- Routes `grants` : création (notification envoyée, `logAudit`), date passée refusée,
  compte hors église refusé, modification, suppression journalisée.
- Collections : config avec `photoIds`/`fileIds` restreint `resolveCollectionData`, la
  photo unitaire et le ZIP ; config sans eux inchangée.
- `media-space.test.ts` : carte Galerie en 4e position, redirection si seule carte.
- Vérification manuelle (Playwright, script de scratchpad) : mobile 390 px clair/sombre,
  défilement, visionneuse au doigt, sélection + ZIP, accès nominatif de bout en bout.
