# Tâches — « Je ne peux plus » et remplacements

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé (raccourci période reporté : #673)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/je-ne-peux-plus` (depuis `main` à jour, Next 16.4.0)
- [x] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter l'enum `ServiceWithdrawalStatus` (`PENDING`, `REPLACED`, `CANCELLED`,
  `CLOSED`) et le modèle `ServiceWithdrawal` décrits dans le plan :
  - champs `churchId`, `eventId`, `departmentId`, `memberId`, `originalStatus ServiceStatus`,
    `message String? @db.VarChar(500)`, `status`, `createdById`, `replacementMemberId`,
    `resolvedById`, `resolvedAt`, `relanceSentAt`, `createdAt`, `updatedAt` ;
  - relations `Church`, `Event` et `Department` (`onDelete: Cascade`), `Member` désisté
    (`"WithdrawnMember"`, `Cascade`) et remplaçant (`"ReplacementMember"`, `SetNull`), avec les
    relations inverses sur `Church`, `Event`, `Department`, `Member` ;
  - index `[eventId, departmentId, status]`, `[memberId, status]`, `[churchId, status]`.
  - *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration `service_withdrawals` (`prisma migrate dev`), relire le SQL,
  ajouter `serviceWithdrawal` au mock Prisma *(fichiers : `prisma/migrations/…`,
  `src/__mocks__/prisma.ts`)*
- [x] **T3** — Ajouter le type `"serviceWithdrawal"` à `ChurchResourceType` et au registre
  `CHURCH_RESOLVERS` (lecture de `churchId`, message « Désistement introuvable ») *(fichier :
  `src/lib/auth.ts`)*
- [x] **T4** [P] — Documenter la table et l'enum *(fichier : `docs/database.md`)*

### 2. Logique métier (services)

Dossier `src/modules/planning/services/withdrawals/`.

- [x] **T5** — `withdrawable(event, now)`, pure : vrai si `now` est avant
  `event.planningDeadline`, ou avant `event.date` si l'événement n'a pas d'échéance
  *(fichier : `withdrawals/rules.ts`)*
- [x] **T6** — `resolveWithdrawalRecipients(churchId, departmentId, withdrawnMemberId, db)` :
  comptes `DEPARTMENT_HEAD` rattachés au département par `user_departments` (principal et
  adjoints), moins le compte lié au STAR désisté ; à défaut, les `MINISTER` du ministère du
  département *(fichier : `withdrawals/recipients.ts`)*
- [x] **T7** — `listReplacementCandidates(withdrawal, db, now)` : membres du département, hors
  STAR désisté et hors déjà planifiés sur ce service ; `getPlanningAvailability` ; garder
  `AVAILABLE`/`IF_NEEDED` sans `busyElsewhere` ; tri Disponible → Si besoin → nom
  *(fichier : `withdrawals/candidates.ts`)*
- [x] **T8** — `notifyWithdrawal`, `notifyWithdrawalCancelled`, `notifyWithdrawalReplaced`,
  `notifyWithdrawalClosed`, `notifyWithdrawalRelance` : `notifyUsers`, domaine `planning`, types
  `SERVICE_WITHDRAWAL*`, liens `/planning/remplacements/[id]` (responsables) et `/planning`
  (STAR), messages de la spec (nombre de candidats, message du STAR) *(fichier :
  `withdrawals/notify.ts`)*
- [x] **T9** — `createWithdrawal(input, tx)` : contrôle du statut planifié (`PLANNED_STATUSES`),
  de `withdrawable` et de l'absence de `PENDING` ; création ; `planning.status = null` ; upsert
  `AvailabilityResponse` `UNAVAILABLE` ; suppression de la `PlanningChangeNotice` en attente de
  ce STAR sur ce service. Puis `withdrawService(...)` : transaction, `logAudit`, notification
  après validation *(fichier : `withdrawals/withdraw.ts`)*
