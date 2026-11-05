# Tâches — Trésorerie de l'église : registre des entrées et des sorties

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
> Un commit par lot (plan, « Approche générale »).

## Prérequis

- [x] Branche : `claude/visual-deposit-validation-process-gbyji8` (branche de session, à jour de
  `main`)
- [x] Migration Prisma générée (schéma modifié)

## Lot 1 — Comptes, catégories, registre, accès

### 1. Données & migration

- [x] **T1** — Enums `TreasuryAccountKind`, `TreasuryDirection`, `TreasuryMethod`,
  `TreasuryEntryKind`, `TreasuryCategorySystem` et modèles `TreasuryAccount`,
  `TreasuryCategory`, `TreasuryPurpose`, `TreasuryEntry`, `TreasuryCollection`, `TreasuryCheque`,
  `TreasuryClosure`, `TreasuryBudget`, avec relations inverses (`Church`, `User`, `Event`) ; champs
  `treasuryAccountId` sur `FinancialPayment` et `ShuttleEntry` *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Migration `add_treasury` (`prisma migrate diff`) puis `prisma generate`
  *(fichier : `prisma/migrations/<horodatage>_add_treasury/migration.sql`)*
- [x] **T3** [P] — Mocks Prisma des nouveaux modèles *(fichier : `src/__mocks__/prisma.ts`)*

### 2. Module et accès

- [x] **T4** — Manifeste `treasury` (`dependsOn` core, accounting ; routes ; `treasury:manage`,
  `treasury:reopen`), ajout à `allManifests`, index du module *(fichiers :
  `src/modules/treasury/manifest.ts`, `src/modules/treasury/index.ts`, `src/lib/manifests.ts`)*
- [x] **T5** [P] — Matrice figée des permissions, tableau du `CLAUDE.md`, `docs/auth.md`
  *(fichiers : `src/core/__tests__/permissions.test.ts`, `CLAUDE.md`, `docs/auth.md`)*
- [x] **T6** [P] — Règle dependency-cruiser `no-treasury-imports-other-modules` (autorisés :
  `accounting`, `storage`) *(fichier : `.dependency-cruiser.cjs`)*
- [x] **T7** — Gardes `requireTreasuryAccess`, `requireTreasuryReopen`, `isTreasuryVisible`
  *(fichier : `src/modules/treasury/auth.ts`)*
- [x] **T8** [P] — Schémas Zod purs (compte, catégorie, objet, ligne, collecte, remise, transfert,
  clôture, réouverture, budget) *(fichier : `src/modules/treasury/schemas.ts`)*

### 3. Services

- [x] **T9** — `ensureDefaults` : catégories par défaut et catégories système, idempotent
  *(fichier : `src/modules/treasury/services/defaults.ts`)*
- [x] **T10** — Comptes : liste, création, modification (solde/date de départ audités),
  archivage *(fichier : `src/modules/treasury/services/accounts.ts`)*
- [x] **T11** — Catégories et objets : CRUD, suppression refusée si utilisée ou système
  *(fichier : `src/modules/treasury/services/categories.ts`)*
- [x] **T12** — `assertOpen` / `assertTreasuryDateOpen` (lecture des clôtures) *(fichier :
  `src/modules/treasury/services/closures.ts`)*
- [x] **T13** — Justificatifs : type vérifié sur les octets, 10 Mo, `storeFile`, lecture
  *(fichier : `src/modules/treasury/services/receipts.ts`)*
- [x] **T14** — Lignes : création, modification, suppression logique ; règles sens/catégorie,
  objet, catégories système, doublon (`confirmDuplicate`), mois clôturé, audit avant/après,
  historique *(fichier : `src/modules/treasury/services/entries.ts`)*
- [x] **T15** — `getLedger` : lignes triées, solde courant par compte et tous comptes, période
  (ouverture, entrées, sorties, clôture), transferts exclus des totaux tous comptes, alerte caisse
  négative *(fichier : `src/modules/treasury/services/ledger.ts`)*

### 4. API

- [x] **T16** — `GET /ledger` *(fichiers : `src/app/api/accounting/tresorerie/ledger/route.ts`,
  `contract.ts`)*
- [x] **T17** — `POST /entries`, `PATCH`/`DELETE /entries/[id]`, `GET …/receipt`,
  `GET …/history` (multipart, `Content-Length` borné, débit limité) *(fichiers :
  `src/app/api/accounting/tresorerie/entries/**`)*
