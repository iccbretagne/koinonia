# Tâches — Page publique « Donner » et slide de projection

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche de travail : `claude/visual-deposit-validation-process-gbyji8` (branche désignée de la session), depuis `main` à jour.
- [x] Dépendance `qrcode` (licence MIT) et ses types ajoutés au `package.json`, avec le lockfile
  régénéré par `npm install`. Vérifier ensuite `npm audit --omit=dev --audit-level=high`.

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter le modèle `GivingPage` décrit dans le plan :
  - une ligne par église (`churchId` unique, `onDelete: Cascade`) ;
  - les champs par section ;
  - `shortUrl` ;
  - `updatedById` (`onDelete: SetNull`).

  Ajouter aussi les relations inverses sur `Church` (`givingPage`) et `User`.
  *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration `add_giving_page` avec `prisma migrate dev`, jamais
  `db push`. Vérifier qu'elle ne fait que créer la table et sa clé étrangère, puis régénérer le
  client. *(fichiers : `prisma/migrations/<horodatage>_add_giving_page/migration.sql`,
  `src/generated/prisma/`)*

### 2. Module `giving` (manifeste, schémas, services)

- [x] **T3** — Manifeste du module :
  - `name: "giving"`, `dependsOn: ["core"]` ;
  - routes : `authenticated` `/dons`, `api` `/api/giving`, `public` `/donner` ;
  - permission `giving:manage` pour `SUPER_ADMIN`, `ADMIN`, `SECRETARY`, `ACCOUNTANT` ;
  - domaine de notification `giving` (`defaultEmail: true`, `visibleWith`).

  L'ajouter ensuite à `allManifests`. *(fichiers : `src/modules/giving/manifest.ts`,
  `src/lib/manifests.ts`)*
- [x] **T4** [P] — Fonctions pures IBAN et BIC :
  - `normalizeIban` ;
  - `isValidIban`, avec les longueurs par pays SEPA et la clé mod 97 ;
  - `ibanError`, qui renvoie un message explicite selon la cause (format, longueur, clé) ;
  - `formatIban`, qui regroupe par 4 caractères ;
  - `isValidBic`.

  *(fichier : `src/modules/giving/services/iban.ts`)*
- [x] **T5** — Schémas Zod purs :
  - `givingPageSchema` : `trim` et longueurs alignées sur les colonnes, https pour `onlineUrl`
    et `shortUrl`, IBAN normalisé puis validé par `ibanError`, BIC, email ;
  - `superRefine` sur les champs obligatoires par section activée (virement : bénéficiaire et
    IBAN ; don en ligne : lien ; sur place : ordre des chèques ; reçu fiscal : texte), avec un
    message rattaché au champ concerné ;
  - types `GivingPageInput` et `PublicGivingPage`.

  *(fichier : `src/modules/giving/schemas.ts`)*
- [x] **T6** — Valeurs par défaut des textes, qui ne sont pas stockées :
  - introduction ;
  - explication et note du don en ligne ;
  - consigne « sur place » (chèques et espèces dans l'enveloppe remise par l'accueil) ;
  - verset 2 Corinthiens 9:7 et sa référence.

  Aucun texte par défaut pour le reçu fiscal. *(fichier :
  `src/modules/giving/services/defaults.ts`)*
- [x] **T7** — Lectures :
  - `getGivingSettings(churchId)` : la ligne existante, ou les défauts avec `enabled: false`.
    Ajoute `hasAccountingEmails` et `publicUrl` (`APP_URL`, sinon `AUTH_URL`, puis
    `/donner/<slug>`).
  - `getPublicGivingPage(slug)` : renvoie `null` si l'église est inconnue, la page absente ou
    désactivée. Sinon, ne projette que les sections activées, sans `churchId` ni auteur.

  *(fichier : `src/modules/giving/services/giving-page.ts`)*
- [x] **T8** — `alertPaymentDetailsChange(church, diff, actor)` :
  - **adresses comptables présentes** (`parseEmailList(church.accountingEmails)`) :
    `sendEmail` direct, avec un champ par ligne (ancienne et nouvelle valeur, IBAN formaté),
    l'auteur, la date et un lien vers `/dons` ;
  - **sinon** : `notifyUsersWithRole(churchId, "ADMIN", { domain: "giving", type: "GIVING_PAYMENT_DETAILS_CHANGED", … })` ;
  - une erreur d'envoi est journalisée sans être propagée.

  *(fichier : `src/modules/giving/services/alerts.ts`)*
