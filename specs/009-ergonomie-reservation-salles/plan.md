# Plan technique — Ergonomie de la réservation de salles

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-07-26

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucune nouvelle dépendance entre modules ; tout reste dans `rooms`
      (services + `src/app/api/rooms*`, `src/app/(auth)/rooms/*`).
- [x] **Sécurité** : les nouvelles actions de contrôle (« signaler un écart sans déclaration »,
      « clôturer sans déclaration ») restent protégées par la même vérification d'autorisation que
      la validation existante (équipe dédiée SECURITE/ENTRETIEN, `rooms:manage`, ou Super Admin).
      Les actions affichées côté client sont désormais **cohérentes avec ce que le serveur
      autorise réellement** (ownership vérifié côté client en plus du serveur).
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — inchangé, aucune nouvelle
      permission nécessaire (tout est ownership ou fonction de département, comme en 008).
- [x] **Validation** Zod sur les mutations modifiées (`checklist`, `checklist/validate`).
- [x] **Migration** Prisma prévue (nouveaux champs sur `RoomChecklist`, aucun nouveau modèle).
- [x] **Enums** : `RoomChecklistStatus` n'est pas étendu (voir Décisions — préféré à un nouveau
      statut) ; import inchangé depuis `@/generated/prisma/client`.
- [x] **UI** : réutilise `DataTable`, `Modal`, `ConfirmModal`, `Input`, `Select`, `Button` déjà en
      place (dont `ConfirmModal`, ajouté lors d'une itération ergonomique précédente).

## Approche générale

Cette itération ne touche à aucune règle métier déjà tranchée en 008 (disponibilité, récurrence,
partage cross-église). Elle porte sur trois axes, tous internes au module `rooms` déjà existant :

1. **Navigation/consultation** : la page de réservation bascule sa vue par défaut vers le calendrier
   par salle (déjà présent depuis l'itération ergonomique précédente), le rend cliquable (ouvre un
   détail avec actions), et enrichit la vue liste avec tri/filtre client-side (les réservations sont
   déjà entièrement chargées côté client, pas besoin de nouveaux paramètres d'API).
2. **Traçabilité de la main courante** : ajout d'un signalement d'état des lieux/du matériel
   (dégât, matériel manquant/déplacé, panne) symétrique au couple `closedProperly`/`cleaned` déjà en
   place — déclaré à la fermeture, contrôlé à la validation.
3. **Actions de suivi côté équipe dédiée** : deux nouvelles actions sur des réservations passées
   dont la main courante n'a jamais été déclarée (`PENDING`/`OPENED` avec `endAt` dépassé), en plus
   du contrôle déjà existant pour les fermetures déclarées — et un accès à ces réservations
   jusqu'ici invisibles sur le tableau de bord (filtré aujourd'hui sur `OPENED`/`CLOSED_DECLARED`/
   `ISSUE_REPORTED`/`VALIDATED`, ce qui exclut justement les `PENDING` qu'il faut pouvoir traiter).

## Modèle de données

```prisma
model RoomChecklist {
  // … champs existants inchangés …

  // Fermeture — ajouts
  equipmentOk    Boolean?
  equipmentNotes String?  @db.Text

  // Validation — ajouts
  validatedEquipmentOk    Boolean?

  // Traçabilité des actions de suivi sans déclaration préalable
  closedWithoutDeclaration Boolean @default(false)
}
```

Aucun changement sur `Room`, `RoomAccess`, `RoomReservation`, ni sur les enums.

Migration : `npm run db:migrate` (nom suggéré `rooms_checklist_followup`). Champs nullables /
avec défaut → pas de backfill nécessaire sur les lignes existantes.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/room-reservations/[id]/checklist` | PATCH | créateur (ownership) — inchangé | phase `"close"` étendue : `{..., equipmentOk: boolean, equipmentNotes?: string}` | checklist mise à jour |
| `/api/room-reservations/[id]/checklist/validate` | PATCH | équipe dédiée / `rooms:manage` — inchangé | discriminé par `action` (voir ci-dessous) | checklist mise à jour |

Nouveau corps de `/checklist/validate` (`z.discriminatedUnion("action", …)`) :
- `{action: "validate", validatedClosedProperly, validatedCleaned, validatedEquipmentOk, incidentNotes?}`
  — inchangé dans son effet, exige `checklist.status === "CLOSED_DECLARED"` (`409` sinon).
- `{action: "report-issue", incidentNotes}` (`incidentNotes` obligatoire ici, contrairement au cas
  `validate`) — exige `checklist.status` ∈ `{"PENDING","OPENED"}` **et** `endAt` déjà passé (`409`
  sinon) ; passe le statut à `ISSUE_REPORTED`, notifie le créateur (comme le cas `validate` en
  écart).
- `{action: "close-manually", notes?}` — mêmes préconditions que `report-issue` ; passe le statut à
  `VALIDATED`, `closedWithoutDeclaration: true`, **sans notification**.

Endpoint `GET /api/room-reservations` (liste) et la requête serveur de
`src/app/(auth)/rooms/checklists/page.tsx` : élargir le filtre pour inclure les réservations
`PENDING` déjà passées (`endAt < now`), en plus des statuts déjà remontés — sinon elles restent
invisibles pour l'équipe dédiée et les nouvelles actions n'ont rien sur quoi s'exercer.

## Services / logique métier

`src/modules/rooms/services/checklist.service.ts` :
- `declareClosing(...)` : ajoute `equipmentOk: boolean`, `equipmentNotes?: string | null` aux
  paramètres et à l'écriture (symétrique à `closedProperly`/`cleaned`).
- `validateChecklist(...)` : ajoute `validatedEquipmentOk: boolean` ; la concordance déclenchant
  `VALIDATED` vs `ISSUE_REPORTED` inclut désormais `equipmentOk === validatedEquipmentOk`.
- `getReservationOwnership(...)` (privé) : sélectionne aussi `endAt` (nécessaire aux deux nouvelles
  fonctions ci-dessous).
- **Nouveau** `reportIssueWithoutDeclaration({reservationId, validatorId, incidentNotes})` : vérifie
  `checklist.status` ∈ `{PENDING, OPENED}` et `endAt < now` (sinon `ApiError(409)`) ; statut →
  `ISSUE_REPORTED`, `closedWithoutDeclaration: true`, notifie le créateur (réutilise la même
  notification `ROOM_CHECKLIST_ISSUE` que `validateChecklist`).
- **Nouveau** `closeWithoutDeclaration({reservationId, validatorId, notes?})` : mêmes préconditions ;
  statut → `VALIDATED`, `closedWithoutDeclaration: true`, pas de notification.

Exports publics : ajouter les deux nouvelles fonctions à `src/modules/rooms/index.ts` (à côté de
`declareOpening`/`declareClosing`/`validateChecklist`).

## UI / composants

- `src/app/(auth)/rooms/page.tsx` : passe désormais `currentUserId={session.user.id}` et
  `canManage` (permission `rooms:manage` ou Super Admin) à `RoomsBookingClient`, pour que les
  actions affichées correspondent à ce que le serveur autorisera réellement.
- `RoomsBookingClient.tsx` :
  - Vue par défaut : `"calendar"` au lieu de `"list"`.
  - Extraction d'une fonction pure `getAvailableActions(reservation, { currentUserId, canManage })`
    (annulation occurrence/série si créateur ou `canManage` ; déclarer ouverture/fermeture si
    créateur et statut correspondant), réutilisée à la fois par les lignes de la vue liste et par
    la nouvelle modale de détail — évite que les deux vues divergent sur qui peut faire quoi.
  - `RoomCalendarView` : les puces de réservation deviennent cliquables (`onSelect(reservation)`),
    ouvrant une nouvelle modale `ReservationDetailModal` (infos complètes + actions via
    `getAvailableActions` + bouton **Retour** explicite, en plus du bouton de fermeture natif de
    `Modal`).
  - Vue liste : ajout de contrôles de tri (date, salle) et de filtre (salle, statut de main
    courante) au-dessus du `DataTable`, appliqués côté client sur les données déjà chargées.
  - Modale de déclaration de fermeture : ajoute la case « Salle/matériel en bon état » +
    champ notes optionnel (visible en tout temps, comme `closedProperly`/`cleaned`).
- `RoomChecklistsClient.tsx` :
  - Nouvelles actions par ligne, visibles quand `checklist.status` ∈ `{PENDING, OPENED}` **et**
    `endAt` déjà passé : « Signaler un écart » (modale imposant `incidentNotes`) et « Clôturer sans
    déclaration » (confirmation via `ConfirmModal`, notes optionnelles).
  - Modale de contrôle (« Contrôler ») : ajoute la case « Constaté : salle/matériel en bon état ».
  - Remplace le lien texte « Annuler » par un bouton **Retour** explicite (`variant="secondary"`)
    dans les modales de consultation/contrôle — la confirmation d'annulation d'une réservation
    (`ConfirmModal`, ailleurs) garde son vocabulaire « Annuler » car il s'agit d'une action
    destructive, pas d'une navigation.
- `src/app/(auth)/rooms/checklists/page.tsx` : élargit la requête Prisma pour inclure les
  réservations `PENDING` dont `endAt < now` (voir API ci-dessus).

## Décisions & alternatives écartées

- **Choix** : `closedWithoutDeclaration: Boolean` sur `RoomChecklist` plutôt qu'un nouveau statut
  d'enum (`RoomChecklistStatus`) — *Pourquoi* : un nouveau statut obligerait à mettre à jour tous
  les mappings d'affichage existants (`CHECKLIST_LABELS`/`CHECKLIST_BADGE` dans deux composants) et
  toute logique future qui switch sur ce statut, pour un besoin qui est avant tout de la
  traçabilité (« ce contrôle n'a pas suivi le parcours normal »), pas un nouvel état observable par
  l'utilisateur final. Le flag reste consultable pour l'équipe dédiée sans complexifier l'état
  affiché aux STAR.
- **Choix** : tri/filtre de la vue liste en client-side plutôt que via de nouveaux paramètres
  d'API — *Pourquoi* : les réservations d'une église sont déjà chargées intégralement côté client
  (pas de pagination existante) ; ajouter des paramètres serveur pour filtrer des données déjà en
  mémoire serait une complexité sans bénéfice actuel.
- **Choix** : extraire `getAvailableActions` en fonction pure partagée plutôt que dupliquer la
  logique liste/détail — *Pourquoi* : évite que les deux vues affichent des actions différentes
  pour la même réservation (source du problème identifié dans le contexte : le client affichait déjà
  des actions que le serveur refusait ensuite).
- **Écarté** : notification automatique de relance pour les réservations non déclarées — tranché en
  amont (spec 009, Questions ouvertes) : seules les actions manuelles « signaler » / « clôturer »
  sont demandées pour cette itération, pas de relance automatique.

## Risques & points d'attention

- **Élargissement du filtre du tableau de contrôle** (inclusion des `PENDING` passées) : à surveiller
  en volume — si beaucoup de réservations ne sont jamais ouvertes, le tableau pourrait grossir ;
  acceptable pour l'instant vu l'usage attendu (une salle par créneau), à revisiter si besoin de
  pagination apparaît.
- **Cohérence client/serveur des actions affichées** : `getAvailableActions` doit rester strictement
  alignée avec les vérifications serveur (ownership, `rooms:manage`, fonction de département) —
  toute évolution future d'une des deux doit systématiquement se répercuter sur l'autre.
- Aucun changement sur la disponibilité/récurrence : les risques déjà documentés en 008 (concurrence
  sur la disponibilité, duplication de la logique de récurrence) restent valables et inchangés.

## Stratégie de tests

Tests unitaires (Vitest) — extension de `src/modules/rooms/services/checklist.service.test.ts` :
- `declareClosing`/`validateChecklist` : concordance incluant désormais `equipmentOk` (match → 
  `VALIDATED`, écart sur ce seul champ → `ISSUE_REPORTED`).
- `reportIssueWithoutDeclaration` : refusé si le statut est déjà `CLOSED_DECLARED`/`VALIDATED`/
  `ISSUE_REPORTED`, ou si `endAt` n'est pas encore passé (`409`) ; accepté sinon → `ISSUE_REPORTED`
  + notification du créateur.
- `closeWithoutDeclaration` : mêmes préconditions ; accepté → `VALIDATED`,
  `closedWithoutDeclaration: true`, **aucune** notification créée.

Tests d'intégration légers (`src/app/api/room-reservations/__tests__/security.test.ts`, existant à
étendre) : les trois valeurs d'`action` sur `/checklist/validate` respectent la même autorisation
(équipe dédiée / `rooms:manage` / Super Admin → `403` sinon), et les codes `409` des préconditions
de statut/date.

Pas de tests de composants (aucune convention de test UI dans le repo aujourd'hui) : vérification
manuelle via le serveur de dev pour le calendrier cliquable, le tri/filtre, et les nouvelles
actions du tableau de contrôle.
