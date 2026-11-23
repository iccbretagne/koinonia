# Tâches — Visuel du billet d'entrée

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé — PR [#775](https://github.com/iccbretagne/koinonia/pull/775) ouverte vers `main`

- [x] Branche en attente reprise : `claude/visual-deposit-validation-process-gbyji8`.
- [x] Plan technique rédigé après lecture des conventions Claude Code et Next.js locales.
- [x] **T1** — Schéma Prisma et migration : documents, images, adresse ; client généré.
- [x] **T2** — Schémas purs et services de gestion/rendu ; réexport par l'index.
- [x] **T3** — API privée/public par jeton, contrats et OpenAPI.
- [x] **T4** — Éditeur, aperçu partagé, adresse dans les paramètres, billet public PNG/PDF.
- [x] **T5** — Outils MCP avec aperçu/confirmation, mêmes droits et services.
- [x] **T6** — Tests Vitest des règles, rendu/QR, API et MCP.
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Critères d'acceptation relus ; limites de recette consignées.
- [x] Commit et push de la branche.
- [x] PR [#775](https://github.com/iccbretagne/koinonia/pull/775) ouverte vers `main` après accord de l’utilisateur.

## Vérifications réalisées
- Migration `20261123112700_ticket_visual` générée avec `prisma migrate dev`, appliquée à MariaDB
  locale ; `prisma migrate diff --exit-code` : aucune différence.
- 5 517 tests passent dans 447 fichiers ; 17 tests dédiés ajoutés (services, API, MCP).
- QR décodé avec jsQR dans le PNG et depuis les pixels RGB embarqués dans le PDF.
- Aperçu PNG inspecté ; exports fictifs disponibles localement dans `/tmp/koinonia-ticket-visual-preview.{png,pdf}`.
- `lint:prisma-boundary` passe (141 routes, seuil inchangé).
- Recette dans un navigateur, impression et scan sur le téléphone de l'équipe : à faire en recette.
- `npm run build` : réussi hors confinement (Turbopack, TypeScript, pages et worker audio).
- `npm run test:coverage` : réussi ; lignes 73,86 %, branches 65,44 % (seuils CI respectés).
