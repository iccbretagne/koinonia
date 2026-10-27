# Tâches — Changer l'icône de l'application depuis Koinonia

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [ ] Branche de travail à jour depuis `main`, après fusion de la PR #703 (spec 068), qui
  apporte le script d'icônes, les icônes par défaut et le service worker modifié.

## Tâches

### 1. Données & migration

- [ ] **T1** — Modèle `AppIconVariant`, avec la relation `updatedBy` (`onDelete: SetNull`) et
  la relation inverse `appIconsUpdated` sur `User`. *(fichier : `prisma/schema.prisma`)*
- [ ] **T2** — Migration `add_app_icon`, qui ne fait que créer la table `app_icon_variants`.
  Régénérer ensuite le client. *(fichiers : `prisma/migrations/<horodatage>_add_app_icon/`,
  `src/generated/prisma/`)*

### 2. Rendu et logique (module `core`)

- [ ] **T3** [P] — Rendu pur sur buffers :
  - `fillCorners(buffer, background)` : masque arrondi intérieur sur fond plein ;
  - `renderAppIconVariants(buffer, background)` : `icon-192`, `icon-512`,
    `icon-maskable-512` (zone sûre de 72 %), `apple-touch-180`, `favicon-48` ;
  - `renderBadge(buffer)` : seule l'opacité est gardée, rendue en blanc, à 96 px ;
  - `suggestBackground(buffer)` : couleur médiane d'une bande prise à 8 % des bords, hors
    coins.

  *(fichier : `src/modules/core/services/app-icon-render.ts`)*
- [ ] **T4** — Rebrancher `scripts/generate-app-icons.mjs` sur `app-icon-render.ts`, exécuté
  via `tsx`. Générer une fois `public/brand/badge-bell-96.png`, la cloche blanche du badge
  générique. Les PNG par défaut doivent rester identiques au pixel près, sauf écart assumé.
  *(fichiers : `scripts/generate-app-icons.mjs` → `.ts`, `public/brand/badge-bell-96.png`,
  `package.json` pour un script `icons`)*
- [ ] **T5** — Contrôles de dépôt :
  - `normalizeAppIcon(buffer)` :
    - 5 Mo au plus, contrôlé avant décodage ;
    - format **décodé** PNG, JPEG ou WebP ;
    - `limitInputPixels` et `failOn: "error"` ;
    - carré à 2 % près, 512 px au moins.
  - `normalizeBadge(buffer)` : PNG ou WebP avec canal alpha.
  - Chaque refus donne une `ApiError(400)` avec un message explicite.

  *(fichier : `src/modules/core/services/app-icon.ts`)*
- [ ] **T6** — État et écriture :
  - `getAppIconState()` : personnalisée ou non, version, fond, badge présent, auteur, date, et
    les 20 derniers `AuditLog` dont `entityType` vaut `"AppIcon"` ;
  - `previewAppIcon(buffer, background?)` : variantes en data URL, sans écriture ;
  - `setAppIcon(buffer, background, actor)` : transaction qui remplace les cinq variantes,
    avec une nouvelle `version`, le badge étant conservé ;
  - `setAppIconBadge(buffer, actor)` ;
  - `removeAppIcon("icon" | "badge", actor)` ;
  - `logAudit` en `CREATE`, `UPDATE` ou `DELETE`, avec `entityType: "AppIcon"` et sans
    `churchId`.

  *(fichier : `src/modules/core/services/app-icon.ts`)*
- [ ] **T7** — Lecture publique :
  - `getAppIconVariant(variant)` ;
  - `getAppIconVersion()`, avec un cache mémoire de 60 s, invalidé à l'écriture dans le même
    processus ;
  - `appIconUrl(variant, version)` ;
  - `defaultAppIconPath(variant, custom)` :
    - fichier livré dans `public/brand/` ;
    - **cloche** pour `badge-96` si l'icône est personnalisée sans badge.
  - Export de l'ensemble par l'index du module.

  *(fichiers : `src/modules/core/services/app-icon.ts`, `src/modules/core/index.ts`)*

### 3. API & routes

- [ ] **T8** — Manifeste `core` :
  - `/admin/app-icon` en `authenticated` ;
  - `/api/admin/app-icon` en `api` ;
  - `/api/app-icon` en `public`, avec `method: "GET"`.

  *(fichier : `src/modules/core/manifest.ts`)*
