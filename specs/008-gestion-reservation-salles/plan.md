# Plan technique — Gestion des salles et de leur réservation

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-07-26

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveau module `rooms`, autonome (`dependsOn: ["core"]`) ; le lien
      vers `Event` (module `planning`) est une relation Prisma au niveau schéma uniquement — aucun
      import TypeScript cross-module requis, donc pas de `optionalDependencies` nécessaire.
- [x] **Sécurité** : chaque route protégée par `requireAuth()`/`requireChurchPermission()` ;
      `churchId` toujours vérifié contre la propriété/l'autorisation de la salle.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`), déclarées dans le manifeste
      `roomsModule`.
- [x] **Validation** Zod sur toutes les routes de mutation.
- [x] **Migration** Prisma prévue (nouveaux modèles `Room`, `RoomAccess`, `RoomReservation`,
      `RoomChecklist`).
- [x] **Enums** importés depuis `@/generated/prisma/client`.
- [x] **UI** : réutilise `DataTable`, `Modal`, `Input`, `Select`, `Button` de `src/components/ui/`.

## Approche générale

Nouveau module `rooms`, autonome (comme `mrbs`, `accounting`…), qui gère : le référentiel des
salles et leur partage cross-église (liste blanche), les réservations (avec récurrence propre,
occurrence par occurrence), et la main courante (`RoomChecklist`) associée à chaque réservation.

Le lien optionnel `RoomReservation.eventId` référence `Event` (module `planning`) directement en
base — c'est une relation Prisma, pas un import de code, donc conforme aux frontières de modules
sans déclarer de dépendance.

L'accès « équipe dédiée » (validation de la main courante) réutilise le mécanisme déjà en place
pour Protocole/Production Média : appartenance à un département dont la `function` vaut
`SECURITE` ou `ENTRETIEN` (nouvelles entrées dans `DEPT_FN`/`SYSTEM_FUNCTIONS`), pas de nouveau
rôle global.

La déclaration d'ouverture/fermeture par l'utilisateur de la salle est **ownership-based** (comme
l'auto-déclaration d'absence) : quiconque est `createdById` de la réservation peut déclarer, sans
permission dédiée.

## Modèle de données

```prisma
model Room {
  id         String   @id @default(cuid())
  name       String
  churchId   String
  capacity   Int?
  location   String?
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())

  church       Church            @relation(fields: [churchId], references: [id])
  sharedWith   RoomAccess[]
  reservations RoomReservation[]

  @@map("rooms")
}

model RoomAccess {
  id       String @id @default(cuid())
  roomId   String
  churchId String  // église autorisée (autre que la propriétaire)

  room   Room   @relation(fields: [roomId], references: [id], onDelete: Cascade)
  church Church @relation(fields: [churchId], references: [id])

  @@unique([roomId, churchId])
  @@map("room_accesses")
}

enum RoomReservationStatus {
  CONFIRMED
  CANCELLED
}

model RoomReservation {
  id                 String                 @id @default(cuid())
  roomId             String
  churchId           String                 // église qui réserve
  eventId            String?
  title              String
  startAt            DateTime
  endAt              DateTime
  status             RoomReservationStatus  @default(CONFIRMED)
  recurrenceRule     String?                // "weekly" | "biweekly" | "monthly" — utilisé
                                             // seulement si non lié à un Event lui-même récurrent
  seriesId           String?
  isRecurrenceParent Boolean                @default(false)
  createdById        String
  createdAt          DateTime               @default(now())
  cancelledAt        DateTime?
  cancelledById      String?

  room        Room           @relation(fields: [roomId], references: [id])
  church      Church         @relation(fields: [churchId], references: [id])
  event       Event?         @relation(fields: [eventId], references: [id])
  createdBy   User           @relation("RoomReservationCreatedBy", fields: [createdById], references: [id])
  cancelledBy User?          @relation("RoomReservationCancelledBy", fields: [cancelledById], references: [id])
  checklist   RoomChecklist?

  @@index([roomId, startAt, endAt])
  @@index([churchId, startAt])
  @@map("room_reservations")
}

enum RoomChecklistStatus {
  PENDING
  OPENED
  CLOSED_DECLARED
  VALIDATED
  ISSUE_REPORTED
}

model RoomChecklist {
  id            String              @id @default(cuid())
  reservationId String              @unique
  status        RoomChecklistStatus @default(PENDING)

  openedById          String?
  openedAt            DateTime?
  keyReceivedFromId   String?
  keyReceivedFromName String?
  openingNotes        String?  @db.Text

  closedById          String?
  closedAt            DateTime?
  closedProperly      Boolean?
  cleaned             Boolean?
  keyReturnedToId     String?
  keyReturnedToName   String?
  closingNotes        String?  @db.Text

  validatedById            String?
  validatedAt              DateTime?
  validatedClosedProperly  Boolean?
  validatedCleaned         Boolean?
  incidentNotes            String?  @db.Text

  reservation     RoomReservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  openedBy        User? @relation("RoomChecklistOpenedBy", fields: [openedById], references: [id])
  keyReceivedFrom User? @relation("RoomChecklistKeyReceivedFrom", fields: [keyReceivedFromId], references: [id])
  closedBy        User? @relation("RoomChecklistClosedBy", fields: [closedById], references: [id])
  keyReturnedTo   User? @relation("RoomChecklistKeyReturnedTo", fields: [keyReturnedToId], references: [id])
  validatedBy     User? @relation("RoomChecklistValidatedBy", fields: [validatedById], references: [id])

  @@map("room_checklists")
}
```

