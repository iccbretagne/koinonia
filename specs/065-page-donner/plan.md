# Plan technique — Page publique « Donner » et slide de projection

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-10-18

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` importe le module `giving` par son index
  (`@/modules/giving`), ses schémas purs (`@/modules/giving/schemas`, pour `contract.ts`) et
  rien d'autre.
- [x] **Sécurité** :
  - les routes API de paramétrage passent par `requireChurchPermission("giving:manage", churchId)`,
    avec `churchId` toujours explicite ;
  - la page publique ne lit que la page **active** de l'église désignée par son adresse, sans
    jamais exposer d'identifiant interne ni les champs d'un autre tenant.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`). La nouvelle permission est
  déclarée dans le manifeste du module.
- [x] **Validation** Zod sur l'unique mutation (`PUT`) : IBAN (clé mod 97), BIC, URL https et
  champs obligatoires selon les sections activées.
- [x] **Migration** Prisma `add_giving_page` (une table, aucune donnée existante touchée).
- [x] **Enums** : aucun nouvel enum. Les rôles du manifeste sont des chaînes `Role` connues.
- [x] **UI** : `Input`, `Textarea`, `Field`, `Checkbox`, `Button`, `Alert`, `PageHeader`,
  `useToast` et `EmptyState` réutilisés. Le hook `useSnapshotExport` (lot 7b) est réutilisé pour
  l'export de la slide. Trois composants sont créés, faute d'équivalent :
  - la vue de la page, partagée entre la page publique et l'aperçu du paramétrage ;
  - la ligne copiable ;
  - la slide.

Aucune entorse à la constitution n'est nécessaire.

## Approche générale

Un nouveau module **`giving`** (« Dons »), activable par instance comme les autres
(`ENABLED_MODULES`), qui ne dépend que de `core`. Il porte :

- une table de paramètres, une ligne par église ;
- la permission `giving:manage` ;
- le domaine de notification `giving` ;
- ses services : lecture publique, enregistrement avec contrôle d'intégrité, alertes.

Côté interface :

- **`/donner/[churchSlug]`** : page publique, Server Component, sans compte.
- **`/dons`** : paramétrage avec aperçu en direct, pour Admin, Secrétaire, Comptable et
  Super Admin.
- **`/dons/slide`** : slide 16:9 avec téléchargement PNG et plein écran.

Le fil directeur est l'**intégrité des coordonnées**. Toute écriture passe par un seul service,
qui :

1. valide les données ;
2. compare l'état précédent au nouvel état ;
3. enregistre ;
4. journalise ;
5. alerte quand une coordonnée de paiement change ou quand la page est désactivée.

Aucune route ni aucun écran n'écrit en dehors de ce service.

## Modèle de données

```prisma
/// Page publique « Donner » d'une église (spec 065). Une ligne par église, créée au premier
/// enregistrement : absente = page jamais configurée.
model GivingPage {
  id        String  @id @default(cuid())
  churchId  String  @unique
  church    Church  @relation(fields: [churchId], references: [id], onDelete: Cascade)
  enabled   Boolean @default(false)

  intro             String? @db.Text

  // Don en ligne
  onlineEnabled     Boolean @default(false)
  onlineUrl         String? @db.VarChar(500)   // https uniquement
  onlineDescription String? @db.Text
  onlineNote        String? @db.VarChar(200)

  // Virement
  transferEnabled   Boolean @default(false)
  beneficiary       String? @db.VarChar(140)
  iban              String? @db.VarChar(34)    // normalisé : majuscules, sans espaces
  bic               String? @db.VarChar(11)
  transferReference String? @db.VarChar(140)   // libellé conseillé, « Prénom Nom » compris

  // Sur place (chèques et espèces dans l'enveloppe de l'accueil)
  onsiteEnabled     Boolean @default(false)
  checkPayee        String? @db.VarChar(140)
  onsiteText        String? @db.Text

  // Reçu fiscal — désactivé par défaut, sans texte par défaut
  taxReceiptEnabled Boolean @default(false)
  taxReceiptText    String? @db.Text

  // Bas de page
  verseText         String? @db.Text
  verseReference    String? @db.VarChar(80)
  contactEmail      String? @db.VarChar(254)
  address           String? @db.VarChar(255)
  socialHandle      String? @db.VarChar(80)

  // Slide
  shortUrl          String? @db.VarChar(255)   // optionnelle, https

  updatedById       String?
  updatedBy         User?    @relation("GivingPageUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("giving_pages")
}
```

