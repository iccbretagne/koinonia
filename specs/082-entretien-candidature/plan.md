# Plan technique — Rendez-vous d'entretien après une candidature au service

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-11-15

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout vit dans le module `serving` ; `src/app/` passe par `@/modules/serving`, `@/modules/serving/auth` et `@/modules/serving/schemas`. Aucune nouvelle dépendance entre modules.
- [x] **Sécurité** : routes de gestion derrière `requireServingActor(churchId)` avec `canManage` (Super Admin, `serving:manage`, équipe PVS), l'église étant celle **du créneau ou de la candidature** (`resolveChurchId`) ; routes publiques par jeton dérivé, débit limité, Turnstile sur « Retrouver mon rendez-vous ».
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune permission nouvelle : `serving:manage` et la fonction de département `VIE_DES_STAR` suffisent.
- [x] **Validation** Zod sur toutes les mutations (schémas dans `@/modules/serving/schemas`, importés par les `contract.ts`).
- [x] **Migration** Prisma `serving_interviews`.
- [x] **Enums** depuis `@/generated/prisma/client`.
- [x] **UI** : `Modal`, `ConfirmModal`, `Field`/`Input`/`Select`, `StatusChip`, `Alert`, `Tabs`, `EmptyState` réutilisés.

## Approche générale

Deux objets nouveaux dans le module `serving` : le **créneau** (tenu par le PVS) et le
**rendez-vous** (un essai par candidature, historisé). Un créneau ne porte qu'un rendez-vous actif
à la fois, garanti par une **prise atomique** sur le créneau (mise à jour conditionnelle). Le
rendez-vous copie l'horaire, le lieu et la personne qui reçoit au moment de la réservation : l'historique reste lisible
même si le créneau est modifié ou supprimé. Les statuts « À compléter » et « deux absences
d'affilée » sont **calculés à la lecture**, jamais stockés. Le repère « À planifier » est stocké
sur la candidature (raison + date), parce qu'il porte une raison et sert aux relances.

Le candidat gère son rendez-vous par un **lien à jeton dérivé** (HMAC, empreinte seule stockée,
même principe que formulaires et billetterie), re-dérivable pour les emails d'invitation. Les
tâches planifiées s'ajoutent à `runServingTasks` (cron `serving`, 60 min) : rappels de la veille,
issues à noter, relances « À planifier », invitations après ouverture de créneaux.

## Modèle de données

```prisma
enum ServingInterviewStatus {
  BOOKED      // réservé (« À compléter » une fois l'heure de fin passée : calculé)
  DONE        // réalisé
  NO_SHOW     // absent
  EXCUSED     // excusé
  CANCELLED
}

enum ServingInterviewCancelReason {
  CANDIDATE     // annulé ou changé par le candidat
  PVS           // annulé ou déplacé par le PVS
  SLOT_REMOVED  // créneau retiré par le PVS
  REJECTED      // candidature non retenue
}

enum ServingSchedulingReason {
  NO_SLOT              // aucun créneau disponible à l'envoi
  DECLINED             // aucun créneau ne convenait
  CANDIDATE_CANCELLED
  SLOT_REMOVED
  NO_SHOW
  EXCUSED
}

model ServingInterviewSlot {
  id              String    @id @default(cuid())
  churchId        String
  startsAt        DateTime
  durationMinutes Int       @default(30)
  location        String?   @db.VarChar(200)
  visioUrl        String?   @db.VarChar(500)
  /// Membre du PVS qui reçoit ; null si son compte est supprimé (« à réattribuer »)
  interviewerId   String?
  /// Créneaux créés ensemble (saisie en série) : regroupement d'affichage seulement
  seriesId        String?
  /// Prise atomique : non nul = un rendez-vous actif occupe le créneau
  bookedAt        DateTime?
  createdById     String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  church      Church             @relation(fields: [churchId], references: [id], onDelete: Cascade)
  interviewer User?              @relation("ServingInterviewer", fields: [interviewerId], references: [id], onDelete: SetNull)
  interviews  ServingInterview[]

  @@index([churchId, startsAt])
  @@index([interviewerId, startsAt])
  @@map("serving_interview_slots")
}

model ServingInterview {
  id                   String                        @id @default(cuid())
  applicationId        String
  /// null si le créneau a été supprimé (l'historique garde la copie ci-dessous)
  slotId               String?
  status               ServingInterviewStatus        @default(BOOKED)
  startsAt             DateTime
  durationMinutes      Int
  location             String?                       @db.VarChar(200)
  visioUrl             String?                       @db.VarChar(500)
  interviewerId        String?
  cancelReason         ServingInterviewCancelReason?
  outcomeAt            DateTime?
  outcomeById          String?
  dayBeforeRemindedAt  DateTime?
  completionRemindedAt DateTime?
  createdAt            DateTime                      @default(now())
  updatedAt            DateTime                      @updatedAt

  application ServingApplication    @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  slot        ServingInterviewSlot? @relation(fields: [slotId], references: [id], onDelete: SetNull)

  @@index([applicationId, createdAt])
  @@index([status, startsAt])
  @@index([slotId])
  @@map("serving_interviews")
}

// ServingApplication : repère « À planifier », lien du candidat, relances
model ServingApplication {
  // …
  schedulingReason     ServingSchedulingReason?   // null : rendez-vous réservé ou réalisé (ou aucune étape)
  schedulingSince      DateTime?
  schedulingRemindedAt DateTime?
  slotsInvitedAt       DateTime?                  // dernière invitation « nouveaux créneaux »
  manageSalt           String?  @db.VarChar(32)
  manageHash           String?  @unique @db.VarChar(64)
  interviews           ServingInterview[]
}

// ServingSettings : délai de relance « À planifier »
model ServingSettings {
  // …
  schedulingReminderDays Int @default(14)
  /// Dernière ouverture de créneaux (déclenche l'invitation des « À planifier »)
  slotsOpenedAt          DateTime?
}
```