- [x] **T10** — `replaceWithdrawal({ withdrawalId, memberId, actorId })` : refus après le début de
  l'événement ; mise à jour conditionnelle `PENDING → REPLACED` (409 avec le nom du remplaçant
  si déjà pourvu) ; revalidation du candidat (422) ; unicité de `EN_SERVICE_DEBRIEF` (422) ;
  upsert `Planning` avec `originalStatus` ; `recordPlanningChanges` pour le remplaçant ;
  `logAudit` ; confirmation au STAR désisté *(fichier : `withdrawals/replace.ts`)*
- [x] **T11** — `cancelWithdrawal` (`PENDING → CANCELLED`, statut d'origine restauré, réponse
  `AVAILABLE`, responsables prévenus) et `closeWithdrawal` (`PENDING → CLOSED`, STAR informé),
  avec `logAudit` *(fichier : `withdrawals/resolve.ts`)*
- [x] **T12** — `reconcileWithdrawalsAfterGridEdit(tx, { eventId, departmentId, before, after,
  actorId })` : STAR désisté replacé → `CANCELLED` ; membre nouvellement planifié → le plus
  ancien `PENDING` passe `REPLACED` avec ce membre (un par membre ajouté) ; idempotent ;
  renvoie les confirmations à envoyer *(fichier : `withdrawals/reconcile.ts`)*
- [x] **T13** — `runWithdrawalRelances(now)` : `PENDING`, `relanceSentAt` nul, événement dans les
  48 h et à venir, désistement antérieur à `event.date − 48 h` ; relance avec le nombre de
  candidats recalculé ; `relanceSentAt = now` *(fichier : `withdrawals/relances.ts`)*
- [x] **T14** — `listPendingWithdrawals` : par service (pour la grille) et par membre (pour
  « Mon planning ») ; `getWithdrawalDetail(id, viewer)` (désistement, événement, membre,
  candidats, `canReplace`) *(fichier : `withdrawals/queries.ts`)*
- [x] **T15** — `saveResponses` (spec 058) : pour un STAR planifié qui passe « Pas disponible »,
  appeler `createWithdrawal` dans la même transaction si `withdrawable`, sinon garder la
  notification simple ; notifier après validation *(fichier :
  `src/modules/planning/services/availability/responses.ts`)*
- [x] **T16** — `listMemberAvailability` : ajouter `plannedIn: { departmentId, departmentName,
  withdrawable }[]` par événement *(fichier : `availability/responses.ts`)*
- [x] **T17** — Exporter les services publics depuis l'index du module *(fichier :
  `src/modules/planning/index.ts`)*

### 3. API (route handlers)

Toutes : `resolveChurchId` sur l'objet, puis `requireChurchPermission`, Zod sur les mutations,
`successResponse`/`errorResponse`, `await params`.

- [x] **T18** — `POST /api/planning/withdrawals` : `planning:view` dans l'église de l'événement,
  fiche liée au compte (`isMemberLinkedToUser`), Zod `{ eventId, departmentId, message? ≤ 500 }`
  → `withdrawService` *(fichier : `src/app/api/planning/withdrawals/route.ts`)*
- [x] **T19** — `GET /api/planning/withdrawals/[id]` (`planning:department` +
  `requireDepartmentAccess`) et `DELETE` (annulation : `planning:view`, fiche liée)
  *(fichier : `src/app/api/planning/withdrawals/[id]/route.ts`)*
- [x] **T20** [P] — `POST /api/planning/withdrawals/[id]/replace` : `planning:edit` +
  `requireDepartmentAccess`, Zod `{ memberId }` *(fichier :
  `src/app/api/planning/withdrawals/[id]/replace/route.ts`)*
- [x] **T21** [P] — `POST /api/planning/withdrawals/[id]/close` : `planning:edit` +
  `requireDepartmentAccess` *(fichier : `src/app/api/planning/withdrawals/[id]/close/route.ts`)*
