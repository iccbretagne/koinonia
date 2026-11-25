# Tâches — 089 Retours du comptable

- [x] Migration `financial_requests.archivedAt/archivedById` (`prisma/schema.prisma`, migration)
- [x] Règle `isRequestArchived` + `setRequestArchived` (`src/modules/accounting/services/archive.ts`)
- [x] Actions `archive`/`unarchive` (`api/accounting/requests/[id]` route + contract)
- [x] Liste : filtre « Archivées », « En cours » sans archivées (`AccountingDashboard`, `page.tsx`)
- [x] Détail : Archiver / Désarchiver (`RequestDetail`, `page.tsx`)
- [x] Aperçu `?inline=1` (`file-storage.ts`, routes `attachments/[id]` et `local`) + bouton « Voir » (`AttachmentManager`)
- [x] `PUT /api/accounting/payments/[id]/treasury-account` (`setPaymentTreasuryAccount`, `validatePaymentAccountChange`) + sélecteur « Payé depuis »
- [x] Message de date de départ (`assertOnOrAfterOpening`, lignes, collectes, remises, transferts)
- [x] [P] Tests : `archive.test.ts`, `treasury-account/route.test.ts`, `file-storage-inline.test.ts`, `entries.test.ts`
- [x] `npm run openapi`, CHANGELOG, `docs/database.md`, CLAUDE.md
- [x] typecheck, lint, lint:boundaries, lint:prisma-boundary, test, build