- [x] **T18** [P] — `GET`/`POST /accounts`, `PATCH /accounts/[id]` *(fichiers :
  `src/app/api/accounting/tresorerie/accounts/**`)*
- [x] **T19** [P] — Catégories et objets (`/categories`, `/purposes`, `[id]`) *(fichiers :
  `src/app/api/accounting/tresorerie/categories/**`, `purposes/**`)*

### 5. UI

- [x] **T20** — Navigation : `hasTreasury`, entrée « Trésorerie » dans le bloc Comptabilité,
  onglet dans `AccountingNav` (sans toucher `MoreSheet`/`NavPageList`) *(fichiers :
  `src/app/(auth)/layout.tsx`, `src/lib/navigation.ts`,
  `src/app/(auth)/accounting/AccountingNav.tsx`)*
- [x] **T21** — Page `/accounting/tresorerie` (serveur) et `TreasuryClient` à onglets dans l'URL
  *(fichiers : `src/app/(auth)/accounting/tresorerie/page.tsx`, `TreasuryClient.tsx`)*
- [x] **T22** — Onglet Registre : filtres, synthèse, tableau, détail, historique, formulaire de
  ligne (justificatif photo/document, confirmation de doublon) *(fichiers :
  `src/app/(auth)/accounting/tresorerie/LedgerTab.tsx`, `EntryForm.tsx`, `EntryDetail.tsx`)*
- [x] **T23** — Onglet Réglages : comptes, catégories, objets *(fichier :
  `src/app/(auth)/accounting/tresorerie/SettingsTab.tsx`)*

### 6. Tests

- [x] **T24** [P] — Gardes : rôles acceptés/refusés (Secrétaire refusée), réouverture, autre
  église *(fichier : `src/modules/treasury/__tests__/auth.test.ts`)*
- [x] **T25** [P] — Lignes : règles, doublon, mois clôturé, audit, transfert par paire
  *(fichier : `src/modules/treasury/__tests__/entries.test.ts`)*
- [x] **T26** [P] — Registre : solde courant, recoupement de période, transferts, caisse négative,
  compte archivé *(fichier : `src/modules/treasury/__tests__/ledger.test.ts`)*
- [x] **T27** [P] — Catégories : défauts idempotents, suppression refusée si utilisée
  *(fichier : `src/modules/treasury/__tests__/categories.test.ts`)*
- [x] **T28** — Snapshots du layout, `route-exhaustiveness`, `npm run openapi` *(fichiers :
  `src/app/(auth)/__tests__/…`, `docs/openapi.json`)*

## Lot 2 — Collecte, remise, transferts, clôture

- [x] **T29** — `createCollection` (transaction : lignes espèces/chèques par catégorie, chèques,
  deux compteurs) et cultes proposés *(fichier : `src/modules/treasury/services/collections.ts`)*
- [x] **T30** — `listChequesInHand`, `createDeposit` ; suppression de remise → chèques remis en
  caisse *(fichier : `src/modules/treasury/services/deposits.ts`)*
- [x] **T31** — `createTransfer` (deux jambes, même groupe) *(fichier :
  `src/modules/treasury/services/transfers.ts`)*
- [x] **T32** — `closeMonth`, `reopenMonth` (motif, audit) *(fichier :
  `src/modules/treasury/services/closures.ts`)*
- [x] **T33** — Routes `/collections`, `/cheques`, `/deposits`, `/transfers`, `/closures`,
  `/closures/[month]` *(fichiers : `src/app/api/accounting/tresorerie/**`)*
- [x] **T34** — Onglets Collecte, Remise, Clôture ; action Transfert dans le Registre *(fichiers :
  `CollectionTab.tsx`, `DepositTab.tsx`, `ClosureTab.tsx`, `TransferForm.tsx`)*
- [x] **T35** [P] — Tests collecte, remise, transferts, clôture *(fichiers :
  `src/modules/treasury/__tests__/collections.test.ts`, `deposits.test.ts`, `closures.test.ts`)*

## Lot 3 — Reprises (comptabilité, navette)

- [x] **T36** — `listTreasuryPayments(churchId)` exporté par l'index de `accounting`
  *(fichiers : `src/modules/accounting/services/treasury-link.ts`, `src/modules/accounting/index.ts`)*
- [x] **T37** — `reprises.ts` : paiements (catégorie Navette ou Notes de frais selon la fonction du
  département), abondements de la navette si `registry.has("shuttle")` ; fusion dans `getLedger`
  *(fichiers : `src/modules/treasury/services/reprises.ts`, `ledger.ts`)*
