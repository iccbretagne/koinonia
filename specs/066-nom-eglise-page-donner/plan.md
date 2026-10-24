# Plan technique — Nom et logo de l'église sur la page « Donner » et la slide

- **Spec associée** : `./spec.md`
- **Statut** : Terminé
- **Mis à jour le** : 2026-10-21

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` importe `giving` par son index (`@/modules/giving`) et
  ses schémas purs (`@/modules/giving/schemas`). Le module `giving` importe désormais `storage`,
  qui reste l'infrastructure partagée (ADR-0006). Une règle `no-giving-imports-other-modules`
  est ajoutée à `.dependency-cruiser.cjs` : elle n'y figurait pas et n'autorise que `storage`.
- [x] **Sécurité** :
  - les nouvelles routes d'écriture passent par
    `requireChurchPermission("giving:manage", churchId)`, avec un `churchId` toujours fourni ;
  - la lecture publique du logo ne sert que la page d'une église **active**, sur la même règle que
    la page publique ;
  - le dépôt est soumis au limiteur de débit des mutations.
- [x] **Permissions** : `giving:manage` inchangée, via `rolePermissions`.
- [x] **Validation** : Zod pour les champs JSON. Le fichier déposé est contrôlé côté serveur : taille
  réelle, format **décodé** (et non le MIME déclaré), dimensions.
- [x] **Migration** Prisma `add_giving_church_identity`. Ses valeurs par défaut reproduisent le
  rendu actuel.
- [x] **Enums** : `GivingNameSize` vient de `@/generated/prisma/enums` dans le schéma pur, et de
  `@/generated/prisma/client` côté services.
- [x] **UI** : réutilisation de `Switch`/`Section` (paramétrage), du motif `role="radiogroup"` de
  `ThemeSelector`, de `Button`, `ConfirmModal` et `useToast`. Pas de nouveau composant partagé.

## Approche générale

**Nom de l'église.** Quatre réglages (*affiché* et *taille*, pour la page et pour la slide)
s'ajoutent au contenu de la page de dons. Ils empruntent le circuit existant de la spec 065 :
schéma Zod, `updateGivingPage`, journal et calcul des différences. Ils ne sont pas sensibles, donc
pas d'alerte.

**Logo.** Le logo suit un circuit **séparé et immédiat** : un fichier déposé est enregistré tout
de suite par une route dédiée. La spec impose que l'image affichée soit celle enregistrée et que
rien d'autre ne puisse la remplacer. On l'obtient ainsi :

1. **Dépôt par le serveur, pas d'URL présignée.** Le navigateur envoie le fichier à Koinonia, qui
   le contrôle, le réencode et l'écrit lui-même dans le stockage. Aucune URL d'écriture n'est
   remise au navigateur, ce qui écarte par construction les deux faiblesses relevées par l'audit
   de sécurité sur les autres dépôts : taille déclarée non vérifiée, et objet réécrit après
   validation.
2. **Clé immuable.** Chaque dépôt écrit une nouvelle clé `giving/<churchId>/logo-<uuid>.png`.
   La précédente est supprimée après l'enregistrement en base, jamais réécrite.
3. **Seul point d'écriture.** `logoKey` ne fait pas partie du contenu du formulaire :
   `updateGivingPage` ne peut pas le modifier, et seul le service du logo l'écrit.
4. **Servi par Koinonia, même origine.** Les images sont lues par une route publique de Koinonia
   et non par une URL signée du stockage. L'export PNG de la slide (`html2canvas`) n'a ainsi
   aucun problème de CORS, et le lien partagé ne dépend pas de l'expiration d'une signature.

Seuls le dépôt, le remplacement et le retrait sont sensibles : ils sont journalisés et alertent,
comme un changement d'IBAN. Les interrupteurs *Afficher le logo* suivent le circuit du
formulaire : ils sont journalisés, sans alerte.

## Modèle de données

```prisma
/// Taille du nom de l'église sur la page de dons et la slide (spec 066). SMALL = rendu d'origine.
enum GivingNameSize {
  SMALL
  MEDIUM
  LARGE
}

