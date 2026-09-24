# Plan technique — Suivi des nouveaux convertis et des demandes de rendez-vous pastoral

- **Spec associée** : `./spec.md`
- **ADR** : [ADR-0015](../../docs/adr/0015-module-suivi-rendez-vous-pastoraux.md) — module `care`
  (Proposé ; passe à Accepté à la livraison du lot 1)
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-24

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveau module `src/modules/care`, `dependsOn: ["core"]`, exposé
      par son index. Aucun import entre `care`, `agenda` et `integration` : réactions par bus
      d'événements (abonnements dans `src/lib/registry.ts`, racine de composition), écrans
      composites orchestrés dans `src/app/`. Une règle `no-care-imports-other-modules` est
      ajoutée à `.dependency-cruiser.cjs`.
- [x] **Sécurité** : toutes les routes `care` résolvent l'église de l'objet visé
      (`resolveChurchId` ou lecture de la demande) puis passent par une garde du module ; le
      `churchId` n'est jamais optionnel. Le formulaire public reste protégé par Turnstile +
      limitation de débit.
- [x] **Permissions** via `rolePermissions` : `care` déclare `care:qualify` et `care:view` dans
      son manifeste. **Aucune garde de `care` n'utilise `members:manage`/`events:manage` comme
      approximation d'un rôle** (décision #583 : le défaut de `hasMsdpManagementAccess` n'est pas
      repris).
- [x] **Validation** Zod sur toutes les mutations (actions en union discriminée, comme
      `familyPatchSchema`).
- [x] **Migration** Prisma : quatre migrations (renommage du rôle, schéma `care`, reprise des
      données, rattrapage des appels au salut), rejouées sur MariaDB 10.11 locale.
- [x] **Enums** importés depuis `@/generated/prisma/client`.
- [x] **UI** : `Modal`, `ConfirmModal`, `Select`, `Input`, `Textarea`, `Button` et l'historique
      de la spec 051 (`RequestHistoryTimeline`, généralisé) réutilisés.
- [x] **Surface HTTP** (ADR-0012) : `care` déclare `/care`, `/api/care` et, en public,
      `/agenda-public` (adresse diffusée, conservée) et `/api/care/requests/public`. Les
      anciennes adresses internes redirigent (voir UI).

## Approche générale

Trois lots, en **stratégie multi-PR** (constitution §V) : base `feat/suivi-rendez-vous-pastoraux`,
une PR par lot vers cette base, une PR finale vers `main`.

1. **Lot 1 — Le module et la reprise, à comportement constant.** Création de `care`, déplacement
   des demandes de rendez-vous (depuis `agenda`) et des suivis de nouveaux convertis (depuis
   `integration`) avec leurs écrans, renommage du rôle, nouvelles permissions, création des
   demandes par événement depuis le formulaire d'accueil, retrait des jours préférés. À la fin
   du lot, tout ce qui marchait marche encore, au nouvel endroit.
2. **Lot 2 — Le nouveau flux.** Affectation au choix profil pastoral / membre du MSDP,
   notifications d'affectation et de dessaisissement, date fixée par le membre du MSDP, issue du
   rendez-vous, retour au référent, motifs de rejet, confidentialité du contenu, rapprochement des
   demandes d'une même personne, création automatique et rattrapage des suivis de nouveaux
   convertis.
3. **Lot 3 — Pilotage et finitions.** Relances et réglages, statistiques de l'espace, guide et
   documentation.

Le lot 1 est le plus risqué (déplacement, migrations), mais il est vérifiable par simple
non-régression ; les lots 2 et 3 n'ajoutent que du comportement neuf dans un module déjà en place.

## Modèle de données

Les tables existantes **changent de propriétaire, pas de nom** (ADR-0015 §5) : `appointment_requests`
et `msdp_follow_ups` deviennent la propriété de `care` ; seules les routes et services de `care` les
écrivent.

