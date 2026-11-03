# Tâches — Navette : suivi budgétaire déclaratif

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [ ] Branche : `claude/visual-deposit-validation-process-gbyji8` (branche de session, repartie
  de `main` après la v1.33.0)
- [ ] Migration Prisma générée (schéma modifié)

## Tâches

### 1. Données & migration

- [ ] **T1** — Enums `ShuttleEntryKind`, `ShuttleExpenseCategory`, `ShuttlePaymentMethod` et
  modèles `ShuttleEntry`, `ShuttleRental`, `ShuttleSettings`, avec leurs relations inverses sur
  `Church`, `User` et `FinancialRequest` *(fichier : `prisma/schema.prisma`)*
- [ ] **T2** — Migration `add_shuttle_ledger` (`prisma migrate diff`), puis `prisma generate`
  *(fichier : `prisma/migrations/<horodatage>_add_shuttle_ledger/migration.sql`)*
- [ ] **T3** [P] — Mocks Prisma `shuttleEntry`, `shuttleRental`, `shuttleSettings`
  *(fichier : `src/__mocks__/prisma.ts`)*
- [ ] **T4** [P] — Fonction `NAVETTE` (« Navette ») dans `DEPT_FN` et `DEPT_FN_LABEL`, et entrée
  correspondante dans la vue des accès *(fichiers : `src/lib/department-functions.ts`,
  `src/lib/access-overview.ts`)*

### 2. Module et accès

- [ ] **T5** — Manifeste `shuttle` :
  - `dependsOn` core, planning, accounting ;
  - routes `/accounting/navette` et `/api/accounting/navette` ;
  - permission `shuttle:manage` (SA, Admin, Comptable) ;
  - domaine de notification `shuttle`.

  Ajout à `allManifests`, soit 15 modules *(fichiers : `src/modules/shuttle/manifest.ts`,
  `src/lib/manifests.ts`)*
- [ ] **T6** [P] — Schémas purs Zod :
  - création et modification d'une ligne, par type ;
  - location ;
  - réglages ;
  - signalement ;
  - import d'une note de frais ;
  - filtres de lecture ;
  - libellés français des types et des modes de paiement.

  *(fichier : `src/modules/shuttle/schemas.ts`)*
- [ ] **T7** — Gardes `getShuttleAccess`, `requireShuttleAccess`, `requireShuttleManager`.
  L'appartenance se calcule par fiche liée, `user_departments` ou Ministre du ministère ;
  l'identité est résolue côté serveur *(fichier : `src/modules/shuttle/auth.ts`)*

### 3. Comptabilité (extraction sans changement de comportement)

- [ ] **T8** — Extraire du `POST` des demandes un service `createFinancialRequest` et
  `notifyAccountingNewRequest`, et ajouter `copyAttachmentFile`. Les exporter par l'index ; la
  route existante les appelle *(fichiers : `src/modules/accounting/services/requests.ts`,
  `src/modules/accounting/index.ts`, `src/app/api/accounting/requests/route.ts`)*

### 4. Logique métier (services du module)

- [ ] **T9** — Justificatifs :
  - type vérifié sur les octets (JPEG, PNG, WebP, PDF) ;
  - 10 Mo au plus ;
  - stockage `shuttle/<churchId>/…` ;
  - lecture ;
  - copie vers la comptabilité.

  *(fichier : `src/modules/shuttle/services/receipts.ts`)*
- [ ] **T10** — Registre en écriture : `createEntry`, `updateEntry`, `deleteEntry`.
  - Signe du montant, justificatif obligatoire selon le type.
  - `FUNDING` et `OPENING_BALANCE` réservés au gestionnaire, solde de départ unique.
  - Fenêtre de 48 h, suppression logique.
  - Verrou si un remboursement est demandé.
  - Audit avant et après.
  - Notification de la compta pour un non-gestionnaire.
  - Alerte au franchissement du seuil.

  *(fichier : `src/modules/shuttle/services/ledger.ts`)*
- [ ] **T11** — Registre en lecture : `getLedger` et `getEntryHistory`. Ils calculent :
  - le solde à date, le solde de début de période, les totaux de la période et le solde
    courant ;
  - les répartitions par type, par mois et par location ;
  - les cautions en cours et les avances personnelles ;
  - la fusion des entrées B.

  *(fichier : `src/modules/shuttle/services/ledger-read.ts`)*
- [ ] **T12** — Liens avec la comptabilité :
  - `requestReimbursement` et `cancelReimbursement` (A) ;
  - `reimbursementStatus` (A) ;
  - `listBudgetAdvanceReleases` (B) ;
  - `listUnlinkedExpenseReports` et `importExpenseReport` (C).

  *(fichier : `src/modules/shuttle/services/accounting-link.ts`)*