- [ ] **T9** — Contrats (ADR-0023) :
  - `/api/admin/app-icon` : GET, PUT `multipart`, DELETE avec `{ target }` ;
  - `/api/admin/app-icon/preview` : POST `multipart` ;
  - `/api/app-icon/[variant]` : GET ;
  - `/api/app-icon/manifest` : GET.

  Schémas Zod : `backgroundSchema` (`#rrggbb`) et `deleteSchema`. *(fichiers :
  `src/app/api/admin/app-icon/contract.ts`, `.../preview/contract.ts`,
  `src/app/api/app-icon/[variant]/contract.ts`, `src/app/api/app-icon/manifest/contract.ts`)*
- [ ] **T10** — Routes d'administration, toutes derrière `requireSuperAdmin()` :
  - `GET` : renvoie l'état ;
  - `PUT` : `formData`, avec les fichiers `icon` et `badge` facultatifs mais au moins un, et
    `background` validé par Zod ;
  - `DELETE` : retrait de l'icône ou du badge ;
  - `POST preview`.

  *(fichiers : `src/app/api/admin/app-icon/route.ts`, `.../preview/route.ts`)*
- [ ] **T11** — Route publique `/api/app-icon/[variant]` :
  - `await params` ;
  - variante dans la liste fermée (avec ou sans `.png`), sinon `404` ;
  - icône déposée : PNG avec `Cache-Control` immuable si `?v=` égale la version, sinon
    `max-age=300`, plus `X-Content-Type-Options: nosniff` ;
  - sinon : `302` vers le fichier par défaut.

  *(fichier : `src/app/api/app-icon/[variant]/route.ts`)*
- [ ] **T12** — Route `/api/app-icon/manifest` : le contenu de `public/manifest.json`, avec les
  icônes `/api/app-icon/<variante>.png?v=<version>`, en `application/manifest+json` et
  `max-age=300`. Suppression de `public/manifest.json`. *(fichiers :
  `src/app/api/app-icon/manifest/route.ts`, `public/manifest.json`)*
- [ ] **T13** — `npm run openapi` et commit de `docs/openapi.json`. Vérifier
  `route-exhaustiveness.test.ts` et le seuil de `lint:prisma-boundary`, qui ne doit pas
  monter : les routes passent par le service.

### 4. UI & PWA

- [ ] **T14** — Root layout, en `generateMetadata` ou en lecture de version dans le layout :
  - `manifest` vaut `/api/app-icon/manifest?v=<version>` ;
  - l'icône et l'`apple-touch-icon` pointent vers `/api/app-icon/...?v=<version>`.

  *(fichier : `src/app/layout.tsx`)*
- [ ] **T15** [P] — Service worker :
  - icône et badge de notification en `/api/app-icon/icon-192.png` et `/badge-96.png` ;
  - liste du cache statique sans `public/manifest.json` ;
  - `CACHE_NAME` passe à `koinonia-v5`.

  *(fichier : `public/sw.js`)*
- [ ] **T16** — Page serveur `/admin/app-icon` : `requireAuth`, puis redirection vers `/admin`
  si l'utilisateur n'est pas Super Admin, puis `getAppIconState()`, avec `PageHeader`.
  *(fichier : `src/app/(auth)/admin/app-icon/page.tsx`)*
- [ ] **T17** [P] — Composant `AppIconPreview` : quatre formes à partir des variantes, avec des
  tokens sémantiques seulement.
  - **iPhone** : coins `rounded-[22%]` ;
  - **Android** : masque rond sur la variante masquable ;
  - **onglet** : favicon en 16 et 32 px ;
  - **notification** : badge blanc sur fond sombre, à côté de l'icône.
  - Le fond sombre de la notification est représentatif d'Android : une exception ESLint est
    documentée si nécessaire.

  *(fichier : `src/app/(auth)/admin/app-icon/AppIconPreview.tsx`)*
- [ ] **T18** — Composant client `AppIconClient` :
  - **icône en vigueur**, avec un `StatusChip` « Par défaut » ou « Personnalisée » ;
  - **dépôt** : sélection du fichier, puis `preview`, puis aperçu, couleur de fond (type
    couleur et champ hexadécimal), aide « bonne icône » et « Enregistrer l'icône » ;
  - **badge** facultatif, avec son aperçu, et « Retirer la silhouette » ;
  - **« Revenir à l'icône par défaut »**, avec `ConfirmModal` ;
  - `Alert` sur la limite iPhone et sur la mise à jour Android en quelques jours, avec un texte
    d'annonce à copier ;
  - **historique** des 20 derniers changements ;
  - retours par `useToast`.

  *(fichier : `src/app/(auth)/admin/app-icon/AppIconClient.tsx`)*
