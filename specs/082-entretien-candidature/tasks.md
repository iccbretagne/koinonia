# Tâches — Rendez-vous d'entretien après une candidature au service

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [ ] Branche de travail à jour avec `main` (les retours de recette de la spec 077 — paramètres
      ouverts à l'équipe PVS, rappels d'observation au PVS — partent dans la même PR ou avant)
- [ ] Migration Prisma générée (`serving_interviews`)

## Tâches

### 1. Données & migration

- [x] **T1** — Enums `ServingInterviewStatus`, `ServingInterviewCancelReason`,
      `ServingSchedulingReason` ; modèles `ServingInterviewSlot` (prise atomique `bookedAt`,
      `interviewerId` set null, `seriesId`) et `ServingInterview` (copie horaire/lieu/personne qui
      reçoit, rappels) ; `ServingApplication` : `schedulingReason`, `schedulingSince`,
      `schedulingRemindedAt`, `slotsInvitedAt`, `manageSalt`, `manageHash` ; `ServingSettings` :
      `schedulingReminderDays` (14), `slotsOpenedAt` ; relations `Church`, `User` ; migration
      *(fichiers : `prisma/schema.prisma`, `prisma/migrations/…_serving_interviews/`)*
- [x] **T2** — Mock Prisma : `servingInterviewSlot`, `servingInterview` *(fichier :
      `src/__mocks__/prisma.ts`)*

### 2. Logique métier (services)

- [x] **T3** [P] — `parisDateTime(day, time)` déplacé dans `src/lib/paris-time.ts`, importé par
      `src/app/api/mcp/_actions/common.ts` (comportement inchangé) *(fichiers :
      `src/lib/paris-time.ts`, `src/app/api/mcp/_actions/common.ts`)*
- [x] **T4** [P] — Jetons du candidat : `manageTokenPair` (HMAC `SERVING_TOKEN_SECRET`, à défaut
      `AUTH_SECRET`), `hashToken`, `isTokenShape`, `matchesHash`, `ensureManageToken`,
      `findApplicationByToken` *(fichier : `src/modules/serving/services/tokens.ts`)*
- [x] **T5** — Schémas Zod : création unitaire et en série (jours, plage, durée 5–240 min, lieu
      ou visio https, personne qui reçoit, 200 créneaux au plus), modification, actions publiques
      (`book`/`decline`/`cancel`), actions PVS (`book`/`cancel`/`outcome`/`invite`), « Retrouver mon
      rendez-vous », `schedulingReminderDays` (1–60) dans les réglages *(fichier :
      `src/modules/serving/schemas.ts`)*
- [x] **T6** — Créneaux : `expandSeries` (pure, heure de Paris, changement d'heure),
      `createSlots` (personne qui reçoit dans l'équipe PVS, pas de créneau passé, chevauchement
      d'un même membre refusé, `slotsOpenedAt` posé), `updateSlot` (rendez-vous actif mis à jour,
      candidat et personnes qui reçoivent prévenus), `deleteSlot` (rendez-vous actif annulé
      `SLOT_REMOVED`, candidat invité à choisir), `listSlots`, `listFreeSlots`, « à réattribuer »
      calculé *(fichier : `src/modules/serving/services/slots.ts`)*
- [x] **T7** — Rendez-vous : `bookSlot` (prise atomique, ancien rendez-vous annulé et libéré,
      copie du créneau, repère levé), `cancelInterview`, `declineSlots`, `recordOutcome` (après
      l'heure seulement, `NO_SHOW`/`EXCUSED` ⇒ « À planifier »), `candidateCanChange` (≥ 24 h),
      `interviewView` (« À compléter » calculé), `hasRepeatedNoShow`, `setScheduling(reason)`
      *(fichier : `src/modules/serving/services/interviews.ts`)*
- [x] **T8** — Envoi de la fiche : jeton posé, raison `NO_SLOT` s'il n'y a aucun créneau libre,
      `manageToken` renvoyé ; non-retenue (`rejectApplication`) : rendez-vous à venir annulé
      `REJECTED`, créneau libéré, personne qui reçoit prévenue, message neutre au candidat ; vue
      de la candidature avec rendez-vous, historique, repère, `repeatedNoShow`, liste avec
      pastilles *(fichier : `src/modules/serving/services/applications.ts`)*
- [x] **T9** — Notifications : emails au candidat (confirmation, changement, annulation, rappel de
      la veille, invitation « nouveaux créneaux », lien renvoyé, message neutre de non-retenue) ;
      notifications `serving` à la personne qui reçoit et à l'équipe PVS (réservé, déplacé, annulé,
      rappel, issue à noter, relance « À planifier »), prénom et nom seuls *(fichier :
      `src/modules/serving/services/notifications.ts`)*
- [x] **T10** — Tâches planifiées dans `runServingTasks` : `remindDayBefore`, `remindCompletion`,
      `remindScheduling` (délai réglable, renouvelé), `inviteToNewSlots` (au plus 1 par 24 h),
      purge qui libère le créneau et prévient la personne qui reçoit *(fichier :
      `src/modules/serving/services/lifecycle.ts`)*
- [x] **T11** — Réglages : `schedulingReminderDays` lu et écrit *(fichier :
      `src/modules/serving/services/settings.ts`)* ; exports de l'index *(fichier :
      `src/modules/serving/index.ts`)*

