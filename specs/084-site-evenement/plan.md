# Plan technique — Site d'événement de billetterie

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-11-21

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout vit dans le module `ticketing` (services `site*.ts`, schémas
      purs dans `schemas.ts`) ; `src/app/` n'importe que `@/modules/ticketing`, `/auth`, `/schemas`
- [x] **Sécurité** : routes d'édition derrière `requireEventAction(id, "site")` (église de
      l'événement), approbation des domaines derrière `requireSuperAdmin()`, activation derrière
      `requireChurchPermission("church:settings", churchId)` ; pages publiques sans session, ne
      lisant que des données publiées
- [x] **Permissions** : aucune permission d'église nouvelle ; un rôle d'événement
      `COMMUNICATION` et une action `site` dans `EVENT_ACTIONS`
- [x] **Validation** Zod : thème, pages et blocs sont des schémas discriminés stricts
- [x] **Migration** Prisma : oui (voir ci-dessous)
- [x] **Enums** depuis `@/generated/prisma/client`
- [x] **UI** : éditeur construit avec `src/components/ui/` ; le site public a ses propres
      composants de rendu (aucune couleur en dur : variables CSS calculées du thème)

## Approche générale

Le site est un **document structuré** (thème + pages + blocs) validé par Zod et stocké en JSON
avec deux versions : **brouillon** (édité) et **publié** (instantané figé à la publication). Il est
rendu par des **Server Components** qui transforment chaque bloc en JSX — **aucun HTML stocké,
aucun `dangerouslySetInnerHTML`**. Le style vient de **variables CSS** calculées côté serveur à
partir de couleurs hexadécimales validées ; dégradés, fonds et séparateurs sont des choix
d'énumérations traduits en CSS par le serveur, jamais une valeur saisie.

Le site est servi sur un **hôte dédié** : `{sous-domaine}.{SITE_BASE_DOMAIN}` (lot 1) ou un
domaine vérifié et approuvé (lot 3). `src/proxy.ts` reconnaît l'hôte et **réécrit** la requête
vers `/site/{siteSlug}/…` ; sur un hôte de site, **seules** les pages du site, l'inscription, la
réservation, le billet et leurs API publiques passent — tout le reste répond 404.

## Modèle de données

```prisma
enum TicketingRole {
  ORGANIZER
  TREASURER
  RECEPTION
  CATERING
  OBSERVER
  COMMUNICATION        // nouveau (spec 084)
}

model TicketingSite {
  id             String    @id @default(cuid())
  eventId        String    @unique
  churchId       String
  slug           String    @unique @db.VarChar(63)   // sous-domaine
  draft          Json                                 // { theme, pages } validé par siteDocumentSchema
  published      Json?                                // instantané publié
  publishedAt    DateTime?
  publishedById  String?
  afterCloseDays Int       @default(30)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  event   TicketingEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  assets  TicketingSiteAsset[]
  domain  TicketingSiteDomain?
  @@index([churchId])
  @@map("ticketing_sites")
}

model TicketingSiteAsset {
  id        String   @id @default(cuid())
  siteId    String
  key       String   @db.VarChar(255)   // stockage (file-storage)
  width     Int
  height    Int
  bytes     Int
  createdAt DateTime @default(now())
  site TicketingSite @relation(fields: [siteId], references: [id], onDelete: Cascade)
  @@index([siteId])
  @@map("ticketing_site_assets")
}

enum TicketingSiteDomainStatus { PENDING VERIFIED APPROVED SUSPENDED }

model TicketingSiteDomain {
  id            String   @id @default(cuid())
  siteId        String   @unique
  churchId      String
  host          String   @unique @db.VarChar(253)
  proofToken    String   @db.VarChar(64)
  status        TicketingSiteDomainStatus @default(PENDING)
  lastCheckedAt DateTime?
  lastError     String?  @db.VarChar(300)
  approvedById  String?
  createdAt     DateTime @default(now())
  site TicketingSite @relation(fields: [siteId], references: [id], onDelete: Cascade)
  @@index([churchId, status])
  @@map("ticketing_site_domains")
}

model TicketingSiteSettings {             // activation par l'Admin d'église (comme McpChurchSettings)
  churchId String  @id
  enabled  Boolean @default(false)
}
```

Migration `add_ticketing_sites` (générée par `prisma migrate diff`, rejouée par le job `migrations` de la CI). L'ajout d'une valeur d'enum MariaDB est
un `ALTER … MODIFY ENUM(…)` sans perte.

