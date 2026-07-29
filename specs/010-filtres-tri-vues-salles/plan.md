# Plan technique — Filtres et tri sur les vues du module de réservation de salles

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-07-26

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun changement — feature purement client-side, aucune nouvelle
      dépendance entre modules.
- [x] **Sécurité** : aucune route touchée, aucune donnée supplémentaire exposée — le tri/filtre
      s'applique aux données déjà chargées par les pages serveur existantes (`requireChurchPermission`
      inchangé).
- [x] **Permissions** : inchangées.
- [x] **Validation** : aucune mutation ajoutée, pas de nouveau schéma Zod nécessaire.
- [x] **Migration** : `[Aucun changement]` — pas de schéma touché.
- [x] **Enums** : inchangés.
- [x] **UI** : réutilise `Select` (déjà utilisé pour le tri/filtre de la vue liste en 009) et
      `DataTable`, sans nouveau composant.

## Approche générale

Même pattern qu'en 009 pour la vue liste des réservations : tri/filtre appliqués **côté client**
sur les données déjà chargées (les deux écrans concernés chargent déjà l'intégralité de leurs
lignes sans pagination), via un `useMemo` dérivant la liste affichée à partir de contrôles
`Select` placés au-dessus du `DataTable`. Aucun paramètre d'API, aucune requête serveur
supplémentaire.

## Modèle de données

`[Aucun changement]`

## API

`[Aucun changement]` — aucun endpoint ajouté ni modifié.

## Services / logique métier

`[Aucun changement]` — aucune logique métier, uniquement de la présentation.

## UI / composants

- `src/app/(auth)/admin/rooms/RoomsAdminClient.tsx` :
  - Ajout d'un contrôle `Select` « Filtrer par statut » (`Toutes` / `Actives` / `Désactivées`) et
    d'un `Select` « Trier par » (`Nom`) au-dessus du `DataTable`.
  - `useMemo` dérivant `displayedRooms` à partir de `rooms` (état déjà existant), du filtre de
    statut et du tri par nom (`localeCompare`).
  - Le `DataTable` reçoit `data={displayedRooms}` au lieu de `data={rooms}` ; aucun changement de
    colonnes ni d'actions.
- `src/app/(auth)/rooms/checklists/RoomChecklistsClient.tsx` :
  - Ajout de deux `Select` « Filtrer par salle » et « Filtrer par statut de main courante », plus
    un `Select` « Trier par » (`Date`) au-dessus du `DataTable` — même disposition que celle
    ajoutée à la vue liste des réservations en 009 (`RoomsBookingClient.tsx`).
  - Les options de salle sont dérivées de `reservations` (valeurs uniques de `room`) plutôt que
    d'un nouvel appel API, pour rester cohérent avec le chargement déjà entièrement côté serveur
    (`initialReservations`).
  - `useMemo` dérivant `displayedReservations` ; le tri par date remplace le tri fixe actuel
    (`startAt` décroissant, déjà appliqué côté serveur) — le tri client devient la source de
    vérité affichée, avec `startAt` décroissant comme valeur par défaut du contrôle pour ne pas
    changer le comportement actuel par défaut.
  - `DataTable` reçoit `data={displayedReservations}`.

## Décisions & alternatives écartées

- **Choix** : tri/filtre 100% client-side, comme en 009 — *Pourquoi* : les deux écrans chargent
  déjà l'intégralité de leurs données sans pagination ; ajouter des paramètres serveur serait une
  complexité sans bénéfice actuel, et casserait la cohérence avec le pattern déjà établi.
- **Écarté** : filtre par capacité ou par partage cross-église sur la liste des salles — *Raison* :
  tranché en amont (spec 010, Questions ouvertes) — hors périmètre pour cette itération, le nombre
  de salles par église restant faible en pratique.
- **Écarté** : extraire un composant `SortFilterBar` générique partagé entre les trois vues (liste
  réservations, salles admin, contrôle mains courantes) — *Raison* : les critères diffèrent
  suffisamment (statut de salle vs statut de main courante vs salle) que l'abstraction ajouterait
  plus de complexité (props génériques, typage) qu'elle n'en retirerait pour seulement trois
  usages ; à reconsidérer si une quatrième vue similaire apparaît.

## Risques & points d'attention

- Aucun risque notable : changement additif, purement présentationnel, sans impact sur les données
  ou la sécurité.

## Stratégie de tests

Aucun test automatisé nouveau : comme documenté en 009, il n'existe pas de convention de test de
composants dans ce repo (aucun `.test.tsx`), et cette feature ne touche ni service ni route API.
Vérification manuelle via le serveur de dev : filtrer/trier chaque vue, vérifier que la liste vide
s'affiche proprement, et que retirer un filtre restaure l'ensemble des éléments.