### 3. API (route handlers)

- [x] **T12** — Manifeste : `routes.public` `/entretien` et `/api/serving/public/interview`
      (toutes méthodes) *(fichier : `src/modules/serving/manifest.ts`)*
- [x] **T13** — `POST /api/serving/public/[churchSlug]` renvoie `manageToken` *(fichiers :
      `src/app/api/serving/public/[churchSlug]/route.ts`, `contract.ts`)*
- [x] **T14** — `GET`/`POST /api/serving/public/interview/[token]` (débit limité, jeton inconnu =
      même réponse) et `POST /api/serving/public/interview/recover` (Turnstile, 3/min, réponse
      identique) *(fichiers : `src/app/api/serving/public/interview/…/route.ts`, `contract.ts`)*
- [x] **T15** — `GET`/`POST /api/serving/interview-slots`, `PATCH`/`DELETE
      /api/serving/interview-slots/[id]` (équipe PVS, église du créneau, `logAudit`) *(fichiers :
      `src/app/api/serving/interview-slots/…`)* ; `resolveChurchId("servingInterviewSlot")`
      *(fichier : `src/lib/auth.ts`)*
- [x] **T16** — `POST /api/serving/applications/[id]/interview` (actions PVS, `logAudit`) ;
      `GET /api/serving/applications/[id]` enrichi ; `PUT /api/serving/settings` avec le délai
      *(fichiers : `src/app/api/serving/applications/[id]/interview/…`, contrats existants)*
- [x] **T17** — `npm run openapi` et `docs/openapi.json`

### 4. UI

- [x] **T18** [P] — `InterviewPicker` (créneaux libres par jour, personne qui reçoit, « Aucun
      créneau ne me convient », 409 « créneau pris ») *(fichier :
      `src/components/serving/InterviewPicker.tsx`)*
- [x] **T19** — Écran de confirmation de `/servir/[churchSlug]` : choix du créneau avec le jeton
      renvoyé, lien de rendez-vous affiché (candidat sans email), « Retrouver mon rendez-vous »
      *(fichier : `src/app/servir/[churchSlug]/ServingForm.tsx`)*
- [x] **T20** — Page publique `/entretien/[token]` : rendez-vous en cours, changer / annuler
      (≥ 24 h), sinon contact du PVS ; sans rendez-vous : `InterviewPicker` *(fichiers :
      `src/app/entretien/[token]/page.tsx`, `ManageInterview.tsx`)*
- [x] **T21** — `/candidatures/entretiens` : créneaux à venir par semaine (libre, réservé,
      à réattribuer), ajout unitaire et en série, modification, retrait, compteur « à
      compléter » ; bouton « Entretiens » sur `/candidatures` *(fichiers :
      `src/app/(auth)/candidatures/entretiens/…`, `src/app/(auth)/candidatures/page.tsx`)*
- [x] **T22** — Liste `/candidatures` : pastilles « À planifier · raison » et « Entretien le … »
      *(fichier : `src/app/(auth)/candidatures/ApplicationsClient.tsx`)*
- [x] **T23** — Fiche `/candidatures/[id]` : bloc « Entretien » (en cours, historique, deux
      absences d'affilée, fixer, annuler, noter réalisé / absent / excusé, inviter, « pas
      d'email ») *(fichier : `src/app/(auth)/candidatures/[id]/…`)*
- [x] **T24** — Paramètres : délai de relance « À planifier » *(fichier :
      `src/app/(auth)/candidatures/parametres/ServingSettingsForm.tsx`)*

### 5. Tests

- [x] **T25** [P] — `paris-time.test.ts` : bascules d'heure ; `slots.test.ts` : `expandSeries`,
      créneau passé, personne qui reçoit hors PVS, chevauchement, `slotsOpenedAt`, retrait d'un
      créneau réservé
- [x] **T26** [P] — `interviews.test.ts` : prise atomique (une seule réservation sur deux),
      changement qui libère l'ancien créneau, raisons « À planifier », limite des 24 h, issue après
      l'heure, « À compléter » et « deux absences » calculés, validation sans entretien
- [x] **T27** [P] — `lifecycle.test.ts` : rappel de la veille unique, issue à noter, relance
      « À planifier » au délai puis renouvelée, invitation au plus une fois par jour, purge qui
      libère le créneau sans message au candidat
- [x] **T28** [P] — `applications.test.ts` : non-retenue ⇒ annulation, créneau libéré, message
      neutre ; envoi sans créneau ⇒ `NO_SLOT`
- [x] **T29** — Routes : jeton (forme, empreinte, inconnu = même réponse), débit, église du
      créneau ou de la candidature (autre église : 404), PVS seulement, `route-exhaustiveness`,
      `openapi`, `notifications-no-direct-email` *(fichiers : `src/app/api/serving/__tests__/…`)*

### 6. Assistant et MCP

- [x] **T30** — Questions de données `serving.myInterviews`, `serving.toPlan`,
      `serving.freeSlots` : droit de l'écran revérifié, prénom et nom seuls, `boundedAnswer`
      *(fichiers : `src/app/api/assistant/_data/serving.ts`, `_data-questions.ts`)*
- [x] **T31** — Fiches de l'assistant : KB-150 complétée, fiche « Gérer les créneaux
      d'entretien », fiches de données des trois questions (audience `pvsTeam` /
      `serving:manage`), synonymes *(fichiers : `src/modules/assistant/knowledge/espaces.ts`,
      `donnees.ts`, `synonyms.ts`)*