- [ ] **T19** — Navigation : entrée « Icône de l'application » en `superAdminOnly` dans
  `configLinksDef`, et `CONFIG_BLOCKS["/admin/app-icon"] = "Plateforme"`. Mettre à jour les
  instantanés `layout-props`. *(fichiers : `src/app/(auth)/layout.tsx`,
  `src/lib/navigation.ts`)*

### 5. Tests

- [ ] **T20** [P] — `app-icon-render.test.ts`, avec `sharp` réel sur des images générées en
  mémoire :
  - dimensions de chaque variante ;
  - pixel d'angle égal à la couleur de fond, sans transparence ;
  - badge blanc, alpha conservé ;
  - `suggestBackground` sur une image à coins blancs et fond violet.

  *(fichier : `src/modules/core/services/__tests__/app-icon-render.test.ts`)*
- [ ] **T21** — `app-icon.test.ts`, avec Prisma mocké :
  - refus : SVG, GIF, image non carrée, image de moins de 512 px, fichier de plus de 5 Mo,
    fichier qui n'est pas une image, badge sans alpha. Aucune écriture dans ces cas ;
  - `setAppIcon` : remplacement transactionnel, nouvelle version, badge conservé, journal ;
  - `removeAppIcon("icon")` et `("badge")` ;
  - `defaultAppIconPath` : badge générique sous icône personnalisée ;
  - cache de version invalidé à l'écriture.

  *(fichier : `src/modules/core/services/__tests__/app-icon.test.ts`)*
- [ ] **T22** — Routes d'administration :
  - `403` pour un Admin d'église et pour un Secrétaire ;
  - `200` pour un Super Admin ;
  - `400` sur une image refusée, sans changement ;
  - `400` sur un `background` invalide ;
  - DELETE.

  *(fichier : `src/app/api/admin/app-icon/__tests__/route.test.ts`)*
- [ ] **T23** — Routes publiques :
  - variante inconnue : `404` ;
  - sans icône : `302` vers le défaut ;
  - avec icône : PNG et en-têtes de cache ;
  - badge absent sous icône personnalisée : `302` vers la cloche ;
  - manifeste avec des icônes versionnées.

  *(fichiers : `src/app/api/app-icon/[variant]/__tests__/route.test.ts`,
  `src/app/api/app-icon/manifest/__tests__/route.test.ts`)*

### 6. Documentation & livraison

- [ ] **T24** [P] — `docs/database.md` (table `app_icon_variants`), `docs/design-system/README.md`
  (icône réglable : script pour l'icône par défaut, écran pour l'instance) et `CLAUDE.md`
  (paragraphe court dans « Spécificités de l'Admin d'église », côté plateforme).
- [ ] **T25** [P] — Guide utilisateur : entrée « Icône de l'application », réservée au Super
  Admin. *(fichier : `src/components/GuideContent.tsx`)*
- [ ] **T26** — CHANGELOG, section « Non publié », entrée « Ajouté ». *(fichier :
  `CHANGELOG.md`)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run lint:prisma-boundary`, seuil inchangé
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Migration rejouée sur base vierge (job CI `migrations`)
- [ ] Recette staging :
  - dépôt, aperçu et enregistrement ;
  - favicon et notification Android avec la nouvelle icône ;
  - installation neuve sur iPhone et Android ;
  - badge déposé, puis retiré (cloche) ;
  - retour au défaut.
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (correspondance ci-dessous)
- [ ] PR ouverte vers `main`

## Correspondance critères d'acceptation → tâches

| Critère (spec) | Tâches |
|---|---|
| Écran réservé au Super Admin, même par adresse directe | T10, T16, T19, T22 |
| Formats et tailles acceptés, refus explicites, icône inchangée | T5, T10, T21, T22 |
| Badge facultatif ; à défaut, cloche générique | T3, T4, T6, T7, T11, T21, T23 |
| Aperçu en quatre formes avant enregistrement | T6, T10, T17, T18 |
| Coins remplis d'une couleur proposée et modifiable | T3, T5, T18, T20 |
| Onglet, installation et notifications avec l'icône déposée, pour tous | T11, T12, T14, T15, T23 |
| Retour à l'icône par défaut | T6, T11, T18, T21 |
| Dépôt, remplacement et retrait dans l'historique (auteur, date) | T6, T18, T21 |
| Limites iPhone et Android expliquées | T18 |
| Une mise à jour de Koinonia ne remplace pas l'icône déposée | T1, T11 (icône en base, fichiers livrés en repli seulement) |
| Fichier déposé jamais servi tel quel | T5, T6 (source non conservée), T11 |
