# Plan technique — Collecte des disponibilités et disponibilités dans la grille

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-10-02
- **ADR** : [ADR-0020](../../docs/adr/0020-disponibilite-derivee-absence-indisponible.md) — fusion
  de l'absence et du statut `INDISPONIBLE` (revient sur la spec 050, § Statuts de service)

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout vit dans le module `planning` (absences, planning, événements
  y sont déjà) ; `src/app/` n'importe que `@/modules/planning`. Aucune dépendance inter-modules
  nouvelle.
- [x] **Sécurité** : chaque route passe par `requireAuth` puis `requireChurchPermission(perm,
  churchId)` sur l'église **résolue de l'objet** (`resolveChurchId("event", …)`, église du membre),
  plus `requireDepartmentAccess` dès qu'un `departmentId` est adressé ; le cron reste derrière
  `authorizeCron`.
- [x] **Permissions** via `rolePermissions` : nouvelle `availability:settings` déclarée dans le
  manifeste `planning` ; réutilisation de `absences:view`/`absences:manage` pour le reste.
- [x] **Validation** Zod sur toutes les mutations (réponses, réglages, demande ponctuelle, relance).
- [x] **Migration** Prisma : nouvelles tables + reprise de données en SQL dans la même migration
  (rejouée par le job CI `migrations`).
- [x] **Enums** depuis `@/generated/prisma/client` (`AvailabilityAnswer`, `AvailabilityAskReason`).
- [x] **UI** : `StatusChip`, `Tabs`, `Modal`/`BottomSheet`, `Alert`, `Field`, `Button`,
  `EmptyState`, `useToast` ; segmenté trois choix construit comme `StatusSegments` de la grille.

## Approche générale

La disponibilité devient une **donnée dérivée**, calculée pour un triplet (STAR, événement,
département) à partir de trois sources, dans cet ordre :

1. une **réponse** explicite à l'événement (`Disponible` / `Si besoin` / `Pas disponible`) ;
2. à défaut, une **période d'indisponibilité** qui couvre l'événement — l'actuelle absence
   `PERIOD`, conservée telle quelle (ciblage départements, backups, frise, export) et renommée
   dans l'interface ;
