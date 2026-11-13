# Tâches — Formulaires (inscriptions, participation, sondages)

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **ADR** : `docs/adr/0030-moteur-de-formulaires.md`
- **Statut** : En cours (lot 1 fait)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
> Trois lots, une PR par lot (branche de la session) : chaque lot passe la vérification finale.

## Prérequis

- [ ] Branche de travail à jour de `main`
- [ ] Migration Prisma générée à chaque lot qui modifie le schéma

---

## Lot 1 — Construction et réponses

### 1. Données, module & migration

- [x] **T1** — Enums `FormKind`, `FormAccess`, `FormStatus`, `FormQuestionType` (13 types),
      `FormResponseStatus` ; modèles `Form`, `FormQuestion`, `FormChoice`, `FormResponse`,
      `FormAnswer`, `FormResponseChoice`, `FormAnonymousReceipt` (cascade depuis `Form` et
      `FormResponse`, `@@unique([churchId, slug])`, `eventId`/`ticketingEventId` nullables) ;
      migration *(fichiers : `prisma/schema.prisma`, `prisma/migrations/*_forms/`)*
- [x] **T2** — Module `forms` : manifeste (`forms:manage` SA/Admin/Secrétaire ; routes
      `authenticated: /formulaires`, `api: /api/forms`, `public: /f`, `/api/forms/public` ;
      domaine de notification `forms`), index, enregistrement dans le registre et
      `ENABLED_MODULES` *(fichiers : `src/modules/forms/manifest.ts`, `index.ts`,
      `src/lib/registry.ts`)*
- [x] **T3** — Matrice des permissions et documentation des droits dans le même commit
      *(fichiers : `src/core/__tests__/permissions.test.ts`, `CLAUDE.md`, `docs/auth.md`)*
- [x] **T4** [P] — Schémas purs : définition d'un formulaire (questions, choix, réglages,
      conservation 1 à 24 mois), corps des routes *(fichier : `src/modules/forms/schemas.ts`)*

### 2. Logique métier (services)

- [x] **T5** — Moteur : `buildAnswerSchema(questions)` pour les 13 types (bornes, formats,
      note 1 à 5, consentement vrai, choix connus) et `visibleQuestions` (question masquée ignorée)
      *(fichier : `src/modules/forms/services/engine.ts`)*
- [x] **T6** [P] — Jetons de gestion dérivés (`FORMS_TOKEN_SECRET`, à défaut `AUTH_SECRET`),
      empreinte seule *(fichier : `src/modules/forms/services/tokens.ts`)*
- [x] **T7** — Construction : créer, mettre à jour (questions, choix, ordre, conditions),
      dupliquer, slug unique par église, `assertSafeEdit` (question répondue, places sous les
      inscrits, anonymat figé) *(fichier : `src/modules/forms/services/builder.ts`)*
- [x] **T8** — Cycle de vie : publier, fermer, rouvrir, supprimer (réponses effacées, `deletedAt`),
      clôture automatique ; `loadAnswerableForm` avec 404 uniforme *(fichier :
      `src/modules/forms/services/lifecycle.ts`)*
- [x] **T9** — Réponses : `submitResponse` en transaction verrouillée (ouverture, nombre maximal,
      doublon compte/email, places des choix, validation par le moteur), modification et
      annulation par jeton ou par compte ; sondage anonyme sans identité, reçu séparé, jour seul
      *(fichier : `src/modules/forms/services/responses.ts`)*
- [x] **T10** — Accès : `getFormAccess` (gestion / intervenant / aucun), gardes
      `requireFormManage`, `requireFormAccess` *(fichiers : `src/modules/forms/services/access.ts`,
      `src/modules/forms/auth.ts`)*
- [x] **T11** [P] — Export `.xlsx` (`sanitizeRow`), une ligne par réponse *(fichier :
      `src/modules/forms/services/exports.ts`)*
- [x] **T12** — Notifications : accusé de réception (email direct sans compte, sinon
      `createNotification` domaine `forms`), renvoi du lien de gestion sur doublon, signal regroupé
      au secrétariat sans nom *(fichier : `src/modules/forms/services/notify.ts`)*
- [x] **T13** — Tâches planifiées : ouverture / fin des réponses, signal des nouvelles réponses
      (15 min) ; purge quotidienne (totaux puis suppression) ; branchement `/api/cron` gardé par
      `registry.has("forms")` *(fichiers : `src/modules/forms/services/tasks.ts`,
      `src/app/api/cron/route.ts`)*

### 3. API (route handlers + `contract.ts`)

- [x] **T14** — `/api/forms` (GET, POST) et `/api/forms/[id]` (GET, PATCH, DELETE) ;
      `logAudit` sur création, modification, suppression *(fichiers : `src/app/api/forms/…`)*