model GivingPage {
  // …champs existants…
  // Nom de l'église (spec 066) : un réglage pour la page publique, un pour la slide
  pageChurchNameShown  Boolean        @default(true)
  pageChurchNameSize   GivingNameSize @default(SMALL)
  slideChurchNameShown Boolean        @default(true)
  slideChurchNameSize  GivingNameSize @default(SMALL)
  // Logo (spec 066) : une image pour fond sombre, écrite uniquement par le service du logo
  /// Clé de stockage immuable `giving/<churchId>/logo-<uuid>.png` ; null = aucun logo.
  logoKey              String?        @db.VarChar(255)
  pageLogoShown        Boolean        @default(true)
  slideLogoShown       Boolean        @default(true)
}
```

La migration `add_giving_church_identity` ajoute ces colonnes avec leurs valeurs par défaut. Les
lignes existantes prennent « nom affiché, Petit » et n'ont aucun logo, c'est-à-dire le rendu
actuel. Aucune reprise de données n'est nécessaire.

Les interrupteurs du logo valent `true` par défaut (spec : « coché par défaut ») et restent
sans effet tant que `logoKey` est nul.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/giving?churchId=` | GET | `giving:manage` dans `churchId` | — | `content` avec les 6 nouveaux réglages, et `logoVersion: string \| null` |
| `/api/giving` | PUT | `giving:manage` dans `body.churchId` | `givingPageSchema` + 6 réglages (sans `logoKey`) | contenu enregistré |
| `/api/giving/logo` | POST | `giving:manage` dans le `churchId` du formulaire | `multipart/form-data` : `churchId`, `file` | `{ logoVersion }`, 201 |
| `/api/giving/logo?churchId=` | DELETE | `giving:manage` dans `churchId` | — | `{ logoVersion: null }` |
| `/api/giving/logo?churchId=&v=` | GET | `giving:manage` dans `churchId` | — | image PNG (aperçu du paramétrage, page active ou non) |
| `/api/giving/public/[churchSlug]/logo?v=` | GET | public | — | image PNG si page active et logo présent, 404 sinon |

**Ajouts à `givingPageSchema`** :

```ts
const nameSize = z.nativeEnum(GivingNameSize); // @/generated/prisma/enums
pageChurchNameShown: z.boolean().default(true),
pageChurchNameSize: nameSize.default("SMALL"),
slideChurchNameShown: z.boolean().default(true),
slideChurchNameSize: nameSize.default("SMALL"),
pageLogoShown: z.boolean().default(true),
slideLogoShown: z.boolean().default(true),
```

Avec ces valeurs par défaut, un corps envoyé par un onglet ouvert avant le déploiement reste
valide. `logoKey` est absent du schéma et donc ignoré, puisque Zod retire les clés inconnues.

**Contrôles du `POST /api/giving/logo`**, dans cet ordre, avant toute écriture :

