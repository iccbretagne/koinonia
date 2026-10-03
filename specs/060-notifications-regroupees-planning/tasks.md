# Tâches — Notifications regroupées des changements de planning

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **ADR** : `docs/adr/0021-planificateur-taches-cron.md`
- **Statut** : En cours (code livré, recette à faire)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/notifications-regroupees-planning`, rebasée sur `main` (planificateur
  de la PR #634 disponible)
- [x] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter le modèle `PlanningChangeNotice` : `churchId`, `memberId`, `eventId`,
  `departmentId`, `previousStatus ServiceStatus?`, `lastChangedAt`, `createdAt`.
  - Clé unique `[memberId, eventId, departmentId]`, index `[churchId, lastChangedAt]`.
  - Aucune relation vers les autres tables.
  - Ajouter aussi `planningNoticeDelayMinutes Int @default(15)` à `AvailabilitySettings`.
  - *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration `add_planning_change_notices` (`prisma migrate dev`) et
  vérifier le SQL. Ajouter `planningChangeNotice` au mock *(fichiers :
  `prisma/migrations/…`, `src/__mocks__/prisma.ts`)*
- [x] **T3** [P] — Documenter la table et la colonne *(fichier : `docs/database.md`)*

### 2. Logique métier (services)

- [x] **T4** — Ajouter `planningNoticeDelayMinutes` à `getAvailabilitySettings` (défaut 15 sans
  ligne) et à `updateAvailabilitySettings` *(fichier :
  `src/modules/planning/services/availability/settings.ts`)*
- [x] **T5** — Créer `planning-change-notices.ts` avec :
  - le type `PlanningChange` ;
  - `computeNetChanges(rows, current)`, pure. `null` et `INDISPONIBLE` valent « absent ». Elle
    renvoie `ADDED` / `REMOVED` / `CHANGED`, ou rien si le statut d'origine est retrouvé.

  *(fichier : `src/modules/planning/services/planning-change-notices.ts`)*
- [x] **T6** — `buildPlanningDigest(changes)`, pure :
  - lignes triées par date d'événement, chacune avec date, événement, département et nature du
    changement ;
  - titre « Planning mis à jour » et message de synthèse en une phrase ;
  - lien `/planning`.

  *(même fichier)*
- [x] **T7** — `recordPlanningChanges(db, churchId, changes, { actorId, now })` :
  - écarte le STAR relié au compte de l'auteur (`MemberUserLink` validé) et les événements passés ;
  - `upsert` sans jamais écraser `previousStatus` ;
  - puis `updateMany` pour aligner `lastChangedAt` sur toutes les lignes du STAR.

  *(même fichier)*
- [x] **T8** — Gabarit d'email `buildPlanningChangesEmail({ title, lines, link })`, qui affiche la
  liste des changements, avec échappement HTML *(fichier : `src/lib/email.ts`)*
- [x] **T9** — `flushPlanningChangeNotices(now)` :
  1. délais par église (défaut 15), puis sélection des STAR dont toutes les lignes sont calmes
     depuis le délai ;
  2. par STAR, dans une transaction : relecture puis `deleteMany` conditionnel
     (`lastChangedAt ≤ snapshot`) ; si le nombre supprimé est différent du nombre lu, le STAR est
     abandonné ;
  3. lecture des statuts actuels ;
  4. sont écartés : événement disparu ou passé, département disparu, STAR sans compte relié,
     changement net vide ;
  5. `createNotification` avec `domain: "planning"`, `type: "PLANNING_DIGEST"`, l'email T8 et les
     erreurs avalées ;
  6. renvoie `{ notified, members }`.

  Import dynamique de `@/lib/notifications` et `@/lib/email`, comme
  `event-change-notices.ts` *(même fichier)*
- [x] **T10** — Exporter `recordPlanningChanges`, `flushPlanningChangeNotices` et le type
  `PlanningChange` depuis l'index du module *(fichier : `src/modules/planning/index.ts`)*
- [x] **T11** — Retrait d'un département via une demande approuvée : lire les plannings des
  `EventDepartment` retirés avant le `deleteMany`, puis `recordPlanningChanges(tx, …)` avec
  `previousStatus` *(fichier : `src/modules/planning/services/request-executor.ts`)*

### 3. API (route handlers) et planificateur

- [x] **T12** — Grille :
  - supprimer le bloc de notifications immédiates (`notifyUsers`, `PLANNING_ASSIGNED`/`REMOVED`/
    `STATUS_CHANGED`) ;
  - appeler `recordPlanningChanges` pour les statuts modifiés, à partir de `prevStatusMap`.

  Un échec d'enregistrement est journalisé et n'empêche pas la réponse *(fichier :
  `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)*
- [x] **T13** [P] — Recopie : lire dans la transaction les plannings cibles existants avant les
  `upsert`, puis `recordPlanningChanges(tx, …)` pour les statuts qui changent *(fichier :
  `src/app/api/events/[eventId]/duplicate-planning/route.ts`)*
- [x] **T14** [P] — Retrait d'un département, pour un événement seul ou une série : lire les
  plannings avant le `deleteMany`, puis `recordPlanningChanges(tx, …)` avec `previousStatus` et
  un statut actuel absent *(fichier : `src/app/api/events/[eventId]/departments/route.ts`)*
- [x] **T15** [P] — Ajouter `planningNoticeDelayMinutes: z.number().int().min(5).max(120)` au
  schéma `PUT` *(fichier : `src/app/api/availability/settings/route.ts`)*
