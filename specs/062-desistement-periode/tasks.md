# Tâches — Désistement depuis une période d'indisponibilité

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/desistement-periode` (depuis `main` à jour, après le merge de #674)
- [ ] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [ ] **T1** — `ServiceWithdrawal.absenceId String?` + relation `absence` (`onDelete: SetNull`),
  index `[absenceId, status]` ; relation inverse `Absence.withdrawals` *(fichier :
  `prisma/schema.prisma`)*
- [ ] **T2** — Migration `…_service_withdrawal_absence` via `npm run db:migrate` (jamais
  `db push`) ; vérifier le SQL généré (colonne nullable, FK `SET NULL`, index) *(fichier :
  `prisma/migrations/`)*
- [ ] **T3** [P] — Documenter la colonne *(fichier : `docs/database.md`)*

### 2. Logique métier (services)

- [ ] **T4** — `createWithdrawal` : options `{ absenceId?, recordResponse = true }` ; sans
  `recordResponse`, pas d'upsert de la réponse « Pas disponible » ; `absenceId` persisté
  *(fichier : `src/modules/planning/services/withdrawals/withdraw.ts`)*
- [ ] **T5** — Extraire de `cancelWithdrawal` le cœur transactionnel
  `cancelPendingWithdrawal(tx, id, actorId, { restoreResponse }, now)` (`PENDING → CANCELLED`
  conditionnel, statut d'origine restauré, réponse « Disponible » seulement si
  `restoreResponse`) ; `cancelWithdrawal` l'utilise avec `restoreResponse: true`, comportement
  inchangé *(fichier : `src/modules/planning/services/withdrawals/resolve.ts`)*
- [ ] **T6** — Notifications : types `SERVICE_WITHDRAWAL_BY_ABSENCE` (au STAR, regroupée, période
  déclarée par un tiers) et `SERVICE_WITHDRAWAL_KEPT` (au STAR, services déjà pourvus ou clos non
  replacés), domaine `planning`, lien `/planning` *(fichier :
  `src/modules/planning/services/withdrawals/notify.ts`)*
- [ ] **T7** — `findWithdrawableServicesForAbsence(tx, { memberId, churchId, targeting,
  excludeAbsenceId? }, now)` : statuts `PLANNED_STATUSES`, événement à venir couvert (même
  fenêtre et même filtre départemental que `findAbsenceConflicts`), `withdrawable`, sans
  désistement `PENDING` ; renvoie `{ eventId, title, date, departmentId, departmentName }`
  *(fichier : `src/modules/planning/services/withdrawals/absence.ts`)*
- [ ] **T8** — `withdrawForAbsence(tx, { absenceId, churchId, memberId, actorId, targeting },
  now)` : un `createWithdrawal(…, { absenceId, recordResponse: false })` par service trouvé ;
  renvoie les identifiants *(fichier : `withdrawals/absence.ts`)*
- [ ] **T9** — `cancelAbsenceWithdrawals(tx, { absenceId, actorId, keep? }, now)` : `PENDING` non
  retenus par `keep` → `cancelPendingWithdrawal(…, { restoreResponse: false })` ;
  `REPLACED`/`CLOSED` rapportés ; événements commencés ignorés ; renvoie `{ cancelled, kept }`
  *(fichier : `withdrawals/absence.ts`)*
- [ ] **T10** — `sendAbsenceWithdrawalNotices({ created, cancelled, kept, memberId, churchId,
  thirdParty, actorId })` hors transaction : journal d'audit des créations (`source: "absence"`),
  `sendWithdrawalNotice` par création, `notifyWithdrawalCancelled` par annulation, STAR informé
  (tiers et conservés) ; erreurs journalisées sans propagation *(fichier :
  `withdrawals/absence.ts`)*
- [ ] **T11** — `declareAbsence` : `withdrawForAbsence` après `deleteResponsesCoveredByPeriod`
  et les backups, **avant** `findAbsenceConflicts` ; la transaction renvoie l'absence et les
  identifiants ; envoi hors transaction ; détection du tiers (`isMemberLinkedToUser`) ; retour
  `{ absence, withdrawalCount }` *(fichier :
  `src/modules/planning/services/absence.service.ts`)*
- [ ] **T12** — `updateAbsence` : si le ciblage change, `cancelAbsenceWithdrawals(keep = encore
  couvert)` puis `withdrawForAbsence` sur le nouveau ciblage, avant `conflictsAfter` ; rien si
  seuls le motif ou les backups changent ; retour avec les compteurs *(fichier :
  `absence.service.ts`)*
- [ ] **T13** — `cancelAbsence` : `cancelAbsenceWithdrawals` (aucun conservé), notifications
  hors transaction ; retour avec `cancelledWithdrawalCount` *(fichier : `absence.service.ts`)*
- [ ] **T14** — Exporter `findWithdrawableServicesForAbsence` et ajuster les types de retour
  consommés par l'index *(fichier : `src/modules/planning/index.ts`)*

### 3. API (route handlers)

- [ ] **T15** — `GET /api/absences/withdrawal-preview` : `requireAbsenceSubjectAccess`, Zod sur
  `startDate`/`endDate`/`allDepartments`/`departmentIds`/`absenceId?`, `absenceId` vérifié dans
  l'église et pour ce membre ; sans import Prisma *(fichier :
  `src/app/api/absences/withdrawal-preview/route.ts`)*
- [ ] **T16** — `POST /api/absences` et `PATCH /api/absences/[id]` (`update`/`cancel`) : relayer
  `withdrawalCount`/`cancelledWithdrawalCount` sans casser la forme actuelle de la réponse
  *(fichiers : `src/app/api/absences/route.ts`, `src/app/api/absences/[id]/route.ts`)*

### 4. UI

- [ ] **T17** — `UnavailabilityPeriodForm` : avant l'enregistrement, appel de l'aperçu ; si des
  services sont listés, `ConfirmModal` d'avertissement (2ᵉ personne en mode « self », 3ᵉ personne
  en mode « manage », liste à puces au-delà de trois services, `absenceId` en modification) ;
  sinon enregistrement direct ; utilisable sur mobile *(fichier :
  `src/components/UnavailabilityPeriodForm.tsx`)*
- [ ] **T18** [P] — Toasts « N désistement(s) créé(s) : responsables prévenus » / « N
  désistement(s) annulé(s) » à partir des compteurs (le formulaire transmet la réponse à
  `onSaved`) *(fichiers : `src/app/(auth)/disponibilites/AvailabilityClient.tsx`,
  `src/app/(auth)/absences/AbsencesClient.tsx`)*

### 5. Tests

- [ ] **T19** [P] — `absence.test.ts` (withdrawals) : `findWithdrawableServicesForAbsence`
  (remplaçant compris, échéance, filtre départemental, `PENDING` exclu, `excludeAbsenceId`,
  service du dernier jour de la période couvert) ; `withdrawForAbsence` (`absenceId`, aucune
  réponse) ; `cancelAbsenceWithdrawals` (`keep`, conservés rapportés, autres origines intactes,
  événement commencé ignoré) ; `sendAbsenceWithdrawalNotices` (tiers / soi-même) *(fichier :
  `src/modules/planning/services/withdrawals/__tests__/absence.test.ts`)*
- [ ] **T20** [P] — `withdraw.test.ts` / `resolve.test.ts` : `recordResponse: false` n'écrit pas
  de réponse ; `restoreResponse: false` n'écrit pas « Disponible » ; `cancelWithdrawal` inchangé
- [ ] **T21** — `absence.service.test.ts` : déclaration (désistements, `ABSENCE_CONFLICT`
  seulement après échéance, `ABSENCE_DECLARED` toujours, STAR informé si tiers) ; modification
  (raccourcissement → annulations, prolongation → créations, motif seul → rien, service repris
  puis période modifiée → re-désisté) ; annulation (annulés + conservés notifiés) ; backups
  inchangés *(fichier : `src/modules/planning/services/absence.service.test.ts`)*
- [ ] **T22** — Routes : `withdrawal-preview` (soi-même, responsable dans/hors périmètre → 403,
  400 Zod, `absenceId` d'un autre membre → 403/404) ; `POST`/`PATCH` relaient les compteurs
  *(fichiers : `src/app/api/absences/__tests__/`, `src/app/api/absences/[id]/__tests__/`)*

### 6. Documentation

- [ ] **T23** [P] — Processus : la période crée des désistements avant l'échéance (alerte de
  conflit au-delà), annulation/modification *(fichiers : `docs/processus/planning-de-service.md`,
  fiche absences de `docs/processus/` si elle existe)*
- [ ] **T24** [P] — API : `withdrawal-preview`, compteurs `POST`/`PATCH` *(fichier :
  `docs/api.md`)*
- [ ] **T25** [P] — Guide : « Je ne peux plus servir » et « Indisponibilités de mon périmètre »
  mentionnent la période *(fichier : `src/components/GuideContent.tsx`)*
- [ ] **T26** — CHANGELOG « Non publié » ; spec 061 : retirer la mention « reporté (#673) » ;
  statuts spec/plan 062 à « Implémentée »/« Implémenté »

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run lint:prisma-boundary` (seuil inchangé)
- [ ] `npm run test` (dont `route-exhaustiveness.test.ts`)
- [ ] `npm run build` (frontière client/serveur)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main` (ferme #673)