1. **`Content-Length`** absent → 411. Supérieur à 2,5 Mo (2 Mo plus l'enveloppe multipart)
   → 413, sans lire le corps.
2. **`file`** absent ou `file.size > 2 Mo` → 400.
3. **Décodage `sharp`** avec `limitInputPixels: 40_000_000` et `failOn: "error"`. Le format
   décodé doit être `png`, `jpeg` ou `webp`, sinon 400. Le MIME déclaré n'est pas pris en compte,
   et le SVG est refusé ici, quel que soit son nom. Une image illisible donne aussi 400.
4. **Réencodage** :
   - `rotate()` pour appliquer l'orientation EXIF ;
   - `resize({ width: 1200, height: 600, fit: "inside", withoutEnlargement: true })` ;
   - `png()`, qui garde la transparence et retire les métadonnées (comportement par défaut de
     `sharp`, sans `withMetadata`) ;
   - pour un WebP animé, seule la première image est gardée (défaut de `sharp`).

Un échec à n'importe quelle étape laisse le logo précédent intact.

**Lecture** (les deux `GET`) :

- le flux vient du stockage (`getS3ObjectStream`), en `Content-Type: image/png` avec
  `X-Content-Type-Options: nosniff` ;
- public : `Cache-Control: public, max-age=86400, immutable`. Le paramètre `v` (l'uuid de la clé)
  change à chaque dépôt, ce qui suffit à invalider le cache ;
- paramétrage : `Cache-Control: private, no-store`.

**Contrats** (ADR-0023) :

- `contract.ts` pour `/api/giving/logo` (corps multipart décrit comme celui des pièces jointes
  comptables) et pour `/api/giving/public/[churchSlug]/logo` ;
- la description du `PUT /api/giving` est mise à jour ;
- lancer `npm run openapi`.

**Manifeste `giving`** :

- `dependsOn: ["core", "storage"]` ;
- `public` reçoit `{ path: "/api/giving/public", method: "GET" }`. Le préfixe `/api/giving`,
  déjà déclaré en `api`, couvre `/api/giving/logo` ;
- vérifier que `route-exhaustiveness.test.ts` accepte un préfixe public plus long qu'un préfixe
  `api` (c'est déjà le cas pour `/api/audio/public`).

## Services / logique métier

**`src/modules/giving/services/giving-page.ts`**

- On ajoute les six réglages à `CONTENT_FIELDS`, mais pas à `SENSITIVE_FIELDS`.
- `getGivingSettings` renvoie en plus `logoVersion`, l'uuid extrait de `logoKey`, ou `null`.
- `getPublicGivingPage` transmet `slug` et `logoVersion` pour construire `logo.src`.

**`src/modules/giving/services/logo.ts`** (nouveau)

- `normalizeLogo(buffer): Promise<Buffer>` : décodage, contrôle du format, réencodage (voir
  API). Les échecs lèvent `ApiError(400, …)` avec un message pour l'utilisateur.
- `setGivingLogo(churchId, buffer | null, actor)` :
  1. normalisation, si un fichier est fourni ;
  2. `uploadFile` vers une nouvelle clé ;
  3. en transaction : lecture de la page, puis `upsert` de `logoKey`. Si la page n'existe pas,
     elle est créée avec `defaultGivingContent(church.name)`, donc inactive ;
  4. **après** la transaction, `deleteMediaFile(ancienne clé)`, dont l'échec est journalisé et
     ignoré : une clé orpheline ne fait pas de tort ;
  5. `logAudit` (`entityType: "GivingPage"`, `details.changedFields: ["logoKey"]`), puis
     `alertPaymentDetailsChange` avec le libellé « Logo » et la valeur « déposé », « remplacé » ou
     « retiré » ;
  6. si l'écriture en base échoue, la nouvelle clé est supprimée.
- `getGivingLogoStream(churchId)` et `getPublicGivingLogoStream(slug)` renvoient `null` si l'église
  n'a pas de logo et, pour le public, si la page est inactive.
- Clés : `givingLogoKey(churchId, uuid)` et `logoVersionFromKey(key)`, des fonctions pures.

**`src/modules/giving/services/defaults.ts`** : la valeur par défaut des six réglages est
`true`/`"SMALL"`/`true`.

**`src/modules/giving/schemas.ts`** : on ajoute à `PublicGivingPage` les champs
`churchNameSize: GivingNameSize | null` et `logo: { src: string } | null`.
`toPublicGivingPage(churchName, content, logoSrc: string | null)` ne garde le logo que si
`pageLogoShown` vaut vrai **et** si `logoSrc` est fourni.

## UI / composants

### En-tête de la page publique

Nouveau composant serveur, sans état : `src/app/donner/_components/GivingPageHeader.tsx`. C'est la
seule source de l'en-tête, partagée par la page publique et par l'aperçu du paramétrage.

- Props : `churchName`, `nameSize: GivingNameSize | null`, `logoSrc: string | null` et `compact`.
- Mise en page `flex items-center gap-3` :
  - le logo est un `<img>` avec `alt=""`, car le nom est présent ou le titre suffit ;
  - le logo mesure `h-10` (`h-8` en mode compact), avec `w-auto max-w-[140px] object-contain` ;
  - à côté, un bloc `min-w-0` qui contient le nom et le titre « Donner ».
- Les classes par taille sont dans `src/app/donner/_components/church-name.ts`, un fichier pur :

| Taille | Rendu (capitales, toujours `break-words`) |
|---|---|
| SMALL | `text-xs tracking-widest text-on-brand/70`, le rendu actuel |
| MEDIUM | `text-base leading-6 tracking-wider text-on-brand/80` |
| LARGE | `font-display text-[22px] leading-7 tracking-wide text-on-brand` |

- `generateMetadata` ne change pas : l'onglet reste nommé `Donner — {churchName}`.

### Slide (`src/app/(auth)/dons/slide/`)

**`page.tsx`** passe deux props :

- `churchNameSize` : la taille si le nom est affiché, sinon `null` ;
- `logoSrc` : l'URL **publique** du logo si `slideLogoShown` et si un logo existe. La slide n'est
  proposée que si la page est active, donc l'URL publique répond toujours.

**Principe : le QR code garde sa taille.** Le nom et le logo occupent une **ligne d'identité**
de hauteur fixe, `SLIDE_IDENTITY_H = 68` px de scène, en haut de la slide. Le corps (carte du QR
code et moyens de don) dispose donc de la même hauteur quels que soient les réglages, et le QR
code n'est jamais réduit à cause du nom ou du logo. Il reste carré : le cadre impose la même
largeur et la même hauteur.

La hauteur de 68 px correspond à une ligne du nom en *Grand* (56 px × 1,2). Elle coûte environ
85 px au corps par rapport à aujourd'hui. Mesures faites sur la démonstration (Chromium sans
interface, scène 1920 × 1080), la place est reprise ainsi :

- **titre** « Dîmes & Offrandes » de 120 à **100 px** (`SLIDE_TITLE_PX`) ;
- **phrase d'aide** « Scanne le code ou tape l'adresse » retirée (gain d'environ 52 px). Le
  message de repli sans adresse courte (« Scanne le code avec ton téléphone ») reste ;
- **l'adresse se réduit avant le QR code** : `fitContent` pose le QR code à `QR_MAX`, puis
  appelle `fitUrlLines` avec un `fits` qui exige la largeur **et** l'absence de débordement
  (scène, carte, corps). Si aucune taille ne convient, il rappelle `fitUrlLines` sur la largeur
  seule, puis `fitQrSize` réduit le QR code en dernier recours.

Résultats mesurés, logo et nom en *Grand* : adresse courte (`eglise-rance.fr/don`) → QR 470,
adresse à 60 px sur une ligne ; adresse longue (`koinonia.iccrennes.fr/donner/icc-rennes`) →
QR 470, adresse à 42 px sur deux lignes. Avec un titre à 120 px, la même adresse longue faisait
tomber le QR code à 430 px.

**Défaut corrigé au passage (spec 065).** Le bloc de l'adresse a `overflow-hidden` sans
`shrink-0` : dans la carte en colonne flex, sa hauteur minimale tombe à 0 et le navigateur le
rogne pour éviter le débordement. La carte ne déborde donc jamais, `fitQrSize` ne voit rien, et
l'adresse est coupée en hauteur sans signal (reconstitution du rendu actuel : 47 px visibles sur
65). Le bloc reçoit `shrink-0`, ce qui rend la mesure honnête.

**`slide-fit.ts`** :

- `SLIDE_NAME_PX = { SMALL: 26, MEDIUM: 40, LARGE: 56 }` et `SLIDE_IDENTITY_H = 68` ;
- `SLIDE_LOGO_H = 64` et `SLIDE_LOGO_MAX_W = 480` ;
- `fitName(start, fits)`, une fonction pure : elle réduit la police par pas de 2 px, de la taille
  choisie jusqu'à 26 px, tant que le nom ne tient pas sur une ligne. À 26 px, s'il ne tient
  toujours pas, elle renvoie `{ size: 26, wrap: true }`. Seul ce dernier recours peut agrandir la
  ligne d'identité, d'une ligne de 26 px (31 px).

**`GivingSlide.tsx`** :

- la ligne d'identité (`flex items-center gap-6`, `min-height: SLIDE_IDENTITY_H`) contient :
  - le logo, un `<img>` de `SLIDE_LOGO_H` px de haut, avec `w-auto`,
    `max-w-[SLIDE_LOGO_MAX_W]`, `object-contain` et `shrink-0` ;
  - le nom, dans un `min-w-0 flex-1`. Il n'apparaît que si `churchNameSize !== null`, avec un
    interlettrage de `0.2em` en Petit et de `0.12em` au-delà ;
- si ni le nom ni le logo ne sont affichés, la ligne disparaît et le titre remonte ;
- le titre passe à `text-[100px]` ; la phrase « Scanne le code ou tape l'adresse » est retirée ;
  le bloc de l'adresse reçoit `shrink-0` ;
- `fitContent` cale d'abord le nom (`fitName`, mesuré par `scrollWidth <= clientWidth` en
  `nowrap`), puis le verset, puis l'adresse avec le QR code à `QR_MAX` (largeur et hauteur, voir
  ci-dessus), et enfin le QR code. Le nom et le logo, eux, n'agissent jamais sur le QR code ;
