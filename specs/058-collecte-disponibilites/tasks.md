# Tâches — Collecte des disponibilités et disponibilités dans la grille

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **ADR** : `docs/adr/0020-…`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
>
> **Livraison suggérée en trois sous-PR** vers `feat/collecte-disponibilites` (feature longue) :
> **A** = §1–§3 et tests associés (données, calcul, cron, API — sans effet visible tant que l'UI
> n'expose rien, hormis le refus d'`INDISPONIBLE` et d'`EVENTS`) ; **B** = écran « Mes
> disponibilités », réglages, « Indisponibilités » (§4.1–4.4) ; **C** = grille (§4.5–4.7). La
> migration de reprise (T2) **et** le retrait d'`INDISPONIBLE` de la grille (T35) doivent partir
> ensemble en production : une seule PR finale vers `main`.

## Prérequis

- [x] Branche créée : `feat/collecte-disponibilites`
- [x] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Schéma : enums `AvailabilityAnswer`, `AvailabilityAskReason` ; modèles
  `AvailabilitySettings`, `AvailabilityCollection`, `AvailabilityResponse`, `AvailabilityAsk`,
  `AvailabilityReminderLog` ; relations inverses sur `Church`, `Member`, `Event`, `Department`,
  `User` (`AvailabilityEnteredBy`). *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Migration `add_availability_collection` générée par `prisma migrate dev`, puis
  complétée à la main par la **reprise** : (a) absences `EVENTS` actives → réponses
  `UNAVAILABLE` par événement existant × département (dépliage `allDepartments` sur les
  départements du membre qui servent l'événement, sinon intersection avec les départements
  ciblés), `enteredById = createdById` ; (b) suppression de toutes les absences `EVENTS` ;
  (c) plannings `INDISPONIBLE` → réponses `UNAVAILABLE` (`enteredById` NULL, `INSERT IGNORE`) ;
  (d) suppression de ces plannings. Commentaire SQL par étape.
  *(fichier : `prisma/migrations/<horodatage>_add_availability_collection/migration.sql`)*
- [x] **T3** — `docs/database.md` : section « Disponibilités » (5 tables, règle de dérivation,
  reprise). *(fichier : `docs/database.md`)*

### 2. Logique métier (services)

- [x] **T4** — Calcul pur : `resolveAvailability`, `collectionWindow`, `askDueAt`,
  `shouldRelance`, types `AvailabilityState`. Aucun accès BDD.
  *(fichier : `src/modules/planning/services/availability/state.ts`)*
- [x] **T5** [P] — Réglages : `DEFAULT_AVAILABILITY_SETTINGS`, `getAvailabilitySettings`,
  `updateAvailabilitySettings` (upsert), `listAvailabilitySettingsByChurch` (Map pour le cron).
  *(fichier : `src/modules/planning/services/availability/settings.ts`)*
- [x] **T6** — Lecture STAR : `listMemberAvailability(memberId, churchId, month)` — événements du
  mois où un département du membre sert (hors parents de récurrence, à venir), état par
  département via T4 (réponse > période > demandé > non demandé), échéance, mois proposés
  (collectes ouvertes + mois en cours). *(fichier : `…/availability/responses.ts`)*
- [x] **T7** — Écriture : `saveResponses({ memberId, churchId, answers, actorId })` — dépliage
  « tous mes départements », refus d'un département non servant / événement passé ou hors
  église (`ApiError(400)`), upsert, `enteredById`, puis collecte des **alertes** (STAR planifié
  `EN_SERVICE*`/`REMPLACANT` passé `UNAVAILABLE`) et notification
  `AVAILABILITY_PLANNED_UNAVAILABLE` aux responsables (`resolveResponsibleUserIds`) après commit.
  *(fichier : `…/availability/responses.ts`)*
- [x] **T8** — Grille : `getPlanningAvailability(eventId, departmentId, memberIds)` → état par
  membre (`state`, `overdue`, `source`, `enteredByThirdParty`), `busyElsewhere` (plannings
  `EN_SERVICE*` le même jour dans un autre département), compteurs.
  *(fichier : `…/availability/grid.ts`)*
- [x] **T9** — Demandes ciblées : `createAsks(tx, { eventId, departmentIds, reason,
  createdById? })` (upsert, `notifiedAt = null`, `dueAt` via `askDueAt`) ; `askTeam(...)` (crée +
  notifie tout de suite les membres liés du département) ; `manualRelance(...)` (« Sans réponse »
  du département, `manualRelanceAt` du jour → `ApiError(409)`, journal T11).
  *(fichier : `…/availability/asks.ts`)*
- [x] **T10** — Tâche planifiée `runAvailabilityTasks(now)` : par église active, (1) ouverture des
  mois cibles `opensAt ≤ now` ayant un événement à venir — même clôture proche ou passée —,
  `closesAt` figé ; (2) notification d'ouverture (`notifiedAt`, mention « au plus vite » si
  clôture passée) ; (3) envoi des demandes ciblées en attente, **groupées par STAR** ;
  (4) relances collecte et demandes (aux seuls « Sans réponse », sauf collecte ouverte après sa
  date de relance), dédoublonnées par T11. *(fichier : `…/availability/collection.ts`)*