- [x] **T16** — Déclarer la tâche `planning-change-notices` au rythme `every-run`, qui appelle
  `flushPlanningChangeNotices` par import dynamique de `@/modules/planning`. L'ajouter à la
  réponse (`planningChangeNotices`) *(fichier : `src/app/api/cron/route.ts`)*

### 4. UI

- [x] **T17** — Paramètres des disponibilités : section distincte « Changements de planning »
  avec un champ numérique « Délai avant l'envoi (minutes) », de 5 à 120, et un texte d'aide.
  - Le champ reste éditable quand la collecte est désactivée.
  - Une colonne sur mobile.
  - Envoyer la valeur dans le `PUT`.

  *(fichier : `src/app/(auth)/disponibilites/parametres/AvailabilitySettingsClient.tsx`, et la
  page serveur si elle passe les valeurs initiales)*

### 5. Tests

- [x] **T18** — Tests du service `computeNetChanges` et `buildPlanningDigest` :
  - ajouté, retiré, statut changé ;
  - aller-retour annulé ;
  - `INDISPONIBLE` traité comme absent ;
  - tri par date ;
  - lien `/planning`.

  *(fichier : `src/modules/planning/services/__tests__/planning-change-notices.test.ts`)*
- [x] **T19** — Tests de `recordPlanningChanges` :
  - statut d'origine conservé ;
  - auteur écarté ;
  - événement passé écarté ;
  - `lastChangedAt` aligné sur toutes les lignes du STAR.

  *(même fichier)*
- [x] **T20** — Tests de `flushPlanningChangeNotices` :
  - délai non écoulé, rien n'est envoyé ;
  - délai écoulé : une seule notification pour deux départements et deux auteurs ;
  - changement net vide : rien n'est envoyé, les lignes sont supprimées ;
  - événement supprimé ou passé écarté ;
  - STAR sans compte ;
  - nombre supprimé différent, STAR abandonné ;
  - délai propre à chaque église, et nouveau délai appliqué aux lignes déjà en attente ;
  - échec d'envoi avalé ;
  - domaine `planning` et email fourni.

  *(même fichier)*
- [x] **T21** [P] — Route grille : plus aucun `notifyUsers`, `recordPlanningChanges` appelé avec
  les bons `previousStatus`, et un échec d'enregistrement sans effet sur la réponse *(fichier :
  `src/app/api/events/[eventId]/departments/[deptId]/__tests__/planning-change-notices.test.ts`)*
- [x] **T22** [P] — Recopie et retrait d'un département (événement seul et série) : changements
  enregistrés *(fichiers : `…/duplicate-planning/__tests__/`, `…/departments/__tests__/`)*
- [x] **T23** [P] — Exécuteur de demandes : un retrait de département enregistre les changements
  *(fichier : `src/modules/planning/services/request-executor.test.ts` ou équivalent existant)*
- [x] **T24** [P] — Réglage : bornes 5 et 120 refusées en dehors, valeur enregistrée *(fichier :
  `src/app/api/availability/__tests__/settings-and-ask.test.ts`)*
- [x] **T25** [P] — Cron : la tâche `planning-change-notices` est due à chaque passage et appelle
  le vidage *(fichier : `src/app/api/cron/__tests__/cron-modules.test.ts`)*
- [x] **T26** — Adapter les mocks existants de `@/modules/planning`, qui doivent recevoir les
  nouveaux exports, dans les tests qui le simulent *(fichiers : tests en échec après T10)*

### 6. Documentation

- [x] **T27** [P] — `docs/api.md` (champ de réglage, tâche cron), `docs/production.md` (ligne
  `planning-change-notices` du tableau des tâches), CHANGELOG (Ajouté + Modifié : fin de la
  notification immédiate), description du manifeste planning si elle cite les notifications
  d'affectation *(fichiers : docs, `CHANGELOG.md`, `src/modules/planning/manifest.ts`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run lint:prisma-boundary` (pas de nouvelle route qui importe Prisma)
- [x] `npm run test`
- [x] `npm run build`
- [ ] Migration rejouée sur base vierge (job CI `migrations`)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (voir couverture ci-dessous)
- [ ] Recette : minuteur passé à 5 minutes ; scénario « placer, retirer, attendre le délai » vérifié
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère (spec) | Tâches |
|---|---|
| Plus de notification à chaque changement | T12, T21 |
| Délai par église, 15 min par défaut, de 5 à 120 | T1, T4, T15, T17, T24 |
| Réglé avec les disponibilités, mêmes rôles, valeur hors bornes refusée | T15, T17, T24 |
| Nouveau délai appliqué aux changements en attente | T9, T20 |
| Envoi au plus quelques minutes après l'échéance, jamais avant | T9, T16, T20, T25 |
| Une seule notification, tous événements et départements | T7, T9, T20 |
| Changement net uniquement, rien si vide | T5, T9, T18, T20 |
| Ligne : date, événement, département, nature ; triée | T6, T18 |
| Lien « Mon planning » | T6, T18 |
| Email selon préférences, même contenu | T8, T9, T20 |
| Auteur jamais prévenu | T7, T19 |
| Événements passés jamais notifiés | T7, T9, T19, T20 |
| Recopie prévient les STAR ajoutés | T13, T22 |
| Retrait d'un département prévient | T11, T14, T22, T23 |
| Événement déplacé ou supprimé : rien de plus que la spec 059 | T9 (événement disparu écarté ; les déplacements ne passent pas par l'enregistrement), T20 |
| STAR sans compte : ni notification ni erreur | T9, T20 |
| Échec d'envoi sans effet sur l'enregistrement | T9, T12, T20, T21 |