- le premier calage attend le chargement de l'image (`onLoad` → `refit`), en plus de
  `document.fonts.ready`, car la largeur du logo change la place disponible pour le nom ;
- l'export PNG et le plein écran capturent le même nœud. Comme le logo vient de la même origine,
  `html2canvas` le dessine sans configuration CORS.

### Paramétrage (`src/app/(auth)/dons/GivingSettingsClient.tsx`)

**Typage du brouillon** :

- ajouter `SizeKey`, et l'exclure de `TextKey` ;
- ajouter les quatre nouveaux booléens à `BOOL_KEYS` ;
- `toDraft` et `toPreviewContent` copient les tailles telles quelles.

**Section « Nom et logo de l'église »**, placée avant « Verset et pied de page » :

- **Logo** :
  - un aperçu du logo actuel sur fond sombre (`data-theme="dark"`, `bg-bg`), servi par le `GET`
    authentifié ;
  - les boutons « Déposer un logo » ou « Remplacer », qui ouvrent un `<input type="file"
    accept="image/png,image/jpeg,image/webp">` caché, et « Retirer » ;
  - une mention : « PNG, JPEG ou WebP, 2 Mo au plus, en blanc ou clair. Le logo est enregistré
    dès son dépôt et la comptabilité est prévenue. » ;
  - un contrôle de taille côté client avant l'envoi, pour la réactivité (le serveur fait foi) ;
  - « Retirer » passe par un `ConfirmModal` ;
  - succès ou erreur : toast. En cas d'erreur, le logo précédent reste affiché.