- [x] **T32** — MCP : les trois questions dans `MCP_TOOLS` ; action confirmée
      `create_interview_slots_preview` / `…_confirm` (portée `write`, `createSlots`, refus de
      l'écran, empreinte, `logAudit` `via: "mcp"`) ; instructions du serveur à jour *(fichiers :
      `src/app/api/mcp/_tools.ts`, `src/app/api/mcp/_actions/serving.ts`, index des actions)*
- [x] **T33** — Tests : questions de données (refus hors PVS, aucune coordonnée), outils MCP
      visibles pour le PVS seulement, aperçu puis confirmation des créneaux, refus *(fichiers :
      `src/app/api/assistant/__tests__/…`, `src/app/api/mcp/__tests__/…`)*

### 7. Documentation

- [x] **T34** — `CLAUDE.md` (module candidatures : créneaux, rendez-vous, lien du candidat,
      relances ; module mcp : nouveaux outils et action) ; `docs/database.md` ; `docs/auth.md` ;
      `docs/architecture.md` (`SERVING_TOKEN_SECRET`, `/entretien`) ; `docs/production.md` ;
      `.env.example`
- [x] **T35** — Guide utilisateur : fiche « Entretiens : créneaux et rendez-vous » (PVS), fiche
      « Candidatures » complétée, fiche « Connecter mon assistant IA » (nouvelle action) ;
      `docs/guide-screenshots.md` *(fichiers : `src/components/GuideContent.tsx`, docs)*
- [x] **T36** — `CHANGELOG.md`, `docs/openapi.json`, écarts dans `plan.md`, statut de la spec

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run lint:prisma-boundary`
- [ ] `npm run test`
- [ ] `npm run openapi` (fichier à jour)
- [ ] `next build`
- [ ] Critères d'acceptation de `spec.md` vérifiés un par un
- [ ] Recette, puis PR vers `main`

## Couverture des critères d'acceptation

| Critère | Tâches |
|---|---|
| Créneaux créés, modifiés, retirés (date, heure, durée 30 min, lieu ou visio, personne qui reçoit) | T1, T5, T6, T15, T21, T25 |
| Série en une fois, chaque créneau modifiable seul | T6, T15, T21, T25 |
| Créneaux proposés après l'envoi, avec le nom, choix ou passer | T8, T13, T18, T19 |
| Un seul candidat par créneau, réservations simultanées | T1, T7, T26 |
| Email de confirmation avec lien | T9, T13, T19 |
| Changer ou annuler jusqu'à 24 h, libération du créneau | T7, T14, T20, T26 |
| Sans créneau : « À planifier » | T7, T8, T22, T28 |
| Invitation après ouverture de créneaux, 1 par jour | T10, T27 |
| Rappel de la veille au candidat et à la personne qui reçoit | T9, T10, T27 |
| Rendez-vous et historique sur la candidature, actions PVS, issue | T7, T16, T23, T26 |
| « À compléter » et notification du lendemain | T7, T10, T21, T27 |
| « À planifier » avec raison | T7, T22, T23 |
| Relance « À planifier » 14 jours, réglable, renouvelée | T10, T11, T24, T27 |
| Deux absences d'affilée signalées | T7, T23, T26 |
| Validation sans entretien, aucune issue automatique | T7, T26 |
| Déplacer ou retirer un créneau réservé prévient le candidat | T6, T9, T25 |
| Non-retenue : créneau libéré, message neutre ; effacement sans message | T8, T10, T27, T28 |
| Aucun autre rôle ne voit créneaux ni rendez-vous | T15, T16, T29 |
| Notifications : prénom et nom seuls | T9, T27 |
| Journalisation | T15, T16, T29, T32 |
| Assistant et MCP (questions, fiches, action de création de créneaux) | T30–T33 |
| Documentation et guide | T34–T36 |
