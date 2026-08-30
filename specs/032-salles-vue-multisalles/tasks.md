# Tâches — Salles : visualisation multi-salles et suivi de ses propres réservations

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : En cours (code livré, recette manuelle T12 en attente de Docker)

> Tâches **ordonnées** et **vérifiables**. Les tâches `[P]` sont parallélisables.
>
> ⚠️ Cette feature ne touche **ni le schéma, ni les services métier, ni l'API** (cf. `plan.md`).
> Les sections 1 à 3 du découpage standard sont donc sans objet : le travail commence aux
> calculs de présentation, puis l'UI. Les tâches **T2 à T9 modifient toutes le même fichier**
> `RoomsBookingClient.tsx` : elles sont séquentielles par nature, à faire dans l'ordre.

## Prérequis

- [x] Branche créée : `feat/salles-vue-multisalles` (depuis `main` à jour)
- [x] Migration Prisma — **sans objet**, aucun changement de schéma
- [x] Vérifier que `prisma/migrations/20260614095330_init_macbook_dev_env/` (non suivi, artefact
      local) **n'est pas** ajouté au commit

## Tâches

### 1. Données & migration

*Sans objet — aucun changement de `prisma/schema.prisma`.*

### 2. Logique métier (services)

*Sans objet — `src/modules/rooms/services/` n'est pas touché, aucun événement de bus émis.*

### 3. API (route handlers)

*Sans objet — aucun endpoint ajouté ni modifié. Les routes `GET /api/rooms` et
`GET /api/room-reservations` sont consommées telles quelles.*

### 4. Calculs de présentation

- [x] **T1** — Créer le fichier de helpers de calendrier, **pur** (aucun import : ni React,
      ni Prisma, ni `@/modules/*`) : `localDateStr`, `addDays`, `getWeekStart` (lundi 00h00
      local), `buildWeekDays`, `buildMonthDays` (**déplacée** depuis le composant, sortie
      alignée sur `buildWeekDays`), `formatWeekLabel`, `cellKey`, `groupByRoomAndDay`
      (générique sur `{ room: { id }, startAt }`, cellules triées par heure de début).
      Y déplacer aussi les constantes `DAYS_FR` / `MONTHS_FR`.
      **`groupByRoomAndDay` regroupe sur `localDateStr(new Date(startAt))`, jamais sur
      `startAt.split("T")[0]`** — c'est la correction du bug de date.
      *(fichier : `src/app/(auth)/rooms/calendar.ts`)*

- [x] **T2** — Tests unitaires des helpers, **construits avec le constructeur local**
      (`new Date(2026, 8, 10, 23)`) pour rester vrais quel que soit le `TZ` de la machine :
      - `getWeekStart` : jeudi → lundi 00h00 ; **dimanche → semaine écoulée** ; idempotence
        sur un lundi ; franchissement du **changement d'heure** (25 octobre 2026) ;
      - `buildWeekDays` : 7 jours consécutifs ; semaine à cheval sur deux mois ;
      - `buildMonthDays` : longueur multiple de 7, jours de débordement `inMonth: false`,
        bon nombre de jours dans le mois ;
      - `groupByRoomAndDay` : deux salles le même jour ne se mélangent pas ; tri par heure ;
        **23h et 00h30 le lendemain tombent dans deux cellules distinctes** (verrouille la
        correction du bug UTC).
      *(fichier : `src/app/(auth)/rooms/calendar.test.ts`)*

### 5. UI

- [x] **T3** — Basculer l'état de vue de `"list" | "calendar"` vers
      `"week" | "month" | "list"`, **défaut `"week"`**, et rendre la bascule à trois entrées
      (Semaine / Mois / Liste). Remplacer le `currentMonth: string` interne de
      `RoomCalendarView` par une **ancre de période unique** `anchor: Date` : flèches à
      ±7 jours en vue semaine, ±1 mois en vue mois ; libellé via `formatWeekLabel` ou
      `MONTHS_FR`. Supprimer du composant les helpers déplacés en T1 et importer
      `./calendar`.
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

- [x] **T4** — Remplacer le sélecteur de salle **obligatoire** (qui retombait sur
      `rooms[0]`) par un filtre **facultatif** `filterRoomId`, valeur vide = « Toutes les
      salles », rendu avec le `Select` de `src/components/ui/` et sa prop `placeholder`.
      Calculer les **salles affichées** : `isActive`, **plus** toute salle inactive portant
      une réservation dans la période affichée (lecture directe de la `Map` de T1, aucun
      appel).
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

- [x] **T5** — Implémenter la **grille semaine salles × jours** : en-tête « Salle » +
      7 colonnes datées avec mise en évidence du jour courant ; une ligne par salle affichée
      (nom + église propriétaire si `!isOwner`) ; chaque cellule rend les réservations de
      `groupByRoomAndDay`, chacune ouvrant le détail existant au clic. Message explicite si
      l'église n'a aucune salle.
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

- [x] **T6** — Rendre la **grille mensuelle multi-salles** : la cellule d'un jour agrège
      les réservations de toutes les salles affichées (union des `cellKey` sur les salles
      visibles), triée par heure de début, chaque entrée préfixée du **nom de sa salle**.
      Conserver le reste du rendu mensuel existant (jours hors mois grisés, jour courant).
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

- [x] **T7** — Distinguer visuellement les réservations de l'utilisateur courant
      (`createdBy.id === currentUserId`) dans **les deux** grilles : violet plein contre
      violet léger. Factoriser le rendu d'une réservation en un seul élément partagé par la
      semaine et le mois, pour que les deux vues ne divergent pas.
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

