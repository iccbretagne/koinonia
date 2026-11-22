# Tâches — Compta : « Demander une pièce »

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

## Prérequis

- [x] Branche créée : `feat/compta-demander-piece`
- [x] Migration Prisma (T1)

## Tâches

### 1. Données
- [x] **T1** — Colonnes `pieceRequest*` sur `FinancialRequest`, `receiptRequest*` sur `ShuttleEntry`, index ; migration *(`prisma/schema.prisma`, `prisma/migrations/*`)*

### 2. Services
- [x] **T2** — `piece-requests.ts` : `requestPiece`, `cancelPieceRequest`, `submitPieces` ; export index *(`src/modules/accounting/services/`, `index.ts`)*
- [x] **T3** [P] — `receipt-requests.ts` : `requestReceipt`, `cancelReceiptRequest`, `submitRequestedReceipt` ; export index *(`src/modules/shuttle/services/`, `index.ts`)*

### 3. API
- [x] **T4** — PATCH `requestPiece` / `cancelPieceRequest` (schémas dans `contract.ts`) *(`src/app/api/accounting/requests/[id]/`)*
- [x] **T5** — POST `/api/accounting/requests/[id]/pieces` + contrat *(nouveau)*
- [x] **T6** [P] — PUT/DELETE `…/navette/entries/[id]/receipt-request`, POST `…/receipt` + contrats
- [x] **T7** — Manifestes (routes), `npm run openapi`

### 4. UI
- [x] **T8** — `RequestDetail.tsx` : bouton/modal gestion, mention, annulation ; encart de dépôt du demandeur ; données passées par `[id]/page.tsx`
- [x] **T9** [P] — `AccountingDashboard.tsx` : pastille et filtre « Pièce demandée »
- [x] **T10** [P] — Registre navette : bouton gestion, encart auteur

### 5. Tests
- [x] **T11** — `piece-requests.test.ts`
- [x] **T12** [P] — `receipt-requests.test.ts`
- [x] **T13** — Routes (gardes, Zod), `route-exhaustiveness`, `openapi`

### 6. Documentation
- [x] **T14** — `CLAUDE.md` (Comptable, navette), fiche assistant si un écran est décrit, `CHANGELOG.md` (Non publié), statut de la spec

## Vérification finale
- [x] `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`
- [x] Critères d'acceptation de `spec.md` vérifiés un par un
- [x] Branche poussée (PR sur accord)

## Couverture des critères

| Critère | Tâches |
|---|---|
| Bouton réservé à la gestion, hors annulée/rejetée | T2, T4, T8, T11 |
| Message + notification (cloche, email, appareils) | T2, T11 |
| Dépôt multiple par le demandeur seul, contrôles | T2, T5, T8, T11, T13 |
| Mention retirée, compta prévenue au dépôt | T2, T5, T11 |
| Relance : compteur et date | T2, T8, T11 |
| Annulation | T2, T4, T8 |
| Repérage dans la liste | T9 |
| Navette | T3, T6, T10, T12 |
| Journal | T2, T3, T11, T12 |
| Règles existantes inchangées | T13 (non-régression) |
