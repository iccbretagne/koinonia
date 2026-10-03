# Tâches — Prévenir les personnes planifiées d'un changement ou d'une suppression d'événement

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/notifier-changement-evenement`
- [x] Migration Prisma : aucune (schéma inchangé)

## Tâches

### 1. Données & migration

Aucune.

### 2. Logique métier (services)

- [ ] **T1** — Créer `event-change-notices.ts` : types `EventChange`
      (`MOVED`/`CANCELLED`), `PendingNotice`, `EventChangeNotices`, puis
      `emptyEventChangeNotices` et `mergeEventChangeNotices`.
      *(fichier : `src/modules/planning/services/event-change-notices.ts`)*
- [ ] **T2** — Dans le même fichier, `loadEventAudience(tx, churchId, eventIds)` : une requête
      par table (`in: eventIds`), toutes filtrées par `churchId`. Elle charge :
      - le titre et la date des événements ;
      - les plannings `EN_SERVICE`/`EN_SERVICE_DEBRIEF`/`REMPLACANT`, avec département, membre
        et comptes liés ;
      - les responsables via `UserDepartment` (principal et adjoints, rôle `DEPARTMENT_HEAD`,
        église de l'événement) ;
      - les Ministres via `UserChurchRole` (`MINISTER`, `ministryId` des départements concernés).
      *(fichier : idem)*
- [ ] **T3** — Fonctions pures de construction : filtres (`MOVED` sans changement de date,
      date d'origine passée, aucun planifié), regroupement par destinataire, priorité de la
      notification d'encadrant (mention de sa propre affectation), exclusion de l'auteur.
      Messages et titres selon le plan :
      - un événement / plusieurs événements ;
      - STAR → `/planning`, encadrant → `/dashboard` avec « Personnes concernées : Dépt (n) » ;
      - types `EVENT_RESCHEDULED` / `EVENT_CANCELLED` / `EVENT_CHANGES` ;
      - dates au format `fr-FR`.
      *(fichier : idem)*
- [ ] **T4** — `collectEventChangeNotices(tx, churchId, changes, { actorId, now })` combine T2 et
      T3. `sendEventChangeNotices(notices)` envoie chaque élément par `createNotification`
      (domaine `planning`, sans `tx`, email générique), avale et journalise les erreurs, et
      retourne `{ notified }`. *(fichier : idem)*
- [ ] **T5** — Exporter `collectEventChangeNotices`, `sendEventChangeNotices`,
      `emptyEventChangeNotices`, `mergeEventChangeNotices` et les types depuis l'index du module.
      *(fichier : `src/modules/planning/index.ts`)*
- [ ] **T6** — `deleteEvents` appelle `collectEventChangeNotices` (`CANCELLED`, `actorId` =
      `ctx.userId`) **avant** la purge des plannings, et retourne `EventChangeNotices` (au lieu de
      `void`). *(fichier : `src/modules/planning/services/event.service.ts`)*
- [ ] **T7** — `ExecutionResult.notices?: EventChangeNotices`. Deux fonctions le remplissent :
      - `executeModificationEvenement` : `MOVED` si la date change ;
      - `executeAnnulationEvenement` : retour de `deleteEvents`.
      `executeRequest` propage `notices`. *(fichier :
      `src/modules/planning/services/request-executor.ts`)*

### 3. API (route handlers)

- [ ] **T8** — `PUT /api/events/[eventId]` : collecter les `MOVED` dans les deux branches. Pour la
      série, un seul appel après la boucle. Envoyer après la transaction et ajouter `notified` à
      la réponse. Sans changement de date : rien n'est collecté.
      *(fichier : `src/app/api/events/[eventId]/route.ts`)*
- [ ] **T9** — `DELETE /api/events/[eventId]` : récupérer le retour de `deleteEvents`, envoyer
      après le commit, répondre `{ success, notified }`. *(fichier : idem)*
- [ ] **T10** — `PATCH /api/events` :
      - `delete` : envoyer le retour de `deleteEvents`, répondre `{ deleted, notified }` ;
      - `update` avec `date` : collecter les `MOVED` de `before`, envoyer, ajouter `notified`.
      *(fichier : `src/app/api/events/route.ts`)*
- [ ] **T11** — `PATCH /api/requests/[id]` : sortir `execResult.notices` de la transaction, appeler
      `sendEventChangeNotices` après le commit, ajouter `notified` à la réponse.
      *(fichier : `src/app/api/requests/[id]/route.ts`)*
- [ ] **T12** — Vérifier `npm run lint:prisma-boundary` : aucune lecture Prisma ajoutée dans les
      routes (seuil inchangé). *(fichier : `scripts/prisma-boundary-baseline.txt` non modifié)*

### 4. UI

- [ ] **T13** [P] — `EventsClient.tsx` : après une modification de date, une suppression (unitaire
      ou groupée) ou une modification groupée réussie, si `notified > 0`, afficher
      `toast.success("{n} personne(s) prévenue(s)")` via `useToast`.
      *(fichier : `src/app/(auth)/admin/events/EventsClient.tsx`)*
- [ ] **T14** [P] — `RequestsDashboard.tsx` : même toast après l'approbation d'une demande dont la
      réponse porte `notified > 0`.
      *(fichier : `src/app/(auth)/secretariat/requests/RequestsDashboard.tsx`)*

### 5. Tests

- [ ] **T15** — Tests du service (prismaMock) *(fichier :
      `src/modules/planning/services/__tests__/event-change-notices.test.ts`)* :
      - statuts notifiés (`EN_SERVICE`, `EN_SERVICE_DEBRIEF`, `REMPLACANT`) et non notifiés
        (`INDISPONIBLE`, `null`) ;
      - responsable principal, adjoint et Ministre notifiés, avec le récapitulatif ;
      - encadrant planifié : une seule notification ;
      - auteur exclu ;
      - STAR sans compte : compté chez l'encadrant, ne reçoit rien ;
      - événement passé, `MOVED` identique, événement sans planifié : rien ;
      - série : une notification par destinataire, une ligne par événement ;
      - filtre `churchId` présent dans les requêtes ;
      - `sendEventChangeNotices` : domaine `planning`, sans `tx`, erreur avalée, compteur.
- [ ] **T16** [P] — `deleteEvents` collecte avant `planning.deleteMany` (ordre des appels) et
      retourne les notifications. *(fichier : `src/modules/__tests__/event-service.test.ts`)*
- [ ] **T17** [P] — `executeRequest` : `notices` rempli pour une modification de date et pour une
      annulation, vide pour une modification de titre seul.
      *(fichier : `src/modules/__tests__/request-executor.test.ts`)*
- [ ] **T18** [P] — Routes événements : PUT (événement seul et série), DELETE, PATCH delete et
      PATCH update. Pour chacune, vérifier l'envoi après la transaction et `notified` dans la
      réponse. Un PUT/PATCH sans changement de date (titre seul) n'envoie rien.
      *(fichiers : `src/app/api/events/[eventId]/__tests__/event-change-notices.test.ts`,
      `src/app/api/events/__tests__/route.test.ts`)*
- [ ] **T19** [P] — Route demandes : l'approbation d'une modification ou d'une annulation
      d'événement envoie les notifications après le commit et renvoie `notified`.
      *(fichier : `src/app/api/requests/__tests__/security.test.ts` ou nouveau
      `event-change-notices.test.ts` dans le même dossier)*

### 6. Documentation

- [ ] **T20** [P] — CHANGELOG `[Non publié]` (Ajouté) : prévenir les personnes planifiées
      et leurs encadrants d'un déplacement ou d'une annulation d'événement. *(fichier :
      `CHANGELOG.md`)*
- [ ] **T21** [P] — Mettre à jour la description du domaine `planning` si besoin (« …
      changements ou annulations d'événements… »), et l'entrée correspondante du guide
      utilisateur (STAR, responsable) si les notifications y sont listées. *(fichiers :
      `src/modules/planning/manifest.ts`, `src/app/(auth)/guide/GuideContent.tsx`)*
- [ ] **T22** — Statut de la spec → `Implémentée`, tâches cochées. *(fichiers : `spec.md`,
      `tasks.md`)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run lint:prisma-boundary`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (voir la correspondance ci-dessous)
- [ ] PR ouverte vers `main`

## Correspondance critères d'acceptation → tâches

| Critère (spec) | Tâches |
|---|---|
| Déplacement → STAR planifiés liés notifiés (ancienne → nouvelle date) | T2, T3, T8, T10, T15, T18 |
| Suppression → mention « annulé » | T3, T6, T9, T10, T15, T16, T18 |
| Responsables (principal, adjoints) notifiés avec le nombre de personnes | T2, T3, T15 |
| Ministres notifiés avec le récapitulatif par département | T2, T3, T15 |
| Identique en direct ou par approbation de demande | T7, T11, T17, T19 |
| Titre/type/délai/réglage seul → rien | T3, T8, T10, T17, T18 |
| Événement passé ou sans planifié → rien | T3, T15 |
| Série / suppression groupée → une notification par destinataire | T3, T8, T10, T15, T18 |
| Aucun doublon, auteur exclu | T3, T15 |
| Email selon la préférence « Planning et service », un seul email | T4, T15 |
| Message de confirmation avec le nombre de personnes prévenues | T8–T11, T13, T14 |
| Aucune personne d'une autre église | T2, T15 |