```prisma
enum Role {
  // … AGENDA_QUALIFIER renommé :
  PASTORAL_CARE_REFERENT // « Référent soins pastoraux »
}

enum AppointmentRequestStatus {
  PENDING    // reçue
  VALIDATED  // validée et confiée, à planifier
  SCHEDULED  // planifiée (date connue)
  CLOSED     // + terminée (issue consignée)
  REJECTED
}

enum AppointmentOutcome {          // + issue d'un rendez-vous clôturé
  HELD                             // a eu lieu, clôturé
  REFERRED_TO_FOLLOWUP             // a eu lieu, orienté vers un suivi de nouveau converti
  NO_SHOW                          // la personne n'est pas venue, clôturé sans suite
}
// « nouveau rendez-vous nécessaire » et « absent, replanifier » ne clôturent pas :
// retour à VALIDATED, tracé dans l'historique.

enum AppointmentRejectReason {      // + motif de rejet (liste fixe)
  OUT_OF_SCOPE  DUPLICATE  WITHDRAWN  UNREACHABLE  REDIRECTED  OTHER
}

model AppointmentRequest {
  // … champs existants ; preferredDays conservé, plus lu ni écrit
  assignedToId      String?  // profil pastoral (existant)
  assignedMemberId  String?  // + membre du MSDP (User) — exclusif avec assignedToId
  assignedAt        DateTime? // + base de la relance « confiée non planifiée »
  assignedById      String?  // + qui a confié
  scheduledFor      DateTime? // + date du RDV, quel que soit l'accompagnant
  outcome           AppointmentOutcome?
  outcomeAt         DateTime?
  rejectReasonCode  AppointmentRejectReason? // rejectReason existant = commentaire libre
  sourceIntegrationRequestId String? @unique // + remplace FamilyIntegrationRequest.appointmentRequestId
  personJourneyId   String?  // + rapprochement (dossier de parcours)
}

model MsdpFollowUp {
  requestId  String? @unique // devient optionnel ; onDelete: SetNull (au lieu de Cascade)
  // + identité propre : un suivi peut naître d'un rendez-vous, sans demande d'accueil
  firstName  String  @db.VarChar(100)
  lastName   String  @db.VarChar(100)
  phone      String? @db.VarChar(30)
  email      String? @db.VarChar(255)
  assignedConseillerMsdpId String? // membre du MSDP (existant)
  assignedProfileId        String? // + profil pastoral — exclusif avec le précédent
  assignedById             String? // + qui a confié
  sourceAppointmentId      String? @unique // + RDV qui l'a fait naître (issue « orienté »)
  personJourneyId          String? // + rapprochement
}

/// Réglages du module care, par église (même forme que IntegrationSettings).
model CareSettings {
  id                   String @id @default(cuid())
  churchId             String @unique
  unassignedDelayDays  Int    @default(7)  // reçue non confiée → référents
  unscheduledDelayDays Int    @default(14) // confiée non planifiée → accompagnant
  // church, createdAt, updatedAt ; @@map("care_settings")
}

model FamilyIntegrationRequest {
  // - appointmentRequestId : supprimé, lien repris par AppointmentRequest.sourceIntegrationRequestId
}
```

**Invariant** vérifié par le service (et par un test) : jamais `assignedToId` et
`assignedMemberId` à la fois ; idem `assignedConseillerMsdpId` / `assignedProfileId`.

**Migrations** (ordre) :