- [x] **T22** — Grille, `GET` : ajouter `withdrawals` (`PENDING` du service) et
  `counts.toReplace` ; `PUT` : appeler `reconcileWithdrawalsAfterGridEdit` dans le traitement
  existant, puis les confirmations *(fichier :
  `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)*
- [x] **T23** — Planificateur : déclarer `{ key: "service-withdrawal-relances", schedule:
  { kind: "interval", minutes: 60 }, run: runWithdrawalRelances }` et l'ajouter au résumé de
  réponse *(fichier : `src/app/api/cron/route.ts`)*

### 4. UI

- [x] **T24** — `loadMyPlanning` : inclure le statut `REMPLACANT` ; charger les désistements
  `PENDING` du membre et `withdrawable` par service ; noms des responsables pour le message
  après échéance *(fichier : `src/app/(auth)/planning/my-planning-data.ts`)*
- [x] **T25** — « Mon planning » : bouton « Je ne peux plus » (carte « Prochain service » et
  chaque service à venir) avec `ConfirmModal` + `Textarea` facultatif ; `Alert` « contacte ton
  responsable » après l'échéance ; `StatusChip` « Désisté — en attente de remplacement » et
  bouton « Annuler mon désistement » ; libellé du statut « remplaçant » ; `useToast` ; mobile
  *(fichier : `src/app/(auth)/planning/MyPlanningView.tsx`)*
- [x] **T26** — Page serveur du service à remplacer : garde `planning:department` +
  `requireDepartmentAccess`, chargement par `getWithdrawalDetail` *(fichier :
  `src/app/(auth)/planning/remplacements/[id]/page.tsx`)*
- [x] **T27** — Client de remplacement : événement, STAR désisté et message, candidats en cartes
  avec pastille de disponibilité, « Choisir », « Ne pas remplacer » (`ConfirmModal`),
  `EmptyState` sans candidat, état terminal (pourvu/annulé/clos), lecture seule si
  `!canReplace`, gestion des erreurs 409/422 (message + liste rafraîchie) ; mobile d'abord
  *(fichier : `src/app/(auth)/planning/remplacements/[id]/ReplacementClient.tsx`)*
- [x] **T28** [P] — Grille : bandeau `Alert` « N service(s) à remplacer » avec liens, ligne du
  STAR désisté marquée « à remplacer » (avec message), compteur `toReplace` *(fichier :
  `src/components/PlanningGrid.tsx`)*
- [x] **T29** [P] — Écran de disponibilités : `ConfirmModal` d'avertissement avant d'enregistrer
  un « Pas disponible » (réponse ; raccourci période reporté à #673) qui touche un service `withdrawable`
  *(fichier : `src/app/(auth)/disponibilites/AvailabilityClient.tsx`)*
- [x] **T30** [P] — Fil d'Ariane : rattacher `/planning/remplacements/[id]` à l'espace Planning
  (« Remplacement ») *(fichier : `src/lib/navigation.ts`)*

### 5. Tests

Dossier `src/modules/planning/services/withdrawals/__tests__/` sauf mention.

- [x] **T31** [P] — `rules.test.ts` : avant/après échéance, sans échéance, événement commencé
- [x] **T32** [P] — `recipients.test.ts` : responsables et adjoints ; STAR désisté responsable
  exclu ; Ministre seulement à défaut ; pas de Ministre en copie sinon
- [x] **T33** [P] — `candidates.test.ts` : disponibilité, « déjà de service ailleurs », déjà
  planifiés, STAR désisté exclu, tri
- [x] **T34** — `withdraw.test.ts` : retrait du planning, statut d'origine, réponse
  `UNAVAILABLE`, notice 060 supprimée, notification après transaction ; refus non planifié,
  `PENDING` existant, échéance passée
- [x] **T35** — `replace.test.ts` : succès (statut d'origine, `recordPlanningChanges`,
  confirmation) ; 409 concurrent ; 422 candidat devenu indisponible ; 422 débrief en double ;
  refus après le début ; accepté après l'échéance
- [x] **T36** [P] — `resolve.test.ts` : annulation (statut et réponse restaurés, responsables
  prévenus, refus si non `PENDING`) ; clôture (STAR informé, fin de la relance)
- [x] **T37** [P] — `reconcile.test.ts` : STAR désisté replacé → annulation ; ajout → remplacement
  du plus ancien ; plusieurs ajouts ; idempotence
- [x] **T38** [P] — `relances.test.ts` : fenêtre 48 h, relance unique, pas de relance pour un
  désistement tardif, ni pour un événement passé
- [x] **T39** — `saveResponses` : « Pas disponible » d'un STAR planifié → désistement avant
  l'échéance, notification simple après ; plusieurs services touchés par une même saisie *(fichier :
  `availability/__tests__/responses.test.ts`)*
- [x] **T40** — Routes `withdrawals` : 403 fiche non liée, 403 hors périmètre, 403 Secrétaire sur
  `replace`/`close`, 400 Zod, isolation multi-église, codes 201/409/422 *(fichier :
  `src/app/api/planning/withdrawals/__tests__/routes.test.ts`)*
- [x] **T41** — Grille : `GET` renvoie `withdrawals`/`toReplace` ; `PUT` déclenche la
  réconciliation *(fichier : tests existants de la route planning)*
- [x] **T42** [P] — Planificateur : la tâche `service-withdrawal-relances` est déclarée et
  exécutée *(fichier : `src/app/api/cron/__tests__/cron-modules.test.ts`)*
- [x] **T43** [P] — `loadMyPlanning` : statut `REMPLACANT` inclus, désistements en attente
  renvoyés *(fichier : test des données « Mon planning »)*

### 6. Documentation

- [x] **T44** [P] — Réaligner la date limite de planification (bloquante pour les responsables,
  sauf pour pourvoir un désistement) et décrire le désistement *(fichier :
  `docs/processus/planning-de-service.md`)*
- [x] **T45** [P] — Documenter les nouvelles routes *(fichier : `docs/api.md`)*
- [x] **T46** [P] — Guide utilisateur : STAR (« Je ne peux plus », annulation) et responsable
  (remplacer, ne pas remplacer) *(fichier : contenu du guide, `src/components/GuideContent.tsx`)*
- [x] **T47** — CHANGELOG (« Non publié ») ; statut de la spec et du plan à « Implémentée »

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` (dont `route-exhaustiveness.test.ts` pour la page et les routes nouvelles)
- [x] `npm run build` (frontière client/serveur)
- [x] Parcours vérifié sur mobile : désistement → notification → choix d'un remplaçant
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (tableau ci-dessous)
- [x] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère de la spec | Tâches |
|---|---|
| « Je ne peux plus » depuis « Prochain service » et « Mon planning » | T24, T25, T18 |
| Confirmation et message facultatif | T25, T18 |
| Service « à remplacer » dans la grille, « Mon planning » et le compteur | T14, T22, T25, T28, T41 |
| Disponibilité « Pas disponible » après désistement | T9, T34 |
| Notification immédiate, nombre de candidats, lien vers l'écran | T8, T9, T34 |
| Liste des remplaçants filtrée et triée | T7, T33 |
| Remplaçant placé avec le statut d'origine, STAR désisté retiré, fin de l'état | T9, T10, T35 |
| Remplaçant prévenu (060), confirmation au STAR désisté | T10, T35 |
| Choix invalide refusé avec message clair | T10, T27, T35 |
| « Ne pas remplacer » | T11, T21, T27, T36 |
| Services « remplaçant » dans « Mon planning » | T24, T25, T43 |
| Annulation du désistement, responsable informé | T11, T19, T25, T36 |
| Remplacement réservé à `planning:edit` dans le périmètre ; Secrétaire en lecture | T19–T21, T26, T27, T40 |
| Désistement jusqu'à l'échéance, sinon « contacte ton responsable » | T5, T25, T31 |
| Remplacement possible après l'échéance, jusqu'au début | T10, T35 |
| Ministre prévenu seulement à défaut | T6, T32 |
| Relance unique 48 h avant | T13, T23, T38, T42 |
| « Pas disponible » depuis l'écran de disponibilités = désistement | T15, T16, T29, T39 |
| Préférences de notification respectées | T8 (`notifyUsers` → `dispatchUserEmails`) |
| Parcours utilisable sur mobile | T25, T27, T28, T29, vérification finale |