Les relations inverses sont ajoutées sur `Church` (`givingPage GivingPage?`) et sur `User`.

La migration s'appelle `add_giving_page`. Elle ne fait que créer la table et sa clé étrangère :
aucune donnée n'est reprise. Le job CI `migrations` la rejoue sur une base vierge.

Les valeurs par défaut des textes (introduction, note du don en ligne, texte « sur place »,
verset 2 Corinthiens 9:7) ne sont **pas** stockées en base. Elles sont proposées par le service
quand la ligne n'existe pas encore, puis enregistrées au premier `PUT`. Le texte du reçu fiscal
n'a jamais de valeur par défaut (spec).

## API

Chaque route a son `contract.ts` (ADR-0023). Les schémas Zod vivent dans
`src/modules/giving/schemas.ts`, qui est pur. Il faut ensuite lancer `npm run openapi` et
commiter `docs/openapi.json`.

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/giving?churchId=` | GET | `giving:manage` dans `churchId` | — | paramètres de la page, ou défauts si jamais configurée, plus `hasAccountingEmails` et `publicUrl` |
| `/api/giving` | PUT | `giving:manage` dans `body.churchId` | `givingPageSchema` (voir ci-dessous) | paramètres enregistrés |

**Schéma `givingPageSchema`** :

- **`churchId`** : identifiant de l'église.
- **`enabled`** : page activée ou non.
- **Champs texte de chaque section** : nettoyés par `trim`, avec une longueur maximale alignée
  sur les colonnes.
- **`onlineUrl`, `shortUrl`** : URL https.
- **`iban`** : normalisé (espaces retirés, majuscules), puis vérifié par la clé ISO 13616
  mod 97.
- **`bic`** : 8 ou 11 caractères, au format BIC.
- **`contactEmail`** : adresse email valide.
- **Contrôles `superRefine` sur les sections activées** :
  - virement : `beneficiary` et `iban` obligatoires ;
  - don en ligne : `onlineUrl` obligatoire ;
  - sur place : `checkPayee` obligatoire ;
  - reçu fiscal : `taxReceiptText` obligatoire.
- **Message d'erreur IBAN** : explicite, par exemple « IBAN invalide : vérifiez les caractères
  saisis (clé de contrôle incorrecte) ». Il remonte au champ concerné.

Aucune route API publique : la page publique est un Server Component qui appelle le service.
Elle n'a donc ni surface JSON publique ni rate limit à prévoir. La slide est elle aussi rendue
côté serveur (`/dons/slide`), sans route API dédiée.

**Manifeste** (`src/modules/giving/manifest.ts`, ajouté à `src/lib/manifests.ts`) :

```ts
routes: {
  authenticated: [{ path: "/dons" }],
  api: [{ path: "/api/giving" }],
  public: [{ path: "/donner" }],
},
permissions: { "giving:manage": ["SUPER_ADMIN", "ADMIN", "SECRETARY", "ACCOUNTANT"] },
notificationDomains: [{
  key: "giving", label: "Page de dons",
  description: "Modification des coordonnées de paiement de la page de dons.",
  defaultEmail: true, visibleWith: ["giving:manage", "church:settings"],
}],
```

## Services / logique métier

Les services vivent dans `src/modules/giving/services/` et sont exportés par l'index du module.

- **`iban.ts`** : fonctions pures.
  - `normalizeIban` retire espaces et tirets, et met en majuscules.
  - `isValidIban` vérifie la longueur par pays (table limitée aux pays SEPA, avec repli sur
    15 à 34 caractères) et la clé mod 97, calculée en BigInt ou par blocs.
  - `formatIban` regroupe par 4 caractères pour l'affichage.
  - `isValidBic` vérifie le format BIC.
- **`giving-page.ts`** :
  - `getGivingSettings(churchId)` renvoie la ligne existante, ou les défauts pour l'éditeur.
  - `getPublicGivingPage(slug)` : église par `slug`, puis page `enabled`. Renvoie `null` dans
    les trois cas (page absente, désactivée, église inconnue), ce qui garantit un seul message
    pour les trois. Ne projette que les champs des sections activées : pas de `churchId`, pas
    d'auteur.
  - `updateGivingPage(churchId, input, actor)`, en transaction :
    1. lit l'état précédent ;
    2. fait l'upsert ;
    3. calcule le diff des **champs sensibles** (`iban`, `bic`, `beneficiary`, `onlineUrl`,
       `onlineEnabled`, `transferEnabled`) et de `enabled`.

    Hors transaction ensuite :
    - `logAudit({ entityType: "GivingPage", action: "UPDATE" | "CREATE", details: { changed: [...] } })` ;
    - si un champ sensible a changé, ou si la page passe d'active à inactive, appel de
      `alertPaymentDetailsChange`.
- **`alerts.ts`** : `alertPaymentDetailsChange(church, diff, actor)`.
  - Les adresses viennent de `parseEmailList(church.accountingEmails)`.
  - **Si au moins une adresse existe** : `sendEmail` direct. C'est une adresse institutionnelle
    configurée par l'église, donc dans la liste blanche de CLAUDE.md. L'email liste chaque champ
    avec son ancienne et sa nouvelle valeur (IBAN formaté), l'auteur, la date et un lien vers
    `/dons`.
  - **Sinon** : `notifyUsersWithRole(churchId, "ADMIN", { domain: "giving", type: "GIVING_PAYMENT_DETAILS_CHANGED", … })`.
    L'email des Admins suit alors leurs préférences.
  - Une erreur d'envoi est journalisée sans faire échouer l'enregistrement. L'audit fait foi.

## UI / composants

**Vue partagée.** `GivingPageView` est un Server Component sans état. Il reçoit les données
déjà projetées et rend les sections dans l'ordre de la spec. Il est utilisé à deux endroits :

- la page publique ;
- l'aperçu du paramétrage, rendu côté client à partir de l'état du formulaire. La vue n'utilise
  aucune API serveur, elle reste donc importable des deux côtés.

**Ligne copiable.** `CopyRow` est un client component : libellé, valeur et bouton « Copier ».
Il passe par `navigator.clipboard`, avec deux replis :

- `document.execCommand("copy")` ;
- sinon, la sélection du texte, avec l'état « Sélectionné ».

L'IBAN s'affiche groupé par 4 caractères, mais se copie sans espaces.

**Pages :**

1. **`src/app/donner/[churchSlug]/page.tsx`** (public).
   - Appelle `getPublicGivingPage(slug)`. Si le résultat est `null`, appelle `notFound()`, et le
     `not-found.tsx` du segment affiche « Cette page n'est pas disponible ». Le message est
     identique dans les trois cas.
   - `generateMetadata` donne le titre « Donner — <église> ».
   - La mise en page reprend celle de `/rejoindre` : en-tête `bg-brand`, contenu centré
     `max-w-xl`, tokens sémantiques, thèmes clair et sombre.
   - Le bouton principal du don en ligne est un lien stylé `buttonClasses("primary")`, avec
     `target="_blank"` et `rel="noopener noreferrer"`.
2. **`src/app/(auth)/dons/page.tsx`** (paramétrage).
   - Garde : `requireChurchPermission("giving:manage", currentChurchId)` côté serveur.
   - `GivingSettingsClient` affiche le formulaire par sections, chacune avec son interrupteur
     d'activation et ses champs `Input`/`Textarea`. Sur grand écran, l'aperçu en direct est en
     colonne à droite ; sur mobile, il passe dans un onglet « Aperçu ».
   - Un `Alert` signale l'absence d'adresse comptable.
   - Bouton « Enregistrer », avec les erreurs Zod affichées sur les champs.
   - Lien « Voir la page publique ».
   - Lien « Slide de projection », désactivé tant que la page n'est pas active.
3. **`src/app/(auth)/dons/slide/page.tsx`** (slide).
   - Même garde. Si la page n'est pas active, affiche un `EmptyState` qui renvoie au
     paramétrage.
   - Le Server Component génère le QR code en SVG. La cible est `shortUrl`, à défaut
     `${APP_URL}/donner/${slug}`.
   - `GivingSlide` affiche une scène 1920 × 1080 mise à l'échelle par CSS, comme dans la
     maquette, et deux boutons :
     - « Télécharger (PNG) » : `useSnapshotExport` avec `captureWidth: "1920px"`, scale 1.
     - « Plein écran » : `requestFullscreen()` sur la scène. Sortie avec Échap, un clic ou un
       retour arrière.

**Rendu de la slide.** Le fond est toujours sombre et reprend l'identité ICC, quel que soit le
thème de l'utilisateur. Cela relève des exceptions documentées du design system (« visionneuses
toujours sombres, exports ») : les quelques couleurs en dur portent
`// eslint-disable-next-line no-restricted-syntax -- slide de projection, rendu fixe`.
`useSnapshotExport` force aujourd'hui `data-theme="light"`. On lui ajoute une option
`theme?: "light" | "dark" | null` : la valeur par défaut reste `"light"`, et `null` laisse le
rendu tel quel.