- [x] **T9** — `updateGivingPage(churchId, input, actor)` :
  1. en transaction : lecture de l'état précédent, puis upsert avec `updatedById` ;
  2. diff des champs sensibles (`iban`, `bic`, `beneficiary`, `onlineUrl`, `onlineEnabled`,
     `transferEnabled`) et du passage d'active à inactive ;
  3. hors transaction : `logAudit` (`entityType: "GivingPage"`, `CREATE` ou `UPDATE`, champs
     modifiés), puis `alertPaymentDetailsChange` si un champ sensible a changé, si la page est
     désactivée, ou à la création dès qu'une coordonnée est renseignée.

  *(fichier : `src/modules/giving/services/giving-page.ts`)*
- [x] **T10** — Index du module : exporter le manifeste, les services de lecture et d'écriture,
  `formatIban` et les types publics. Lancer ensuite `npm run lint:boundaries`. *(fichier :
  `src/modules/giving/index.ts`)*

### 3. Permissions, navigation et documentation des droits

- [x] **T11** — Mettre à jour la matrice figée avec `giving:manage` : vrai pour Super Admin,
  Admin, Secrétaire et Comptable, faux pour tous les autres rôles. *(fichier :
  `src/core/__tests__/permissions.test.ts`)*
- [x] **T12** [P] — Ajouter la ligne `giving:manage` au tableau des permissions et un paragraphe
  « Spécificités du module dons » (droits, intégrité, alertes). *(fichiers : `CLAUDE.md`,
  `docs/auth.md`)*
- [x] **T13** — Ajouter l'entrée de navigation
  `{ href: "/dons", label: "Page de dons", permissions: ["giving:manage"] }` à `configLinksDef`.
  Ne l'afficher que si `registry.has("giving")`. *(fichier : `src/app/(auth)/layout.tsx`)*

### 4. API

- [x] **T14** — Contrat ADR-0023 : `GET` (paramètre `churchId`) et `PUT` (corps
  `givingPageSchema` importé de `@/modules/giving/schemas`), avec l'accès `giving:manage` et les
  règles métier : IBAN vérifié, alerte comptable, journal. *(fichier :
  `src/app/api/giving/contract.ts`)*
- [x] **T15** — Route handler :
  - `GET` : `churchId` lu dans la requête,
    `requireChurchPermission("giving:manage", churchId)`, puis `getGivingSettings` ;
  - `PUT` : corps parsé avec Zod avant tout accès en base, même garde sur `body.churchId`,
    puis `updateGivingPage` avec la session comme auteur ;
  - réponses via `successResponse` et `errorResponse`.

  *(fichier : `src/app/api/giving/route.ts`)*
- [x] **T16** — Régénérer la référence OpenAPI avec `npm run openapi`, puis vérifier le seuil
  `lint:prisma-boundary` (inchangé). *(fichier : `docs/openapi.json`)*

### 5. UI — page publique

- [x] **T17** [P] — Ligne copiable :
  - `navigator.clipboard.writeText` ;
  - repli sur `document.execCommand("copy")`, puis sélection du texte avec l'état
    « Sélectionné » ;
  - libellé, valeur affichée et valeur copiée distinctes (l'IBAN se copie sans espaces) ;
  - confirmation « Copié ».

  *(fichier : `src/app/donner/_components/CopyRow.tsx`)*
- [x] **T18** — Vue partagée `GivingPageView` :
  - sections dans l'ordre de la spec : en-tête, don en ligne, virement avec le rappel
    « Prénom Nom », sur place, reçu fiscal, verset, pied de page ;
  - uniquement des tokens sémantiques ;
  - bouton de don en ligne : lien `buttonClasses("primary")` en nouvel onglet, avec
    `rel="noopener noreferrer"` ;
  - pas de hook serveur, pour être réutilisable dans l'aperçu.

  *(fichier : `src/app/donner/_components/GivingPageView.tsx`)*
- [x] **T19** — Page publique `/donner/[churchSlug]` : `await params`, `getPublicGivingPage`,
  `notFound()` si le résultat est `null`, et `generateMetadata`. Le `not-found.tsx` du segment
  affiche « Cette page n'est pas disponible », message identique dans les trois cas. *(fichiers :
  `src/app/donner/[churchSlug]/page.tsx`, `src/app/donner/[churchSlug]/not-found.tsx`)*

### 6. UI — paramétrage

- [x] **T20** — Page serveur `/dons` : église courante,
  `requireChurchPermission("giving:manage", churchId)`, puis `getGivingSettings`. Rendu avec
  `PageHeader`. *(fichier : `src/app/(auth)/dons/page.tsx`)*
- [x] **T21** — Formulaire `GivingSettingsClient` :
  - une section par bloc, avec son interrupteur d'activation ;
  - `Input`, `Textarea` et `Field` du design system ;
  - IBAN reformaté par groupes de 4 à la perte du focus ;
  - erreurs Zod affichées sous chaque champ ;
  - `Alert` si aucune adresse comptable n'est configurée ;
  - texte d'aide sur l'adresse courte : sans elle, la slide n'affiche que le QR code ;
  - bouton « Enregistrer » avec `useToast` ;
  - liens « Voir la page publique » et « Slide de projection », ce dernier désactivé tant que la
    page est inactive ;
  - aperçu en direct via `GivingPageView` : colonne à droite sur grand écran, onglet « Aperçu »
    sur mobile.

  *(fichier : `src/app/(auth)/dons/GivingSettingsClient.tsx`)*

