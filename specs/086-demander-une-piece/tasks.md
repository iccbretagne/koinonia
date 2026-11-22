# Tâches — Compta : « Demander une pièce »

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

## Prérequis

- [x] Branche créée : `feat/compta-demander-piece`
- [ ] Migration Prisma (T1)

## Tâches

### 1. Données
- [ ] **T1** — Colonnes `pieceRequest*` sur `FinancialRequest`, `receiptRequest*` sur `ShuttleEntry`, index ; migration *(`prisma/schema.prisma`, `prisma/migrations/*`)*

### 2. Services
- [ ] **T2** — `piece-requests.ts` : `requestPiece`, `cancelPieceRequest`, `submitPieces` ; export index *(`src/modules/accounting/services/`, `index.ts`)*
- [ ] **T3** [P] — `receipt-requests.ts` : `requestReceipt`, `cancelReceiptRequest`, `submitRequestedReceipt` ; export index *(`src/modules/shuttle/services/`, `index.ts`)*

### 3. API
- [ ] **T4** — PATCH `requestPiece` / `cancelPieceRequest` (schémas dans `contract.ts`) *(`src/app/api/accounting/requests/[id]/`)*
- [ ] **T5** — POST `/api/accounting/requests/[id]/pieces` + contrat *(nouveau)*
- [ ] **T6** [P] — PUT/DELETE `…/navette/entries/[id]/receipt-request`, POST `…/receipt` + contrats
- [ ] **T7** — Manifestes (routes), `npm run openapi`

### 4. UI
- [ ] **T8** — `RequestDetail.tsx` : bouton/modal gestion, mention, annulation ; encart de dépôt du demandeur ; données passées par `[id]/page.tsx`
- [ ] **T9** [P] — `AccountingDashboard.tsx` : pastille et filtre « Pièce demandée »
- [ ] **T10** [P] — Registre navette : bouton gestion, encart auteur

### 5. Tests
- [ ] **T11** — `piece-requests.test.ts`
- [ ] **T12** [P] — `receipt-requests.test.ts`
- [ ] **T13** — Routes (gardes, Zod), `route-exhaustiveness`, `openapi`

### 6. Documentation
- [ ] **T14** — `CLAUDE.md` (Comptable, navette), fiche assistant si un écran est décrit, `CHANGELOG.md` (Non publié), statut de la spec

## Vérification finale
- [ ] `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`
- [ ] Critères d'acceptation de `spec.md` vérifiés un par un
- [ ] Branche poussée (PR sur accord)

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