**Navigation.**

- Une entrée `{ href: "/dons", label: "Page de dons", permissions: ["giving:manage"] }` est
  ajoutée dans `configLinksDef` de `(auth)/layout.tsx`. Elle est filtrée par
  `registry.has("giving")`.
- Elle apparaît dans l'espace « Administration ». Le Comptable n'avait jusqu'ici aucune entrée
  dans cet espace : il y verra la seule « Page de dons ». Ce comportement est voulu, et vérifié
  dans `navigation.test.ts`.
- Le panneau « Plus » mobile n'est pas modifié : il affiche déjà les espaces accessibles.

## Décisions & alternatives écartées

- **Choix : un module `giving` distinct.** *Pourquoi* : `accounting` traite les demandes de
  dépenses internes. La page de dons est une vitrine publique, sans lien fonctionnel avec ces
  demandes. Un module séparé est activable seul, a sa propre permission et n'ajoute aucune
  dépendance entre modules.
- **Écarté : rattacher le paramétrage aux « Paramètres de l'église »** (`/admin/churches/[id]`).
  *Raison* : la section `/admin` n'est pas ouverte au Comptable, et ces paramètres exigent
  `church:settings` (Admin seul). Les rôles décidés (Admin, Secrétaire, Comptable) imposent une
  permission et un écran propres.
