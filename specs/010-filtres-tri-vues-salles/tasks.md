# Tâches — Filtres et tri sur les vues du module de réservation de salles

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé (vérification manuelle T3/T4 à faire par l'utilisateur)

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche : `feat/gestion-reservation-salles` (déjà active, features 008/009 non mergées)
- [ ] Migration Prisma : `[Aucun changement]` — pas de schéma touché.

## Tâches

### 1. Données & migration

`[Aucun changement]`

### 2. Logique métier (services)

`[Aucun changement]`

### 3. API (route handlers)

`[Aucun changement]`

### 4. UI

- [x] **T1** [P] — Ajouter un `Select` « Filtrer par statut » (Toutes/Actives/Désactivées) et un
      `Select` « Trier par » (Nom) au-dessus du `DataTable` ; dériver `displayedRooms` via
      `useMemo` à partir de `rooms`, du filtre de statut et du tri par nom (`localeCompare`) ;
      passer `data={displayedRooms}` au `DataTable`
      *(fichier : `src/app/(auth)/admin/rooms/RoomsAdminClient.tsx`)*
- [x] **T2** [P] — Ajouter les `Select` « Filtrer par salle », « Filtrer par statut de main
      courante » et « Trier par » (Date) au-dessus du `DataTable` (options de salle dérivées des
      `reservations` déjà chargées) ; dériver `displayedReservations` via `useMemo` (tri par date
      décroissante par défaut, pour ne pas changer le comportement actuel) ; passer
      `data={displayedReservations}` au `DataTable`
      *(fichier : `src/app/(auth)/rooms/checklists/RoomChecklistsClient.tsx`)*

### 5. Tests

`[Aucun test automatisé]` — feature purement présentationnelle, aucune convention de test de
composants dans ce repo (cf. `plan.md` § Stratégie de tests). Vérification manuelle :

- [ ] **T3** — Vérifier manuellement en dev : filtre statut + tri nom sur `/admin/rooms` (y
      compris liste vide et retrait du filtre)
- [ ] **T4** — Vérifier manuellement en dev : filtres salle/statut + tri date sur
      `/rooms/checklists` (y compris liste vide et retrait des filtres)

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `feat/gestion-reservation-salles` (feature longue, cf. stratégie multi-PR) —
      ou ajoutée à la PR #430 déjà ouverte si elle n'est pas encore mergée
