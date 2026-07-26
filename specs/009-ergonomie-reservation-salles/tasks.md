# Tâches — Ergonomie de la réservation de salles

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche : `feat/gestion-reservation-salles` (déjà active, feature 008 non mergée)
- [x] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter à `RoomChecklist` : `equipmentOk Boolean?`, `equipmentNotes String? @db.Text`,
      `validatedEquipmentOk Boolean?`, `closedWithoutDeclaration Boolean @default(false)`
      *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer et vérifier la migration (`npm run db:migrate` — nom `rooms_checklist_followup`) ;
      contrôler le SQL généré *(fichier : `prisma/migrations/…`)*

### 2. Logique métier (services)

- [x] **T3** — Étendre `declareClosing` : paramètres `equipmentOk: boolean`,
      `equipmentNotes?: string | null`, écriture symétrique à `closedProperly`/`cleaned`
      *(fichier : `src/modules/rooms/services/checklist.service.ts`)*
- [x] **T4** — Étendre `validateChecklist` : paramètre `validatedEquipmentOk: boolean`, concordance
      déclenchant `VALIDATED`/`ISSUE_REPORTED` incluant `equipmentOk === validatedEquipmentOk`
      *(même fichier que T3)*
- [x] **T5** — Ajouter `endAt` au select de `getReservationOwnership`, puis implémenter
      `reportIssueWithoutDeclaration({reservationId, validatorId, incidentNotes})` : refuse
      (`ApiError(409)`) si `checklist.status` ∉ `{PENDING, OPENED}` ou si `endAt` n'est pas encore
      passé ; sinon statut → `ISSUE_REPORTED`, `closedWithoutDeclaration: true`, notification du
      créateur (réutilise `ROOM_CHECKLIST_ISSUE`) *(même fichier que T3)*
- [x] **T6** — Implémenter `closeWithoutDeclaration({reservationId, validatorId, notes?})` : mêmes
      préconditions que T5 ; statut → `VALIDATED`, `closedWithoutDeclaration: true`, **sans**
      notification *(même fichier que T3)*
- [x] **T7** — Exporter `reportIssueWithoutDeclaration` et `closeWithoutDeclaration`
      *(fichier : `src/modules/rooms/index.ts`)*

### 3. API (route handlers)

- [x] **T8** [P] — Étendre le schéma Zod de la phase `"close"` : `equipmentOk: z.boolean()`,
      `equipmentNotes: z.string().max(500).optional()` ; transmettre à `declareClosing`
      *(fichier : `src/app/api/room-reservations/[id]/checklist/route.ts`)*
- [x] **T9** [P] — Remplacer le corps par un `z.discriminatedUnion("action", …)` avec les cas
      `"validate"` (existant, + `validatedEquipmentOk`), `"report-issue"` (`incidentNotes`
      obligatoire) et `"close-manually"` (`notes?`) ; router vers le service correspondant en
      conservant la vérification d'autorisation actuelle (équipe dédiée / `rooms:manage` / Super
      Admin) pour les trois cas *(fichier :
      `src/app/api/room-reservations/[id]/checklist/validate/route.ts`)*
- [x] **T10** [P] — Élargir la requête Prisma pour inclure les réservations dont
      `checklist.status === "PENDING"` et `endAt < now`, en plus des statuts déjà remontés
      *(fichier : `src/app/(auth)/rooms/checklists/page.tsx`)*

### 4. UI

- [x] **T11** [P] — Passer `currentUserId={session.user.id}` et `canManage` (permission
      `rooms:manage` ou Super Admin) à `RoomsBookingClient`
      *(fichier : `src/app/(auth)/rooms/page.tsx`)*
- [x] **T12** — Vue par défaut de `RoomsBookingClient` : `"calendar"` au lieu de `"list"`
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*
- [x] **T13** — Extraire `getAvailableActions(reservation, { currentUserId, canManage })` (annulation
      occurrence/série si créateur ou `canManage` ; déclarer ouverture/fermeture si créateur et
      statut correspondant) ; l'utiliser dans les actions de la vue liste (`DataTable`)
      *(même fichier que T12)*
- [x] **T14** — Rendre les puces de réservation du calendrier cliquables (`onSelect`) ; créer
      `ReservationDetailModal` (infos complètes + actions via `getAvailableActions` + bouton
      **Retour** explicite en plus de la fermeture native de `Modal`) *(même fichier que T12)*
- [x] **T15** — Vue liste : contrôles de tri (date, salle) et de filtre (salle, statut de main
      courante) au-dessus du `DataTable`, appliqués côté client *(même fichier que T12)*
- [x] **T16** — Modale de déclaration de fermeture : case « Salle/matériel en bon état » + champ
      notes optionnel, transmis via `equipmentOk`/`equipmentNotes` *(même fichier que T12)*
- [x] **T17** — Modale de contrôle (« Contrôler ») : case « Constaté : salle/matériel en bon état »,
      transmise via `validatedEquipmentOk` *(fichier :
      `src/app/(auth)/rooms/checklists/RoomChecklistsClient.tsx`)*
- [x] **T18** — Nouvelles actions par ligne quand `checklist.status` ∈ `{PENDING, OPENED}` et
      `endAt` déjà passé : « Signaler un écart » (modale imposant `incidentNotes`) et « Clôturer
      sans déclaration » (`ConfirmModal`, notes optionnelles) *(même fichier que T17)*
- [x] **T19** — Remplacer le lien texte « Annuler » par un bouton **Retour**
      (`variant="secondary"`) dans les modales de consultation/contrôle (`ReservationDetailModal`
      et la modale de contrôle de `RoomChecklistsClient`) — la confirmation d'annulation d'une
      réservation garde le vocabulaire « Annuler » *(fichiers : `RoomsBookingClient.tsx`,
      `RoomChecklistsClient.tsx`)*

### 5. Tests

- [x] **T20** — Tests `declareClosing`/`validateChecklist` : concordance incluant `equipmentOk`
      (match → `VALIDATED`, écart sur ce seul champ → `ISSUE_REPORTED`)
      *(fichier : `src/modules/rooms/services/checklist.service.test.ts`)*
- [x] **T21** — Tests `reportIssueWithoutDeclaration` : refus si statut déjà avancé ou `endAt` pas
      encore passé (`409`) ; succès → `ISSUE_REPORTED` + notification du créateur *(même fichier
      que T20)*
- [x] **T22** — Tests `closeWithoutDeclaration` : mêmes préconditions ; succès → `VALIDATED`,
      `closedWithoutDeclaration: true`, aucune notification créée *(même fichier que T20)*
- [x] **T23** [P] — Étendre les tests d'intégration de route : les trois valeurs d'`action` sur
      `/checklist/validate` respectent la même autorisation (équipe dédiée / `rooms:manage` / Super
      Admin → `403` sinon) et les codes `409` de précondition *(fichier :
      `src/app/api/room-reservations/__tests__/security.test.ts`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `feat/gestion-reservation-salles` (feature longue, cf. stratégie multi-PR)