## Document du site (schémas purs, `@/modules/ticketing/schemas`)

- **Thème** : `colors` (5 hex validés `^#[0-9a-f]{6}$` : primary, secondary, accent, background,
  text), `fonts` (`heading`, `body` ∈ liste fermée de 6 polices), `logoAssetId?`,
  `headerAssetId?`, `background: Background`.
- **`Background`** (partagé page / bande / bannière) — union discriminée :
  - `{ kind: "none" }` · `{ kind: "color", color: PaletteKey }`
  - `{ kind: "gradient", stops: PaletteKey[2..3], direction: "vertical" | "horizontal" | "diagonal" | "radial" }`
  - `{ kind: "image", assetId, veil: PaletteKey, opacity: 0.2..0.9, fixed: boolean }`
  `PaletteKey` = clé de couleur du thème : **jamais une couleur libre** dans un bloc.
- **Pages** (≤ 8) : `{ id, title, slug, inMenu, kind: "content" | "tickets" | "menus" | "practical", sections[] }`.
- **Sections** (bandes) : `{ background: Background, blocks: Block[] (≤ 20) }`.
- **Blocs** — union discriminée stricte : `richText`, `image`, `gallery` (≤ 24 images),
  `palette` (≤ 8 pastilles `{ label, color: hex }` — seule exception de couleur libre, affichée
  en pastille, jamais appliquée au texte), `cards` (≤ 6, titre + image + liste), `doDont`,
  `icons` (pictos d'une bibliothèque fermée, ~40 lucide), `faq`, `button`
  (`{ label, target: { page: slug } | { booking: true } }`), `banner`
  (`{ background, title, tagline }`), `separator` (`{ style: "line" | "goldDiamond" | "wave" }`).
- **Texte riche** : stocké en **arbre** (paragraphes, titres h2/h3, listes ; marques gras,
  italique ; liens). L'éditeur saisit un **Markdown restreint**, converti côté serveur par un petit
  analyseur maison (pas de bibliothèque HTML) ; les liens n'acceptent que `https:`, `mailto:` ou
  une page du site (`page:slug`). Rendu par des composants React.

## Contrôle de lisibilité

`contrast.ts` (pur) : luminance relative et ratio WCAG 2.1. Pour chaque fond (page, bande,
bannière), le texte posé dessus doit atteindre **4,5:1** (3:1 pour les titres ≥ 24 px) au **point
le moins favorable** :
- couleur unie : la couleur ;
- dégradé : chacune de ses couleurs ;
- image : la couleur du voile mélangée, à son opacité, avec le **noir et le blanc** (pire cas de
  l'image dessous).
Le refus nomme la combinaison et propose une piste (voile plus opaque, couleur de texte).
Appliqué à l'enregistrement du brouillon et revérifié à la publication.

## Services (`src/modules/ticketing/services/`)

- `site.ts` : `getSite`, `createSite` (sous-domaine dérivé du `slug` de l'événement, unique,
  réservés `www`, `app`, `api`, `admin`, `mail`…), `saveDraft` (Zod + lisibilité + assets
  appartenant au site), `publish` (instantané, audit), `unpublish`, `setAfterCloseDays`,
  `resolveSiteByHost(host)` (sous-domaine ou domaine `APPROVED`), `publicSiteView(slug)` (instantané
  publié + données publiques de `getPublicEvent` + état de visibilité : brouillon ⇒ invisible,
  clôturé ⇒ « Événement terminé » jusqu'à `closedAt + afterCloseDays`, ensuite 404).
- `site-assets.ts` : `uploadAsset` — 8 Mo max en entrée, `sniffImage` (JPEG/PNG/WebP), `sharp` :
  `rotate()`, redimensionnement ≤ 2400 px, conversion WebP, **métadonnées supprimées** ;
  `readAsset` (seulement si l'asset est référencé par la version publiée, ou pour l'équipe).
- `site-domains.ts` (lot 3) : `requestDomain` (1 par site, 5 actifs par église, nom de domaine
  validé, jamais un sous-domaine de `SITE_BASE_DOMAIN` ni de l'hôte de l'application),
  `verifyDomain` (`node:dns/promises` : TXT `_koinonia.{host}` = `proofToken`, et CNAME vers
  `SITE_TARGET_HOST` ou A/AAAA vers ses IP), `approveDomain`/`rejectDomain` (Super Admin),
  `recheckDomains` (quotidien, branché au cron existant : échec ⇒ `SUSPENDED` + notification de
  l'organisateur), `approvedHosts()` (pour le proxy et Traefik).

## Routage et isolation (`src/proxy.ts`)

1. Hôte = hôte de l'application ⇒ comportement actuel inchangé.
2. Hôte = `*.{SITE_BASE_DOMAIN}` ou domaine approuvé ⇒ hôte de site :
   - liste blanche : `/` et pages du site, `/inscription/…`, `/reservation/…`, `/billet/…`,
     `/site-assets/…`, les API publiques de la billetterie, `/_next/…` ; **tout le reste ⇒ 404** ;
   - réécriture vers `/site/{siteSlug}/{page}` ;
   - **CSP propre au site** : `img-src 'self'` (assets servis par Koinonia), `connect-src 'self'`,
     `frame-ancestors 'none'`, pas d'origine externe ;
   - aucun cookie de session n'est lu ni posé (Auth.js pose des cookies **sans attribut Domain** :
     ils ne sont pas envoyés aux sous-domaines — vérifié par un test).
3. Cache mémoire des hôtes approuvés (rafraîchi toutes les 60 s) : pas de requête base à chaque
   appel.

## Lot 3 — certificats (Traefik)

Traefik lit sa configuration dynamique par **fournisseur HTTP** : Koinonia expose
`GET /api/internal/traefik` (joignable seulement depuis `127.0.0.1` **et** jeton porteur
`TRAEFIK_PROVIDER_TOKEN`), qui renvoie un routeur par domaine `APPROVED` avec
`certResolver: letsencrypt`. Le sous-domaine par défaut repose sur **un certificat joker**
`*.{SITE_BASE_DOMAIN}` (défi DNS chez l'hébergeur DNS de la plateforme). Documenté dans
`docs/production.md`.

## API (chacune avec `contract.ts`, ADR-0023, et déclarée dans le manifeste, ADR-0012)

| Endpoint | Méthode | Accès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/ticketing/events/[id]/site` | GET / POST / PUT | rôle `site` | brouillon (`siteDocumentSchema`) | site + erreurs de lisibilité |
| `/api/ticketing/events/[id]/site/publish` | POST / DELETE | rôle `site` | — | état publié |
| `/api/ticketing/events/[id]/site/assets` | POST | rôle `site` | fichier | `{ id, width, height }` |
| `/api/ticketing/events/[id]/site/domain` | GET / POST / DELETE | rôle `configure` | `{ host }` | état, enregistrements DNS attendus |
| `/api/ticketing/events/[id]/site/domain/verify` | POST | rôle `configure` | — | état |
| `/api/ticketing/site-domains` | GET | Super Admin | — | domaines en attente |
| `/api/ticketing/site-domains/[domainId]` | PATCH | Super Admin | `{ decision, reason? }` | état |
| `/api/ticketing/church/[churchId]/sites` | GET / PUT | `church:settings` | `{ enabled }` | état |
| `/api/internal/traefik` | GET | localhost + jeton | — | configuration dynamique Traefik |
| `/site-assets/[assetId]` | GET | public (asset publié) | — | image |

## UI

- **Onglet « Site »** de `/billetterie/[id]` (visible pour `ORGANIZER`/`COMMUNICATION`) :
  thème (pastilles, listes de polices, fonds), pages (liste, ordre, ajout), éditeur de sections et
  blocs (formulaires par type, `Field`, `Select`, `Modal`, `BottomSheet`), messages de lisibilité
  en ligne, **aperçu** dans un panneau (rendu par les mêmes composants que le site public),
  Publier / Dépublier.
- **Rôle Communication** : la page de l'événement ne montre que les onglets Aperçu (sans
  chiffres d'inscription) et Site ; les autres onglets et leurs API restent fermés (`EVENT_ACTIONS`
  : `COMMUNICATION` n'est que dans `site`).
- **Admin d'église** : carte « Sites d'événement » dans les paramètres de l'église (comme
  `ChurchMcpCard`).
- **Super Admin** : liste des domaines à approuver (`/admin/…`).
- **Site public** : `src/app/site/[siteSlug]/[[...page]]/page.tsx` + composants de rendu ; polices
  par `next/font` (liste fermée déclarée statiquement).

## Décisions & alternatives écartées

- **Choix** : blocs typés + texte riche en arbre — *Pourquoi* : aucune surface d'injection ; le
  rendu React échappe tout.
- **Écarté** : Markdown/HTML stocké puis assaini (DOMPurify) — *Raison* : une seule faille
  d'assainissement suffit ; et dépendance de plus.
- **Choix** : couleurs des blocs par **clé de palette** — *Pourquoi* : la lisibilité se vérifie une
  fois par thème ; aucune valeur CSS libre.
- **Choix** : réécriture par hôte dans `proxy.ts` + liste blanche de chemins — *Pourquoi* : un
  seul déploiement ; l'hôte de site ne peut pas atteindre l'application.
- **Écarté** : application Next.js séparée pour les sites — *Raison* : double déploiement, double
  accès aux données publiques.
- **Choix** : fournisseur HTTP Traefik — *Pourquoi* : nouveaux domaines sans édition manuelle ni
  redémarrage. **Structurant ⇒ ADR-0031** « Sites d'événement : routage par hôte et domaines
  dédiés » (isolation, liste blanche, fournisseur Traefik, certificat joker).
- **Écarté** : Caddy « on-demand TLS » — *Raison* : changerait de reverse proxy en production.

## Risques & points d'attention

- **Domaine des sites** (tranché le 21 novembre 2026) : `SITE_BASE_DOMAIN=evenements.iccrennes.fr`
  (sites en `*.evenements.iccrennes.fr`). Si l'application n'est pas servie sous `iccrennes.fr`,
  les sites sont sur un **domaine enregistrable distinct** : ils ne sont pas « même site » que
  l'application et ne reçoivent jamais ses cookies — meilleure isolation. Conditions maintenues et
  testées quoi qu'il en soit :
  - cookies de session Auth.js **sans attribut `Domain`** : test qui échoue si un `Domain`
    apparaît ;
  - aucun script ni style fourni par l'organisateur, CSP stricte sur les hôtes de site ;
  - aucun formulaire ni appel des sites vers les routes authentifiées de l'application ;
  - certificat joker `*.evenements.iccrennes.fr` (défi DNS sur la zone `iccrennes.fr`).
- **Quota Let's Encrypt** : 5 domaines par église, certificats demandés seulement après
  approbation.
- **Poids des pages** : images converties en WebP ≤ 2400 px ; galeries en `loading="lazy"`.
- **Polices** : `next/font` exige une déclaration statique ; la liste fermée (6) est déclarée une
  fois, seules les polices choisies sont chargées.
- **Rendu de l'éditeur** : prévisualisation par les mêmes composants que le site ⇒ pas d'écart
  entre aperçu et publication.

## Livraison (multi-PR vers `feat/site-evenement`)

1. Lot 1a : migration, rôle `COMMUNICATION`, activation église, schémas (thème, fonds), contraste.
2. Lot 1b : assets d'image, routage par hôte, site public (accueil), thème sur l'inscription,
   éditeur thème + accueil, publication. **ADR-0031.**
3. Lot 2 : pages, sections, blocs, pages automatiques, navigation, « Événement terminé ».
4. Lot 3 : domaines dédiés (vérification, approbation, cron, fournisseur Traefik, documentation).

## Stratégie de tests

- **Schémas** : chaque bloc valide/invalide ; liens refusés (`javascript:`, `data:`, `http:`) ;
  couleur libre refusée hors palette ; bornes (pages, blocs, images).
- **Texte riche** : l'analyseur ne produit jamais de nœud hors liste ; balises HTML saisies
  rendues comme texte.
- **Contraste** : valeurs de référence WCAG ; dégradé et voile au pire cas ; refus et piste.
- **Assets** : faux type (extension ≠ contenu) refusé ; métadonnées absentes après traitement.
- **Proxy** : hôte de site ⇒ `/admin`, `/api/users`, `/api/auth/*` en 404 ; pages autorisées
  réécrites ; CSP du site posée ; hôte inconnu ⇒ 404.
- **Visibilité** : brouillon invisible, publié visible, clôturé « terminé » puis 404 après
  `afterCloseDays`.
- **Rôle Communication** : accès à `site`, refus sur `read`/`payments`/`configure` (routes et
  `EVENT_ACTIONS`) ; matrice `permissions.test.ts` inchangée (rôle d'événement, pas d'église).
- **Domaines** : TXT absent ⇒ reste `PENDING` ; 6e domaine refusé ; recontrôle en échec ⇒
  `SUSPENDED` + notification ; fournisseur Traefik refusé sans jeton ou hors localhost.
- **Aucune donnée personnelle** : rendu des pages automatiques sans email, téléphone ni nom
  d'inscrit.
