# Tâches — Filtre « mes réservations », vue de la main courante et champs multi-lignes

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé (vérification manuelle T11-T15 à faire par l'utilisateur — pas de session authentifiée disponible ici)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche : `feat/gestion-reservation-salles` (déjà active, features 008/009/010 non mergées)
- [ ] Migration Prisma : `[Aucun changement]` — pas de schéma touché.

## Tâches

### 1. Données & migration

`[Aucun changement]`

### 2. Logique métier (services)

`[Aucun changement]`

### 3. API (route handlers)

- [x] **T1** — Étendre le `select` du `checklist` dans la branche « historique de l'église » de
      `GET /api/room-reservations` (`{status: true}` → ensemble complet des champs déjà exposés
      par le tableau de contrôle + `validatedAt`/`validatedClosedProperly`/`validatedCleaned`/
      `validatedEquipmentOk`, jusque-là non exposés) ; ajouter un champ `checklist: {...} | null`
      à la réponse en plus de `checklistStatus` déjà existant (inchangé)
      *(fichier : `src/app/api/room-reservations/route.ts`)*

### 4. UI

- [x] **T2** [P] — Créer `Textarea` : composant `<textarea>` sur le modèle d'`Input` (label, prop
      `error`, mêmes classes de bordure/focus), `rows` par défaut à `3`
      *(fichier : `src/components/ui/Textarea.tsx`)*
- [x] **T3** — Créer `ChecklistDetail` : composant de présentation (aucun état) affichant
      déclaration d'ouverture, déclaration de fermeture et résultat du contrôle d'un
      `checklist: Checklist | null`, avec « Non renseigné » pour chaque section absente
      *(fichier : `src/app/(auth)/rooms/ChecklistDetail.tsx`)*
- [x] **T4** — Vue liste de `RoomsBookingClient.tsx` : case à cocher « Mes réservations
      uniquement » intégrée au `useMemo` `displayedReservations` existant (comparaison
      `r.createdBy.id === currentUserId`), combinable avec les filtres salle/statut déjà présents
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*
- [x] **T5** — Remplacer `Input` par `Textarea` (T2) pour les champs « Notes (optionnel) »
      (`checklistNotes`) et « Préciser le problème... » (`equipmentNotes`) dans la modale de
      déclaration d'ouverture/fermeture *(même fichier que T4)*
- [x] **T6** — Ajouter `checklist: Checklist | null` au type `Reservation` de
      `RoomsBookingClient.tsx` (nouvelle donnée de l'API, T1) ; rendre
      `<ChecklistDetail checklist={reservation.checklist} />` (T3) dans `ReservationDetailModal`,
      en plus du badge de statut déjà affiché *(même fichier que T4)*
- [x] **T7** [P] — Remplacer `Input` par `Textarea` (T2) pour le champ « Signaler un écart
      (optionnel) » (`incidentNotes`) dans la modale de contrôle, et pour le champ « Écart
      constaté »/« Notes (optionnel) » (`followUpNotes`) dans la modale de suivi sans déclaration
      *(fichier : `src/app/(auth)/rooms/checklists/RoomChecklistsClient.tsx`)*
- [x] **T8** — Rendre le bouton d'action de contrôle toujours présent par ligne (« Contrôler » si
      `CLOSED_DECLARED`, sinon « Détails ») ; la modale ouverte rend désormais
      `<ChecklistDetail checklist={r.checklist} />` (T3) en tête, suivi — uniquement si
      `CLOSED_DECLARED` — des contrôles éditables et du bouton « Valider le contrôle » déjà
      existants *(même fichier que T7)*
- [x] **T9** — Ajouter les filtres « Date » (deux `Input type="date"`, « Du »/« Au », sur
      `startAt`) et « Responsable » (`Select`, options dérivées de `reservations`) au `useMemo`
      `displayedReservations` existant, à côté des filtres salle/statut (010)
      *(même fichier que T7)*
- [x] **T10** [P] — Étendre le `select` Prisma de la page pour inclure `validatedAt`,
      `validatedClosedProperly`, `validatedCleaned`, `validatedEquipmentOk` et les transmettre
      dans le mapping vers `RoomChecklistsClient` ; ajouter un lien de retour explicite vers
      `/rooms` à côté du titre (même style que le lien existant sur `/rooms`)
      *(fichier : `src/app/(auth)/rooms/checklists/page.tsx`)*

### 5. Tests

`[Aucun test automatisé]` — feature majoritairement présentationnelle ; la seule route modifiée
(`GET /api/room-reservations`) est un enrichissement de `select`/réponse sans changement
d'autorisation, déjà couvert par `security.test.ts` existant. Vérification manuelle :

- [ ] **T11** — Vérifier manuellement en dev : filtre « mes réservations » combiné aux filtres
      salle/statut sur `/rooms` (vue Liste), y compris liste vide
- [ ] **T12** — Vérifier manuellement en dev : saisie multi-lignes (retour à la ligne, texte long)
      sur les 4 champs concernés
- [ ] **T13** — Vérifier manuellement en dev : détail complet d'une main courante à chaque statut
      (`PENDING`, `OPENED`, `CLOSED_DECLARED`, `VALIDATED`, `ISSUE_REPORTED`), depuis le calendrier
      (`/rooms`) et depuis le tableau de contrôle (`/rooms/checklists`), y compris les sections
      « Non renseigné »
- [ ] **T14** — Vérifier manuellement en dev : filtres date/responsable combinés aux filtres
      salle/statut sur `/rooms/checklists`, y compris liste vide ; bouton de retour vers `/rooms`
- [ ] **T15** — Vérifier manuellement en dev, en largeur mobile : filtres empilés lisibles,
      boutons atteignables (cibles tactiles), `ChecklistDetail` lisible sans défilement horizontal

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `feat/gestion-reservation-salles` — ou ajoutée à la PR #430 déjà ouverte si
      elle n'est pas encore mergée