- [x] **T11** — Journal des relances : `recordReminders(memberEventPairs, day)` →
  `createMany({ skipDuplicates })` et retour des seules paires nouvelles.
  *(fichier : `…/availability/collection.ts`)*
- [x] **T12** — Périodes : dans `declareAbsence`/`updateAbsence`, refuser `kind = EVENTS`
  (`ApiError(400)`) et supprimer les réponses des événements couverts (mêmes départements) dans la
  même transaction. *(fichier : `src/modules/planning/services/absence.service.ts`)*
- [x] **T13** — Bus : ajouter `planning:event:rescheduled` et `planning:event:departments:added`
  au type `PlanningEvents`. *(fichier : `src/modules/planning/events.ts`)*
- [x] **T14** — Émissions : `rescheduled` depuis `PUT /api/events/[eventId]` (dont
  `applyToSeries`), le PATCH groupé `/api/events` (action update avec date) et
  `MODIFICATION_EVENEMENT` ; `departments:added` depuis `POST /api/events/[eventId]/departments`.
  *(fichiers : `src/app/api/events/[eventId]/route.ts`, `src/app/api/events/route.ts`,
  `src/modules/planning/services/request-executor.ts`,
  `src/app/api/events/[eventId]/departments/route.ts`)*
- [x] **T15** — Abonné : `planning:event:created` / `departments:added` → `createAsks(EVENT_ADDED)`
  si la collecte du mois est ouverte ; `rescheduled` → suppression des réponses de l'événement puis
  `createAsks(EVENT_MOVED)` si la collecte du nouveau mois est ouverte ou si une demande existait.
  Enregistrement dans le registre. *(fichiers : `…/availability/subscribers.ts`,
  `src/lib/registry.ts`)*
- [x] **T16** — Permission `availability:settings` (`SUPER_ADMIN`, `ADMIN`, `SECRETARY`), routes
  `/disponibilites` et `/api/availability` au manifeste. *(fichier :
  `src/modules/planning/manifest.ts`)*
- [x] **T17** — Exports publics : services T4–T12 nécessaires à `src/app/`, `runAvailabilityTasks`.
  *(fichier : `src/modules/planning/index.ts`)*
- [x] **T18** — Branchement cron : `runAvailabilityTasks()` dans le `Promise.all` de
  l'orchestrateur, sans garde `registry.has`. *(fichier : `src/app/api/cron/route.ts`)*

### 3. API (route handlers)