- [ ] **T13** [P] — Signalements et cautions : `flagEntry`, `clearFlag`,
  `markDepositRetained`, avec audit et notification de l'auteur *(fichier :
  `src/modules/shuttle/services/flags.ts`)*
- [ ] **T14** [P] — Locations (`listRentals`, `createRental`, `updateRental`) et réglages
  (`getSettings`, `updateThreshold`) *(fichiers : `src/modules/shuttle/services/rentals.ts`,
  `src/modules/shuttle/services/settings.ts`)*
- [ ] **T15** [P] — Export : un ZIP qui contient `releve.xlsx` (relevé avec solde courant et
  synthèse) et les justificatifs de la période *(fichier :
  `src/modules/shuttle/services/export.ts`)*
- [ ] **T16** — Index public du module *(fichier : `src/modules/shuttle/index.ts`)*

### 5. API (route handlers, chacune avec son `contract.ts`)

- [ ] **T17** — `GET /api/accounting/navette` : relevé et synthèses de l'église courante
  *(fichiers : `src/app/api/accounting/navette/{route,contract}.ts`)*
- [ ] **T18** — `POST /api/accounting/navette/entries`, en multipart (`data` + `file`), avec
  borne `Content-Length` (411/413) et débit limité *(fichiers :
  `src/app/api/accounting/navette/entries/{route,contract}.ts`)*
- [ ] **T19** — `PATCH` et `DELETE /entries/[id]`, sur l'église de la ligne *(fichiers :
  `…/entries/[id]/{route,contract}.ts`)*
- [ ] **T20** [P] — `GET /entries/[id]/receipt` (`nosniff`, `private`) et
  `GET /entries/[id]/history` *(fichiers : `…/entries/[id]/receipt/*`, `…/entries/[id]/history/*`)*
- [ ] **T21** [P] — `PUT` et `DELETE /entries/[id]/flag`, `PUT /entries/[id]/retained`
  *(fichiers : `…/entries/[id]/flag/*`, `…/entries/[id]/retained/*`)*
- [ ] **T22** [P] — `POST` et `DELETE /entries/[id]/reimbursement` (A) *(fichiers :
  `…/entries/[id]/reimbursement/*`)*
- [ ] **T23** [P] — `POST /import/[requestId]` (C) *(fichiers :
  `src/app/api/accounting/navette/import/[requestId]/*`)*
- [ ] **T24** [P] — `GET`/`POST /rentals`, `PATCH /rentals/[id]`, `GET`/`PUT /settings`,
  `GET /export` *(fichiers : `…/rentals/*`, `…/settings/*`, `…/export/*`)*
- [ ] **T25** — `npm run openapi` *(fichier : `docs/openapi.json`)*

### 6. UI

- [ ] **T26** — Navigation :
  - drapeau `hasShuttle`, calculé dans le layout si `registry.has("shuttle")` ;
  - bloc « Comptabilité » qui regroupe « Demandes » et « Navette » dans l'espace Demandes, avec
    l'entrée active selon le préfixe le plus long ;
  - snapshot des props du layout mis à jour.

  *(fichiers : `src/app/(auth)/layout.tsx`, `src/lib/navigation.ts`, `src/components/AuthLayoutShell.tsx`)*
- [ ] **T27** [P] — Onglet « Navette » dans `AccountingNav`, quand `hasShuttle` *(fichiers :
  `src/app/(auth)/accounting/AccountingNav.tsx`, et les pages Demandes et Statistiques qui le
  rendent)*
- [ ] **T28** — Page serveur `/accounting/navette` : garde, données initiales, période lue dans
  l'URL *(fichier : `src/app/(auth)/accounting/navette/page.tsx`)*
- [ ] **T29** — `ShuttleClient` :
  - en-tête avec le solde à date ;
  - chips de période et synthèse ;
  - onglets Relevé, Répartition, Cautions & avances, Locations et Réglages.

  *(fichier : `src/app/(auth)/accounting/navette/ShuttleClient.tsx`)*
- [ ] **T30** — Formulaire de ligne :
  - le type d'abord, puis les champs utiles à ce type ;
  - deux boutons « Prendre une photo » et « Choisir un document », avec aperçu et
    glisser-déposer ;
  - Super U proposé par défaut ;
  - rappel du délai de 48 h.

  *(fichier : `…/navette/EntryForm.tsx`)*
- [ ] **T31** — Détail d'une ligne (`BottomSheet` sur mobile) :
  - justificatif et historique ;
  - corriger et supprimer, signaler, caution restituée ou non restituée ;
  - demander ou annuler le remboursement, avec l'état de la demande.

  *(fichier : `…/navette/EntryDetail.tsx`)*