1. `rename_agenda_qualifier_role` — **écrite à la main** : Prisma générerait une redéfinition de
   l'enum qui échoue sur les lignes existantes. Trois temps sur `user_church_roles.role` : ajout
   de `PASTORAL_CARE_REFERENT` à l'enum, `UPDATE … SET role = 'PASTORAL_CARE_REFERENT' WHERE
   role = 'AGENDA_QUALIFIER'`, retrait de l'ancienne valeur. `member_link_requests.requestedRole`
   est une chaîne qui ne porte jamais ce rôle (vérifié) : rien à faire.
2. `care_module_schema` — additive : nouvelles colonnes, enums, `care_settings`, `requestId`
   optionnel + `SetNull`, statut `CLOSED`.
3. `care_data_takeover` — reprise : `sourceIntegrationRequestId` recopié depuis
   `family_integration_requests.appointmentRequestId` puis colonne supprimée ; identité des
   suivis recopiée depuis leur demande d'accueil ; `personJourneyId` renseigné depuis
   `person_journeys.sourceRequestId` pour les demandes et suivis issus d'une demande d'accueil ;
   `assignedAt` des rendez-vous déjà validés = `qualifiedAt`.
4. `backfill_salvation_followups` — rattrapage (spec, décision actée) : un suivi `SUBMITTED` pour
   chaque demande d'accueil non archivée, `salvationCall = 1`, sans suivi. Identifiant généré en
   SQL (`CONCAT('c', REPLACE(UUID(), '-', ''))`, compatible avec les identifiants texte existants).

Les quatre sont rejouées sur MariaDB locale avec un jeu de données couvrant chaque cas, puis
`prisma migrate diff --exit-code`, comme pour la spec 051.

## API

Toutes sous `/api/care`, déclarées au manifeste de `care`. Gardes détaillées dans « Services ».

| Endpoint | Méthode | Garde | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/care/requests` | GET | `care:qualify` ou `care:view`, ou accompagnant (ses demandes) | `churchId`, filtres `status`, `mine` | liste **projetée** selon le lecteur |
| `/api/care/requests` | POST | `planning:view` (dépôt depuis son compte) | identité, `subject`, `message` — plus de jours | demande créée |
| `/api/care/requests/public` | POST | Turnstile + débit | formulaire public, **sans jour** | `{ ok }` |
| `/api/care/requests/[id]` | GET | idem GET liste | — | fiche projetée + `canReadContent` |
| `/api/care/requests/[id]` | PATCH | selon l'action | `action: validate \| reject \| reassign \| set_date \| outcome \| handback` | demande à jour |
| `/api/care/followups` | GET | `care:qualify`/`care:view`, ou accompagnant | filtres | liste |
| `/api/care/followups` | POST | `care:qualify` ou équipe intégration (démarrage manuel, #550) | `integrationRequestId` | suivi créé |
| `/api/care/followups/[id]` | GET/PATCH | référent ou accompagnant | `action: assign \| reassign \| contact \| in_formation \| complete \| abandon \| reopen \| note \| handback` | suivi à jour |
| `/api/care/items/[kind]/[id]/history` | GET | référent, Admin, ou accompagnant en charge | — | frise |
| `/api/care/companions` | GET | `care:qualify` | `churchId` | `{ profiles: […], msdpMembers: […] }` (deux groupes distincts) |
| `/api/care/settings` | GET/PUT | `care:qualify` | `{ unassignedDelayDays, unscheduledDelayDays }` (int 1–365) | réglages |
| `/api/care/stats` | GET | `care:qualify` ou `care:view` | `churchId` | agrégats (dont motifs de rejet) |

Schémas PATCH des rendez-vous (union discriminée) :

- `validate { assignee: { kind: "PROFILE" | "MEMBER", id }, note? }` — depuis `PENDING`.
- `reject { reasonCode, comment? }` — depuis `PENDING`.
- `reassign { assignee }` — depuis `VALIDATED`/`SCHEDULED`, référent seul.
- `set_date { scheduledFor }` — accompagnant **membre du MSDP** seul, depuis `VALIDATED`.
- `outcome { kind: "HELD" | "REFERRED_TO_FOLLOWUP" | "NO_SHOW_CLOSE" | "NEW_APPOINTMENT" | "NO_SHOW_REPLAN" }`
  — accompagnant (ou référent si profil sans compte), depuis `SCHEDULED`, date passée.
- `handback { reason }` — accompagnant, depuis `VALIDATED`/`SCHEDULED` (RDV non tenu).

**Agenda** : `PATCH /api/agenda/requests/[id]/schedule` reste une route d'`agenda` (le protocole
planifie dans l'agenda), mais devient un **orchestrateur** : garde `requireAgendaManage`, puis dans
une transaction, création de l'entrée d'agenda (service `agenda`) et passage à `SCHEDULED` avec
`scheduledFor` (service `care`). La liste « à planifier » du protocole est fournie par une
projection de `care` qui ne contient ni `subject` ni `message`. Les autres routes
`/api/agenda/requests*` sont supprimées.

## Services / logique métier

`src/modules/care/` : `manifest.ts`, `index.ts`, `bus.ts`/`events.ts`, `auth.ts`, `services/`.

**`services/appointment-state.ts`** et **`services/followup-state.ts`** — machines à états
**pures**, sur le modèle de `family-state.ts` (051) : `(état, action, acteur, now) → { data,
notifications }` ou `ApiError`. Elles portent toutes les transitions et tous les droits par action.

**`services/assignee.ts`** — un accompagnant est `{ kind: "PROFILE", profileId }` ou
`{ kind: "MEMBER", userId }`. `resolveAssignee` vérifie l'appartenance à l'église (profil de
l'église ; membre d'un département de fonction `MSDP` via `getFunctionDepartmentIds`, déjà utilisé
par `integration`) ; `isCurrentAssignee(session, item)` compare `userId` de la session au membre
affecté, ou au `userId` du profil pastoral affecté.

**`services/projection.ts`** — **la confidentialité est appliquée ici, une seule fois** :
`projectRequest(item, access)` renvoie la fiche complète si `canReadContent` (référent, Admin,
Super Admin, accompagnant **en charge**), sinon une projection sans `message` **ni `subject`**
(voir Décisions : sur le formulaire public, `subject` contient les motifs, eux-mêmes sensibles),
avec un libellé neutre « Rendez-vous pastoral ». Toutes les routes et pages passent par elle.

**`services/notifications.ts`** — affectation (in-app si compte, email si adresse), dessaisissement,
retour au référent (à tous les détenteurs de `care:qualify` de l'église), date fixée → demandeur
(réutilise `buildAppointmentScheduledEmail`), rejet → demandeur (réutilise
`buildAppointmentRejectedEmail`, motif en clair). Les emails aux accompagnants ne contiennent que
l'identité et un lien, jamais le message.

**`services/history.ts`** — journal d'audit enrichi `{ action, from, to, assignee?, note? }`, sur le
modèle de `family-history.ts` (051), avec lecture des entrées antérieures (`details.transition`
de l'agenda, `{ action }` du MSDP).

**`services/relances.ts`** — `runCareRelances(appUrl)` branché dans le cron (conditionné par
`registry.has("care")`) : échéances pures `unassignedDueAt`/`unscheduledDueAt` (réglages via
`getCareSettings`, défauts 7/14), une notification par échéance dépassée (dédoublonnage par
`type + link + createdAt ≥ échéance`, comme 051). Les rappels d'inactivité MSDP existants sur les
suivis `CONTACTED`/`IN_FORMATION` sont **conservés** (repris tels quels de `integration`).

**`services/intake.ts`** — `handleIntegrationSubmitted(tx, payload)` : crée, **une fois**, la demande
de rendez-vous (si soin pastoral) et le suivi de nouveau converti (si appel au salut), rattachés au
dossier de parcours. Idempotence garantie par les index uniques `sourceIntegrationRequestId` et
`requestId`.

**`auth.ts`** — gardes du module, sans approximation de rôle :

- `requireCareQualify(churchId)` → `care:qualify` (Super Admin, Admin, Référent soins pastoraux).
- `getCareAccess(session, churchId)` → `{ canQualify, canOverview (care:view : + Secrétaire),
  userId, ownProfileIds }` ; un accompagnant sans permission n'accède qu'aux demandes dont il est
  en charge.

**Événements** — `integration` déclare et émet `integration:request:submitted` `{ requestId,
churchId, firstName, lastName, phone, email, salvationCall, pastoralCare: { message } | null,
personJourneyId }` **dans la transaction** de la soumission publique (la route
`POST /api/integration/requests` est enveloppée dans `prisma.$transaction`). L'abonnement vit dans
`src/lib/registry.ts`, conditionné par `registry.has("care")` (« créer non » si `care` est
absent, spec 038), et délègue à `care.handleIntegrationSubmitted`.

**`integration`** perd : `msdp-service.ts`, les routes `/api/integration/msdp*`, la création directe
de `AppointmentRequest`, la section MSDP de ses statistiques, `runMsdpInactivityNotifications`
(repris par `care`). Il gagne : l'événement ci-dessus. Le formulaire d'accueil ne propose « soin
pastoral » que si `care` est actif.

**`agenda`** perd : `requireAgendaQualify`, la permission `agenda:qualify`, les routes de demandes.
Il garde les profils, le calendrier et la planification (orchestrée, voir API).

## UI / composants

- **`/care`** — accueil de l'espace : deux onglets **Rendez-vous** / **Nouveaux convertis**,
  filtres par état, bandeau « À relancer » (lot 3), badge « Rendu par l'accompagnant ». Un
  accompagnant sans permission n'y voit que « Mes demandes ».
- **`/care/requests/[id]`** et **`/care/followups/[id]`** — fiche : identité, état, accompagnant,
  actions contextuelles (`Modal`/`ConfirmModal`), message affiché seulement si `canReadContent`,
  frise d'historique (composant de la 051, généralisé et déplacé dans `src/components/`),
  encart « Autres demandes de la personne » (rapprochement).
- **Sélecteur d'accompagnant** — `Select` à deux `optgroup` : « Profils pastoraux » /
  « Membres du MSDP » ; mention « pas de compte : prévenu par email seulement » sur un profil non
  rattaché.
- **`/care/request`** — dépôt depuis son compte (ex-`/agenda/request`), sans jours.
- **`/care/parametres`** (lot 3) et **`/care/stats`** (lot 3).
- **Public** — `/agenda-public/[churchSlug]` conservé, déplacé dans `care`, sans le choix du jour.
- **`agenda`** — `/agenda/schedule` inchangé en apparence, alimenté par la projection de `care`.
- **`integration`** — la carte MSDP de `RequestDetail.tsx` devient un résumé (état, accompagnant,
  lien vers `/care/followups/[id]`, bouton « Démarrer un suivi » si aucun) ; même chose pour le
  rendez-vous pastoral lié.
- **Navigation** — section « Suivi pastoral » (lien `/care` si `care:qualify`, `care:view` ou
  accompagnant de demandes ouvertes) ; « Demande RDV pastoral » → `/care/request` ; tuile de
  `/requests/new` conditionnée par `registry.has("care")`.
- **Redirections** permanentes dans `next.config.ts` : `/agenda/requests` → `/care`,
  `/agenda/request` → `/care/request`.
- **Rôle** — libellé « Référent soins pastoraux » dans `AccessClient`, `UsersClient`,
  `GuideContent`, `tour-steps`.

## Décisions & alternatives écartées

- **Choix** : tables conservées, propriétaire changé — *Pourquoi* : ADR-0015 §5 ; renommer
  `appointment_requests`/`msdp_follow_ups` n'apporte rien au métier et alourdit une migration déjà
  délicate.
- **Choix** : deux colonnes d'affectation exclusives plutôt qu'une table d'affectation polymorphe
  — *Pourquoi* : deux populations seulement, figées par la spec ; des clés étrangères réelles vers
  `User` et `PastoralProfile` gardent l'intégrité. **Écarté** : colonne `assigneeKind` + identifiant
  sans clé étrangère.
- **Choix** : `subject` traité comme **confidentiel** au même titre que `message` — *Pourquoi* : le
  formulaire public y range les motifs cochés (« Maladie », « Oppressions »…). La spec prévoyait
  que le protocole voie « l'objet général » ; la projection affiche à la place un libellé neutre.
  Même raison pour le titre par défaut de l'entrée d'agenda créée par le protocole, qui reprenait
  `subject` : il devient « Rendez-vous pastoral — Prénom Nom ». **À valider** (écart de
  formulation avec la spec).
- **Choix** : événement émis **dans la transaction** de la soumission — *Pourquoi* : l'ADR-0015
  demandait que la création côté `care` ne fasse pas échouer la soumission. Mais une création
  différée qui échoue perd silencieusement un appel au salut, exactement ce que la spec veut
  empêcher ; une insertion simple dans la même transaction échoue rarement, et l'échec est visible
  (la personne renvoie le formulaire). L'ADR est mis à jour en ce sens.
- **Choix** : démarrage manuel d'un suivi conservé (équipe intégration, référent) — *Pourquoi* :
  #550 permet de démarrer un suivi sans appel au salut coché ; la création automatique s'y ajoute
  sans le remplacer.
- **Choix** : rappels d'inactivité MSDP conservés pour `CONTACTED`/`IN_FORMATION` — *Pourquoi* :
  les relances de la spec ne couvrent que « non confiée » et « confiée non planifiée » ; retirer
  les rappels existants serait une régression non demandée.
- **Choix** : rapprochement par dossier de parcours seulement quand le lien est certain (issu d'une
  demande d'accueil, ou d'une orientation) — **Écarté** : rapprochement automatique par téléphone
  ou email sur le formulaire public, source de faux rapprochements et d'exposition d'informations.
- **Choix** : `/agenda-public` conservé comme adresse publique — *Pourquoi* : lien diffusé (QR
  codes, messages). **Écarté** : nouvelle adresse publique avec redirection, qui casse les liens
  partagés dès qu'une instance désactive `agenda`.
- **Choix** : multi-PR en trois lots — *Pourquoi* : le lot 1 est un déplacement vérifiable par
  non-régression ; le mélanger au nouveau flux rendrait la revue illisible.

## Risques & points d'attention

- **Migration du rôle** : écrite à la main, à rejouer sur une copie de production avant
  déploiement ; la session des personnes concernées porte l'ancien rôle jusqu'à reconnexion
  (vérifier le rafraîchissement des rôles en session).
- **Rattrapage** : volume inconnu d'appels au salut sans suivi — compter en production avant
  déploiement (même démarche que la 051) ; les référents les voient arriver d'un coup.
- **Perte d'accès du protocole et de la Secrétaire au contenu** des demandes existantes : à
  annoncer aux équipes avant déploiement.
- **`lint:prisma-boundary`** : les routes supprimées (`agenda/requests*`, `integration/msdp*`)
  importaient Prisma ; les nouvelles passent par les services. Le seuil baisse : l'abaisser dans le
  même commit (le script échoue aussi quand le compteur descend).
- **Tests existants à déplacer** : `agenda/requests/__tests__` (sécurité, captcha),
  `integration/__tests__/msdp-service.test.ts`, `msdp/counselors` — réécrits contre `care`, sans
  perte de cas.
- **Matrice des permissions** : `permissions.test.ts`, tableau de `CLAUDE.md`, `docs/auth.md`
  mis à jour dans le commit qui change les manifestes.
- **Instance sans `care`** : formulaire d'accueil sans « soin pastoral », pas de création de
  suivi ; test dédié.

## Stratégie de tests

Unitaires Vitest, sans base, sur les fonctions pures ; migrations rejouées sur MariaDB locale.

- **Machines à états** : table complète des transitions de rendez-vous et de suivi, droits par
  action (référent, accompagnant en charge, accompagnant dessaisi, tiers), invariant d'affectation
  exclusive, retour au référent, les cinq issues.
- **Garde** : Super Admin, Admin et Référent passent `care:qualify` ; la Secrétaire a `care:view`
  sans `care:qualify` ; **un Ministre et un Resp. département n'ont aucun accès** (non-régression
  de la décision #583).
- **Projection** : message et objet visibles au référent et à l'accompagnant en charge, invisibles
  à la Secrétaire, au protocole et à un accompagnant dessaisi.
- **Relances** : échéances par état, dédoublonnage, sortie de relance après affectation ou date.
- **Intake** : un appel au salut crée un suivi, un soin pastoral une demande ; double émission →
  une seule création ; `care` absent → rien n'est créé.
- **Routes** : exhaustivité (`routes-exhaustivite.test.ts`), sécurité et captcha du formulaire
  public repris de `agenda`.
- **Migrations** : jeu de données local — rôle renommé, lien d'accueil repris, identité des suivis
  recopiée, rattrapage limité aux demandes non archivées sans suivi.