- [x] **T19** — `GET`/`PUT /api/availability` : soi (`requireAuth` + membre lié dans l'église) ou
  tiers (`requireChurchPermission("absences:manage", churchId)` + périmètre
  `getUserDepartmentScope`) ; Zod `{ churchId, memberId, answers[≤200] }` ; `logAudit` si tiers.
  *(fichier : `src/app/api/availability/route.ts`)*
- [x] **T20** [P] — `GET`/`PUT /api/availability/settings` : `availability:settings` ; Zod bornes
  1–6 / 1–30 / 1–14.
  *(fichier : `src/app/api/availability/settings/route.ts`)*
- [x] **T21** [P] — `POST /api/events/[eventId]/departments/[deptId]/availability` :
  `resolveChurchId("event")`, `absences:manage`, `requireDepartmentAccess` ; Zod
  `{ action: "ask" | "relance" }`. *(fichier :
  `src/app/api/events/[eventId]/departments/[deptId]/availability/route.ts`)*
- [x] **T22** — Planning `GET` : ajout `availability`, `busyElsewhere`, `counts`, `canAskTeam`,
  `manualRelanceAvailable` (T8), dans les deux branches ; retrait d'`activeAbsence`.
  *(fichier : `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)*
- [x] **T23** — Planning `PUT` : `INDISPONIBLE` retiré de l'enum Zod accepté.
  *(même fichier)*
- [x] **T24** [P] — *(POST/PATCH faits en A ; `GET`/export/`target-options` reportés en B avec la vue « Indisponibilités »)* Absences `POST`/`PATCH` et `target-options` : `kind` limité à `PERIOD` ;
  `GET`/export incluent les réponses `UNAVAILABLE` pour la vue « Indisponibilités ».
  *(fichiers : `src/app/api/absences/route.ts`, `[id]/route.ts`, `export/route.ts`,
  `target-options/route.ts`)*

### 4. UI

#### 4.1 « Mes disponibilités »

- [x] **T25** — Page serveur `/disponibilites` : membre lié, membres gérables
  (`absences:manage`), paramètres `?month`/`?event`/`?member`, `loading.tsx`.
  *(fichiers : `src/app/(auth)/disponibilites/page.tsx`, `loading.tsx`)*
- [x] **T26** — Client : onglets par mois avec échéance, carte par événement, segmenté
  Disponible / Si besoin / Pas disponible, « Sans réponse » visible, « Préciser par département »
  (si ≥ 2 départements servants), enregistrement par carte avec toast, événement `?event` mis en
  évidence, mobile d'abord. *(fichier : `src/app/(auth)/disponibilites/AvailabilityClient.tsx`)*
- [x] **T27** — Extraction du formulaire de période (dates, départements, « Qui me remplace ? »
  pour un responsable) depuis `AbsencesClient` en composant partagé ; bouton « Pas disponible du
  … au … » dans `AvailabilityClient`. *(fichiers : `src/components/UnavailabilityPeriodForm.tsx`,
  `AbsencesClient.tsx`, `AvailabilityClient.tsx`)*
- [x] **T28** — « Répondre pour… » (gérables) et mention « Saisi par X ».
  *(fichier : `AvailabilityClient.tsx`)*

#### 4.2 Réglages

- [x] **T29** [P] — `/disponibilites/parametres` : activation + trois délais, sur le modèle de
  `/care/parametres`. *(fichiers : `src/app/(auth)/disponibilites/parametres/page.tsx`,
  `AvailabilitySettingsClient.tsx`)*

#### 4.3 « Indisponibilités »

- [x] **T30** — `/absences` : retrait de « Mes absences », du formulaire et du mode « Des
  événements précis » ; titre « Indisponibilités » ; la vue d'ensemble, la frise et l'export
  affichent périodes et réponses « Pas disponible » ; libellés sans jargon (« Backup » →
  « Remplaçant »). *(fichiers : `src/app/(auth)/absences/page.tsx`, `AbsencesClient.tsx`,
  `AbsencesTimeline.tsx`)*

#### 4.4 Navigation & liens

- [x] **T31** [P] — Navigation : « Disponibilités » pour tout membre d'un département,
  « Indisponibilités » pour `absences:view`. *(fichiers : `src/lib/navigation.ts`,
  `src/app/(auth)/layout.tsx`)*
- [x] **T32** [P] — « Je ne peux pas » → `/disponibilites?event=<id>`.
  *(fichier : `src/app/(auth)/planning/MyPlanningView.tsx`)*

#### 4.5–4.7 Grille

- [x] **T33** — Pastille de disponibilité (`StatusChip`, « en retard » si échéance passée) à la
  place d'`AbsenceBadge` ; mention « De service en <département> ».
  *(fichier : `src/components/PlanningGrid.tsx`)*
- [x] **T34** — Tri disponibles → si besoin → sans réponse → pas disponibles ; en-tête compteur
  `N disponibles · M si besoin · K sans réponse`. *(même fichier)*
- [x] **T35** — Segment `INDISPONIBLE` retiré ; placer un indisponible affiche une `Alert`
  d'avertissement sur la ligne avec la raison. *(même fichier)*
- [x] **T36** — Boutons « Interroger l'équipe » et « Relancer les sans-réponse » (désactivé si
  déjà fait aujourd'hui), confirmation, toast. *(même fichier)*

#### 4.8 Documentation

- [x] **T37** [P] — Guide : entrées « Indiquer mes disponibilités », « Lire les disponibilités
  dans la grille », « Régler la collecte » ; `docs/processus/absences.md` réécrit.
  *(fichiers : `src/components/GuideContent.tsx`, `docs/processus/absences.md`)*
- [x] **T38** [P] — Permission `availability:settings` dans la matrice de `CLAUDE.md` et
  `docs/auth.md` ; CHANGELOG (section non publiée) ; ADR-0020 passé « Accepté ».
  *(fichiers : `CLAUDE.md`, `docs/auth.md`, `CHANGELOG.md`, `docs/adr/0020-…`, `docs/adr/README.md`)*

### 5. Tests

- [x] **T39** [P] — `state.ts` : précédence réponse > période > demandé > non demandé ;
  `overdue` ; fenêtre (M-2, J-7, mois sans événement, mois entamé / clôture passée) ;
  `askDueAt` (collecte ouverte / passée / événement proche) ; `shouldRelance` (échéance trop
  proche). *(fichier : `src/modules/planning/services/availability/__tests__/state.test.ts`)*
- [x] **T40** [P] — `responses.ts` : dépliage, ciblage, refus d'un département non servant et
  d'un événement passé, `enteredById` tiers, alerte au responsable seulement si planifié.
  *(fichier : `…/__tests__/responses.test.ts`)*
- [x] **T41** [P] — `collection.ts` : ouverture idempotente, collecte tardive ouverte quand même,
  église désactivée ignorée, clôture figée malgré un réglage modifié, relance aux seuls « Sans
  réponse », pas de relance si ouverte après sa date, dédoublonnage jour × événement, demandes
  groupées par STAR, envoi par les helpers de notification (domaine `planning`, préférences
  email appliquées). *(fichier : `…/__tests__/collection.test.ts`)*
- [x] **T42** [P] — `asks.ts` + abonnés : événement créé / département ajouté avec et sans collecte
  ouverte ; déplacement → réponses supprimées + demande ; relance manuelle bis du jour → 409.
  *(fichiers : `…/__tests__/asks.test.ts`, `…/__tests__/subscribers.test.ts`)*
- [x] **T43** [P] — `grid.ts` : états, `busyElsewhere`, compteurs.
  *(fichier : `…/__tests__/grid.test.ts`)*
- [x] **T44** — Routes : `availability` GET/PUT (soi ; tiers dans/hors périmètre ; autre église →
  403 ; STAR qui lit un autre membre → 403) ; `settings` (Secrétaire/Admin 200, Resp. département
  et STAR 403) ; `ask`/`relance` (périmètre, 409) ; planning GET (nouveaux champs) et PUT
  (`INDISPONIBLE` → 400) ; absences POST `EVENTS` → 400.
  *(fichiers : `src/app/api/availability/__tests__/route.test.ts`,
  `src/app/api/availability/settings/__tests__/route.test.ts`,
  `src/app/api/events/[eventId]/departments/[deptId]/availability/__tests__/route.test.ts`,
  `…/planning/__tests__/route.test.ts`, `src/app/api/absences/__tests__/security.test.ts`)*
- [x] **T45** — Tests existants adaptés : `absence.service.test.ts` (refus `EVENTS`, suppression
  des réponses couvertes), `absence-targeting.test.ts`, `permissions.test.ts`,
  `manifests.test.ts`, `navigation.test.ts`, `star-navigation.test.ts`, `cron-modules.test.ts`,
  `route-exhaustiveness.test.ts`.
- [x] **T46** — Vérification manuelle en dev (390 px et bureau) : rejeu de la migration sur un jeu
  contenant absences `EVENTS` et plannings `INDISPONIBLE` (comptes avant/après) ; collecte ouverte
  par appel du cron ; réponse ciblée ; période ; grille (pastilles, tri, compteur, avertissement,
  « De service en … ») ; interroger / relancer ; « Je ne peux pas » ; réglages. Base de dev
  restaurée ensuite.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] `npm run build` (frontière client/serveur des écrans modifiés)
- [x] Migration rejouée sur une copie de la base de recette (reprise vérifiée) avant la production *(appliquée en recette par « Deploy Staging », recette validée le 2026-10-02)*
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [x] CHANGELOG (section non publiée) mis à jour
- [x] PR finale `feat/collecte-disponibilites` → `main` (#624) ; annonce aux églises préparée (`annonce-eglises.md` ; ouverture
  simultanée de plusieurs collectes au déploiement)