- [x] **T8** — Ajouter l'encart **« Mes réservations »**, rendu **au-dessus de la bascule
      de vue** (son indépendance vis-à-vis des filtres découle de sa position dans l'arbre,
      pas d'un état à synchroniser) :
      - source : `activeReservations` filtré sur `createdBy.id === currentUserId` **et**
        `endAt >= maintenant`, trié par `startAt` croissant, **4 lignes** affichées ;
      - ligne : titre, date/heure, salle, badge de main courante (`CHECKLIST_BADGE` /
        `CHECKLIST_LABELS` existants) ;
      - actions issues de **`getAvailableActions`** (fonction déjà utilisée par la liste et
        le détail, garante qu'on ne propose jamais une action que le serveur refuserait) :
        « Déclarer l'ouverture », « Déclarer la fermeture », « Détails » — **pas
        d'annulation** ;
      - **repliable / dépliable** ;
      - **ne rend rien** si l'utilisateur n'a aucune réservation à venir.
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

- [x] **T9** — Au-delà de 4 lignes, ajouter dans l'encart le lien vers la **totalité de ses
      réservations** : bascule sur la vue liste avec `filterMine` activé et les autres
      filtres remis à zéro — la case à cocher existante est **réutilisée comme
      destination**, pas supprimée.
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

- [x] **T10** — Rendre la grille semaine exploitable sur mobile : conteneur
      `overflow-x-auto` avec largeur minimale, colonne « Salle » en `sticky left-0`.
      Vérifier que **la page** ne déborde jamais horizontalement (seul le conteneur défile).
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

- [x] **T11** — Marquer d'un commentaire `ponytail:` le chargement non borné de l'historique
      dans `load()` (`/api/room-reservations?churchId=` sans `from`/`to`), en nommant le
      plafond et la voie de sortie : la route accepte déjà `from`/`to`. Plafond **préexistant**,
      hors périmètre de la spec — on le trace, on ne le corrige pas.
      *(fichier : `src/app/(auth)/rooms/RoomsBookingClient.tsx`)*

### 6. Recette

- [ ] **T12** — Recette manuelle guidée par les critères d'acceptation de `spec.md`. Le
      rendu React n'est pas testable automatiquement (`vitest` tourne en
      `environment: "node"` et n'inclut que `*.test.ts` — monter un environnement DOM est
      hors périmètre). Points à vérifier explicitement :
      - encart présent **et identique** dans les trois vues, y compris après changement de
        filtres ;
      - action de l'encart qui **suit l'état réel** de la main courante (ouverture, puis
        fermeture) ;
      - réservation de **soirée tardive** affichée au bon jour dans les deux grilles — le
        bug corrigé ;
      - ligne d'une salle **désactivée** qui subsiste tant qu'elle porte une réservation
        dans la période, et disparaît sinon ;
      - bascule semaine ↔ mois qui **conserve la période** consultée ;
      - vue **mois** devenue multi-salles : c'est le seul écran existant modifié (cf. risque
        n°5 du plan) ;
      - grille consultable **sur mobile** sans débordement de la page ;
      - compte **Secrétaire** : les trois vues sont consultables, **aucune** action de
        réservation ni de déclaration n'est proposée ;
      - **aucune réservation d'une autre église** n'apparaît.

## Couverture des critères d'acceptation

| Critère de `spec.md` | Tâche(s) |
|---|---|
| Ouverture par défaut sur la vue semaine | T3 |
| 7 colonnes lun→dim, une ligne par salle active + inactive réservée | T4, T5 |
| Toutes les réservations d'une case, triées par heure | T1, T5 |
| Aucune sélection de salle requise | T4 |
| Filtre facultatif « Toutes les salles » | T4 |
| Navigation ±1 semaine / ±1 mois, période en toutes lettres | T1, T3 |
| Calendrier mensuel multi-salles, salle identifiable | T6 |
| Bascule Semaine / Mois / Liste | T3 |
| Réservations propres visuellement distinctes | T7 |
| Clic sur une réservation → détail et actions | T5, T6 |
| Encart au-dessus de la bascule, visible dans les 3 vues | T8 |
| Encart : non terminées, chronologique, 4 max | T8 |
| Contenu de l'encart insensible à la vue et aux filtres | T8, T12 |
| Actions ouverture / fermeture selon l'état réel | T8, T12 |
| État de main courante affiché dans l'encart | T8 |
| Encart repliable | T8 |
| Lien vers la totalité de ses réservations au-delà de 4 | T9 |
| Pas d'annulation depuis l'encart | T8 |
| Encart absent si aucune réservation à venir | T8 |
| Réservation de soirée au jour **local** | T1, T2, T12 |
| Mobile sans débordement horizontal | T10, T12 |
| Aucune réservation d'une autre église | T12 *(garanti par la route existante)* |
| Secrétaire : aucune action proposée | T12 *(garanti par `canReserve` / `getAvailableActions`)* |

Tous les critères de la spec sont couverts par au moins une tâche.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries` — doit passer **sans modifier `.dependency-cruiser.cjs`** :
      c'est la preuve que `calendar.ts` n'a introduit aucune dépendance interdite
- [x] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (cf. tableau + T12)
- [ ] `git status` propre hors fichiers voulus — la migration locale
      `20260614095330_init_macbook_dev_env/` **reste non suivie**
- [ ] PR ouverte vers `main`, référençant l'issue #466