- **Page publique** et **Slide de projection**, deux sous-blocs. Chacun contient :
  - un `Switch` « Afficher le logo », désactivé avec la mention « aucun logo déposé » tant qu'il
    n'y a pas de logo ;
  - un `Switch` « Afficher le nom » ;
  - un groupe radio Petit / Moyen / Grand (`grid-cols-3`, hauteur 40 px), désactivé quand le nom
    est masqué, sans perdre sa valeur.

  Le sous-bloc slide porte la mention « Visible dans la slide de projection, après
  enregistrement ».

**Aperçu** : `GivingPageHeader` (en mode `compact`) reflète les réglages *page* du brouillon, avec
le logo servi par la route authentifiée.

**Mobile** : à 320 px, chaque contrôle tient sur une ligne, et les boutons du logo passent sous
l'aperçu.

## Décisions & alternatives écartées

- **Choix** : dépôt par le serveur, réencodé, sur une clé immuable. *Pourquoi* : l'intégrité de la
  page de dons exige que l'image affichée soit celle qui a été contrôlée. Un PUT présigné
  laisserait au navigateur une URL capable de réécrire l'objet, et l'audit de sécurité l'a
  relevé ailleurs. Un logo de 2 Mo au plus ne justifie pas un dépôt direct.
- **Choix** : réencodage systématique en PNG. *Pourquoi* : il retire les métadonnées, neutralise un
  fichier piégé ou polyglotte, borne les dimensions et garde la transparence. Le coût est
  négligeable pour une image de cette taille.