- **Choix : des sections fixes avec colonnes typées.** *Pourquoi* : la spec exclut le contenu
  libre. Des colonnes typées permettent de valider chaque coordonnée et de calculer un diff champ
  par champ pour l'alerte. *Écarté* : un JSON de blocs configurables, plus souple mais
  invalidable finement et sans diff lisible.
- **Choix : pas de route API publique.** La page publique lit directement le service. Cela
  réduit la surface exposée et n'impose ni rate limit ni contrat public.
- **Choix : QR code généré côté serveur en SVG** (nouvelle dépendance `qrcode`, licence MIT,
  sans dépendance native). *Pourquoi* : un vecteur reste net à toute taille, et rien n'est
  envoyé à un service tiers. *Écarté* : une API de génération externe (fuite de l'URL, ajout
  d'une origine dans la CSP) ou un encodeur QR maison (risque d'erreur, code à maintenir).
- **Choix : alerte par `sendEmail` direct aux adresses comptables.** Ce sont des adresses
  institutionnelles, dans la liste blanche de CLAUDE.md. À défaut d'adresse, des
  **notifications** aux Admins, par les helpers du domaine `giving`, qui respectent leurs
  préférences email.
- **Choix : l'audit suffit comme historique.** Les modifications vont dans `AuditLog`, déjà
  consulté par l'Admin dans « Historique ». *Écarté* : une table de versions de la page, non
  demandée par la spec.
