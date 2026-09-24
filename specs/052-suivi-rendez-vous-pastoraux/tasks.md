# Tâches — Suivi des nouveaux convertis et des demandes de rendez-vous pastoral

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **ADR** : `docs/adr/0015-module-suivi-rendez-vous-pastoraux.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**, en trois lots livrés par PR successives vers la base
> `feat/suivi-rendez-vous-pastoraux` (stratégie multi-PR, constitution §V). Dans chaque lot :
> migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche de base créée : `feat/suivi-rendez-vous-pastoraux`
- [ ] Branche de lot créée depuis la base avant chaque lot : `feat/care-lot1-module`,
      `feat/care-lot2-flux`, `feat/care-lot3-pilotage`
- [ ] MariaDB 10.11 locale disponible pour rejouer les migrations

---

## Lot 1 — Le module et la reprise, à comportement constant

### 1.1 Données & migrations

- [ ] **T1** — Migration **écrite à la main** `rename_agenda_qualifier_role` : ajout de
      `PASTORAL_CARE_REFERENT` à l'enum `Role`, `UPDATE user_church_roles SET role =
      'PASTORAL_CARE_REFERENT' WHERE role = 'AGENDA_QUALIFIER'`, retrait de `AGENDA_QUALIFIER`.
      Enum `Role` mis à jour dans le schéma.
      *(fichiers : `prisma/schema.prisma`, `prisma/migrations/…_rename_agenda_qualifier_role/`)*
- [ ] **T2** — Migration `care_module_schema` (additive) : sur `AppointmentRequest`,
      `assignedMemberId` (FK `User`, `SetNull`), `assignedAt`, `assignedById`, `scheduledFor`,
      `outcome`, `outcomeAt`, `rejectReasonCode`, `sourceIntegrationRequestId @unique`,
      `personJourneyId` ; statut `CLOSED` ; enums `AppointmentOutcome` et
      `AppointmentRejectReason`. Sur `MsdpFollowUp` : `requestId` optionnel en `SetNull`,
      `firstName`, `lastName`, `phone`, `email`, `assignedProfileId` (FK `PastoralProfile`),
      `assignedById`, `sourceAppointmentId @unique`, `personJourneyId`. Modèle `CareSettings`.
      *(fichiers : `prisma/schema.prisma`, migration)*
- [ ] **T3** — Migration `care_data_takeover` : recopie de
      `family_integration_requests.appointmentRequestId` vers
      `appointment_requests.sourceIntegrationRequestId` puis suppression de la colonne ; identité
      des suivis recopiée depuis leur demande d'accueil ; `personJourneyId` depuis
      `person_journeys.sourceRequestId` ; `assignedAt = qualifiedAt` pour les demandes validées ;
      `scheduledFor` depuis l'entrée d'agenda liée pour les demandes planifiées. Relation
      `FamilyIntegrationRequest.appointmentRequest` retirée du schéma.
      *(fichiers : `prisma/schema.prisma`, migration)*
- [ ] **T4** — Rejouer T1–T3 sur MariaDB locale avec un jeu de données : rôle renommé, lien
      d'accueil repris, identité recopiée, demandes planifiées datées ; puis
      `prisma migrate diff --exit-code` sans écart. Journaliser le résultat dans la PR.

### 1.2 Module `care` — squelette et gardes

- [ ] **T5** — Créer `src/modules/care/manifest.ts` : `dependsOn: ["core"]`, permissions
      `care:qualify` (Super Admin, Admin, Référent soins pastoraux) et `care:view` (+ Secrétaire),
      routes `authenticated: /care`, `api: /api/care`, `public: /agenda-public` et
      `/api/care/requests/public` (méthode POST). Ajouter le manifeste à `src/lib/manifests.ts`.
      *(fichiers : `src/modules/care/manifest.ts`, `src/lib/manifests.ts`)*
- [ ] **T6** — Retirer `agenda:qualify` du manifeste `agenda` et ses routes de demandes ;
      `requireAgendaQualify` supprimé. *(fichiers : `src/modules/agenda/manifest.ts`,
      `src/modules/agenda/auth.ts`)*
- [ ] **T7** — `src/modules/care/auth.ts` : `requireCareQualify(churchId)` et
      `getCareAccess(session, churchId)` → `{ canQualify, canOverview, userId, ownProfileIds }`,
      par `rolePermissions` (import dynamique, ADR-0004) **sans approximation par
      `members:manage`/`events:manage`**. *(fichier : `src/modules/care/auth.ts`)*
- [ ] **T8** — Règle `no-care-imports-other-modules` dans `.dependency-cruiser.cjs`.
- [ ] **T9** — Remplacer `AGENDA_QUALIFIER` par `PASTORAL_CARE_REFERENT` et le libellé par
      « Référent soins pastoraux » dans : manifestes `audio` et `jobs`, `AccessClient.tsx`,
      `UsersClient.tsx`, `src/app/api/users/[userId]/roles/route.ts`, `GuideContent.tsx`,
      `tour-steps.ts`, `AuthLayoutShell.tsx`, `src/__mocks__/auth.ts`,
      `prisma/fixtures/dev-users.ts`.

### 1.3 Services — reprise à l'identique

- [ ] **T10** — `services/appointments.ts` : dépôt (`submitRequest`, commun au formulaire public et
      au compte, sans jours), liste des demandes par état, validation vers un **profil pastoral**
      (comportement actuel), rejet, passage à `SCHEDULED` avec `scheduledFor`, retour à
      `VALIDATED` à la suppression de l'entrée d'agenda, mise à jour de `scheduledFor`.
      Reprend la logique des routes `agenda/requests*`.
      *(fichier : `src/modules/care/services/appointments.ts`)*
- [ ] **T11** — `services/followups.ts` : reprise de `msdp-service.ts` (schéma, transitions,
      affectation d'un **membre du MSDP**, notifications, rappels d'inactivité), accès réécrit
      sur `getCareAccess` (T7). *(fichiers : `src/modules/care/services/followups.ts`,
      suppression de `src/modules/integration/services/msdp-service.ts`)*
- [ ] **T12** — `services/projection.ts` : `projectRequest(item, access)` — fiche complète si
      `canReadContent` (référent, Admin, Super Admin, accompagnant en charge), sinon ni `message`
      ni `subject`, libellé « Rendez-vous pastoral ». `projectForScheduling` pour le protocole.
      *(fichier : `src/modules/care/services/projection.ts`)*
- [ ] **T13** — `services/intake.ts` : `handleIntegrationSubmitted(tx, payload)` — crée une fois la
      demande de rendez-vous (soin pastoral) et le suivi (appel au salut), rattachés au dossier
      de parcours ; idempotent par les index uniques.
      *(fichier : `src/modules/care/services/intake.ts`)*
- [ ] **T14** — `integration` : déclarer l'événement `integration:request:submitted` ; dans
      `POST /api/integration/requests`, envelopper la création dans `prisma.$transaction` et
      émettre l'événement ; supprimer la création directe d'`AppointmentRequest`.
      *(fichiers : `src/modules/integration/events.ts`, `src/app/api/integration/requests/route.ts`)*
- [ ] **T15** — Abonnement dans `src/lib/registry.ts`, conditionné par `registry.has("care")`,
      délégant à `handleIntegrationSubmitted`.
- [ ] **T16** — `src/modules/care/index.ts` : exports publics (gardes, services, projections,
      manifeste). *(dépend de T7, T10–T13)*

### 1.4 API

- [ ] **T17** — `GET/POST /api/care/requests`, `POST /api/care/requests/public` (Turnstile, débit,
      **sans jour**), `GET/PATCH /api/care/requests/[id]` (actions `validate` vers un profil,
      `reject`), toutes via services et projection. Suppression des routes `api/agenda/requests*`
      sauf `schedule`. *(fichiers : `src/app/api/care/requests/**`)*
- [ ] **T18** — `GET/POST /api/care/followups`, `GET/PATCH /api/care/followups/[id]`,
      `GET /api/care/companions` (membres du MSDP à ce stade). Suppression des routes
      `api/integration/msdp*`. *(fichiers : `src/app/api/care/followups/**`,
      `src/app/api/care/companions/route.ts`)*
- [ ] **T19** — Orchestrer `PATCH /api/agenda/requests/[id]/schedule`, `PATCH` et `DELETE
      /api/agenda/entries/[id]` : écriture d'agenda + service `care` dans la même transaction ;
      titre par défaut de l'entrée « Rendez-vous pastoral — Prénom Nom ».
      *(fichiers : `src/app/api/agenda/requests/[id]/schedule/route.ts`,
      `src/app/api/agenda/entries/[id]/route.ts`)*
- [ ] **T20** — Cron : rappels d'inactivité des suivis repris par `care`, conditionnés par
      `registry.has("care")` ; retrait de `runMsdpInactivityNotifications` côté `integration`.
      *(fichier : `src/app/api/cron/route.ts`)*
- [ ] **T21** — Abaisser le seuil de `scripts/prisma-boundary-baseline.txt` au nouveau compte
      (routes supprimées) ; `npm run lint:prisma-boundary` vert.

### 1.5 UI

- [ ] **T22** — Espace `/care` (onglets Rendez-vous / Nouveaux convertis) et fiches
      `/care/requests/[id]`, `/care/followups/[id]`, reprenant le tableau de qualification et la
      carte MSDP à comportement constant. *(fichiers : `src/app/(auth)/care/**`)*
- [ ] **T23** [P] — Formulaire public déplacé sous `care`, **sans le choix du jour**, même adresse
      `/agenda-public/[churchSlug]`, appel à `/api/care/requests/public`.
      *(fichiers : `src/app/agenda-public/[churchSlug]/**`)*
- [ ] **T24** [P] — Formulaire connecté `/care/request` (ex-`/agenda/request`), sans jours,
      `?from=requests` conservé ; tuile de `/requests/new` vers `/care/request?from=requests`,
      conditionnée par `registry.has("care")`.
      *(fichiers : `src/app/(auth)/care/request/**`, `src/app/(auth)/requests/new/page.tsx`,
      `RequestForm.tsx`)*
- [ ] **T25** [P] — Redirections permanentes `/agenda/requests` → `/care`, `/agenda/request` →
      `/care/request`. *(fichier : `next.config.ts`)*
- [ ] **T26** — Fiche d'accueil : carte MSDP remplacée par un résumé (état, accompagnant, lien,
      « Démarrer un suivi ») et résumé du rendez-vous pastoral lié, lus via les services `care`
      (orchestration dans la page). *(fichiers : `src/app/(auth)/integration/requests/[id]/**`)*
- [ ] **T27** [P] — Formulaire d'accueil : case « soin pastoral » affichée seulement si `care`
      est actif. *(fichiers : `src/app/rejoindre/[churchSlug]/**`)*
- [ ] **T28** [P] — Navigation : section « Suivi pastoral », lien « Demande RDV pastoral » →
      `/care/request`, retrait des liens « Qualification » de l'agenda.
      *(fichier : `src/app/(auth)/layout.tsx`)*
- [ ] **T29** — Statistiques : section MSDP retirée de `/integration/stats` (reprise au lot 3).

### 1.6 Tests du lot 1

- [ ] **T30** — Matrice figée : `src/core/__tests__/permissions.test.ts` (rôle renommé,
      `care:qualify`, `care:view`, sans `agenda:qualify`), tableau de `CLAUDE.md`, `docs/auth.md`
      — dans le même commit que T5–T6.
- [ ] **T31** [P] — `care/__tests__/auth.test.ts` : Super Admin, Admin, Référent → `care:qualify` ;
      Secrétaire → `care:view` seul ; **Ministre et Resp. département → aucun accès** (#583).
- [ ] **T32** [P] — `care/__tests__/projection.test.ts` : message et objet visibles au référent et
      à l'accompagnant en charge, invisibles à la Secrétaire, au protocole et à un tiers.
- [ ] **T33** [P] — `care/__tests__/intake.test.ts` : appel au salut → un suivi ; soin pastoral →
      une demande ; double émission → une seule création ; `care` absent → aucune création.
- [ ] **T34** [P] — Reprise des tests existants contre `care` : sécurité et captcha du formulaire
      public (ex-`agenda/requests/__tests__`), `msdp-service.test.ts`, `msdp/counselors`,
      `cron-modules.test.ts`, `planning-digest.test.ts` (mocks).
- [ ] **T35** [P] — Dépôt : formulaire public et formulaire connecté créent une demande identique à
      l'état reçu, sans jour préféré.
- [ ] **T36** — Exhaustivité des routes (`routes-exhaustivite.test.ts`) et vérification complète
      du lot : typecheck, lint, lint:boundaries, lint:prisma-boundary, test. PR lot 1 → base.

---

## Lot 2 — Le nouveau flux

### 2.1 Données

- [ ] **T37** — Migration `backfill_salvation_followups` : un suivi `SUBMITTED` pour chaque demande
      d'accueil non archivée, `salvationCall = 1`, sans suivi (identifiant
      `CONCAT('c', REPLACE(UUID(), '-', ''))`). Rejouée sur MariaDB locale avec des cas archivés,
      déjà suivis et non suivis.

### 2.2 Services

- [ ] **T38** — `services/assignee.ts` : type `{ kind: "PROFILE" | "MEMBER" }`, `resolveAssignee`
      (profil de l'église ; membre d'un département de fonction `MSDP`), `isCurrentAssignee`,
      invariant d'affectation exclusive. *(fichier : `src/modules/care/services/assignee.ts`)*
- [ ] **T39** — `services/appointment-state.ts` (pur) : `validate` vers profil **ou** membre,
      `reject` avec motif obligatoire, `reassign`, `set_date` (membre du MSDP seul), `outcome`
      (cinq issues), `handback` avec raison ; droits par action.
- [ ] **T40** — `services/followup-state.ts` (pur) : `assign`/`reassign` vers membre **ou**
      profil par le référent seul, `handback`, étapes existantes réservées à l'accompagnant en
      charge.
- [ ] **T41** — Issue « orienté vers un suivi de nouveau converti » : création du suivi avec
      l'identité et le dossier de parcours du rendez-vous (`sourceAppointmentId`).
- [ ] **T42** — `services/notifications.ts` : affectation (in-app si compte, email si adresse, sans
      le message), dessaisissement, retour au référent (tous les `care:qualify` de l'église),
      date fixée par un membre du MSDP → demandeur (`buildAppointmentScheduledEmail`), rejet →
      demandeur avec motif ; transmission au protocole seulement pour un profil pastoral.
- [ ] **T43** — `services/history.ts` : journal `{ action, from, to, assignee?, note? }`, lecture
      des entrées antérieures (agenda `details.transition`, MSDP `{ action }`).
- [ ] **T44** — `services/related.ts` : autres demandes et suivis du même dossier de parcours
      (sorte, date, état), projetés selon le lecteur.
- [ ] **T45** — `listMyRequests(userId, churchId)` : demandes du demandeur, sans accompagnant.

### 2.3 API

- [ ] **T46** — `PATCH /api/care/requests/[id]` : actions `validate` (profil ou membre),
      `reject` (motif), `reassign`, `set_date`, `outcome`, `handback`.
- [ ] **T47** — `PATCH /api/care/followups/[id]` : `assign`/`reassign` (membre ou profil),
      `handback`.
- [ ] **T48** [P] — `GET /api/care/companions` : deux groupes, profils pastoraux (avec indicateur
      « sans compte ») et membres du MSDP.
- [ ] **T49** [P] — `GET /api/care/items/[kind]/[id]/history` et `GET /api/care/requests/mine`.

### 2.4 UI

- [ ] **T50** — Sélecteur d'accompagnant (`Select` à deux groupes, mention « prévenu par email
      seulement »), modales « Rejeter » (liste de motifs + commentaire), « Rendre au référent »
      (raison obligatoire), « Fixer la date » (membre du MSDP), « Issue du rendez-vous ».
- [ ] **T51** — Fiches : message masqué hors `canReadContent`, frise d'historique (composant 051
      déplacé dans `src/components/`), encart « Autres demandes de la personne », badge
      « Rendu par l'accompagnant ».
- [ ] **T52** [P] — Vue « Mes demandes » de l'accompagnant dans `/care` (sans permission : ses
      seules demandes).
- [ ] **T53** [P] — « Mes demandes » du demandeur (`/requests`) : section « Rendez-vous
      pastoraux » (état, date, motif de rejet).

### 2.5 Tests du lot 2

- [ ] **T54** [P] — `appointment-state.test.ts` : table complète des transitions et des droits
      (référent, accompagnant en charge, accompagnant dessaisi, tiers), motif de rejet
      obligatoire, cinq issues, retour au référent, invariant d'affectation.
- [ ] **T55** [P] — `followup-state.test.ts` : affectation aux deux populations, retour, droits.
- [ ] **T56** [P] — `notifications.test.ts` : affectation sans email réussie ; profil sans compte
      → email seul ; dessaisissement notifié ; protocole prévenu pour un profil, pas pour un
      membre ; demandeur prévenu de la date dans les deux cas.
- [ ] **T57** [P] — `history.test.ts` et `related.test.ts` ; `mine` limité à l'appelant.
- [ ] **T58** — Vérification complète du lot, migration T37 rejouée. PR lot 2 → base.

---

## Lot 3 — Pilotage et finitions

- [ ] **T59** — `services/settings.ts` (`getCareSettings` avec défauts 7/14, mise à jour) et
      `GET/PUT /api/care/settings` (`care:qualify`, entiers 1–365) ; page `/care/parametres`.
- [ ] **T60** — `services/relances.ts` : échéances pures `unassignedDueAt`/`unscheduledDueAt`,
      `runCareRelances` (référents / accompagnant, dédoublonnage par échéance) branché au cron ;
      bandeau « À relancer » dans `/care`.
- [ ] **T61** — `GET /api/care/stats` et page `/care/stats` : volumes par état, par accompagnant,
      répartition des motifs de rejet, reprise de la section MSDP retirée au lot 1.
- [ ] **T62** [P] — `relances.test.ts` : échéances par état, dédoublonnage, sortie de relance après
      affectation ou date fixée.
- [ ] **T63** [P] — Documentation : guide intégré (`GuideContent.tsx` : espace suivi pastoral,
      rôle renommé), `docs/auth.md`, `docs/guide-screenshots.md`, `CLAUDE.md` (module `care`,
      permissions), ADR-0015 passé à **Accepté** et index des ADR.
- [ ] **T64** — Vérification complète, puis PR finale `feat/suivi-rendez-vous-pastoraux` → `main`.

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run lint:prisma-boundary`
- [ ] `npm run test`
- [ ] Migrations rejouées sur base vierge, `prisma migrate diff --exit-code` sans écart
- [ ] Avant déploiement : migration du rôle rejouée sur une copie de production ; comptage des
      appels au salut sans suivi ; équipes protocole et secrétariat prévenues de la perte d'accès
      au contenu des demandes
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (voir couverture ci-dessous)
- [ ] PR finale ouverte vers `main`

## Couverture des critères d'acceptation

| Critère (spec.md) | Couvert par |
|---|---|
| Plus de choix de jours ; jours déjà saisis conservés, non affichés | T2, T10, T23, T24, T35 |
| Un espace dédié pour rendez-vous et suivis, distinct de l'intégration et de l'agenda | T5, T22, T28 |
| Suivis existants repris avec état, accompagnant, historique | T3, T4, T11, T43 |
| Appel au salut → suivi automatique, une fois par personne | T13, T14, T15, T33 |
| Rattrapage des appels au salut antérieurs sans suivi | T37 |
| Fiche d'accueil : existence et état du suivi, accès direct | T26 |
| Validation en confiant à un profil ou un membre du MSDP, en une action | T39, T46, T50, T54 |
| Rejet avec motif de la liste, visible sur la fiche et en statistiques | T2, T39, T46, T50, T61 |
| Suivi confié par le référent à un membre du MSDP ou à un profil | T40, T47, T55 |
| Seuls les détenteurs du droit de qualification confient, réaffectent, rejettent | T7, T39, T40, T31, T54 |
| Liste de choix distinguant profils et membres du MSDP | T48, T50 |
| Accompagnant notifié in-app et par email ; absence d'email non bloquante | T42, T56 |
| Accompagnant dessaisi informé | T42, T56 |
| Retour au référent avec raison ; référents prévenus ; historique | T39, T40, T42, T43, T46, T47, T54 |
| Profil pastoral → protocole ; membre du MSDP → date fixée par lui | T19, T39, T42, T46, T56 |
| Demandeur prévenu de la date dans les deux cas | T42, T56 |
| Issue du rendez-vous ; orientation crée un suivi ; nouveau RDV remet à planifier | T39, T41, T46, T50, T54 |
| Autres demandes du même dossier de parcours signalées | T3, T44, T51, T57 |
| Relances : non confiée → référents ; confiée non planifiée → accompagnant ; délais réglables | T59, T60, T62 |
| Message lisible par référents, Admin et accompagnant en charge seulement | T12, T32, T51 |
| Cycle de vie complet sur la fiche | T43, T51, T57 |
| Dépôt public (même adresse) et connecté (menu, tuile), même circuit | T10, T17, T23, T24, T25, T35 |
| Le demandeur connecté retrouve ses demandes dans « Mes demandes » | T45, T49, T53, T57 |
| Ni message ni objet visibles du protocole, de la Secrétaire, de l'intégration ; titre d'agenda neutre | T12, T19, T32 |
| Rôle renommé « Référent soins pastoraux » partout, détenteurs conservés | T1, T4, T9, T30, T63 |

Les 25 critères d'acceptation de la spec sont couverts.