- **Choix** : lecture par une route de Koinonia plutôt que par une URL signée. *Pourquoi* : même
  origine pour l'export PNG (le canvas reste exploitable), lien stable dans le temps et cache
  invalidé par la version de la clé.
- **Choix** : enregistrement immédiat du logo, hors du bouton « Enregistrer ». *Pourquoi* : un
  dépôt différé obligerait à conserver un fichier temporaire, à le nettoyer et à le lier au
  formulaire, pour un gain faible. La spec l'assume et l'écran l'annonce.
- **Choix** : deux colonnes par support pour le nom (*affiché* et *taille*). *Pourquoi* :
  réafficher le nom doit retrouver la taille choisie auparavant.
- **Choix** : une ligne d'identité de hauteur fixe pour le nom et le logo, le nom se réduisant
  pour tenir sur sa ligne. *Pourquoi* : le QR code est l'élément utile de la slide. Sa taille ne
  doit pas dépendre des réglages d'identité (demande du 2026-10-21).
- **Choix** : titre de la slide à 100 px et phrase d'aide retirée, plutôt que réduire le QR code.
  *Pourquoi* : mesuré sur la démonstration, c'est ce qui garde le QR code à 470 px avec le nom,
  le logo et une adresse longue (validé le 2026-10-21). Le QR code et l'adresse se suffisent.
- **Écarté** : placer le logo au-dessus du nom, ou réduire le QR code pour lui faire de la place.
  *Raison* : le QR code rétrécirait dès qu'un logo est déposé.
- **Écarté** : réutiliser le logo des paramètres médias (`MediaSettings.logoKey`). *Raison* : il
  est géré par une autre équipe, sous une autre permission, et créerait une dépendance
  `giving` → `media` (décision du 2026-10-21).
- **Écarté** : accepter le SVG. *Raison* : c'est du contenu actif, et il faudrait l'assainir.
- **Écarté** : deux versions du logo (fond clair, fond sombre). *Raison* : les deux supports ont un
  fond sombre (décision du 2026-10-21).
- **Écarté** : un aperçu de la slide en direct dans le paramétrage, et un composant
  `SegmentedControl` partagé (voir la version précédente de ce plan : même raisonnement).

## Risques & points d'attention

- **Taille du corps** : `request.formData()` met le corps en mémoire. Le refus préalable sur
  `Content-Length` (411/413) borne cette mémoire. Un corps qui annonce une longueur inférieure à
  la réalité est coupé par le serveur HTTP à la longueur annoncée.
- **Bombe de décompression** : `limitInputPixels` borne le décodage, et un dépassement donne 400.
- **Débordement de la slide** : la ligne d'identité est bornée (68 px, plus 31 px au pire si le nom
  passe à la ligne à 26 px). Le titre réduit et la phrase d'aide retirée l'absorbent ; au pire,
  l'adresse puis le QR code se réduisent, sans jamais rogner ni déborder. C'est vérifié
  manuellement avec un nom de plus de 50 caractères, des logos 4:1 et 1:2, et une adresse longue.