- [x] **T15** — `/api/forms/[id]/status` (publier, fermer, rouvrir) et `/api/forms/[id]/duplicate`,
      journalisés
- [x] **T16** — `/api/forms/[id]/responses` (liste filtrée), `/api/forms/[id]/responses/[rid]`
      (PATCH), `/api/forms/[id]/export` (journalisé, jamais pour un intervenant)
- [x] **T17** — Public : `/api/forms/public/[churchSlug]/[formSlug]` (GET, POST : débit,
      Turnstile si public, appartenance à l'église si `MEMBERS`) et
      `/api/forms/public/responses/[token]` (GET, PATCH, DELETE)
- [x] **T18** — Compte connecté : `/api/forms/mine` (mes réponses ouvertes) et
      `/api/forms/mine/[formId]` (GET, PATCH, DELETE)
- [x] **T19** — `npm run openapi` et `docs/openapi.json`

### 4. UI

- [x] **T20** — `/formulaires` : liste (état, réponses, places), créer, dupliquer, fermer ;
      lien « Formulaires » dans l'espace Agenda, à côté de « Billetterie »
      *(fichiers : `src/app/(auth)/formulaires/page.tsx`, `src/lib/navigation.ts`)*
- [x] **T21** — `/formulaires/[id]` onglets Construction (questions, choix et places, ordre
      haut/bas, condition), Réglages (accès, dates, nombre maximal, conservation), Aperçu
- [x] **T22** — Onglet Réponses : `DataTable`, filtres, annulation, export
- [x] **T23** — Page de réponse `/f/[churchSlug]/[formSlug]` (mobile d'abord, Turnstile, places
      restantes, message uniforme « non disponible ») et `/f/reponse/[token]` (modifier, annuler)
- [x] **T24** [P] — « Mes formulaires » pour un compte connecté (réponses ouvertes)

### 5. Tests

- [x] **T25** — Moteur : 13 types valides / invalides, obligatoire, conditionnel, consentement
      *(fichier : `src/modules/forms/services/__tests__/engine.test.ts`)*
- [x] **T26** [P] — Construction et cycle de vie : `assertSafeEdit`, slug, duplication, 404
      uniforme pour brouillon / fermé / supprimé / inexistant / autre église
- [x] **T27** [P] — Réponses : dates, nombre maximal, doublon (compte, email ⇒ lien renvoyé par
      email), places de choix jamais dépassées (deux envois simultanés), `MEMBERS` hors église
- [x] **T28** [P] — Anonymat : ni compte, ni email, ni IP, ni heure ; reçu sans lien ; un envoi
      par compte ; pas de `logAudit`
- [x] **T29** [P] — Purge à 12 mois et à 24 mois au plus, totaux conservés ; notifications
      regroupées sans nom
- [x] **T30** — Routes : droits (`forms:manage` dans son église, intervenant sans export),
      Turnstile et débit, `route-exhaustiveness`, `rbac-no-role-proxy`, `openapi.test`

---

## Lot 2 — Inscriptions PCNC

### 1. Données & migration

- [ ] **T31** — Modèles `FormSession` (1 ou 2 jours), `FormLevel` (code, places, niveau
      d'entrée), `FormFacilitator`, `FormFacilitatorScope`, `FormAttendance` ; colonnes
      `sessionId`, `levelId`, `previousLevelDone`, `waitingOn`, `offerExpiresAt` ; migration

### 2. Logique métier

- [ ] **T32** — Type `SESSION_LEVEL` dans le moteur et la construction : sessions, niveaux,
      places ; « niveau précédent suivi » demandé hors niveau d'entrée, jamais bloquant
- [ ] **T33** — Places des niveaux dans `submitResponse` (verrou), liste d'attente si complet
- [ ] **T34** — Liste d'attente : `offerNextPlace` à chaque place libérée (annulation, déclin,
      expiration, capacité augmentée), place proposée comptée comme prise, acceptation / déclin,
      notification de la proposition ; expiration par la tâche planifiée *(fichier :
      `src/modules/forms/services/waitlist.ts`)*
- [ ] **T35** — Intervenants : plusieurs par formulaire, tout le formulaire ou sessions/niveaux ;
      accès éteint à la clôture ou au retrait ; clôture automatique le lendemain de la dernière
      session *(fichiers : `access.ts`, `lifecycle.ts`)*
- [ ] **T36** — Présence : feuille par session (jours × matin/après-midi), dernière saisie
      gagnante, `logAudit` par case ; export avec présences *(fichier :
      `src/modules/forms/services/attendance.ts`)*

### 3. API

- [ ] **T37** — `/api/forms/[id]/facilitators` (GET, PUT), `/api/forms/[id]/attendance`
      (GET, PUT, périmètre de l'intervenant), `/api/forms/public/responses/[token]/offer` (POST) ;
      liste des réponses filtrée au périmètre ; `npm run openapi`

### 4. UI

- [ ] **T38** — Construction : sessions et niveaux ; Réglages : liste d'attente, délai de
      confirmation, intervenants et leur périmètre
- [ ] **T39** — Page de réponse : choix session/niveau, places restantes, niveau complet ⇒ liste
      d'attente ; page de gestion : accepter / décliner une place proposée
- [ ] **T40** — Onglet Réponses par session et niveau avec décompte et « niveau précédent suivi » ;
      onglet Présence (cases matin/après-midi, rafraîchissement des coches des autres)

### 5. Tests

- [ ] **T41** — Dernière place prise par une seule réponse ; liste d'attente : proposition,
      acceptation, déclin, expiration ⇒ suivante
- [ ] **T42** [P] — Intervenant borné à ses niveaux (réponses et présence), sans export, accès
      éteint à la clôture ou au retrait
- [ ] **T43** [P] — Présence : deux jours × deux demi-journées, dernière saisie, journal, export

---

## Lot 3 — Sondages et participation

### 1. Données & logique métier

- [ ] **T44** — Résultats regroupés par question (effectifs, pourcentages, moyenne des notes,
      textes libres), jamais d'identité en anonyme *(fichier :
      `src/modules/forms/services/results.ts`)*
- [ ] **T45** — Rattachement à un événement d'église ou de billetterie : validation de l'église
      par `src/app` (ADR-0027), `listFormsForEvent` ; participation : total des participants
      accompagnants compris, remplissage des choix

### 2. API

- [ ] **T46** — `/api/forms/[id]/results` (gestion et intervenant), export des résultats ;
      rattachement dans PATCH `/api/forms/[id]` ; `npm run openapi`

### 3. UI

- [ ] **T47** — Onglet Résultats (`recharts`, réponses libres, export) ; Réglages : anonyme ou
      nominatif, événement rattaché
- [ ] **T48** [P] — Bloc « Formulaires » sur `/events/[eventId]` et sur la page de l'événement de
      billetterie

### 4. Tests

- [ ] **T49** — Résultats regroupés, anonymat dans les résultats et l'export, participation
      (accompagnants, ateliers pleins), rattachement refusé pour un événement d'une autre église

### 5. Documentation (à chaque lot)

- [ ] **T50** — `CLAUDE.md` (module `forms`), `docs/database.md`, guide et fiches de l'assistant,
      `CHANGELOG.md` ; statut de l'ADR-0030 passé à Accepté au lot 1

## Vérification finale (à chaque lot)

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run lint:prisma-boundary`
- [ ] `npm run test`
- [ ] `npm run openapi` sans diff restant
- [ ] Tous les critères d'acceptation du lot satisfaits (tableau ci-dessous)
- [ ] PR vers `main` (sur demande)

## Couverture des critères d'acceptation

| Critère de la spec | Tâches |
|---|---|
| Seuls SA, Admin, Secrétaire gèrent les formulaires, dans leur église | T2, T3, T10, T14, T15, T30 |
| 13 types de questions, obligatoire/facultatif, aide | T1, T5, T21, T25, T32 |
| Public sans compte, anti-robot, débit ; réservé refuse hors église | T17, T23, T27, T30 |
| Sessions 1–2 jours, niveaux avec places, jamais dépassées | T31–T33, T39, T41 |
| Liste d'attente, proposition à confirmer, passage au suivant | T34, T37, T39, T41 |
| Prérequis indicatif, « niveau précédent suivi » hors 001 | T32, T39, T40 |
| Plusieurs intervenants, périmètre, sans export, accès éteint | T35, T37, T38, T42 |
| Présence matin/après-midi par jour, dans l'export | T36, T40, T43 |
| Accusé de réception, modifier/annuler tant que ouvert | T9, T12, T17, T18, T23, T24 |
| Sondage anonyme sans identité ; nominatif montre qui | T9, T28, T44, T49 |
| Résultats regroupés par question | T44, T46, T47, T49 |
| Affichage conditionnel masque et ignore | T5, T21, T25 |
| Export par le secrétariat | T11, T16, T22, T36 |
| Notification du secrétariat selon sa préférence | T2, T12, T13, T29 |
| Participation rattachée à un événement d'église ou de billetterie | T45, T46, T48, T49 |
| Effacement après conservation (12 mois, 24 au plus), totaux restants | T4, T13, T29 |
| Formulaire indisponible = même message | T8, T23, T26 |
| Journalisation de la gestion et des exports | T14, T15, T16, T30 |
