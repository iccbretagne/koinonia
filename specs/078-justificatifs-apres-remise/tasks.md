# Tâches — Justificatifs après la remise des fonds

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Fait

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche de travail à jour de `main` (`claude/visual-deposit-validation-process-gbyji8`)
- [x] Migration Prisma générée et rejouée sur MariaDB vierge sans écart avec le schéma

## Tâches

### 1. Données & migration

- [x] **T1** — Schéma : enum `FinancialJustificationStatus`, modèles `FinancialJustification` et
  `FinancialJustificationSettings`, champs `FinancialRequest.justificationId`,
  `FinancialRequest.overageOfJustificationId`, `FinancialAttachment.justificationId`, relations
  inverses (`Church`, `FinancialSeries`, `TreasuryAccount`) et index du plan
  *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Migration additive `20261109090000_financial_justifications`, rejouée sur base
  vierge ; `prisma migrate diff` vide
  *(fichier : `prisma/migrations/20261109090000_financial_justifications/migration.sql`)*
- [x] **T3** [P] — Modèles ajoutés au mock Prisma des tests
  *(fichier : `src/__mocks__/prisma.ts`)*

### 2. Logique métier (services)

- [x] **T4** — Règles pures : éligibilité (avance ; note de frais sans pièce ; ni Navette, ni
  issue de la navette, ni note liée), `nextStatus` (submit, accept, reject, waive, return),
  reliquat et complément, échéances (première relance, intervalle, après refus), clé de
  regroupement mensuel d'une série
  *(fichier : `src/modules/accounting/services/justification-rules.ts`)*
- [x] **T5** — `openJustificationIfDue(requestId, tx)` : ouverture au dernier versement confirmé,
  regroupement d'une série par mois (cumul du versé, échéance repoussée), notification
  d'ouverture renvoyée à l'appelant pour envoi hors transaction
  *(fichier : `src/modules/accounting/services/justifications.ts`)*
- [x] **T6** — `submitJustification` (demandeur seul ; pièces via `assertAttachmentsAssignable` ;
  dépôts cumulés ; note de frais : montant imposé), `reviewJustification` (accept/reject avec
  motif), `waiveJustification` (motif + montant retenu), `recordReturn` (date, compte facultatif) ;
  `logAudit` et notification au demandeur à chaque geste
  *(fichier : `src/modules/accounting/services/justifications.ts`)*
- [x] **T7** — `listJustifications` (filtre statut/retard ; périmètre `accountingScopeWhere`),
  `getJustification` (église de la justification, sinon 404),
  `getJustificationSettings` / `updateJustificationSettings` (valeurs par défaut 7/7)
  *(fichier : `src/modules/accounting/services/justifications.ts`)*
- [x] **T8** — `runJustificationReminders(now)` : prise atomique sur `nextReminderAt`, relance du
  demandeur (attendus ou reliquat à rendre), escalade dès la 3e relance aux responsables
  (principal et adjoints) et au Ministre du ministère, aucun envoi à un demandeur sans rôle dans
  l'église
  *(fichier : `src/modules/accounting/services/justifications.ts`)*
- [x] **T9** [P] — Suivi de l'argent versé : `classifyReleased` et agrégats par mois de versement
  et par département (cases justifié, rendu, à rendre, à justifier, navette, avant le suivi ;
  constante `TRACKING_STARTED_AT`) ; branché dans `computeAccountingStats` sans toucher aux
  indicateurs existants ; identifiants des demandes par case
  *(fichiers : `src/modules/accounting/services/fund-tracking.ts`, `src/modules/accounting/services/stats.ts`)*
- [x] **T10** [P] — `listTreasuryReturns(churchId)` dans le lien trésorerie, et reprise en
  **entrée** dans le registre de la trésorerie (catégorie système des notes de frais, lien vers la
  demande, lecture seule)
  *(fichiers : `src/modules/accounting/services/treasury-link.ts`, `src/modules/treasury/services/reprises.ts`)*
- [x] **T11** — Exports du module
  *(fichier : `src/modules/accounting/index.ts`)*

### 3. API (route handlers)

- [x] **T12** — Helper partagé de validation du compte de trésorerie (compte actif, mois ouvert,
  trésorerie active), repris par la route des versements
  *(fichiers : `src/app/api/accounting/_treasury.ts`, `src/app/api/accounting/payments/[id]/route.ts`)*
- [x] **T13** — Versement : appel de `openJustificationIfDue` dans la transaction, notification
  d'ouverture après
  *(fichier : `src/app/api/accounting/payments/[id]/route.ts`)*
- [x] **T14** — `GET /api/accounting/justifications` et son contrat
  *(fichiers : `src/app/api/accounting/justifications/route.ts`, `contract.ts`)*
- [x] **T15** — `GET` / `PATCH /api/accounting/justifications/[id]` (union `action` : submit,
  accept, reject, waive, return) et son contrat ; `return` valide le compte par T12
  *(fichiers : `src/app/api/accounting/justifications/[id]/route.ts`, `contract.ts`)*
- [x] **T16** — `GET` / `PUT /api/accounting/justifications/settings` et son contrat
  *(fichiers : `src/app/api/accounting/justifications/settings/route.ts`, `contract.ts`)*
- [x] **T17** — Note de frais liée : `overageOfJustificationId` accepté à la création (demandeur,
  dépassement réel, pas de pièce exigée)
  *(fichiers : `src/app/api/accounting/requests/route.ts`, `contract.ts`)*
- [x] **T18** — Tâche cron `accounting-justifications` (horaire, module `accounting`) et contrat
  du cron
  *(fichiers : `src/app/api/cron/route.ts`, `src/app/api/cron/contract.ts`)*