- **Frontière client/serveur** : `GivingPageHeader` est utilisé côté client et côté serveur. Il
  ne doit importer ni Prisma, ni `sharp`, ni de service. Lancer `npm run build`.
- **Clé orpheline** : si la suppression de l'ancienne clé échoue, l'objet reste dans le stockage
  sans être référencé. C'est sans risque : l'erreur est journalisée.
- **Frontières de modules** : la nouvelle règle dependency-cruiser pour `giving` peut révéler
  un import existant non conforme. On le corrige alors, sans élargir la règle.
- **OpenAPI** : trois contrats sont touchés, régénérer `docs/openapi.json`.

## Stratégie de tests

Vitest. Les fonctions pures et les services sont testés avec le stockage et Prisma simulés.
`sharp` est utilisé réellement sur de petites images générées dans le test.

- **`schemas.test.ts`** :
  - un corps sans les nouveaux réglages reçoit leurs valeurs par défaut ;
  - une taille inconnue est refusée ;
  - un `logoKey` envoyé est ignoré ;
  - `toPublicGivingPage` applique les réglages du nom et du logo de la page, et ignore ceux de
    la slide.
- **`giving-page.test.ts`** :
  - modifier le nom ou les interrupteurs du logo journalise, sans alerte ;
  - les valeurs par défaut sont proposées à une église jamais configurée ;
  - `updateGivingPage` ne modifie jamais `logoKey`.
- **`logo.test.ts`** (nouveau) :
  - un PNG valide est réencodé en PNG, ses dimensions sont bornées et ses métadonnées retirées ;
  - un SVG, un fichier texte renommé en `.png` ou une image tronquée donnent 400 ;
  - un dépôt écrit une nouvelle clé, met `logoKey` à jour, supprime l'ancienne clé, journalise
    et alerte (« déposé », « remplacé », « retiré ») ;
  - si l'écriture en base échoue, la nouvelle clé est supprimée et l'ancienne est conservée ;
  - le flux public est `null` si la page est inactive ou sans logo.
- **`src/app/api/giving/logo/__tests__/route.test.ts`** :
  - 411 sans `Content-Length`, 413 au-delà de la limite, sans lire le corps ;
  - 403 sans `giving:manage` dans l'église du formulaire ;
  - 201 pour un Comptable ;
  - le `DELETE` demande la même permission ;
  - le `GET` du paramétrage renvoie l'image avec `no-store`.
- **`src/app/api/giving/public/[churchSlug]/logo/__tests__/route.test.ts`** : 404 pour une page
  inactive ou sans logo, et 200 sinon, en `image/png`, avec `nosniff` et un cache immuable.
- **`slide-fit.test.ts`** : `fitName` garde la taille choisie si le nom tient, la réduit par pas de
  2 px, et passe à la ligne à 26 px en dernier recours. `fitUrlLines` avec un `fits` qui refuse les
  grandes tailles (contrainte de hauteur) descend sur deux lignes jusqu'à 34 px.
- **`church-name.test.ts`** : trois jeux de classes distincts, tous avec `break-words`.
- **`src/app/api/giving/__tests__/route.test.ts`** : le `PUT` transmet les nouveaux réglages, et
  une taille invalide donne 400.
- **Vérification manuelle** (`npm run dev`, jeu de données fictif, stockage local de dev) :
  - dépôt, remplacement et retrait du logo ;
  - refus d'un SVG et d'un fichier de 3 Mo ;
  - page publique à 320 px avec un logo large et un nom en Grand ;
  - slide avec un nom de plus de 50 caractères en Grand et un logo très large (aperçu, plein
    écran, PNG) ;
  - slide avec l'adresse courte `koinonia.iccrennes.fr/donner/icc-rennes`, logo et nom en Grand :
    adresse entière sur deux lignes, QR code à 470 px ;
  - alerte reçue au dépôt.