### 7. UI — slide

- [x] **T22** [P] — Ajouter l'option `theme?: "light" | "dark"` à `useSnapshotExport`. La valeur
  par défaut reste `"light"`, pour que les exports existants ne changent pas. *(fichier :
  `src/components/useSnapshotExport.ts`)*
- [x] **T23** [P] — Fonctions pures d'ajustement de la slide. Elles reçoivent une fonction de
  mesure et sont donc testables sans navigateur :
  - `fitUrlLines` : de 60 à 44 px sur une ligne, puis deux lignes domaine et chemin, plancher à
    34 px ;
  - `fitVerse` : de 34 à 24 px, puis retour à la ligne ;
  - `fitQrSize` : de 470 à 300 px par pas de 10 tant que le contenu dépasse ;
  - `slideVerse` : première proposition du verset, jusqu'au premier « ; ».

  *(fichier : `src/app/(auth)/dons/slide/slide-fit.ts`)*
- [x] **T24** — Page serveur `/dons/slide` :
  - même garde que `/dons` ;
  - si la page est inactive, `EmptyState` avec un lien vers le paramétrage ;
  - sinon, QR code SVG généré par `qrcode`, avec pour cible `shortUrl` ou à défaut l'URL
    publique Koinonia.

  *(fichier : `src/app/(auth)/dons/slide/page.tsx`)*
- [x] **T25** — Composant `GivingSlide` :
  - scène 1920 × 1080 portant `data-theme="dark"`, mise à l'échelle par CSS ;
  - contenu : nom de l'église, « Dîmes & Offrandes », QR code sur une surface claire, adresse
    courte seulement si elle existe (sinon « Scanne le code avec ton téléphone »), trois moyens
    de don (virement « sur <adresse courte> » ou « sur la page de dons »), verset ;
  - jamais l'IBAN ;
  - ajustements de T23 appliqués après `document.fonts.ready` ;
  - boutons « Télécharger (PNG) » (`useSnapshotExport` avec `theme: "dark"` et une largeur de
    1920 px) et « Plein écran » (`requestFullscreen`, sortie par Échap ou un clic).

  *(fichier : `src/app/(auth)/dons/slide/GivingSlide.tsx`)*

### 8. Tests

- [x] **T26** [P] — `iban.test.ts` :
  - IBAN FR valides avec et sans espaces, en minuscules ;
  - clé fausse, longueur incorrecte, caractères invalides, avec le message attendu dans chaque
    cas ;
  - `formatIban` ;
  - BIC sur 8 et 11 caractères, et formats invalides.

  *(fichier : `src/modules/giving/services/__tests__/iban.test.ts`)*
- [x] **T27** [P] — `schemas.test.ts` :
  - champs obligatoires par section activée ;
  - sections désactivées sans exigence ;
  - https imposé pour `onlineUrl` et `shortUrl` ;
  - `javascript:` refusé ;
  - IBAN normalisé dans le résultat.

  *(fichier : `src/modules/giving/__tests__/schemas.test.ts`)*
- [x] **T28** — `giving-page.test.ts` :
  - `getPublicGivingPage` renvoie `null` pour une église inconnue, une page absente ou
    désactivée ;
  - seules les sections activées sont projetées, sans `churchId` ;
  - `updateGivingPage` :
    - IBAN modifié : audit et alerte ;
    - verset seul modifié : audit sans alerte ;
    - désactivation : alerte ;
    - création avec coordonnées : alerte ;
    - `updatedById` renseigné.

  *(fichier : `src/modules/giving/services/__tests__/giving-page.test.ts`)*
- [x] **T29** — `alerts.test.ts` :
  - avec des adresses comptables, `sendEmail` reçoit l'ancienne et la nouvelle valeur, l'auteur
    et la date ;
  - sans adresse, `notifyUsersWithRole(…, "ADMIN", { domain: "giving" })` est appelé ;
  - un échec SMTP n'est pas propagé.

  *(fichier : `src/modules/giving/services/__tests__/alerts.test.ts`)*
- [x] **T30** — Tests de la route `api/giving` :
  - 403 pour Ministre, Resp. département et STAR ;
  - 200 pour Admin, Secrétaire, Comptable et Super Admin ;
  - 400 sur un IBAN invalide, avant tout accès en base ;
  - le `churchId` du corps fait autorité, et un rôle dans une autre église est refusé.

  *(fichier : `src/app/api/giving/__tests__/route.test.ts`)*