- [ ] **T32** [P] — Onglet Réglages (seuil, solde de départ) et liste « Notes de frais hors
  registre » avec « Ajouter au registre » *(fichiers : `…/navette/SettingsTab.tsx`,
  `…/navette/UnlinkedReports.tsx`)*
- [ ] **T33** [P] — Guide : section « Navette », qui précise que la composition du
  département Navette donne des droits *(fichier : `src/components/GuideContent.tsx`)*

### 7. Tests

- [ ] **T34** — Accès : gestionnaire, membre par fiche, responsable, Ministre, autre rôle, autre
  église, département d'une autre fonction *(fichier :
  `src/modules/shuttle/__tests__/auth.test.ts`)*
- [ ] **T35** — Registre en écriture : signe, justificatif, droits par type, solde de départ
  unique, 48 h, suppression logique, audit, notifications, seuil, verrou de remboursement
  *(fichier : `src/modules/shuttle/__tests__/ledger.test.ts`)*
- [ ] **T36** — Registre en lecture : soldes de période, solde courant avec une ligne antidatée,
  répartitions, cautions, avances, fusion des entrées B *(fichier :
  `src/modules/shuttle/__tests__/ledger-read.test.ts`)*
- [ ] **T37** — Liens avec la comptabilité :
  - A : auteur seulement, une demande en cours, justificatif copié, état dérivé, annulation ;
  - B : seules les avances de budget des départements Navette ;
  - C : liste et import ;

  *(fichier : `src/modules/shuttle/__tests__/accounting-link.test.ts`)*
- [ ] **T38** [P] — Justificatifs (signature, taille) et export (contenu du ZIP limité à la
  période) *(fichiers : `src/modules/shuttle/__tests__/{receipts,export}.test.ts`)*
- [ ] **T39** — Routes :
  - 401 et 403 : hors équipe, autre église, membre sur une route de gestionnaire ;
  - 411 et 413 ;
  - 404 pour une ligne d'une autre église ;
  - Zod ;
  - en-têtes du justificatif.

  *(fichiers : `src/app/api/accounting/navette/**/__tests__/*.test.ts`)*
- [ ] **T40** — Non-régression de `POST /api/accounting/requests` après l'extraction, et
  navigation (`hasShuttle`, bloc Comptabilité, module désactivé) *(fichiers : tests existants de
  la comptabilité, `src/lib/__tests__/navigation*.test.ts`)*
- [ ] **T41** — Matrices et contrats : `permissions.test.ts` (`shuttle:manage`),
  `manifests.test.ts` (15 modules), `routes-exhaustivite`, `openapi.test` *(fichiers :
  `src/core/__tests__/permissions.test.ts`, `src/lib/__tests__/manifests.test.ts`)*

### 8. Documentation

- [ ] **T42** — Documentation :
  - `CLAUDE.md` : tableau des permissions et spécificités de la navette ;
  - `docs/auth.md` ;
  - `docs/database.md` : trois tables ;
  - ADR-0014 : `NAVETTE` ajoutée à la règle 5 ;
  - `CHANGELOG.md`.

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries` et `npm run lint:prisma-boundary`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] Commit et push ; PR vers `main` sur demande de l'utilisateur

## Couverture des critères d'acceptation

| Critère de la spec | Tâches |
|---|---|
| Solde de départ, abondement, solde à jour | T10, T11, T29, T35, T36 |
| Dépense déclarée au téléphone avec photo, comptée sans validation | T10, T30, T35 |
| Justificatif aussi par document existant | T9, T30, T38 |
| Sortie sans justificatif refusée | T10, T18, T35, T39 |
| Totaux et soldes pour toute période | T11, T29, T36 |
| Solde courant recalculé (ajout, correction, suppression, antidatée) | T11, T36 |
| 48 h pour l'auteur, compta à tout moment | T10, T19, T35, T39 |
| Notification de la compta et historique avant/après | T10, T20, T31, T35 |
| Ligne signalée toujours comptée, visible par la navette | T13, T21, T31 |
| Cautions en cours, restituées ou non restituées | T11, T13, T29, T36 |
| Alerte de solde bas au franchissement | T10, T14, T35 |
| Aucun accès hors navette ou compta, même par appel direct | T7, T34, T39 |
| Export de la période avec justificatifs | T15, T24, T38 |
| Désactivation et réactivation sans perte | T5, T26, T40, T41 |
| Aucune fuite entre églises | T7, T19, T34, T39 |
| A : remboursement demandé depuis la ligne, même par un STAR | T8, T12, T22, T31, T37 |
| A : état affiché, ligne figée, solde inchangé | T10, T12, T31, T35, T37 |
| B : avance de budget versée visible sans saisie | T11, T12, T36, T37 |
| C : note de frais hors registre listée et ajoutable | T12, T23, T32, T37 |