- [x] **T38** — Route de paiement : `treasuryAccountId?` validé (compte actif, mois ouvert, module
  actif) *(fichiers : `src/app/api/accounting/payments/[id]/route.ts`, `contract.ts`)*
- [x] **T39** — Navette : `treasuryAccountId?` sur `FUNDING` (schéma, service, routes avec
  validation et mois ouvert) *(fichiers : `src/modules/shuttle/schemas.ts`,
  `src/modules/shuttle/services/ledger.ts`, `src/app/api/accounting/navette/entries/**`)*
- [x] **T40** — UI : « Payé depuis » à la saisie d'un paiement, « Remis depuis » à l'abondement ;
  pastille « Repris » avec lien dans le registre *(fichiers : composants de
  `src/app/(auth)/accounting/requests/…`, `…/navette/…`, `LedgerTab.tsx`)*
- [x] **T41** [P] — Tests reprises et routes modifiées (compte archivé, mois clôturé, module
  désactivé, comportement inchangé sans champ) *(fichiers :
  `src/modules/treasury/__tests__/reprises.test.ts`, tests des routes paiement/navette)*

## Lot 4 — Budget, tableau de bord, rapports, export, documentation

- [x] **T42** — Budget : lecture, saisie (répartition en centimes), copie budget/réalisé,
  réalisé contre budget, dépassement *(fichier : `src/modules/treasury/services/budget.ts`)*
- [x] **T43** — Tableau de bord et rapports (catégorie, objet, moyen, mois ; comparaisons M−1 et
  N−1) depuis `getLedger` *(fichier : `src/modules/treasury/services/reports.ts`)*
- [x] **T44** — Export ZIP (classeur + justificatifs) *(fichier :
  `src/modules/treasury/services/export.ts`)*
- [x] **T45** — Routes `/` (tableau de bord), `/budget`, `/budget/copy`, `/reports`, `/export`
  *(fichiers : `src/app/api/accounting/tresorerie/**`)*
- [x] **T46** — Onglets Tableau de bord et Budget ; rapports dans le Registre ; bouton Exporter
  *(fichiers : `DashboardTab.tsx`, `BudgetTab.tsx`, `ReportsPanel.tsx`)*
- [x] **T47** [P] — Tests budget, rapports (recoupement avec le registre), export *(fichiers :
  `src/modules/treasury/__tests__/budget.test.ts`, `reports.test.ts`, `export.test.ts`)*
- [x] **T48** [P] — Documentation : guide (section Trésorerie), `CLAUDE.md` (spécificités du
  module), `docs/database.md`, `CHANGELOG.md`, ADR-0027 accepté *(fichiers :
  `src/app/(auth)/guide/GuideContent.tsx`, `CLAUDE.md`, `docs/database.md`, `CHANGELOG.md`,
  `docs/adr/0027-…md`, `docs/adr/README.md`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] `npm run openapi` à jour
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [x] PR ouverte vers `main` (sur demande)

## Couverture des critères d'acceptation

| Critère | Tâches |
|---|---|
| Accès Comptable/Admin/SA, absent de la navigation des autres | T4, T7, T20, T24 |
| Plusieurs comptes avec solde de départ daté | T10, T18, T23 |
| Solde après chaque ligne, par compte et tous comptes | T15, T22, T26 |
| Période : ouverture, entrées, sorties, clôture qui se recoupent | T15, T26 |
| Collecte par catégorie et moyen, deux compteurs | T29, T33, T34, T35 |
| Remise avec référence, chèques remis hors caisse | T30, T33, T34, T35 |
| Transfert sans effet sur le total ni recettes/dépenses | T15, T31, T26, T35 |
| Paiement depuis un compte repris, modifiable à l'origine seulement ; compte commun non repris | T36–T41 |
| Abondement de la navette repris | T37, T39, T41 |
| Historique des corrections et suppressions | T14, T17, T25 |
| Mois clôturé figé ; réouverture Admin avec motif | T12, T32, T33, T35, T38, T39 |
| Budget annuel par catégorie et par mois, comparaison, dépassement | T42, T45, T46, T47 |
| Budget repris de l'année précédente | T42, T47 |
| Rapports qui se recoupent avec le registre | T43, T47 |
| Export : registre avec soldes, totaux, justificatifs | T44, T47 |
| Catégories modifiables, désactivées si utilisées | T9, T11, T19, T27 |
| Aucune donnée entre églises | T7, T16–T19, T24 |
| Module désactivable sans toucher compta/navette | T4, T38, T39, T41 |