- **Choix : défauts de texte dans le code, pas en base.** Une église voit des textes proposés
  dès le premier affichage du formulaire, sans migration de données.
- **Pas d'ADR.** Ajouter un module suit le pattern établi (ADR-0011/0012), et la dépendance
  `qrcode` est locale à cette feature.

## Risques & points d'attention

- **Détournement de l'IBAN** par un compte compromis ou un rôle trop large.
  - *Mitigation* : `giving:manage` limité aux 4 rôles, alerte immédiate à la comptabilité ou aux
    Admins avec ancienne et nouvelle valeur, audit.
  - *Limite assumée* : une alerte n'empêche pas la modification. Une validation à deux personnes
    n'est pas demandée par la spec.
- **Contenu injecté dans la page publique.** Tous les textes sont rendus comme du texte React
  échappé, jamais en HTML. Les URL sont limitées au schéma https par Zod, ce qui exclut
  `javascript:`.
- **Lisibilité de la slide en projection.** On reprend les tailles mesurées dans la maquette :
  QR code d'environ 470 px dans la scène 1920 et adresse en grandes capitales. Si l'adresse
  courte est longue, sa police est réduite automatiquement pour tenir sur une ligne.
- **Fiabilité de l'export PNG.** `html2canvas` capture mal certains filtres CSS
  (`backdrop-filter`). La slide n'en utilise aucun : fonds en dégradés simples et SVG inline.
- **CSP.** La page publique ne charge aucune ressource externe : le lien de don en ligne est un
  simple `<a>`. Aucune origine n'est ajoutée.
- **Garde `prisma-boundary`.** Les routes passent par les services du module, le seuil n'augmente
  donc pas.
- **Exhaustivité des routes.** Les préfixes `/donner`, `/dons` et `/api/giving` sont déclarés une
  seule fois. `route-exhaustiveness.test.ts` le vérifie.

## Stratégie de tests

Les tests utilisent Vitest, avec Prisma mocké via `@/__mocks__/prisma` comme le reste du dépôt.

- **`iban.test.ts`** :
  - IBAN FR valides, avec et sans espaces, en minuscules ;
  - clé fausse, longueur incorrecte, caractères invalides ;
  - `formatIban` ;
  - BIC sur 8 et 11 caractères, et formats invalides.
- **`schemas.test.ts`** :
  - champs obligatoires par section activée ;
  - https imposé pour `onlineUrl` et `shortUrl` ;
  - message d'erreur IBAN ;
  - sections désactivées sans exigence.
- **`giving-page.test.ts`** :
  - `getPublicGivingPage` renvoie `null` pour une page absente, désactivée ou une église
    inconnue, et ne projette que les sections activées, sans `churchId` ;
  - `updateGivingPage` :
    - un champ sensible modifié déclenche l'alerte et l'audit ;
    - une modification de verset seul n'écrit que l'audit, sans alerte ;
    - une désactivation déclenche l'alerte ;
    - une première création compte comme un changement de coordonnées.
- **`alerts.test.ts`** :
  - avec des adresses comptables, `sendEmail` reçoit les ancienne et nouvelle valeurs ;
  - sans adresse, `notifyUsersWithRole("ADMIN", { domain: "giving" })` est appelé ;
  - un échec SMTP n'est pas propagé.
- **Route `api/giving`** :
  - 403 pour Ministre, Resp. département et STAR ;
  - 200 pour Admin, Secrétaire, Comptable et Super Admin ;
  - 400 sur un IBAN invalide ;
  - le `churchId` du corps fait autorité, et un utilisateur sans rôle dans cette église est
    refusé.
- **Matrice des permissions** : `permissions.test.ts` est mis à jour pour `giving:manage`, avec
  le tableau de CLAUDE.md et `docs/auth.md`.
- **Navigation** : « Page de dons » visible pour Admin, Secrétaire et Comptable, absente pour un
  STAR ou quand le module est désactivé.
- **Contrats** : `openapi.test.ts` passe après `npm run openapi`.
- **Hors Vitest** : vérification sur staging de la page publique (clair et sombre, 320 px), de la
  copie sur iOS et Android, du PNG téléchargé et du plein écran.