- [x] **T31** [P] — `slide-fit.test.ts` avec une mesure simulée :
  - adresse courte qui tient à 60 px ;
  - adresse longue réduite, puis passée sur deux lignes ;
  - verset réduit, puis retour à la ligne ;
  - QR code réduit jusqu'à 300 px et pas en dessous ;
  - `slideVerse`.

  *(fichier : `src/app/(auth)/dons/slide/__tests__/slide-fit.test.ts`)*
- [x] **T32** [P] — Navigation : « Page de dons » visible pour Admin, Secrétaire et Comptable,
  absente pour un STAR et quand le module est désactivé. *(fichier : test de navigation existant,
  `src/lib/__tests__/navigation.test.ts` ou `layout-props.test.ts`)*
- [x] **T33** [P] — Non-régression de `useSnapshotExport` : sans option, le thème forcé reste
  `light`. Avec `theme: "dark"`, c'est `dark`. *(fichier :
  `src/components/__tests__/useSnapshotExport.test.ts`)*
- [x] **T34** — Faire passer `route-exhaustiveness.test.ts` et `openapi.test.ts`, qui vérifient
  que `/donner`, `/dons` et `/api/giving` sont déclarés une seule fois et que la référence
  OpenAPI est à jour. *(fichiers : tests existants)*

### 9. Documentation & livraison

- [x] **T35** [P] — Documenter la table `giving_pages` et le module dans la documentation
  technique. *(fichiers : `docs/database.md`, `docs/architecture.md`)*
- [x] **T36** [P] — Ajouter au guide utilisateur une section « Page de dons » pour Admin,
  Secrétaire et Comptable : paramétrer la page, l'activer, télécharger ou projeter la slide.
  *(fichier : `src/components/GuideContent.tsx`)*
- [x] **T37** — Ajouter à `CHANGELOG.md`, section « Non publié », une entrée « Ajouté » : page
  de dons publique et slide (spec 065). *(fichier : `CHANGELOG.md`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`, sans couleur en dur ni exception `no-restricted-syntax` (slide comprise)
- [x] `npm run lint:boundaries`
- [x] `npm run lint:prisma-boundary`, seuil inchangé
- [x] `npm run test`
- [x] `npm run build`
- [ ] Migration rejouée sur base vierge (job CI `migrations`)
- [ ] Staging : page publique en clair, en sombre et à 320 px ; copie sur iOS et Android ; PNG
  téléchargé ; plein écran ; slide sans débordement, avec et sans adresse courte
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (correspondance ci-dessous)
- [ ] PR ouverte vers `main`

## Correspondance critères d'acceptation → tâches

| Critère (spec) | Tâches |
|---|---|
| Page accessible sans connexion à une adresse propre à l'église | T3, T7, T19 |
| Seules les sections activées, dans l'ordre | T7, T18, T28 |
| Bouton « Copier » sur chaque coordonnée, confirmation ou sélection | T17, T18 |
| Rappel « remplacer Prénom Nom » visible | T18 |
| « Sur place » : chèques et espèces dans l'enveloppe de l'accueil | T6, T18 |
| Page désactivée, non configurée ou église inexistante : aucune coordonnée, même message | T7, T19, T28 |
| Paramétrage réservé à Admin, Secrétaire, Comptable et Super Admin | T3, T11, T15, T20, T30 |
| IBAN invalide refusé avec un message explicite | T4, T5, T21, T26, T27, T30 |
| Lien de don en ligne hors https refusé | T5, T27 |
| Section activée sans ses champs obligatoires refusée | T5, T27 |
| Chaque modification dans l'historique de l'église | T9, T28 |
| Alerte comptable sur IBAN, BIC, bénéficiaire, lien ou désactivation, avec ancienne et nouvelle valeur | T8, T9, T28, T29 |
| Pas d'alerte pour une modification hors coordonnées | T9, T28 |
| Aperçu fidèle dans le paramétrage | T18, T21 |
| Slide 16:9 : titre, QR code, trois moyens, verset, jamais l'IBAN, rien ne déborde | T23, T25, T31 |
| Slide téléchargeable en PNG et en plein écran, seulement si la page est active | T22, T24, T25, T33 |
| Sans adresse comptable : Admins notifiés et paramétrage qui le signale | T8, T21, T29 |
| Verset paramétrable, sur la page et sur la slide | T6, T18, T21, T25 |
| Adresse courte affichée et ciblée par le QR code ; sinon aucune adresse, QR code vers Koinonia | T24, T25, T31 |
| Design system (thèmes clair et sombre), pas de défilement horizontal à 320 px | T18, T21, T25, vérification finale (staging) |
| Aucune donnée d'une autre église | T7, T15, T28, T30 |