3. à défaut, **« Sans réponse »** si la disponibilité a été **demandée** (collecte du mois ouverte,
   ou demande ciblée sur l'événement × département), « en retard » — donc indisponible — une fois
   l'échéance passée ; sinon **« Non demandée »** (aucune pastille).

Le statut de service `INDISPONIBLE` n'est plus posé à la main : la grille affiche la pastille de
disponibilité, et un STAR indisponible n'est simplement pas planifié. L'absence « par événements »
(spec 050, `kind = EVENTS`) disparaît au profit des réponses. Tout le cycle automatique (ouverture,
notifications des demandes, relances) est porté par une tâche ajoutée à l'orchestrateur horaire
`POST /api/cron`, idempotente par horodatages.

## Modèle de données

```prisma
enum AvailabilityAnswer {
  AVAILABLE
  IF_NEEDED
  UNAVAILABLE
}

enum AvailabilityAskReason {
  EVENT_ADDED    // département ajouté à un événement d'une collecte déjà ouverte
  EVENT_MOVED    // date de l'événement modifiée : réponses remises à zéro
  LEADER         // demande ponctuelle d'un responsable
}

/// Réglages de collecte par église (spec 058). Absence de ligne = valeurs par défaut,
/// collecte active (décision 2026-10-02).
model AvailabilitySettings {
  id                 String   @id @default(cuid())
  churchId           String   @unique
  enabled            Boolean  @default(true)
  openMonthsBefore   Int      @default(2)   // ouverture M-2
  closeDaysBefore    Int      @default(7)   // clôture J-7 avant le 1er événement du mois
  relanceDaysBefore  Int      @default(3)   // relance J-3 avant l'échéance
  church             Church   @relation(fields: [churchId], references: [id])
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@map("availability_settings")
}

/// Collecte d'un mois cible. La date de clôture est figée à l'ouverture : modifier la
/// fenêtre ne la recalcule pas (décision 2026-10-02).
model AvailabilityCollection {
  id             String    @id @default(cuid())
  churchId       String
  month          DateTime  @db.Date        // 1er jour du mois cible
  openedAt       DateTime  @default(now())
  closesAt       DateTime
  notifiedAt     DateTime?                 // notification d'ouverture envoyée
  relanceSentAt  DateTime?
  church         Church    @relation(fields: [churchId], references: [id])
  @@unique([churchId, month])
  @@map("availability_collections")
}

/// Réponse d'un STAR pour un événement et UN département. « Tous mes départements » est
/// déplié à l'écriture sur les départements du STAR qui servent l'événement.
model AvailabilityResponse {
  id            String             @id @default(cuid())
  churchId      String
  memberId      String
  eventId       String
  departmentId  String
  answer        AvailabilityAnswer
  enteredById   String?            // null = reprise de l'existant ; ≠ compte lié = saisie par un tiers
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  member        Member     @relation(fields: [memberId], references: [id], onDelete: Cascade)
  event         Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  department    Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  enteredBy     User?      @relation("AvailabilityEnteredBy", fields: [enteredById], references: [id], onDelete: SetNull)
  @@unique([memberId, eventId, departmentId])
  @@index([eventId, departmentId])
  @@map("availability_responses")
}

/// Demande ciblée sur un événement × département (hors ou en complément de la collecte).
model AvailabilityAsk {
  id                 String                @id @default(cuid())
  churchId           String
  eventId            String
  departmentId       String
  reason             AvailabilityAskReason
  dueAt              DateTime
  createdById        String?
  notifiedAt         DateTime?             // null = notification à envoyer par le cron
  relanceSentAt      DateTime?
  manualRelanceAt    DateTime?             // relance manuelle : une par jour au plus
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt
  event              Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  department         Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  @@unique([eventId, departmentId])
  @@map("availability_asks")
}

/// Garantit « jamais deux relances pour le même événement le même jour » (spec 058).
model AvailabilityReminderLog {
  id        String   @id @default(cuid())
  memberId  String
  eventId   String
  sentOn    DateTime @db.Date
  @@unique([memberId, eventId, sentOn])
  @@map("availability_reminder_logs")
}
```

Relations inverses ajoutées sur `Church`, `Member`, `Event`, `Department`, `User`.

**Migration `add_availability_collection`** (une seule, schéma + reprise en SQL) :

1. création des tables ci-dessus ;
2. **absences `EVENTS` actives** → une réponse `UNAVAILABLE` par événement ciblé encore existant
   × département (tous les départements du membre qui servent l'événement si
   `allDepartments`, sinon l'intersection avec les départements ciblés), `enteredById =
   createdById` ; puis suppression de ces absences (cascade sur `absence_events`,
   `absence_departments`, `absence_backups`). Les absences `EVENTS` annulées sont supprimées
   aussi : elles n'avaient plus d'effet, le journal d'audit en garde la trace ;
3. **plannings `INDISPONIBLE`** → réponse `UNAVAILABLE` (membre, événement, département),
   `enteredById = NULL` (« reprise »), `INSERT IGNORE` si une réponse existe déjà ; puis
   suppression de ces lignes de planning (décision : le STAR sort du planning) ;
4. aucune ligne `availability_settings` créée : l'absence de ligne vaut « collecte active,
   fenêtre par défaut ».

La valeur `INDISPONIBLE` reste dans l'enum `ServiceStatus` (historique, statistiques, exports
déjà calculés) mais n'est plus acceptée en écriture (voir API) ; `AbsenceKind.EVENTS` reste dans
l'enum, n'est plus créable. Nettoyage des deux valeurs : chantier ultérieur (ADR-0020).

## API

| Endpoint | Méthode | Permission | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/availability` | GET | soi : `requireAuth` + membre lié ; autre : `absences:manage` + périmètre | `?churchId&memberId?&month=YYYY-MM` | `{ member, months[], events: [{ id, title, date, departments: [{ id, name, state, answer, enteredBy, period? }] , dueAt }] }` |
| `/api/availability` | PUT | idem | `{ churchId, memberId, answers: [{ eventId, answer, departmentIds?: string[] }] }` (≤ 200) | `{ updated, alerts }` |
| `/api/availability/settings` | GET | `availability:settings` | `?churchId` | réglages (défauts si absents) |
| `/api/availability/settings` | PUT | `availability:settings` | `{ churchId, enabled, openMonthsBefore 1–6, closeDaysBefore 1–30, relanceDaysBefore 1–14 }` (`relance < fenêtre`) | réglages |
| `/api/events/[eventId]/departments/[deptId]/availability` | POST | `absences:manage` + `requireDepartmentAccess` | `{ action: "ask" \| "relance" }` | `{ notified }` ; `409` si une relance a déjà été faite aujourd'hui |
| `/api/events/[eventId]/departments/[deptId]/planning` | GET (modifié) | inchangée | — | + par membre `availability: { state, answer, overdue, source, enteredByThirdParty }`, `busyElsewhere: [{ departmentName }]` ; + `counts: { available, ifNeeded, noResponse, unavailable }`, `canAskTeam`, `manualRelanceAvailable` |
| `/api/events/[eventId]/departments/[deptId]/planning` | PUT (modifié) | inchangée | statut `INDISPONIBLE` refusé (`z.enum` sans lui) | inchangé |
| `/api/absences` POST / `[id]` PATCH | modifiés | inchangées | `kind` limité à `PERIOD` | inchangé |

- Le `churchId` d'un membre est vérifié contre celui de la requête ; l'église d'un événement est
  résolue par `resolveChurchId("event", eventId)` — jamais celle de l'affichage.
- PUT `/api/availability` refuse (`400`) un `departmentIds` hors des départements du membre qui
  servent l'événement, plutôt que de l'ignorer, pour ne pas masquer une erreur d'interface ; un
  événement passé ou d'une autre église → `400`.
- Écriture par un tiers : `logAudit` (`entityType: "AvailabilityResponse"`, `details: { memberId,
  eventId, answer }`).
- Routes déclarées dans le manifeste `planning` (`/disponibilites` en `authenticated`,
  `/api/availability` en `api` ; `/api/events` déjà couvert).

## Services / logique métier

Dans `src/modules/planning/services/availability/` :

- **`settings.ts`** — `DEFAULT_AVAILABILITY_SETTINGS`, `getAvailabilitySettings(churchId)`,
  `updateAvailabilitySettings(churchId, data)` (même pattern que `care/services/settings.ts`).
- **`state.ts`** (pur, sans BDD — cœur testé) —
  `resolveAvailability({ response?, period?, asked, dueAt?, now }) → { state, overdue, source }`
  avec `state ∈ AVAILABLE | IF_NEEDED | UNAVAILABLE | NO_RESPONSE | NOT_ASKED` ;
  `collectionWindow(settings, month, firstEventDate) → { opensAt, closesAt, relanceAt }` ;
  `askDueAt({ eventDate, collection?, now })` (clôture de la collecte si l'événement en fait
  partie et qu'elle n'est pas passée, sinon J-7 de l'événement, au plus tôt maintenant) ;
  `shouldRelance(dueAt, relanceDaysBefore, now)`.
- **`responses.ts`** — `listMemberAvailability(memberId, churchId, month)` (événements du mois où
  un département du membre sert, hors parents de récurrence, avec état par département) ;
  `saveResponses({ memberId, churchId, answers, actorId })` (transaction : dépliage « tous mes
  départements », upsert, puis **alerte au responsable** — `resolveResponsibleUserIds(memberId,
  churchId, tx, [deptId])` existant — pour chaque passage à `UNAVAILABLE` d'un STAR planifié
  `EN_SERVICE`/`EN_SERVICE_DEBRIEF`/`REMPLACANT` sur ce département ; notification envoyée après
  commit) ; `getPlanningAvailability(eventId, departmentId, memberIds)` pour la grille, qui
  calcule aussi `busyElsewhere` (plannings `EN_SERVICE*` du même membre dans un autre département
  le même jour).
- **`asks.ts`** — `createAsks(tx, { eventId, departmentIds, reason, createdById? })` (upsert sur
  `(eventId, departmentId)`, `notifiedAt = null`, `dueAt` recalculé) ; `askTeam(...)` et
  `manualRelance(...)` pour la route du responsable (envoi immédiat, `manualRelanceAt` contrôlé
  au jour près).
- **`collection.ts`** — `runAvailabilityTasks(now)` appelée par le cron, par église active :
  1. **ouvrir** les mois cibles dont `opensAt ≤ now` et sans collecte, uniquement si le mois a au
     moins un événement et si `closesAt` laisse **au moins 7 jours** (pas de collecte éclair au
     déploiement ni pour un mois déjà entamé) ;
  2. **notifier** l'ouverture (`notifiedAt`), un message par STAR lié concerné ;
  3. **notifier les demandes ciblées** en attente (`notifiedAt IS NULL`), **regroupées par STAR**
     (une série récurrente = une notification) ;
  4. **relancer** collectes et demandes dont la date de relance est atteinte (`relanceSentAt`),
     uniquement les STAR ayant au moins un « Sans réponse », dédoublonné par
     `AvailabilityReminderLog` (`createMany` + `skipDuplicates`, envoi aux seules lignes nouvelles),
     un message groupé par STAR.
  La « clôture » n'est pas une action : l'état `overdue` se déduit de `closesAt`/`dueAt`.
- **Période** (`absence.service.ts`, modifié) — à la création/modification d'une période,
  suppression des réponses des événements couverts (mêmes départements) pour que la période
  s'applique : « Pas disponible du … au … » l'emporte sur un « Disponible » antérieur ; une
  réponse donnée **après** reste prioritaire.

**Bus** (`events.ts`) : deux événements ajoutés, émis dans les transactions existantes —
`planning:event:rescheduled` (`{ eventId, churchId, previousDate, date }`, depuis `PUT
/api/events/[eventId]` y compris `applyToSeries`, le PATCH groupé et `MODIFICATION_EVENEMENT` du
`request-executor`) et `planning:event:departments:added` (`{ eventId, churchId, departmentIds }`,
depuis `POST /api/events/[eventId]/departments`). Avec `planning:event:created` (déjà émis), un
abonné du module `planning` :
- événement créé / département ajouté → `createAsks(EVENT_ADDED)` si la collecte du mois est déjà
  ouverte (sinon la collecte s'en chargera) ;
- événement déplacé → suppression des réponses de l'événement, puis `createAsks(EVENT_MOVED)` pour
  ses départements si la collecte du **nouveau** mois est ouverte ou si une demande existait.
Les abonnés n'écrivent que des lignes (`notifiedAt = null`) : l'envoi, hors transaction et avec
email, passe par le cron (délai ≤ 1 h, accepté).

**Notifications** (domaine `planning`, préférences spec 053 appliquées par les helpers) :
`AVAILABILITY_COLLECTION_OPENED`, `AVAILABILITY_ASKED`, `AVAILABILITY_RELANCE`,
`AVAILABILITY_PLANNED_UNAVAILABLE` (au responsable) — liens `/disponibilites?month=…` ou
`/dashboard?event=…` ; `entityType`/`entityId` renseignés (spec 057).

**Permissions** (manifeste `planning`) : `availability:settings` → `SUPER_ADMIN`, `ADMIN`,
`SECRETARY` (l'équipe Secrétariat l'obtient par le rôle `SECRETARY` virtuel, ADR-0014). Matrice
figée, `CLAUDE.md`, `docs/auth.md` mis à jour dans le même commit.

**Cron** : `runAvailabilityTasks` ajoutée au `Promise.all` de `src/app/api/cron/route.ts`, sans
garde `registry.has` (module `planning` toujours actif, comme `runReminders`).

## UI / composants

- **`/disponibilites`** (nouvelle page, serveur + client) — « Mes disponibilités » :
  - onglets par mois (`Tabs`) : mois des collectes ouvertes + mois en cours, échéance affichée
    (« À renseigner avant le 24 novembre ») ;
  - une carte par événement : titre, date, segmenté **Disponible / Si besoin / Pas disponible**
    (même construction que `StatusSegments`), état « Sans réponse » visible ; lien « Préciser par
    département » qui déplie une ligne par département (affiché seulement si le STAR en a
    plusieurs qui servent l'événement) ;
  - bouton **« Pas disponible du … au … »** → formulaire de période existant (extrait
    d'`AbsencesClient`), avec « Qui me remplace ? » pour un responsable (backup spec 013) ;
  - pour `absences:manage` : sélecteur « Répondre pour… » (membres du périmètre), mention
    « Saisi par X » sur les réponses d'un tiers ;
  - `?event=<id>` ouvre le bon mois et met l'événement en évidence (lien « Je ne peux pas »).
  - Mobile d'abord : cartes empilées, segmenté pleine largeur, formulaires en `BottomSheet`.
- **`/disponibilites/parametres`** (`availability:settings`) — activation et trois délais, sur le
  modèle de `/care/parametres`.
- **`/absences`** devient **« Indisponibilités »** : la vue d'ensemble, la frise et l'export sont
  conservés (périodes + réponses `Pas disponible`) ; la section « Mes absences » et le formulaire
  de déclaration partent vers `/disponibilites`. Le choix « Des événements précis » disparaît.
- **`PlanningGrid`** :
  - pastille `StatusChip` par membre (Disponible / Si besoin / Pas disponible / Sans réponse ;
    « en retard » si l'échéance est passée), remplace `AbsenceBadge` ;
  - tri : disponibles, si besoin, sans réponse, pas disponibles ;
  - mention « De service en <département> » si `busyElsewhere` ;
  - placer un indisponible : le segment reste cliquable, une `Alert` d'avertissement s'affiche
    sur la ligne avec la raison (« a répondu Pas disponible » / « n'a pas répondu ») ;
  - bouton `INDISPONIBLE` retiré des segments ;
  - en-tête : compteur `N disponibles · M si besoin · K sans réponse`, boutons **« Interroger
    l'équipe »** et **« Relancer les sans-réponse »** (désactivé si déjà fait aujourd'hui).
- **`MyPlanningView`** : « Je ne peux pas » → `/disponibilites?event=<id>`.
- **Navigation** (`navigation.ts`, `hasAbsences`) : entrée « Disponibilités » pour tout membre
  d'un département ; « Indisponibilités » (vue d'ensemble) pour `absences:view`.
- **Guide** (`GuideContent.tsx`) et `docs/processus/absences.md` réécrits.

## Décisions & alternatives écartées

- **Choix** : réponse stockée **par département** (dépliage à l'écriture) — *Pourquoi* : la
  grille interroge (événement, département) directement ; le ciblage devient le cas général
  sans table de surcharge. Un département ajouté plus tard au STAR apparaît « Sans réponse »,
  comme le veut la spec.
- **Choix** : **conserver le modèle d'absence pour les périodes** — *Pourquoi* : backup, frise,
  export et règles de verrouillage déjà en place et testés ; une période couvre aussi les
  événements créés après coup, ce qu'une réponse par événement ne sait pas faire.
- **Choix** : disponibilité **dérivée, jamais stockée** comme statut de planning — *Pourquoi* :
  une seule source de vérité ; c'est l'objet de l'ADR-0020.
- **Choix** : notifications de demandes ciblées **différées au cron** — *Pourquoi* : les abonnés
  du bus tournent dans la transaction de l'émetteur, où l'email n'est pas envoyé ; le cron
  regroupe par STAR (une série d'événements = un message).
- **Choix** : nouvelle permission `availability:settings` plutôt qu'emprunter `events:manage` —
  *Pourquoi* : même détenteurs aujourd'hui, mais pas d'approximation d'un droit par un autre
  (décision #583).
- **Écarté** : supprimer la valeur `INDISPONIBLE` de l'enum dans cette migration — *Raison* :
  statistiques et exports historiques s'y réfèrent ; refus en écriture suffisant pour ce lot.
- **Écarté** : utiliser `ModuleDescriptor.jobs` — *Raison* : jamais branché ; l'orchestrateur
  `/api/cron` est le mécanisme effectif (care, intégration).
- **Écarté** : un compteur « au regard du besoin » — *Raison* : aucune notion d'effectif requis
  n'existe par département/événement ; le compteur affiche disponibles / si besoin / sans
  réponse. **Écart à la spec** (scénario « composer le planning », point 2) à valider.

## Risques & points d'attention

- **Reprise SQL** : la conversion des absences `EVENTS` et des plannings `INDISPONIBLE` doit être
  rejouée sur une copie de la base de recette avant la production ; compter les lignes avant/après.
- **Premier passage du cron au déploiement** : sans la garde « clôture ≥ 7 jours », le mois
  suivant ouvrirait une collecte presque close et marquerait tout le monde « en retard ». Avec la
  garde, octobre et probablement novembre restent « Non demandés ».
- **Volume de notifications** : une église de 150 STAR reçoit ~150 notifications à l'ouverture,
  ~N relances ; l'envoi email passe par `dispatchUserEmails` (erreurs SMTP avalées).
- **Écrans touchés nombreux** (`AbsencesClient` ~36 K) : extraire le formulaire de période plutôt
  que le dupliquer.
- **STAR sans compte lié** : jamais notifiés ; leur réponse est saisie par un responsable.
- Hors lot : l'avertissement d'absence de l'ouverture/fermeture (spec 041,
  `findActiveAbsenceForMember`) continue de ne lire que les périodes.

## Stratégie de tests

- **`state.ts`** (pur, exhaustif) : précédence réponse > période > demandé/non demandé ; `overdue`
  après échéance ; fenêtre (M-2, J-7, mois sans événement, garde 7 jours) ; `askDueAt` (collecte
  ouverte / passée / événement proche) ; `shouldRelance` (échéance trop proche).
- **`responses.ts`** : dépliage « tous mes départements », ciblage, refus d'un département non
  servant, alerte au responsable seulement si planifié, `enteredById` d'un tiers.
- **`collection.ts`** : ouverture idempotente (deux passages = une collecte, une notification),
  église désactivée ignorée, relance aux seuls « Sans réponse », dédoublonnage jour/événement,
  regroupement par STAR des demandes ciblées.
- **Abonnés du bus** : événement créé/département ajouté avec et sans collecte ouverte ;
  événement déplacé → réponses supprimées + demande.
- **Routes** : `availability` GET/PUT (soi, tiers dans/hors périmètre, autre église → 403),
  `settings` (Secrétaire/Admin 200, Resp. département 403), `ask`/`relance` (périmètre, relance
  bis du jour → 409), planning GET (pastilles, compteurs, `busyElsewhere`), planning PUT refuse
  `INDISPONIBLE`, absences POST refuse `EVENTS`.
- **Matrices** : `permissions.test.ts`, `manifests.test.ts`, `route-exhaustiveness.test.ts`,
  `navigation.test.ts` mis à jour ; tests absences existants adaptés (`EVENTS`).
- **Cron** : `cron-modules.test.ts` couvre l'appel de `runAvailabilityTasks`.
- **Migration** : job CI `migrations` (base vierge) + vérification manuelle de la reprise sur un
  jeu de dev contenant absences `EVENTS` et plannings `INDISPONIBLE`.