- [x] **T19** — `npm run openapi` et `docs/openapi.json` ; routes couvertes par le préfixe
  `/api/accounting` du manifeste (vérifié par `route-exhaustiveness`)
  *(fichier : `docs/openapi.json`)*

### 4. UI

- [x] **T20** — Bloc « Justificatifs » du détail d'une demande : état, échéance, relances,
  factures ; dépôt et montant dépensé (demandeur) avec aperçu reliquat/complément et bouton
  « Demander le complément » ; Accepter / Renvoyer / Dispenser / Confirmer la restitution
  (« Rendu sur » ou compte commun) pour la compta ; occurrences couvertes pour une série
  *(fichiers : `src/app/(auth)/accounting/requests/[id]/JustificationPanel.tsx`, `RequestDetail.tsx`, `page.tsx`)*
- [x] **T21** [P] — Tableau de la compta : compteur et filtre « À justifier » (retards en
  évidence, reliquats), carte des délais de relance
  *(fichiers : `src/app/(auth)/accounting/requests/AccountingDashboard.tsx`, `page.tsx`)*
- [x] **T22** [P] — Nouvelle demande : `?complement=` préremplit la note de frais liée
  *(fichiers : `src/app/(auth)/accounting/requests/new/page.tsx`, `NewRequestForm.tsx`)*
- [x] **T23** [P] — Statistiques : bloc « Suivi de l'argent versé » (égalité affichée, cases non
  vides, par département avec taux de justification, chaque montant ouvre ses demandes)
  *(fichier : `src/app/(auth)/accounting/stats/`)*
- [x] **T24** [P] — Pastilles « Justificatifs attendus » / « Reliquat à rendre » dans les listes
  de demandes
  *(fichiers : listes de `src/app/(auth)/accounting/requests/`)*

### 5. Tests

- [x] **T25** — Règles pures : transitions, reliquat/complément, échéances, regroupement mensuel,
  éligibilité (navette, issue de la navette, note liée, note avec ou sans pièce)
  *(fichier : `src/modules/accounting/services/__tests__/justification-rules.test.ts`)*
- [x] **T26** — Service (Prisma mocké) : ouverture au dernier versement seulement (tranche
  résiduelle) ; dépôt par un tiers refusé ; acceptation avec/sans reliquat ; refus avec motif ;
  dispense ; restitution avec/sans compte ; relances idempotentes ; escalade à la 3e ; demandeur
  sans rôle ; audit
  *(fichier : `src/modules/accounting/services/__tests__/justifications.test.ts`)*
- [x] **T27** — Suivi de l'argent versé : chaque cas dans sa case ; invariant « versé = somme des
  cases » global, par mois, par département ; dépassement non doublé ; non-régression des
  indicateurs existants
  *(fichier : `src/modules/accounting/services/__tests__/fund-tracking.test.ts`)*
- [x] **T28** [P] — Trésorerie : restitution reprise en entrée, absente sans compte
  *(fichier : `src/modules/treasury/__tests__/…`)*
- [x] **T29** [P] — Routes : 403/404 hors périmètre ou autre église, Zod, restitution sur mois
  clôturé refusée, note liée refusée sans dépassement
  *(fichier : `src/app/api/accounting/__tests__/justifications-routes.test.ts`)*

### 6. Documentation

- [x] **T30** — `docs/processus/demande-financiere.md` (nouvelle étape et suivi de l'argent
  versé), `docs/database.md`, `CLAUDE.md` (spécificités de la comptabilité), guide utilisateur,
  fiche de l'assistant, `CHANGELOG.md` ; statut de la spec à « Implémentée »

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries` et `npm run lint:prisma-boundary` (seuil 143 inchangé)
- [x] `npm run test`
- [x] `npm run build`
- [ ] Parcours manuel en local (avance avec reliquat, dépassement, refus, série mensuelle) puis
  déploiement en recette
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR vers `main`

## Couverture des critères d'acceptation

| Critère | Tâches |
|---|---|
| Ouverture au dernier versement, échéance affichée | T5, T13, T20, T26 |
| Relances à l'échéance puis chaque semaine, sans doublon | T8, T18, T26 |
| Escalade dès la 3e relance (responsables, Ministre) | T8, T26 |
| Avance récurrente justifiée par mois | T4, T5, T20, T25 |
| Délais réglables par la compta | T7, T16, T21 |
| Dépôt de factures et montant dépensé, relances arrêtées | T6, T15, T20, T26 |
| Reliquat affiché | T4, T20, T21 |
| Dépassement → note de frais liée préremplie | T17, T22, T29 |
| Accepter / renvoyer avec motif | T6, T15, T20, T26 |
| Restitution avec ou sans compte, reprise en trésorerie | T6, T10, T12, T15, T28 |
| Restitution refusée sur mois clôturé | T12, T29 |
| Dispense avec motif et montant retenu | T6, T15, T20, T26 |
| Demande soldée | T4, T6, T25 |
| Note de frais sans pièce relancée, avec pièce soldée | T4, T5, T25 |
| Liste de la compta (retards, reliquats) | T7, T14, T21 |
| Suivi de l'argent versé (égalité exacte, par période et département) | T9, T23, T27 |
| Indicateurs existants inchangés | T9, T27 |
| Navette et notes issues de la navette jamais relancées | T4, T25 |
| Pas de relance des demandes payées avant la mise en service | T5, T9, T27 |
| Historique de chaque geste | T6, T26 |
| Visibilité : demandeur, périmètre, autre église | T7, T14, T15, T29 |
