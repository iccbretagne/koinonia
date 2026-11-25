# Plan — 089 Retours du comptable

- **Statut** : Terminé

## Conformité constitution

- [x] Migration Prisma (pas de `db push`) — `financial_requests.archivedAt/archivedById`
- [x] Routes protégées : `accounting:manage` dans l'église courante (pattern existant des routes)
- [x] Validation Zod dans les `contract.ts` ; `npm run openapi`
- [x] Frontières : `src/app/api/accounting/_treasury.ts` reste la seule couche qui touche les deux modules

## Données

`FinancialRequest.archivedAt DateTime?`, `archivedById String?` (sans relation : l'historique tient
l'auteur). Index inchangés (la liste charge déjà toutes les demandes de l'église).

## Archives

- Règle pure `archiveState(r)` dans `@/modules/accounting` (testable) :
  `needsAction` = statut SUBMITTED/PROCESSING, tranche non remise, justification SUBMITTED ou RETURN_DUE ;
  `closed` = APPROVED, toutes remises, justification absente ou SETTLED, pas de `pieceRequestedAt` ;
  archivée = `!needsAction && (closed || archivedAt)`.
- `PATCH /api/accounting/requests/[id]` : actions `archive` (APPROVED/REJECTED/CANCELLED) et
  `unarchive`, `accounting:manage`, `logAudit`.
- `AccountingDashboard` : « Tous » exclut les archivées, filtre « Archivées ». Détail : bouton
  Archiver / Désarchiver pour la compta.

## Aperçu

`GET /api/accounting/attachments/[id]?inline=1` : `Content-Disposition: inline` seulement pour PDF,
JPEG, PNG, WebP (sinon `attachment`) — URL signée S3 (origine distincte) ou route locale.
`AttachmentManager` : bouton « Voir » (onglet ouvert avant l'appel pour éviter le bloqueur).

## Caisse d'un paiement remis

`PUT /api/accounting/payments/[id]/treasury-account` `{ treasuryAccountId | null }` : paiement remis
de l'église, `accounting:manage` ; ancien compte → `assertTreasuryDateOpen`, nouveau →
`resolveTreasuryAccount` ; `logAudit`. Déclaré par le préfixe `/api/accounting` existant.
UI : ligne « Payé depuis » + select sur les tranches remises.

## Date de départ

`assertOnOrAfterOpening(account, date)` dans `services/accounts.ts`, utilisé par lignes, collectes,
remises et transferts ; message : « La date est antérieure au solde de départ de « X » (jj/mm/aaaa).
Modifiez la date de départ du compte dans Réglages. »

## Tests

Règle `archiveState` ; actions archive/unarchive ; route treasury-account (droits, mois clos,
remise non confirmée) ; message de date ; `inline` restreint aux types sûrs.
