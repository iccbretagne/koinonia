# Plan technique — Trésorerie de l'église : registre des entrées et des sorties

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-11-05

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe que `@/modules/treasury`, `@/modules/treasury/auth`
      et `@/modules/treasury/schemas`. `treasury` importe seulement `@/modules/accounting` (index)
      et `@/modules/storage`. `accounting` et `shuttle` n'importent jamais `treasury` : le lien
      passe par la couche `src/app` (routes de paiement et d'abondement)
- [x] **Sécurité** : chaque route passe par `requireTreasuryAccess(churchId)` (garde du module,
      bâtie sur `requireAuth` + `rolePermissions`) ; église courante pour les collections, église
      de l'objet (lue en base) pour les routes `[id]`, 404 sinon
- [x] **Permissions** via `rolePermissions` : `treasury:manage` (Super Admin, Admin, Comptable) et
      `treasury:reopen` (Super Admin, Admin)
- [x] **Validation** Zod sur toutes les mutations, schémas dans `@/modules/treasury/schemas` et
      les `contract.ts`
- [x] **Migration** Prisma `add_treasury` (pas de `db push`)
- [x] **Enums** importés depuis `@/generated/prisma/enums` / `client`
- [x] **UI** : `PageHeader`, `Tabs`, `DataTable`, `Field`, `Modal`/`BottomSheet`, `StatusChip`,
      `Alert`, `EmptyState`, `ConfirmModal`, `useToast` réutilisés

## Approche générale

Un **nouveau module `treasury`** (« Trésorerie » à l'écran), extension de la comptabilité comme
la navette : `dependsOn: ["core", "accounting"]`, désactivable par `ENABLED_MODULES` (pages et
API en 404, données conservées, comptabilité et navette inchangées).

Le cœur est un **registre de lignes** : montant toujours positif + sens (entrée/sortie), rattaché
à un **compte de trésorerie** de l'église. Les soldes ne sont **jamais stockés** : solde de départ
du compte + somme des lignes non supprimées, calculés à la lecture en centimes entiers (quelques
milliers de lignes par an et par église, comme la navette).

Les mouvements **repris** (paiements de demandes, abondements de la navette) ne sont **pas
recopiés** : leur origine porte une référence facultative vers le compte de trésorerie
(`treasuryAccountId`) et le registre les **lit** et les fusionne, en lecture seule
([ADR-0027](../../docs/adr/0027-reprise-par-lecture-entre-modules.md)). Une correction à
l'origine se reflète donc toujours, sans synchronisation.

Livraison en **4 lots** (un commit par lot) :
1. comptes, catégories, registre, saisie, historique, accès et navigation ;
2. collecte de culte, chèques, remise au compte commun, transferts, clôture mensuelle ;
3. reprises (comptabilité, navette) ;
4. budget, tableau de bord, rapports, export, documentation.

## Modèle de données

```prisma
enum TreasuryAccountKind { CASH ONLINE OTHER }
enum TreasuryDirection   { IN OUT }
enum TreasuryMethod      { CASH CHEQUE TRANSFER CARD ONLINE WERO OTHER }
/// Ligne ordinaire, jambe d'un transfert, ou remise au compte commun.
enum TreasuryEntryKind   { STANDARD TRANSFER DEPOSIT }
/// Catégories système : leur rôle est fixé (le nom reste modifiable).
enum TreasuryCategorySystem { SPECIAL_OFFERING DEPOSIT EXPENSE_REPORTS SHUTTLE }

model TreasuryAccount {
  id             String              @id @default(cuid())
  churchId       String
  name           String              @db.VarChar(80)
  kind           TreasuryAccountKind
  openingBalance Decimal             @db.Decimal(12, 2)
  openingDate    DateTime            @db.Date
  archivedAt     DateTime?
  sortOrder      Int                 @default(0)
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  church         Church              @relation(fields: [churchId], references: [id], onDelete: Cascade)
  entries        TreasuryEntry[]
  payments       FinancialPayment[]  // reprises (lien comptabilité)
  shuttleEntries ShuttleEntry[]      // reprises (lien navette)
  @@unique([churchId, name])
  @@map("treasury_accounts")
}

model TreasuryCategory {
  id        String                  @id @default(cuid())
  churchId  String
  direction TreasuryDirection
  name      String                  @db.VarChar(80)
  system    TreasuryCategorySystem?
  active    Boolean                 @default(true)
  sortOrder Int                     @default(0)
  church    Church                  @relation(fields: [churchId], references: [id], onDelete: Cascade)
  entries   TreasuryEntry[]
  budgets   TreasuryBudget[]
  @@unique([churchId, direction, name])
  @@unique([churchId, system])
  @@map("treasury_categories")
}

/// Objets des offrandes spéciales (missions, construction, actions de grâce…).
model TreasuryPurpose {
  id       String   @id @default(cuid())
  churchId String
  name     String   @db.VarChar(80)
  active   Boolean  @default(true)
  church   Church   @relation(fields: [churchId], references: [id], onDelete: Cascade)
  entries  TreasuryEntry[]
  @@unique([churchId, name])
  @@map("treasury_purposes")
}

model TreasuryEntry {
  id              String            @id @default(cuid())
  churchId        String
  accountId       String
  kind            TreasuryEntryKind @default(STANDARD)
  direction       TreasuryDirection
  categoryId      String?           // null pour une jambe de transfert
  purposeId       String?           // offrande spéciale uniquement
  method          TreasuryMethod
  amount          Decimal           @db.Decimal(12, 2) // toujours > 0
  date            DateTime          @db.Date
  label           String            @db.VarChar(200)
  thirdParty      String?           @db.VarChar(120)
  collectionId    String?           // ligne née d'une collecte
  transferGroupId String?           // les deux jambes d'un transfert
  depositRef      String?           @db.VarChar(60)  // n° de bordereau (remise)
  receiptKey      String?           @db.VarChar(512)
  receiptName     String?           @db.VarChar(255)
  receiptMime     String?           @db.VarChar(100)
  receiptSize     Int?
  createdById     String?
  updatedById     String?
  deletedAt       DateTime?         // suppression logique
  deletedById     String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  // relations church, account, category, purpose, collection (SetNull), createdBy/updatedBy/deletedBy (SetNull)
  chequesIn        TreasuryCheque[] @relation("ChequeCollected")
  chequesDeposited TreasuryCheque[] @relation("ChequeDeposited")
  @@index([churchId, deletedAt, date])
  @@index([accountId, deletedAt, date])
  @@index([transferGroupId])
  @@map("treasury_entries")
}

model TreasuryCollection {
  id          String   @id @default(cuid())
  churchId    String
  accountId   String
  eventId     String?  // culte de l'agenda (SetNull)
  date        DateTime @db.Date
  counter1    String   @db.VarChar(80) // les deux personnes qui ont compté (texte libre)
  counter2    String   @db.VarChar(80)
  createdById String?
  createdAt   DateTime @default(now())
  entries     TreasuryEntry[]
  @@index([churchId, date])
  @@map("treasury_collections")
}

/// Chèque collecté (un par un) ou lot de chèques saisis en total (`count` > 1, sans numéro).
model TreasuryCheque {
  id             String   @id @default(cuid())
  churchId       String
  entryId        String   // ligne d'entrée « Chèque » qui le porte
  number         String?  @db.VarChar(30)
  amount         Decimal  @db.Decimal(12, 2)
  count          Int      @default(1)
  depositEntryId String?  // remise qui l'a emporté ; null = encore en caisse
  entry          TreasuryEntry  @relation("ChequeCollected", fields: [entryId], references: [id], onDelete: Cascade)
  depositEntry   TreasuryEntry? @relation("ChequeDeposited", fields: [depositEntryId], references: [id], onDelete: SetNull)
  @@index([churchId, depositEntryId])
  @@map("treasury_cheques")
}

/// Mois clôturé (`month` = "AAAA-MM"). Réouvrir = supprimer la ligne, motif dans l'audit.
model TreasuryClosure {
  churchId   String
  month      String   @db.Char(7)
  closedAt   DateTime @default(now())
  closedById String?
  @@id([churchId, month])
  @@map("treasury_closures")
}

model TreasuryBudget {
  id         String   @id @default(cuid())
  churchId   String
  year       Int
  month      Int      // 1..12
  categoryId String
  amount     Decimal  @db.Decimal(12, 2)
  @@unique([churchId, year, categoryId, month])
  @@map("treasury_budgets")
}
```

**Champs ajoutés hors module** (même migration) :
- `FinancialPayment.treasuryAccountId String?` (relation `TreasuryAccount`, `onDelete: SetNull`) ;
- `ShuttleEntry.treasuryAccountId String?` (idem), significatif pour `FUNDING` seulement.

Migration `add_treasury` générée par `prisma migrate diff`, rejouée en CI (job `migrations`).

**Catégories par défaut** : créées à la première ouverture par église (`ensureDefaults`,
idempotent grâce aux deux contraintes d'unicité), dans l'ordre de la spec. Quatre sont
**système** : Offrandes spéciales (objet obligatoire), Remises au compte commun, Notes de frais et
avances, Navette. Une catégorie système se renomme et se désactive, mais ne se supprime pas.

## Accès

`src/modules/treasury/auth.ts` :
- `requireTreasuryAccess(churchId)` → `{ session }` : Super Admin, ou `treasury:manage` dans
  `churchId`. Sinon `FORBIDDEN`.
- `requireTreasuryReopen(churchId)` : `treasury:reopen` (Admin, Super Admin).
- `isTreasuryVisible(session, churchId)` pour la navigation : `registry.has("treasury")` et
  `treasury:manage`.

La Secrétaire n'a ni `treasury:*` ni accès : rien n'apparaît dans sa navigation.

## Règles métier (services `src/modules/treasury/services/`)

- **`defaults.ts`** — `ensureDefaults(churchId)` : catégories par défaut.
- **`accounts.ts`** — `listAccounts`, `createAccount`, `updateAccount` (nom, nature, solde et date
  de départ, ordre), `archiveAccount` / `unarchiveAccount`. Un compte archivé n'accepte plus de
  saisie ni de reprise ; son historique reste lisible. Changer le solde de départ est audité et
  refusé si la date de départ tombe dans un mois clôturé.
- **`categories.ts`** — CRUD des catégories et des objets. Suppression seulement si aucune ligne
  ni budget ne les référence (sinon 409 « désactivez-la ») ; jamais pour une catégorie système.
- **`entries.ts`** — `createEntry`, `updateEntry`, `deleteEntry` :
  - montant > 0, centimes ; catégorie active du **même sens** ; objet obligatoire pour la
    catégorie Offrandes spéciales, interdit ailleurs ; compte actif de l'église ;
  - **mois clôturé** : `assertOpen(churchId, date)` sur la date (et l'ancienne date pour une
    modification) → 409 « Octobre 2026 est clôturé » ;
  - **doublon** : même compte, date, sens, catégorie et montant qu'une ligne non supprimée →
    409 `{ code: "DUPLICATE", existing }`, sauf si le corps porte `confirmDuplicate: true` ;
  - les catégories système Remises / Notes de frais / Navette ne se choisissent pas à la main
    (elles naissent d'une remise ou d'une reprise) ;
  - une jambe de transfert se modifie ou se supprime **avec l'autre** (même `transferGroupId`) ;
  - une ligne née d'une collecte se modifie seule ; supprimer une ligne « Chèque » supprime ses
    chèques s'ils sont encore en caisse, refus sinon (« déjà remis ») ;
  - une remise supprimée remet ses chèques en caisse (`depositEntryId` → null) ;
  - **suppression logique**, justificatif conservé ;
  - **audit** `logAudit` (`entityType: "TreasuryEntry"`, avant/après dans `details`).
- **`collections.ts`** — `createCollection(churchId, input, actor)`, en **une transaction** :
  pour chaque catégorie, une ligne « Espèces » (total) et une ligne « Chèque » (somme de ses
  chèques) avec ses `TreasuryCheque` ; libellé « Collecte du culte du 1er novembre » (titre du
  culte s'il est choisi) ; les deux compteurs obligatoires et distincts. Compte par défaut : la
  première caisse active. Culte proposé : événements `CULTE` de l'église à ±7 jours.
- **`deposits.ts`** — `listChequesInHand(churchId, accountId?)` (chèques non remis de lignes non
  supprimées) et `createDeposit(churchId, { accountId, date, ref, cashAmount, chequeIds })` : une
  sortie `DEPOSIT`, catégorie système Remises, méthode espèces si pas de chèque, montant = espèces
  + chèques cochés, chèques rattachés (vérifiés : même église, même compte, encore en caisse).
- **`transfers.ts`** — `createTransfer(churchId, { from, to, date, amount, label })` : deux lignes
  `TRANSFER` (OUT sur la source, IN sur la cible), même `transferGroupId`, sans catégorie.
- **`closures.ts`** — `assertOpen`, `closeMonth(churchId, month)` (refusé pour un mois futur ou
  courant non terminé), `reopenMonth(churchId, month, reason)` (motif obligatoire, 5 à 300
  caractères, audit). `assertTreasuryDateOpen(churchId, date)` est exporté pour les routes de
  reprise.
- **`reprises.ts`** — lecture des mouvements repris, fusionnés en lignes `source` :
  - `accounting` : `FinancialPayment` versés (`releasedAt` non nul) avec `treasuryAccountId`,
    d'une demande de l'église ; sortie de `releasedAmount` à `releasedAt`, catégorie système
    **Navette** si la demande vise un département de fonction `NAVETTE`, sinon **Notes de frais
    et avances** ; lien vers `/accounting/requests/<id>`. Lu via un service exporté par
    `@/modules/accounting` (`listTreasuryPayments(churchId)`), comme le lien B de la navette ;
  - `shuttle` : `ShuttleEntry` `FUNDING` non supprimées avec `treasuryAccountId`, **seulement si
    `registry.has("shuttle")`** ; sortie, catégorie Navette, lien vers
    `/accounting/navette?ligne=<id>`. Lecture Prisma directe de la table (pas d'import de
    `shuttle`, qui peut être désactivé, voir ADR-0027).
  Ces lignes n'ont aucune action de modification dans le registre.
- **`ledger.ts`** — `getLedger(churchId, { accountId?, from?, to?, categoryId?, method? })` :
  - lignes propres + reprises, triées par (`date`, `createdAt`) ;
  - `runningBalance` après chaque ligne, par compte ou tous comptes (solde de départ des comptes
    concernés, en ne comptant un compte qu'à partir de sa `openingDate`) ;
  - période : `opening` (tout ce qui précède `from`), `inflows`, `outflows`, `closing`, avec
    `opening + inflows − outflows = closing` ; **tous comptes**, les transferts sont exclus des
    entrées et sorties (ils s'annulent) ; **un compte**, ils y figurent, marqués « Transfert » ;
  - `warnings` : caisse (`CASH`) dont le solde courant passe sous zéro (date de la première ligne
    en cause).
- **`budget.ts`** — `getBudget(churchId, year)`, `setBudget(churchId, year, rows)` (montant annuel
  par catégorie, réparti également en centimes — reste sur décembre — ou montants mensuels
  fournis), `copyBudget(churchId, year, { from: "budget" | "actual" })` (depuis `year − 1`),
  `budgetVsActual(churchId, year, month)` : réalisé du mois et cumul annuel, écart, pourcentage,
  `overBudget` pour une catégorie de sortie dont le réalisé annuel dépasse le budget annuel.
  Transferts exclus du réalisé.
- **`reports.ts`** — `getDashboard(churchId, month)` (soldes, total, entrées/sorties du mois,
  mois précédent, même mois N−1, budget, chèques en caisse, mois non clôturés, alertes) ;
  `getReports(churchId, from, to)` : par catégorie (offrandes spéciales détaillées par objet), par
  moyen, par mois — tous calculés depuis `getLedger`, donc ils se recoupent avec lui.
- **`export.ts`** — `buildTreasuryExport(churchId, from, to)` : ZIP (`archiver`) avec
  `tresorerie.xlsx` (`exceljs` ; feuilles Registre avec soldes, Par catégorie, Par moyen, Par
  mois) et `justificatifs/AAAA-MM-JJ_compte_montant_id.ext`.
- **`receipts.ts`** — justificatif JPEG, PNG, WebP ou PDF, 10 Mo au plus, type vérifié sur les
  octets (même contrôle que la navette, factorisé si possible dans `storage`), `storeFile`
  sous `treasury/<churchId>/…`.

## API

Préfixe `/api/accounting/tresorerie`, déclaré dans `routes.api` du manifeste ; chaque route a son
`contract.ts`, puis `npm run openapi`. Accès : `treasury:manage` sauf mention.

| Endpoint | Méthode | Entrée | Sortie |
|---|---|---|---|
| `/` | GET | `?month` | tableau de bord |
| `/ledger` | GET | `?account&from&to&category&method` | registre + période + alertes |
| `/entries` | POST | multipart `data` (Zod) + `file?` ; `confirmDuplicate?` | ligne (201) / 409 doublon |
| `/entries/[id]` | PATCH, DELETE | partiel + `file?` | ligne / `{ ok }` |
| `/entries/[id]/receipt` | GET | — | fichier (`nosniff`, `private`) |
| `/entries/[id]/history` | GET | — | audit |
| `/accounts` | GET, POST | `{ name, kind, openingBalance, openingDate }` | compte(s) |
| `/accounts/[id]` | PATCH | partiel, `archived?` | compte |
| `/categories`, `/categories/[id]` | GET, POST / PATCH, DELETE | `{ direction, name, active, sortOrder }` | catégorie(s) |
| `/purposes`, `/purposes/[id]` | GET, POST / PATCH, DELETE | `{ name, active }` | objet(s) |
| `/collections` | POST | `{ accountId, eventId?, date, counters, lines: [{ categoryId, purposeId?, cash, cheques: [{ number?, amount, count? }] }] }` | collecte + lignes |
| `/cheques` | GET | `?account` | chèques en caisse |
| `/deposits` | POST | `{ accountId, date, ref, cashAmount, chequeIds }` | remise |
| `/transfers` | POST | `{ fromId, toId, date, amount, label? }` | les deux lignes |
| `/closures` | GET, POST | `{ month }` | mois clôturés |
| `/closures/[month]` | DELETE | `{ reason }` — **`treasury:reopen`** | `{ ok }` |
| `/budget` | GET, PUT | `?year` / `{ year, rows: [{ categoryId, annual? , monthly? }] }` | budget |
| `/budget/copy` | POST | `{ year, from: "budget" \| "actual" }` | budget |
| `/reports` | GET | `?from&to` | par catégorie, objet, moyen, mois |
| `/export` | GET | `?from&to` | ZIP |

Collections : église courante (`getCurrentChurchId`). Routes `[id]` : église de l'objet, 404 si
autre église. POST/PATCH multipart : `Content-Length` borné (11 Mo) avant lecture, débit limité
(`RATE_LIMIT_MUTATION`).

**Routes modifiées hors module** (couche `src/app`, qui seule importe les deux côtés) :
- `PATCH /api/accounting/payments/[id]` : `releaseSchema` gagne `treasuryAccountId?` (nullable).
  S'il est fourni et que `registry.has("treasury")` : compte actif de l'église
  (`getTreasuryAccount`), mois de `releasedAt` ouvert (`assertTreasuryDateOpen`). Module
  désactivé : le champ est refusé (400). Absent : comportement inchangé (compte commun).
- `POST/PATCH/DELETE /api/accounting/navette/entries…` : pour un `FUNDING`, `treasuryAccountId?`
  validé de la même manière, mois ouvert vérifié pour l'ancienne et la nouvelle date. Le service
  `shuttle` se contente de stocker la valeur (schéma `@/modules/shuttle/schemas` élargi).
- Les deux contrats et `docs/openapi.json` sont mis à jour.

## UI / composants

- **Navigation** : drapeau `hasTreasury` (`isTreasuryVisible`) dans `(auth)/layout.tsx` →
  `navigation.ts` ; entrée « Trésorerie » (`/accounting/tresorerie`) dans le bloc
  « Comptabilité », sous « Navette ». `AccountingNav` gagne l'onglet « Trésorerie ».
  `MoreSheet.tsx` et `NavPageList.tsx` ne sont pas modifiés.
- **`/accounting/tresorerie`** (Server Component, `requireTreasuryAccess`) → `TreasuryClient`,
  onglets `Tabs` reflétés dans l'URL (`?onglet=`), comme dans la démo validée :
  - **Tableau de bord** : carte du total, une carte par compte, synthèse du mois (ouverture,
    entrées, sorties, clôture, comparaisons M−1 et N−1), derniers mouvements, « À surveiller »
    (chèques en caisse, budget, caisse négative, mois à clôturer).
  - **Registre** : filtres compte / période / catégorie / moyen, synthèse de période, `DataTable`
    (date, libellé, catégorie, moyen, entrée, sortie, solde), pastilles « Repris » (lien vers
    l'origine) et « Transfert ». Ligne ouverte : détail, justificatif, historique, actions.
    Boutons « Ajouter un mouvement », « Transfert », « Exporter ».
  - **Collecte** : culte ou date, compte, tableau espèces par catégorie, chèques un par un ou en
    total, deux compteurs, récapitulatif par catégorie et par moyen, « Enregistrer la collecte ».
  - **Remise** : compte, date, n° de bordereau, montant des espèces, chèques en caisse à cocher,
    total remis.
  - **Budget** : année, tableaux entrées / sorties (prévu, réalisé, barre d'avancement, %),
    `StatusChip` « Dépassé » / « À surveiller » (≥ 90 %), « Modifier », « Reprendre l'année
    précédente » (budget ou réalisé).
  - **Clôture** : soldes du mois par compte, vérifications (chèques en caisse, caisse négative),
    « Clôturer », liste des mois clôturés ; « Rouvrir » (motif) pour `treasury:reopen`.
  - **Réglages** : comptes (création, solde de départ, archivage), catégories et objets.
  - Formulaire de ligne (`Modal` / `BottomSheet`) : sens, compte, catégorie (objet si offrande
    spéciale), moyen, montant, date, libellé, tiers, justificatif (deux boutons « Prendre une
    photo » / « Choisir un document », comme la navette), confirmation de doublon.
- **Comptabilité, saisie d'un paiement** (`RequestDetail` / modale de remise) : si la trésorerie
  est active, un champ « Payé depuis » (Compte commun par défaut, ou un compte de trésorerie
  actif), alimenté par la page serveur.
- **Navette, abondement** : même champ « Remis depuis » dans le formulaire d'abondement.
- **Guide** (`GuideContent.tsx`) : section « Trésorerie » pour le Comptable et l'Admin.

## Manifeste du module

```ts
defineModule({
  name: "treasury",
  version: "1.0.0",
  dependsOn: ["core", "accounting"],
  routes: {
    authenticated: [{ path: "/accounting/tresorerie" }],
    api: [{ path: "/api/accounting/tresorerie" }],
  },
  permissions: {
    "treasury:manage": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
    "treasury:reopen": ["SUPER_ADMIN", "ADMIN"],
  },
});
```

Ajouté à `src/lib/manifests.ts`. Mises à jour dans le même commit : matrice figée de
`src/core/__tests__/permissions.test.ts`, tableau du `CLAUDE.md`, `docs/auth.md`. Règle
dependency-cruiser `no-treasury-imports-other-modules` (autorisés : `accounting` via son index,
`storage`). Pas de domaine de notification : la spec ne demande aucune notification.

## Changements dans les autres modules

- **`accounting`** : un service `listTreasuryPayments(churchId)` exporté par l'index (paiements
  versés avec `treasuryAccountId`, demande, département et sa fonction). Aucune autre logique ne
  change ; `accounting` n'importe pas `treasury`.
- **`shuttle`** : `treasuryAccountId` accepté et stocké pour `FUNDING` ; l'affichage du registre
  de la navette n'est pas modifié.

## Décisions & alternatives écartées

- **Choix** : reprises **lues** à l'origine (référence facultative `treasuryAccountId`), pas
  recopiées. *Pourquoi* : aucune synchronisation ; une correction à l'origine est toujours
  reflétée ; « une ligne reprise ne se modifie qu'à son origine » est garanti par construction.
  Formalisé dans ADR-0027, qui généralise le lien B de la navette.
- **Écarté** : écrire une ligne dans le registre au versement (bus d'événements ou appel depuis la
  route). *Raison* : deux sources de vérité, rattrapage à prévoir en cas d'échec, et
  `accounting` dépendrait de `treasury`.
- **Choix** : la navette est lue par Prisma, sans `dependsOn: ["shuttle"]`. *Pourquoi* : la
  trésorerie doit fonctionner quand la navette est désactivée (spec) ; un `dependsOn` les lierait.
  La lecture est gardée par `registry.has("shuttle")`.
- **Choix** : montant positif + sens, plutôt qu'un montant signé (navette). *Pourquoi* : les
  rapports raisonnent en entrées et sorties par catégorie ; le sens est une donnée, pas un signe.
- **Choix** : soldes calculés, jamais stockés ; la clôture **interdit les écritures** au lieu de
  figer des soldes. *Pourquoi* : pas de dénormalisation à maintenir ; un mois clôturé reste
  exact tant que rien ne s'écrit dedans, ce que garantissent `assertOpen` (registre) et les
  routes de reprise.
- **Choix** : réouverture = suppression de la ligne de clôture, motif dans l'audit. *Écarté* :
  colonnes `reopenedAt/reason` (une seule réouverture conservée alors qu'il peut y en avoir
  plusieurs).
- **Choix** : chèques en table à part (`TreasuryCheque`). *Pourquoi* : la remise coche des chèques
  et « chèques en caisse » est une requête ; une ligne par chèque dans le registre l'alourdirait.
- **Choix** : catégories par église, créées à la première ouverture. *Écarté* : seed global
  (une église créée plus tard n'en aurait pas).
- **Écarté** : un compte « compte commun » dans la trésorerie. *Raison* : hors périmètre ; la
  remise est une sortie de la caisse.

## Risques & points d'attention

- **Mois clôturé contourné par une reprise** : la vérification est dans les routes de paiement
  et de navette ; un test par route le couvre.
- **Calcul des soldes** : centimes entiers partout (`cents()` comme la navette) pour éviter les
  écarts d'arrondi ; tests de recoupement ouverture + entrées − sorties = clôture.
- **Navette désactivée après des reprises** : les lignes disparaissent du registre et les soldes
  changent ; documenté dans le guide (spec : « aucune ligne de la navette n'est reprise »).
- **Volume** : calcul en mémoire, index `(accountId, deletedAt, date)` ; à revoir au-delà de
  quelques dizaines de milliers de lignes.
- **Données sensibles** : aucun nom de donateur (spec) ; les compteurs sont du texte libre.
- **Frontières** : `treasury` ne doit importer ni `shuttle` ni `planning` (culte lu par Prisma sur
  `events`, type `CULTE`) ; vérifié par `lint:boundaries`.

## Stratégie de tests

Vitest, Prisma mocké (`@/__mocks__/prisma`) :
- **auth** : Comptable/Admin/Super Admin acceptés, Secrétaire et autres rôles refusés ; réouverture
  réservée à Admin/Super Admin ; autre église → 404.
- **entries** : sens/catégorie, objet obligatoire, catégories système non sélectionnables,
  doublon (409 puis confirmation), mois clôturé (création, modification vers/depuis), suppression
  logique, audit avant/après, transfert modifié par paire.
- **collections** : lignes générées par catégorie et moyen, chèques créés, compteurs requis.
- **deposits** : montant = espèces + chèques cochés, chèques d'un autre compte ou déjà remis
  refusés, suppression de la remise → chèques en caisse.
- **ledger** : solde courant, période (recoupement), transferts exclus des totaux tous comptes,
  alerte caisse négative, compte archivé.
- **reprises** : paiement avec/sans compte, catégorie Navette selon la fonction du département,
  navette désactivée → aucune ligne.
- **budget** : répartition en centimes, copie budget/réalisé, dépassement.
- **reports** : totaux par catégorie/moyen/mois égaux au registre.
- **routes modifiées** : paiement avec compte archivé ou mois clôturé refusé ; trésorerie
  désactivée → champ refusé ; sans champ → inchangé (tests existants verts).
- **permissions.test.ts**, **route-exhaustiveness**, **openapi.test.ts**, snapshots du layout.
