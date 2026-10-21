# Tâches — Nom et logo de l'église sur la page « Donner » et la slide

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée (vérification manuelle T31 à faire en recette)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/nom-eglise-page-donner`
- [x] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Modifier `prisma/schema.prisma` :
  - ajouter l'enum `GivingNameSize` (`SMALL`, `MEDIUM`, `LARGE`) ;
  - ajouter à `GivingPage` les colonnes `pageChurchNameShown`, `pageChurchNameSize`,
    `slideChurchNameShown`, `slideChurchNameSize`, `logoKey` (nullable, `VarChar(255)`),
    `pageLogoShown` et `slideLogoShown` ;
  - valeurs par défaut : `true`, `SMALL`, `true`.

  *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration `add_giving_church_identity` (`prisma migrate dev`). Vérifier
  qu'elle ne contient que l'ajout des colonnes avec leurs valeurs par défaut, puis régénérer le
  client.
  *(fichier : `prisma/migrations/<horodatage>_add_giving_church_identity/migration.sql`)*

### 2. Frontières et manifeste

- [x] **T3** [P] — Ajouter une règle `no-giving-imports-other-modules` qui n'autorise que
  `storage`. Mettre à jour le commentaire de la règle 1 : la liste des modules qui importent
  `storage` s'allonge.
  *(fichier : `.dependency-cruiser.cjs`)*
- [x] **T4** [P] — Manifeste `giving` :
  - `dependsOn: ["core", "storage"]` ;
  - ajouter la route publique `{ path: "/api/giving/public", method: "GET" }` ;
  - compléter le commentaire de périmètre avec le nom et le logo.

  *(fichier : `src/modules/giving/manifest.ts`)*

### 3. Logique métier

- [x] **T5** — Schémas purs :
  - six réglages avec leurs valeurs par défaut dans `givingPageSchema`, sans `logoKey` ;
  - `PublicGivingPage` reçoit `churchNameSize` et `logo` ;
  - `toPublicGivingPage(churchName, content, logoSrc)` applique les réglages *page*.

  *(fichier : `src/modules/giving/schemas.ts`)*
- [x] **T6** [P] — `defaultGivingContent` propose les six réglages par défaut.
  *(fichier : `src/modules/giving/services/defaults.ts`)*
- [x] **T7** — Service de la page :
  - ajouter les six réglages à `CONTENT_FIELDS`, mais pas à `SENSITIVE_FIELDS` ;
  - `getGivingSettings` renvoie `logoVersion` ;
  - `getPublicGivingPage` construit `logo.src`
    (`/api/giving/public/<slug>/logo?v=<version>`) ;
  - `updateGivingPage` ne touche jamais `logoKey`.

  *(fichier : `src/modules/giving/services/giving-page.ts`)*
- [x] **T8** — Nouveau service du logo, avec les fonctions :
  - `givingLogoKey` et `logoVersionFromKey`, pures ;
  - `normalizeLogo` : décodage avec `limitInputPixels`, format décodé limité à png, jpeg et webp,
    `rotate`, `resize` en 1200 × 600 `inside`, réencodage `png()` ;
  - `setGivingLogo(churchId, buffer | null, actor)` : écriture sur une nouvelle clé, `upsert` en
    transaction (page par défaut si absente), suppression de l'ancienne clé après la transaction,
    nettoyage de la nouvelle clé si l'écriture en base échoue, journal, puis alerte « Logo »
    (déposé, remplacé ou retiré) ;
  - `getGivingLogoStream` et `getPublicGivingLogoStream`, ce dernier renvoyant `null` si la page
    est inactive ou sans logo.

  *(fichier : `src/modules/giving/services/logo.ts`)*
- [x] **T9** — Exporter depuis l'index : `setGivingLogo`, `getGivingLogoStream`,
  `getPublicGivingLogoStream`. *(fichier : `src/modules/giving/index.ts`)*

### 4. API

- [x] **T10** — `POST`, `DELETE` et `GET /api/giving/logo` :
  - `POST` : refus 411 sans `Content-Length` et 413 au-delà de 2,5 Mo, avant de lire le corps ;
    puis `formData`, `churchId`, `requireChurchPermission("giving:manage")`, limiteur de débit,
    contrôle `file.size` ≤ 2 Mo et `setGivingLogo` ; réponse 201 `{ logoVersion }` ;
  - `DELETE` : même permission, logo retiré ;
  - `GET` : même permission, flux PNG avec `Cache-Control: private, no-store` et `nosniff`.

  *(fichiers : `src/app/api/giving/logo/route.ts`, `src/app/api/giving/logo/contract.ts`)*
- [x] **T11** — `GET /api/giving/public/[churchSlug]/logo` (avec `await params`) :
  - 404 si `getPublicGivingLogoStream` renvoie `null` ;
  - sinon `image/png`, `nosniff`, `Cache-Control: public, max-age=86400, immutable`.

  *(fichiers : `src/app/api/giving/public/[churchSlug]/logo/route.ts`, `contract.ts` voisin)*
- [x] **T12** — Mettre à jour la description du `PUT /api/giving` (réglages du nom et du logo
  journalisés, sans alerte ; logo déposé par sa propre route). Lancer ensuite `npm run openapi`.
  *(fichiers : `src/app/api/giving/contract.ts`, `docs/openapi.json`)*

### 5. UI

- [x] **T13** [P] — Créer la table des classes du nom par taille, toutes avec `break-words`.
  *(fichier : `src/app/donner/_components/church-name.ts`)*
- [x] **T14** — Créer `GivingPageHeader` :
  - props `churchName`, `nameSize`, `logoSrc` et `compact` ;
  - logo `h-10`/`h-8`, `max-w-[140px]`, `object-contain`, `alt=""` ;
  - nom masqué si `nameSize` vaut `null` ;
  - aucun import de Prisma, de `sharp` ni de service.

  *(fichier : `src/app/donner/_components/GivingPageHeader.tsx`)*
- [x] **T15** — La page publique utilise `GivingPageHeader`. `generateMetadata` ne change pas.
  *(fichier : `src/app/donner/[churchSlug]/page.tsx`)*
- [x] **T16** [P] — Ajouter à `slide-fit.ts` :
  - `SLIDE_NAME_PX`, `SLIDE_IDENTITY_H = 68`, `SLIDE_LOGO_H = 64` et `SLIDE_LOGO_MAX_W = 480` ;
  - la fonction pure `fitName(start, fits)`, qui réduit par pas de 2 px jusqu'à 26 px puis passe à
    la ligne.

  *(fichier : `src/app/(auth)/dons/slide/slide-fit.ts`)*
- [x] **T17** — Slide :
  - props `churchNameSize` et `logoSrc` ;
  - ligne d'identité de hauteur fixe : logo à gauche, puis nom affiché ou masqué selon le
    réglage ; la ligne disparaît si les deux sont masqués ;
  - titre à 100 px, phrase « Scanne le code ou tape l'adresse » retirée, bloc de l'adresse en
    `shrink-0` (il n'est plus rogné) ;
  - `fitContent` cale le nom sur sa ligne, puis le verset, puis l'adresse avec le QR code à
    `QR_MAX` (largeur **et** hauteur, repli sur la largeur seule), puis le QR code en dernier
    recours ; le QR code n'est jamais réduit par le nom ou le logo ;
  - le calage se refait au chargement de l'image ;
  - ajouter les nouvelles props aux dépendances du calage.

  *(fichier : `src/app/(auth)/dons/slide/GivingSlide.tsx`)*
- [x] **T18** — La page de la slide calcule `churchNameSize` et `logoSrc` (URL publique) à partir
  des réglages *slide*. *(fichier : `src/app/(auth)/dons/slide/page.tsx`)*
- [x] **T19** — Paramétrage, typage du brouillon :
  - ajouter `SizeKey` ;
  - ajouter les quatre booléens à `BOOL_KEYS` ;
  - `toDraft` et `toPreviewContent` copient les tailles telles quelles.

  *(fichier : `src/app/(auth)/dons/GivingSettingsClient.tsx`)*
- [x] **T20** — Paramétrage, bloc **Logo** :
  - aperçu sur fond sombre ;
  - « Déposer un logo » / « Remplacer » avec un champ fichier caché ;
  - contrôle de taille côté client ;
  - « Retirer » via `ConfirmModal` ;
  - toasts de succès et d'erreur ;
  - mention de l'enregistrement immédiat et de l'alerte de la comptabilité ;
  - `logoVersion` mis à jour dans l'état local.

  *(fichier : `src/app/(auth)/dons/GivingSettingsClient.tsx`)*
- [x] **T21** — Paramétrage, sous-blocs **Page publique** et **Slide de projection** :
  - « Afficher le logo », désactivé sans logo ;
  - « Afficher le nom » ;
  - groupe radio Petit / Moyen / Grand, désactivé quand le nom est masqué ;
  - mention « après enregistrement » pour la slide ;
  - section placée avant « Verset et pied de page ».

  *(fichier : `src/app/(auth)/dons/GivingSettingsClient.tsx`)*
- [x] **T22** — L'aperçu utilise `GivingPageHeader` en mode `compact` avec les réglages *page* du
  brouillon et le logo servi par la route authentifiée.
  *(fichier : `src/app/(auth)/dons/GivingSettingsClient.tsx`)*

### 6. Tests

- [x] **T23** [P] — Schémas :
  - les valeurs par défaut s'appliquent ;
  - une taille inconnue est refusée ;
  - un `logoKey` envoyé est ignoré ;
  - `toPublicGivingPage` applique les réglages *page* et ignore les réglages *slide*.

  *(fichier : `src/modules/giving/__tests__/schemas.test.ts`)*
- [x] **T24** [P] — Service de la page :
  - les réglages sont journalisés sans alerte ;
  - les valeurs par défaut sont proposées à une page jamais configurée ;
  - `updateGivingPage` ne modifie jamais `logoKey`.

  *(fichier : `src/modules/giving/__tests__/giving-page.test.ts`)*
- [x] **T25** [P] — Service du logo :
  - PNG réencodé, dimensions bornées, métadonnées retirées ;
  - SVG, fichier texte renommé et image tronquée refusés (400) ;
  - nouvelle clé écrite, ancienne supprimée, journal et alerte (déposé, remplacé, retiré) ;
  - en cas d'échec en base, la nouvelle clé est supprimée et l'ancienne conservée ;
  - le flux public vaut `null` si la page est inactive ou sans logo.

  *(fichier : `src/modules/giving/__tests__/logo.test.ts`)*
- [x] **T26** [P] — Route du logo :
  - 411 et 413 sans lire le corps ;
  - 403 hors de `giving:manage` dans l'église du formulaire ;
  - 201 pour un Comptable ;
  - `DELETE` protégé par la même permission ;
  - `GET` renvoyé avec `no-store`.

  *(fichier : `src/app/api/giving/logo/__tests__/route.test.ts`)*
- [x] **T27** [P] — Route publique du logo :
  - 404 si la page est inactive ou sans logo ;
  - sinon 200 en `image/png`, avec `nosniff` et un cache immuable.

  *(fichier : `src/app/api/giving/public/[churchSlug]/logo/__tests__/route.test.ts`)*
- [x] **T28** [P] — `fitName` : garde la taille choisie si le nom tient, réduit par pas de 2 px, et
  passe à la ligne à 26 px en dernier recours. `fitUrlLines` avec une contrainte de hauteur
  descend sur deux lignes jusqu'à 34 px. *(fichier : `src/app/(auth)/dons/slide/__tests__/slide-fit.test.ts`)*
- [x] **T29** [P] — Classes du nom : trois jeux distincts, tous avec `break-words`.
  *(fichier : `src/app/donner/_components/__tests__/church-name.test.ts`)*
- [x] **T30** [P] — Route `PUT /api/giving` : transmet les nouveaux réglages, et renvoie 400 pour
  une taille invalide. *(fichier : `src/app/api/giving/__tests__/route.test.ts`)*
- [ ] **T31** — Vérification manuelle (`npm run dev`, jeu de données fictif) :
  - dépôt, remplacement et retrait du logo, avec l'alerte ;
  - refus d'un SVG et d'un fichier de 3 Mo ;
  - page publique à 320 px dans les trois tailles, avec et sans nom, avec et sans logo, en
    vérifiant le titre de l'onglet ;
  - slide avec un nom de plus de 50 caractères en Grand et des logos 4:1 et 1:2 : aperçu, plein
    écran et PNG, sans débordement ni chevauchement, avec un QR code carré de même taille
    qu'avant ;
  - slide avec l'adresse courte `koinonia.iccrennes.fr/donner/icc-rennes`, logo et nom en Grand :
    adresse entière sur deux lignes, QR code à 470 px ;
  - aperçu du paramétrage en direct ;
  - taille retrouvée au réaffichage du nom ;
  - `git checkout next-env.d.ts`.

### 7. Documentation

- [x] **T32** [P] — Mettre à jour :
  - CHANGELOG : entrée « Ajouté » sous « Non publié » ;
  - `CLAUDE.md` : paragraphe « Spécificités du module dons » (nom, logo, alerte sur le logo) ;
  - `docs/auth.md`, si le module dons y figure.

  *(fichiers : `CHANGELOG.md`, `CLAUDE.md`, `docs/auth.md`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`, avec la nouvelle règle `giving`
