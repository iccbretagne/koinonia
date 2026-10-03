# Tâches — Gestion des salles et de leur réservation

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé — écarts : manifeste enregistré dans `src/lib/manifests.ts`, tests de routes dans `src/app/api/room-reservations/__tests__/`

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/gestion-reservation-salles`
- [x] Migration Prisma générée (T3)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter les enums `RoomReservationStatus`/`RoomChecklistStatus`, les modèles
      `Room`, `RoomAccess`, `RoomReservation`, `RoomChecklist`, et les relations inverses
      (`Church.rooms/roomAccesses/roomReservations`, `Event.roomReservations`, 7 relations
      nommées sur `User`) *(fichier : `prisma/schema.prisma`)*
- [x] **T2** [P] — Ajouter `DEPT_FN.SECURITE` et `DEPT_FN.ENTRETIEN`
      *(fichier : `src/lib/department-functions.ts`)*
      > ⚠️ `SYSTEM_FUNCTIONS` (liste de libellés/descriptions) a été supprimée depuis la
      > rédaction de cette spec : elle n'avait aucun consommateur. `DEPT_FN.SECURITE` et
      > `DEPT_FN.ENTRETIEN` **existent déjà** dans le fichier. Si l'écran d'admin des fonctions
      > de département a besoin de libellés, il faudra les réintroduire là où ils sont
      > effectivement affichés.
- [x] **T3** — Générer et vérifier la migration (`npm run db:migrate` — nom `add_rooms`) ;
      contrôler le SQL généré *(fichier : `prisma/migrations/…`)*

### 2. Module & logique métier

- [x] **T4** — Implémenter `checkRoomAvailability(roomId, startAt, endAt, excludeReservationId?)`
      (chevauchement `RoomReservation` `status: CONFIRMED` du même `roomId`, tous les `churchId`
      confondus) et une fonction de génération de dates récurrentes (dupliquée volontairement de
      `request-executor.ts`, cf. `plan.md` § Décisions) *(fichier :
      `src/modules/rooms/services/reservation.service.ts`)*
- [x] **T5** — Implémenter `createReservation(params)` : vérification propriété/`RoomAccess`,
      expansion des occurrences (récurrence propre ou alignée sur un `Event` récurrent),
      re-vérification de disponibilité en transaction par occurrence, création de la
      `RoomReservation` + `RoomChecklist` vide (`PENDING`) *(même fichier que T4)*
- [x] **T6** — Implémenter `cancelReservation(id, cancelledById, scope)` (`"occurrence"` ou
      `"series"`) *(même fichier que T4)*
- [x] **T7** — Implémenter `declareOpening`/`declareClosing` (autorisation par ownership sur
      `reservation.createdById`, remise de clés à une personne sans compte via `...Name`)
      *(fichier : `src/modules/rooms/services/checklist.service.ts`)*
- [x] **T8** — Implémenter `validateChecklist` (statut `VALIDATED`/`ISSUE_REPORTED` selon
      concordance avec la déclaration, notification du créateur en cas d'écart) *(même fichier
      que T7)*
- [x] **T9** — Créer le manifeste du module : permissions `rooms:view`
      (`SUPER_ADMIN,ADMIN,SECRETARY,MINISTER,DEPARTMENT_HEAD,STAR`), `rooms:reserve`
      (`SUPER_ADMIN,ADMIN,MINISTER,DEPARTMENT_HEAD,STAR`), `rooms:manage`
      (`SUPER_ADMIN,ADMIN`) ; exports publics des services *(fichier :
      `src/modules/rooms/index.ts`)*
- [x] **T10** — Enregistrer `roomsModule` dans le registry *(fichier : `src/lib/registry.ts`)*

### 3. API (route handlers)

- [x] **T11** — `GET /api/rooms` (salles possédées + partagées avec l'église) et
      `POST /api/rooms` (`rooms:manage`) *(fichier : `src/app/api/rooms/route.ts`)*
- [x] **T12** [P] — `PATCH /api/rooms/[id]` (`rooms:manage`) *(fichier :
      `src/app/api/rooms/[id]/route.ts`)*
- [x] **T13** [P] — `GET/POST/DELETE /api/rooms/[id]/access` (gestion `RoomAccess`,
      `rooms:manage`) *(fichier : `src/app/api/rooms/[id]/access/route.ts`)*
- [x] **T14** — `GET /api/room-reservations` (`rooms:view`) et `POST /api/room-reservations`
      (`rooms:reserve`, validation Zod dates + récurrence, `409` si conflit) *(fichier :
      `src/app/api/room-reservations/route.ts`)*
- [x] **T15** [P] — `PATCH /api/room-reservations/[id]` (annulation occurrence/série, créateur ou
      `rooms:manage`) *(fichier : `src/app/api/room-reservations/[id]/route.ts`)*
- [x] **T16** [P] — `PATCH /api/room-reservations/[id]/checklist` (déclaration
      ouverture/fermeture, ownership) *(fichier :
      `src/app/api/room-reservations/[id]/checklist/route.ts`)*
- [x] **T17** [P] — `PATCH /api/room-reservations/[id]/checklist/validate` (équipe dédiée
      SECURITE/ENTRETIEN ou `rooms:manage`) *(fichier :
      `src/app/api/room-reservations/[id]/checklist/validate/route.ts`)*

### 4. UI

- [x] **T18** — Page admin salles : CRUD + gestion `RoomAccess` (`DataTable`/`Modal`) *(fichiers :
      `src/app/(auth)/admin/rooms/page.tsx`, `RoomsAdminClient.tsx`)*
- [x] **T19** — Page réservation : recherche de disponibilité, création, historique, déclaration
      ouverture/fermeture sur ses propres réservations *(fichiers :
      `src/app/(auth)/rooms/page.tsx`, `RoomsBookingClient.tsx`)*
- [x] **T20** — Dashboard de contrôle pour l'équipe dédiée : réservations `OPENED`/
      `CLOSED_DECLARED` à valider *(fichiers : `src/app/(auth)/rooms/checklists/page.tsx`,
      `RoomChecklistsClient.tsx`)*
- [x] **T21** [P] — Entrée de navigation « Salles » (visible si `rooms:view` ou appartenance à un
      département SECURITE/ENTRETIEN) *(fichiers : `src/components/Sidebar.tsx`,
      `src/components/MobileNavSheet.tsx`, `src/components/AuthLayoutShell.tsx`,
      `src/app/(auth)/layout.tsx`)*

### 5. Tests

- [x] **T22** — Tests unitaires `reservation.service` : conflit cross-tenant détecté/absent,
      refus si l'église n'a pas accès à la salle, occurrences indépendantes (une occurrence en
      conflit n'empêche pas les autres), annulation `occurrence` vs `series` *(fichier :
      `src/modules/rooms/services/reservation.service.test.ts`)*
- [x] **T23** — Tests unitaires `checklist.service` : déclaration refusée hors ownership, remise
      de clés à une personne sans compte, validation concordante → `VALIDATED`, écart →
      `ISSUE_REPORTED` + notification, réservation passée sans déclaration reste `PENDING`
      *(fichier : `src/modules/rooms/services/checklist.service.test.ts`)*
- [x] **T24** [P] — Tests d'intégration légers des routes : codes 401/403/404/201/409 selon
      rôle/permission/ownership sur `/api/rooms`, `/api/room-reservations` et leurs
      sous-routes *(fichiers : `src/app/api/rooms/__tests__/security.test.ts`,
      `src/app/api/room-reservations/__tests__/security.test.ts`)*

## Hors tasks.md — à traiter séparément

- **Reprise des réservations futures existantes** (critère d'acceptation de `spec.md`) :
  nécessite d'abord de confirmer l'accès aux données de l'outil actuellement utilisé (base
  séparée ? export ?). Non couvert par les tâches ci-dessus — à traiter comme script de migration
  one-shot une fois cet accès confirmé, indépendamment de la livraison du module.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (sauf reprise des réservations
      existantes, cf. ci-dessus)
- [x] PR ouverte vers `main`