Migration `serving_interviews`. Les candidatures existantes gardent `schedulingReason = null` (pas
de rendez-vous rétroactif) et reçoivent un jeton au premier besoin (invitation par le PVS).

## API

Préfixes : `/api/serving` (authentifié, existant) ; ajout public `/api/serving/public/interview`
(toutes méthodes) et page publique `/entretien` dans `routes.public` du manifeste. Chaque route a
son `contract.ts`, `npm run openapi`.

| Endpoint | Méthode | Accès | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/serving/public/[churchSlug]` | POST (existant) | public, Turnstile | fiche | `+ manageToken` (lien de rendez-vous) |
| `/api/serving/public/interview/[token]` | GET | jeton, 30/min/IP | — | église, rendez-vous en cours, créneaux libres à venir (date, heure, durée, lieu, prénom et nom de la personne qui reçoit), `canChange` (≥ 24 h) |
| `/api/serving/public/interview/[token]` | POST | jeton | `{ action: "book", slotId } \| { action: "decline" } \| { action: "cancel" }` | rendez-vous |
| `/api/serving/public/interview/recover` | POST | public, Turnstile, 3/min/IP | `{ churchSlug, email, turnstileToken }` | toujours `{ ok: true }` |
| `/api/serving/interview-slots` | GET | PVS de l'église (`?churchId`) | `{ from?, to? }` | créneaux (libres, réservés, passés) + candidat éventuel |
| `/api/serving/interview-slots` | POST | PVS | `{ churchId, slots: [{ day, time, durationMinutes, location?, visioUrl?, interviewerId }] }` ou `{ churchId, series: { days[], from, to, durationMinutes, location?, visioUrl?, interviewerId } }` (200 créneaux au plus) | créneaux créés |
| `/api/serving/interview-slots/[id]` | PATCH | PVS (église du créneau) | horaire, durée, lieu, visio, personne qui reçoit | créneau ; un rendez-vous actif suit (horaire ⇒ candidat prévenu) |
| `/api/serving/interview-slots/[id]` | DELETE | PVS | — | créneau retiré ; rendez-vous actif annulé `SLOT_REMOVED` |
| `/api/serving/applications/[id]/interview` | POST | PVS (église de la candidature) | `{ action: "book", slotId } \| { action: "cancel" } \| { action: "outcome", status: "DONE" \| "NO_SHOW" \| "EXCUSED" } \| { action: "invite" }` | rendez-vous et repère |
| `/api/serving/applications/[id]` | GET (existant) | inchangé | — | `+ interviews` (historique), `schedulingReason`, `repeatedNoShow` |
| `/api/serving/settings` | PUT (existant) | équipe PVS | `+ schedulingReminderDays` (1–60) | réglages |

Le jeton n'apparaît jamais dans une URL d'API de gestion ni dans un journal.

## Services / logique métier

Nouveaux fichiers dans `src/modules/serving/services/` :

- **`tokens.ts`** — `manageTokenPair(applicationId, salt)` (HMAC de `SERVING_TOKEN_SECRET`, à
  défaut `AUTH_SECRET`), `hashToken`, `isTokenShape`, `matchesHash` à temps constant ;
  `ensureManageToken(applicationId)` pose sel et empreinte au besoin.
- **`slots.ts`** — `expandSeries` (pure : jours × plage horaire / durée, heure de Paris, changement
  d'heure compris), `createSlots` (personne qui reçoit = membre de l'équipe PVS, vérifié par
  `pvsRecipientIds` ; pas de créneau passé ; chevauchement d'un même membre refusé), `updateSlot`,
  `deleteSlot`, `listSlots`, `listFreeSlots(churchId, now)` (à venir, `bookedAt` nul). Toute
  création pose `ServingSettings.slotsOpenedAt`. Helper pur `parisDateTime(day, time)` dans
  `src/lib/paris-time.ts` (déplacé depuis `src/app/api/mcp/_actions/common.ts`, qui l'importe).
- **`interviews.ts`** —
  - `bookSlot(applicationId, slotId, by)` : transaction — prise atomique
    `updateMany({ id, bookedAt: null, startsAt > now })` (0 ligne ⇒ 409 « créneau pris ») ; ancien
    rendez-vous actif annulé et son créneau libéré ; nouveau rendez-vous avec la copie du créneau ;
    `schedulingReason = null`.
  - `cancelInterview(applicationId, reason)` : libère le créneau, pose la raison « À planifier ».
  - `declineSlots(applicationId)` : raison `DECLINED`.
  - `recordOutcome(applicationId, status, by)` : seulement un rendez-vous `BOOKED` dont l'heure
    est passée ; `NO_SHOW`/`EXCUSED` reposent « À planifier ».
  - `candidateCanChange(interview, now)` : `startsAt - now ≥ 24 h`.
  - `interviewView(interview, now)` : statut affiché (`TO_COMPLETE` si `BOOKED` et fin passée).
  - `hasRepeatedNoShow(interviews)` : deux derniers essais `NO_SHOW`.
  - À l'envoi de la fiche (`submitApplication`) : jeton posé ; s'il n'y a aucun créneau libre,
    raison `NO_SLOT`.
- **`lifecycle.ts`** (existant, étendu) — dans `runServingTasks` :
  - `remindDayBefore` : rendez-vous `BOOKED` qui commencent demain (Paris), `dayBeforeRemindedAt`
    pris de façon atomique ; email au candidat, notification à la personne qui reçoit ;
  - `remindCompletion` : `BOOKED` terminé depuis au moins 12 h, `completionRemindedAt` nul ⇒
    notification à la personne qui reçoit (à défaut, l'équipe PVS) ;
  - `remindScheduling` : candidature `RECEIVED` « À planifier » depuis `schedulingReminderDays`,
    relance tous les `schedulingReminderDays` (`schedulingRemindedAt` atomique) ⇒ équipe PVS ;
  - `inviteToNewSlots` : église dont `slotsOpenedAt` > dernière invitation d'une candidature
    `RECEIVED` « À planifier » avec email, et au moins un créneau libre ; `slotsInvitedAt` atomique,
    au plus une fois par 24 h.
  - Purge d'une candidature (existante) : créneau actif libéré et personne qui reçoit prévenue avant la
    suppression (cascade des rendez-vous), sans message au candidat.
- **`applications.ts`** (existant) — `rejectApplication` annule le rendez-vous à venir
  (`REJECTED`), libère le créneau, prévient la personne qui reçoit et envoie au candidat le message neutre.
- **`notifications.ts`** (existant, étendu) — emails au candidat (`sendEmail` direct : pas de
  compte, liste blanche déjà accordée au fichier ; contenu : date, heure, lieu, nom de la personne
  qui reçoit, lien) ; notifications à la personne qui reçoit et à l'équipe PVS (`notifyUsers`,
  domaine `serving`, prénom et nom du candidat seuls). Types : `SERVING_INTERVIEW_BOOKED`,
  `…_MOVED`, `…_CANCELLED`, `…_REMINDER`, `…_TO_COMPLETE`, `SERVING_SCHEDULING_REMINDER`.

Journal (`logAudit`, dans les routes de gestion) : création, modification et suppression de
créneau ; rendez-vous fixé, annulé, issue notée, invitation — jamais le jeton.

## UI / composants

- **`src/components/serving/InterviewPicker.tsx`** (client) : créneaux libres groupés par jour,
  choix, « Aucun créneau ne me convient », message « créneau pris » (409) avec rechargement ;
  utilisé par l'écran de confirmation de `/servir/[churchSlug]` (après l'envoi, avec le jeton
  renvoyé) et par la page de gestion.
- **`/entretien/[token]`** (public, `PublicShell`) : rendez-vous en cours (date, heure, lieu ou lien
  de visio, personne qui reçoit), « Changer » / « Annuler » si ≥ 24 h, sinon invitation à contacter le PVS
  (adresse du PVS si renseignée) ; sans rendez-vous : `InterviewPicker`. Lien invalide : même
  message qu'un lien inconnu. « Retrouver mon rendez-vous » (email + Turnstile) depuis
  `/servir/[churchSlug]`.
- **`/candidatures/entretiens`** (PVS) : créneaux à venir par semaine (libre / réservé avec le nom
  du candidat / à réattribuer), « Ajouter un créneau », « Ajouter une série » (`Modal` : jours,
  plage, durée 30 min, lieu ou visio, personne qui reçoit parmi l'équipe PVS), modification et retrait
  (`ConfirmModal` qui annonce le candidat prévenu) ; compteur « Entretiens à compléter ». Bouton
  « Entretiens » à côté de « Paramètres » sur `/candidatures`.
- **`/candidatures`** : pastilles « À planifier · raison » et « Entretien le … » dans la liste.
- **`/candidatures/[id]`** : bloc « Entretien » — rendez-vous en cours, historique, signal
  « deux absences d'affilée », actions (fixer un créneau, annuler, noter réalisé / absent / excusé,
  inviter à choisir un créneau).
- **`/candidatures/parametres`** : champ « Relancer une candidature à planifier après (jours) ».
- Guide utilisateur et fiche de l'assistant (KB-150) complétés ; nav inchangée.

## Assistant (Nia / Koï) et assistants IA connectés (MCP)

Même règle que les autres modules (specs 075 et 081) : les questions de données relisent les
services de l'écran et revérifient le droit de l'écran (équipe PVS, Admin, Super Admin) ; seuls
le prénom et le nom du candidat sortent, jamais une coordonnée ni une autre donnée de la fiche.

- **Questions de données** (`src/app/api/assistant/_data/serving.ts`, fiches de type `data`,
  audience `pvsTeam` ou `serving:manage`) :
  - `serving.myInterviews` — mes entretiens à venir (personne qui reçoit) : date, heure, prénom
    et nom du candidat, lieu ;
  - `serving.toPlan` — candidatures « À planifier » (prénom, nom, raison, depuis) et nombre
    d'entretiens « À compléter » ;
  - `serving.freeSlots` — créneaux libres à venir (jour, heure, personne qui reçoit), filtrables
    par jour.
- **MCP** : ces trois questions entrent dans la liste blanche `MCP_TOOLS`
  (`src/app/api/mcp/_tools.ts`). Une **action confirmée** (lot 2/3 de la spec 081, portée
  `write`) : `create_interview_slots_preview` / `…_confirm` — créer un ou plusieurs créneaux ou
  une série (« tous les mardis de décembre de 19 h à 21 h avec Jean »), via `createSlots` ;
  l'aperçu liste les créneaux et refuse ce que l'écran refuserait (personne hors PVS, créneau
  passé, chevauchement), la confirmation revérifie le droit et journalise `via: "mcp"`.
  Aucune action ne touche un rendez-vous (réserver, annuler, noter l'issue restent à l'écran).
- **Fiches de l'assistant** : KB-150 complétée (entretiens, statuts, relances) ; nouvelle fiche
  « Gérer les créneaux d'entretien » (audience PVS) ; fiches de données des trois questions ;
  synonymes (« entretien », « rendez-vous », « créneau »).

## Documentation

- `CLAUDE.md` : spécificités du module candidatures (créneaux, rendez-vous, lien du candidat,
  relances) et liste des outils et actions du module mcp.
- `docs/database.md` (modèles, enums, colonnes), `docs/auth.md` (accès PVS, lien public),
  `docs/architecture.md` (module `serving`, `SERVING_TOKEN_SECRET`, pages publiques
  `/entretien`), `docs/production.md`, `.env.example`.
- Guide utilisateur (`GuideContent.tsx`) : fiches « Entretiens : créneaux et rendez-vous » (PVS)
  et « Candidatures » complétée ; `docs/guide-screenshots.md`.
- `CHANGELOG.md`, `docs/openapi.json`, écarts dans ce plan.

## Décisions & alternatives écartées

- **Choix** : prise atomique par `bookedAt` sur le créneau — *Pourquoi* : MariaDB n'a pas d'index
  unique partiel ; une mise à jour conditionnelle garantit un seul rendez-vous actif par créneau
  sans verrou de table.
- **Choix** : copie de l'horaire, du lieu et de la personne qui reçoit dans le rendez-vous — *Pourquoi* :
  historique fidèle même si le créneau est modifié ou supprimé ; emails et rappels lisent le
  rendez-vous seul.
- **Choix** : « À compléter » et « deux absences » calculés — *Pourquoi* : aucun état à
  synchroniser, aucune tâche pour basculer un statut.
- **Choix** : jeton dérivé (HMAC) plutôt qu'aléatoire — *Pourquoi* : les invitations « nouveaux
  créneaux » et les déplacements doivent renvoyer le lien sans le stocker en clair.
- **Choix** : `parisDateTime` déplacé dans `src/lib/paris-time.ts` — *Pourquoi* : le module ne
  peut pas importer `src/app` ; une seule règle d'heure de Paris.
- **Écarté** : statut « À compléter » stocké — *Raison* : basculerait par tâche planifiée, source
  d'écarts.
- **Écarté** : un créneau = un événement d'équipe (`TeamEvent`) — *Raison* : `serving` n'importe pas
  `planning`, et un créneau libre n'est pas un événement.
- **Écarté** : fichier d'agenda (.ics) — *Raison* : hors périmètre de la spec.

## Écarts à la spec (à valider)

- **Candidat sans email** (l'email est facultatif sur la fiche) : le lien de rendez-vous est
  affiché sur l'écran de confirmation, sans email de confirmation, de rappel ni d'invitation ; la
  candidature le signale au PVS (« pas d'email : à contacter par téléphone »).
- **Implémentation** : l'aperçu de l'action MCP et la création partagent `planSlots` (règles de
  l'écran sans écriture) ; la confirmation rejoue `createSlots`, qui revérifie tout (un créneau
  pris ou passé entre-temps ⇒ refus) — pas d'empreinte séparée. La personne qui reçoit est
  désignée par son nom (la personne connectée par défaut). Le nom de la personne qui reçoit est
  relu à l'affichage de la fiche (le rendez-vous ne garde que son identifiant).

## Risques & points d'attention

- **Courses** sur un même créneau : couvertes par la prise atomique et testées.
- **Changement d'heure** dans une série : `parisDateTime` testé sur les dates de bascule.
- **Personne qui reçoit qui quitte l'équipe PVS** : affichée « à réattribuer » (calculé) ; aucune
  notification ne lui part plus.
- **Purge** (spec 077) : le créneau actif doit être libéré avant la cascade.
- **Données** : notifications et emails sans autre donnée de la fiche que prénom et nom (et, pour
  le candidat, son propre rendez-vous).

## Stratégie de tests

- `slots.test.ts` : `expandSeries` (plages, durée, changement d'heure), refus créneau passé,
  personne qui reçoit hors PVS, chevauchement ; `slotsOpenedAt` posé.
- `interviews.test.ts` : prise atomique (deux réservations, une seule aboutit), changement libère
  l'ancien créneau, annulation et raisons « À planifier », limite des 24 h, issue seulement après
  l'heure, `NO_SHOW`/`EXCUSED` ⇒ « À planifier », « À compléter » et « deux absences » calculés.
- `lifecycle.test.ts` : rappel de la veille (une fois), issue à noter, relance « À planifier » au
  délai réglé puis renouvelée, invitation au plus une fois par jour, purge qui libère le créneau.
- `applications.test.ts` : non-retenue ⇒ annulation, créneau libéré, message neutre.
- Routes : jeton (forme, empreinte, inconnu = même réponse), débit, église du créneau ou de la
  candidature (autre église : 404), PVS seulement ; `route-exhaustiveness`, `openapi`,
  `notifications-no-direct-email` inchangé.