- [x] `npm run lint:prisma-boundary` : le seuil reste à 143, les nouvelles routes passent par les
  services
- [x] `npm run test`, y compris `openapi.test.ts` et `route-exhaustiveness.test.ts`
- [x] `npm run build` pour la frontière client/serveur, puis `git checkout next-env.d.ts`
- [x] Tous les critères d'acceptation de `spec.md` sont satisfaits, et la spec passe au statut
  `Implémentée`
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère (spec.md) | Tâches |
|---|---|
| Réglages du nom séparés page / slide : affiché + 3 tailles | T1, T5, T21 |
| Sans réglage enregistré, rendu identique à avant | T1, T2, T6, T23, T24 |
| Le réglage de la page ne modifie pas la slide, et inversement | T5, T15, T18, T23 |
| Nom masqué : absent de l'en-tête et de la slide (aperçu, plein écran, PNG) | T14, T17, T31 |
| Nom masqué sur la page : l'onglet nomme toujours l'église | T15, T31 |
| Trois tailles visiblement distinctes | T13, T16, T29, T31 |
| Nom long en Grand : la slide tient en 16:9, la page n'a pas de défilement horizontal à 320 px | T13, T16, T17, T28, T31 |
| Taille inactive quand le nom est masqué, retrouvée au réaffichage | T1, T21, T31 |
| Modifications du nom journalisées, sans alerte | T7, T24 |
| Modification réservée aux rôles qui paramètrent déjà la page « Donner », logo compris | T10, T26, T30 |
| Logo unique pour fond sombre : déposer, remplacer, retirer, aperçu sur fond sombre | T8, T10, T20, T25, T31 |
| PNG, JPEG, WebP ≤ 2 Mo seulement ; SVG, autre type, trop lourd ou illisible refusés, logo précédent conservé | T8, T10, T25, T26, T31 |
| Image affichée = image enregistrée, non remplaçable autrement, métadonnées retirées | T7, T8, T10, T11, T24, T25 |
| Logo affiché sur l'en-tête de la page et sur la slide (aperçu, plein écran, PNG), sans déformation | T11, T14, T17, T18, T27, T31 |
| Sans logo ou affichage désactivé : aucun logo | T5, T14, T17, T23, T27 |
| Logo très large ou très haut : la slide tient en 16:9, sans chevauchement | T16, T17, T28, T31 |
| Dépôt, remplacement ou retrait du logo : journalisé et alerté ; interrupteurs : journal seul | T8, T24, T25 |
| QR code de même taille et carré, quels que soient le nom et le logo | T16, T17, T28, T31 |
| Adresse longue avec logo et nom en Grand : lisible en entier, QR code de même taille | T17, T28, T31 |
| Adresse jamais rognée | T17, T31 |
| Phrase « Scanne le code ou tape l'adresse » retirée | T17, T31 |