Ajouts sur les modèles existants :
- `Church.rooms Room[]`, `Church.roomAccesses RoomAccess[]`, `Church.roomReservations RoomReservation[]`
- `Event.roomReservations RoomReservation[]`
- `User` : 7 relations nommées (`RoomReservationCreatedBy/CancelledBy`,
  `RoomChecklistOpenedBy/KeyReceivedFrom/ClosedBy/KeyReturnedTo/ValidatedBy`)

`src/lib/department-functions.ts` : ajout de `DEPT_FN.SECURITE` et `DEPT_FN.ENTRETIEN` +
entrées correspondantes dans `SYSTEM_FUNCTIONS` (l'admin des fonctions de département les
affichera automatiquement, aucun changement UI supplémentaire requis).

Migration : `npm run db:migrate` (nom suggéré `add_rooms`).

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/rooms` | GET | `rooms:view` | query `churchId` | salles possédées + partagées avec cette église |
| `/api/rooms` | POST | `rooms:manage` | `{churchId, name, capacity?, location?}` | `201` |
| `/api/rooms/[id]` | PATCH | `rooms:manage` | `{name?, capacity?, location?, isActive?}` | salle mise à jour |
| `/api/rooms/[id]/access` | GET/POST/DELETE | `rooms:manage` | `{churchId}` (POST/DELETE) | liste/maj `RoomAccess` |
| `/api/room-reservations` | GET | `rooms:view` | query `churchId`, `roomId?`, `from?`, `to?` | réservations + disponibilité |
| `/api/room-reservations` | POST | `rooms:reserve` | `{churchId, roomId, eventId?, title, startAt, endAt, recurrenceRule?, recurrenceEnd?}` | `201` (ou `409` si conflit) |
| `/api/room-reservations/[id]` | PATCH | créateur ou `rooms:manage` | `{action:"cancel", scope:"occurrence"\|"series"}` | annulation |
| `/api/room-reservations/[id]/checklist` | PATCH | créateur de la réservation (ownership) | `{phase:"open"\|"close", ...}` | checklist mise à jour |
| `/api/room-reservations/[id]/checklist/validate` | PATCH | équipe dédiée (fonction SECURITE/ENTRETIEN) ou `rooms:manage` | `{closedProperly, cleaned, incidentNotes?}` | checklist `VALIDATED`/`ISSUE_REPORTED` |

Schémas Zod : `startAt`/`endAt` en `z.string().datetime()` avec `.refine(endAt > startAt)` ;
`recurrenceRule` en `z.enum(["weekly","biweekly","monthly"]).optional()`, exigé avec
`recurrenceEnd` si présent (même validation que les événements récurrents existants).

## Services / logique métier

`src/modules/rooms/services/reservation.service.ts` :
- `checkRoomAvailability(roomId, startAt, endAt, excludeReservationId?)` — chevauchement sur
  `RoomReservation` `status: CONFIRMED` du même `roomId`, **peu importe la `churchId`**.
- `createReservation(params)` :
  - Vérifie que `churchId` est propriétaire de la salle ou dans `RoomAccess`.
  - Si `recurrenceRule` + `recurrenceEnd` fournis (et pas de lien à un `Event` déjà récurrent) :
    génère les dates d'occurrence (logique dupliquée, volontairement, de
    `generateRecurrenceDates`/`MAX_RECURRENCE_OCCURRENCES` de
    `src/modules/planning/services/request-executor.ts` — cf. Décisions).
  - Si lié à un `Event` récurrent (`isRecurrenceParent`/`seriesId` sur l'`Event`) : une
    `RoomReservation` par occurrence d'`Event` de la série (interroge les `Event` enfants).
  - Pour **chaque occurrence**, dans une transaction : re-vérifie la disponibilité (protège contre
    une réservation concurrente créée entre la vérification initiale et l'écriture), crée la
    `RoomReservation` + une `RoomChecklist` vide (`PENDING`) ; si une occurrence est en conflit,
    elle est simplement omise (pas d'échec de tout le lot) et signalée dans la réponse.
- `cancelReservation(id, cancelledById, scope)` — `scope: "occurrence"` annule une seule ligne,
  `scope: "series"` annule toutes les `RoomReservation` du même `seriesId` non déjà passées.

`src/modules/rooms/services/checklist.service.ts` :
- `declareOpening(reservationId, userId, { keyReceivedFromId?, keyReceivedFromName?, notes? })` —
  autorisé uniquement si `userId === reservation.createdById` ; statut → `OPENED`.
- `declareClosing(reservationId, userId, { closedProperly, cleaned, keyReturnedToId?, keyReturnedToName?, notes? })` —
  même contrainte d'ownership ; statut → `CLOSED_DECLARED`.
- `validateChecklist(reservationId, validatorId, { validatedClosedProperly, validatedCleaned, incidentNotes? })` —
  statut → `VALIDATED` si les valeurs concordent avec la déclaration, `ISSUE_REPORTED` sinon (ou
  si `incidentNotes` est renseigné) ; notifie le créateur de la réservation en cas d'écart.

Aucun événement de bus nécessaire : le module `rooms` est autonome et rien d'autre n'a besoin de
réagir à ses écritures pour l'instant.

## UI / composants

- `src/app/(auth)/admin/rooms/` — CRUD salles + gestion de `RoomAccess` (Admin/Super Admin),
  pattern `DataTable`/`Modal` identique à `admin/departments`.
- `src/app/(auth)/rooms/` — recherche de disponibilité + réservation (STAR/Resp./Ministre),
  historique de mes réservations, déclaration ouverture/fermeture sur mes réservations.
- `src/app/(auth)/rooms/checklists/` — file d'attente de contrôle pour l'équipe dédiée
  (réservations `OPENED`/`CLOSED_DECLARED` non validées), visible via le même pattern
  `isMemberOf("SECURITE") || isMemberOf("ENTRETIEN")` déjà utilisé pour Protocole/Production Média
  dans `src/app/(auth)/layout.tsx`.
- Navigation : nouvelle entrée « Salles » (Sidebar + MobileNavSheet), visible dès `rooms:view` ou
  appartenance à un département Sécurité/Entretien.

## Décisions & alternatives écartées

- **Choix** : module `rooms` autonome plutôt que sous-domaine de `planning` — *Pourquoi* : domaine
  fonctionnellement distinct (ressource physique cross-tenant, permissions propres) ; le lien à
  `Event` est une relation Prisma, pas un besoin d'import de code, donc aucune dépendance de
  module n'est requise (contrairement aux Absences, couplées à `Planning`/`Member` en continu).
- **Choix** : dupliquer la logique de génération de dates récurrentes plutôt que l'exporter depuis
  `planning` — *Pourquoi* : fonction pure de ~15 lignes, non exportée publiquement aujourd'hui ;
  créer une dépendance de module pour ça serait disproportionné. *Risque accepté* : un bugfix sur
  la récurrence devra être répliqué des deux côtés si besoin (signalé en Risques).
- **Choix** : déclaration ouverture/fermeture par ownership (`createdById`), pas de permission
  dédiée — *Pourquoi* : cohérent avec le pattern d'auto-déclaration déjà utilisé pour les absences.
- **Choix** : équipe de contrôle via fonction de département (`SECURITE`/`ENTRETIEN`) plutôt que
  nouveau rôle — *Pourquoi* : évite d'étendre l'enum `Role` pour un besoin fonctionnel, cohérent
  avec Protocole/Production Média.
- **Écarté** : verrou/contrainte SQL d'exclusion de plage (`EXCLUDE` PostgreSQL-like) pour empêcher
  tout chevauchement au niveau base — *Raison* : MariaDB ne supporte pas nativement les contraintes
  d'exclusion de plage ; on mitigue via re-vérification en transaction (cf. Risques), acceptable
  au volume attendu (réservations de salles, pas un système de réservation à très haute
  concurrence).
- **Reporté** : mécanisme d'import des réservations MRBS existantes — nécessite d'abord de savoir
  comment accéder aux données MRBS (base séparée ? export ?). Non bloquant pour livrer le module ;
  à traiter comme tâche de migration one-shot séparée une fois l'accès aux données confirmé.

## Risques & points d'attention

- **Concurrence sur la disponibilité** : deux requêtes quasi simultanées pour le même créneau
  pourraient toutes deux passer la vérification avant qu'aucune n'ait écrit. Mitigé par une
  re-vérification à l'intérieur de la transaction Prisma au moment de l'écriture (best-effort,
  pas une garantie absolue faute de contrainte SQL native — à documenter comme limite connue,
  comme le fait déjà `src/lib/rate-limit.ts` pour sa propre limitation).
- **Duplication de la logique de récurrence** avec `planning` — voir Décisions.
- **Volume de relations nommées sur `User`** (7 nouvelles) — cohérent avec l'existant
  (`MemberUserLink`, `Absence` en ont déjà plusieurs), mais à surveiller si le modèle grossit encore.
- **Import MRBS** : dépend d'un accès aux données externes non encore confirmé — à ne pas
  bloquer la livraison du module sur ce point.

## Stratégie de tests

Tests unitaires (Vitest) `src/modules/rooms/services/reservation.service.test.ts` :
- Détection de conflit cross-tenant (deux églises différentes, même salle, créneaux qui se
  chevauchent → refus) et non-conflit (créneaux disjoints, ou salles différentes → autorisé).
- Refus si l'église n'est ni propriétaire ni dans `RoomAccess` de la salle.
- Récurrence : occurrences indépendantes (une occurrence en conflit n'empêche pas les autres),
  annulation `occurrence` vs `series`.

Tests unitaires `src/modules/rooms/services/checklist.service.test.ts` :
- Déclaration ouverture/fermeture refusée si l'appelant n'est pas le créateur de la réservation.
- Remise de clés à une personne sans compte (nom libre) acceptée.
- Validation : concordance → `VALIDATED` ; écart → `ISSUE_REPORTED` + notification du créateur.
- Réservation passée sans déclaration → identifiable (statut `PENDING` après la date de fin).

Tests d'intégration légers sur les routes (`src/app/api/rooms/**/__tests__/security.test.ts`) :
codes 401/403/404/201/409 selon rôle/permission/ownership, pattern identique aux tests
`security.test.ts` déjà en place (ex. `absences`, `requests`).
