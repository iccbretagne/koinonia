# Tâches — 090 Campagnes de collecte

## Lot 1 — Socle
- [x] Schéma Prisma + migration `campaigns`, relations `Church`/`User`
- [x] Manifeste `campaigns` (routes, `campaigns:manage`, domaine `campaigns`), enregistrement, frontières
- [x] Matrice de permissions (test, `CLAUDE.md`, `docs/auth.md`)
- [x] `schemas.ts` (définition v1, corps des routes), `definition.ts`, `rules.ts`, `sniff.ts` + tests
- [x] `auth.ts` (gestionnaire, répondant, jeton), `tokens.ts`
- [x] Service d'import (aperçu, application idempotente, blocages) + tests
- [x] Routes campagnes, import, statut, gestionnaires, candidats + `contract.ts`

## Lot 2 — Collecte
- [x] Vue d'affectation, sauvegarde partielle, soumission (complétude), alertes locales
- [x] Fichiers : dépôt (type par contenu), téléchargement, suppression
- [x] Répondants (compte / sans compte), liens personnels
- [x] Routes à jeton `/api/campaigns/public/[token]/*`
- [ ] Pages `/collectes`, `/collectes/r/[assignmentId]`, `/collecte/[token]` (mobile d'abord)

## Lot 3 — Pilotage
- [x] Avancement, contrôles croisés, demande de correction, validation (case Pasteure), relance
- [x] Exports XLSX/CSV
- [x] Notifications (domaine `campaigns`), tâche cron (relance J-2, purge des fichiers)
- [ ] Pages `/collectes/[id]`, `/collectes/import`, `/collectes/[id]/import` ; carte Accueil ; navigation

## Lot 4 — F9
- [x] `f9-2026.json` (79 codes, codes internes `M0_C`, `M1_C`, `N`, `I*_FIN`) + test de couverture
- [ ] Guide d'utilisation (`docs/`), fiches de l'assistant

## Lot 5 — MCP
- [ ] Lectures `campaigns_list`, `campaign_progress` ; actions import et statut (aperçu → confirmation)

## Finition
- [ ] `npm run openapi`, typecheck, lint, lint:boundaries, tests, build
- [x] `CLAUDE.md` (spécificités du module), `docs/database.md`, CHANGELOG
