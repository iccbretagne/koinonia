# Plan technique — Salles : visualisation multi-salles et suivi de ses propres réservations

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-30

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import `src/app/` → module. Le nouveau fichier
      `calendar.ts` est un **frère du composant**, sans aucune dépendance (ni Prisma, ni
      React, ni `@/modules/*`). Cf. décision D2 pour la raison de ne pas le placer dans
      `src/modules/rooms/`.
- [x] **Sécurité** : aucune route API touchée. La garde existante de `/rooms`
      (`requireChurchPermission("rooms:view", churchId)` dans `page.tsx`) et celles des
      deux routes consommées (`GET /api/rooms`, `GET /api/room-reservations`, toutes deux
      `requireChurchPermission("rooms:view", churchId)`) restent inchangées. Le `churchId`
      multi-tenant continue de venir de `getCurrentChurchId(session)` côté serveur.
- [x] **Permissions** via `rolePermissions` : inchangé. `page.tsx` calcule déjà
      `canReserve` / `canManage` à partir de `rolePermissions` et les passe en props ; on
      les réutilise tels quels.
- [x] **Validation Zod** : sans objet — la feature n'introduit **aucune mutation**.
- [x] **Migration Prisma** : sans objet — **aucun changement de schéma**.
- [x] **Enums** depuis `@/generated/prisma/client` : sans objet — aucun enum manipulé côté
      client (les statuts de main courante transitent déjà en `string` typée dans
      l'interface `Reservation` du composant).
- [x] **UI** : `Button`, `Select`, `Modal`, `ConfirmModal`, `DataTable` de
      `src/components/ui/` réutilisés ; **aucun nouveau composant UI générique** créé. Les
      grilles sont du markup Tailwind local à la page, comme l'actuel `RoomCalendarView`.

## Approche générale

La feature est **100 % côté client, à périmètre de données constant**. Les deux appels que
`RoomsBookingClient` effectue déjà au montage rapportent tout le nécessaire :

- `GET /api/rooms?churchId=` → **toutes** les salles accessibles (possédées + partagées),
  avec `isActive`, `isOwner`, `ownerChurch` ;
- `GET /api/room-reservations?churchId=` → **tout** l'historique des réservations de
  l'église, avec `room`, `createdBy.id`, `checklistStatus`, `status`.

Le travail consiste donc à **réorganiser un état déjà en mémoire**. Trois chantiers :

1. **Extraire les calculs de calendrier** (semaine, mois, regroupement salle × jour) dans
   un fichier pur et testable — c'est là que se corrige au passage le bug de date UTC,
   **à la racine**, pour la vue semaine comme pour la vue mois.
2. **Refondre le mode calendrier** : `RoomCalendarView` passe d'« une salle, un mois » à
   « toutes les salles, semaine **ou** mois », le sélecteur de salle obligatoire devenant
   un filtre facultatif.
3. **Ajouter l'encart « Mes réservations »**, dérivé de l'état déjà chargé, rendu au-dessus
   de la bascule de vue et donc indépendant de celle-ci.

## Modèle de données

**[Aucun changement]**

Aucune migration Prisma. Les modèles `Room` (qui porte déjà `isActive`) et
`RoomReservation` (qui porte déjà `startAt`, `createdById`, `status`) suffisent.

## API

**[Aucun endpoint ajouté ni modifié]**

| Endpoint | Méthode | Permission | Usage dans la feature |
|---|---|---|---|
| `/api/rooms?churchId=` | GET | `rooms:view` | **Existant, inchangé.** Fournit `isActive` / `isOwner` / `ownerChurch`, tout ce qu'il faut pour décider quelles lignes afficher et pour signaler une salle appartenant à une autre église. |
| `/api/room-reservations?churchId=` | GET | `rooms:view` | **Existant, inchangé.** Fournit l'historique complet avec `room`, `createdBy.id`, `checklistStatus`. |
| `/api/room-reservations/[id]` | PATCH | (garde existante) | **Existant, inchangé.** Annulation, déclenchée depuis le détail uniquement. |
| `/api/room-reservations/[id]/checklist` | PATCH | (garde existante) | **Existant, inchangé.** Déclarations d'ouverture / fermeture, désormais aussi déclenchables depuis l'encart — même appel, mêmes gardes serveur. |

> L'encart réutilise **strictement** les fonctions d'appel déjà écrites dans le composant
> (`openChecklist` → `submitChecklist`). Aucun contournement de garde : le serveur
> revalide, comme aujourd'hui, que l'appelant est bien l'auteur de la réservation.

## Services / logique métier

**[Aucun service métier ajouté]** — `src/modules/rooms/services/` n'est pas touché, aucun
événement de bus n'est émis. La feature ne produit aucune règle métier : elle présente
autrement des données déjà servies.

Un unique fichier de **calcul de présentation**, sans état ni effet de bord :

### `src/app/(auth)/rooms/calendar.ts` (nouveau)

| Fonction | Rôle |
|---|---|
| `localDateStr(date)` | Date **locale** au format `YYYY-MM-DD` — clé de toutes les cellules. Déplacée depuis le composant. |
| `addDays(date, n)` | Décalage de jours (navigation de semaine). |
| `getWeekStart(date)` | Lundi 00h00 **local** de la semaine contenant `date`. |
| `buildWeekDays(weekStart)` | Les 7 jours lundi → dimanche de la semaine. |
| `buildMonthDays(year, month)` | Grille mensuelle en semaines pleines. **Déplacée** depuis le composant, signature de sortie alignée sur `buildWeekDays`. |
| `formatWeekLabel(weekStart)` | Libellé de période (« 8 – 14 septembre 2026 », « 28 sept. – 4 octobre 2026 » à cheval sur deux mois). |
| `cellKey(roomId, dateStr)` | Clé composite `salle|jour`. |
| `groupByRoomAndDay(reservations)` | `Map<cellKey, Reservation[]>`, chaque cellule triée par heure de début. Générique sur `{ room: { id }, startAt }` pour rester indépendante du composant. |

**Correction du bug de date, à la racine.** Le regroupement actuel fait
`r.startAt.split("T")[0]` (`RoomsBookingClient.tsx:238`), c'est-à-dire la date **UTC** :
une réservation du 9 septembre à 00h30 heure de Paris est stockée `2026-09-08T22:30:00Z`
et s'affiche donc le 8. `groupByRoomAndDay` étant l'**unique** point de regroupement, la
correction vaut d'emblée pour la vue semaine **et** pour la vue mois — pas de garde à
poser à deux endroits.

## UI / composants

### Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/app/(auth)/rooms/calendar.ts` | **Nouveau** — helpers ci-dessus. |
| `src/app/(auth)/rooms/calendar.test.ts` | **Nouveau** — tests unitaires (cf. stratégie de tests). |
| `src/app/(auth)/rooms/RoomsBookingClient.tsx` | **Modifié** — refonte du mode calendrier, ajout de l'encart, bascule à trois entrées. |
| `src/app/(auth)/rooms/page.tsx` | **Inchangé** — les props (`churchId`, `canReserve`, `canManage`, `currentUserId`) suffisent déjà. |

### État du composant

```
view : "list" | "calendar"          →  "week" | "month" | "list"   (défaut : "week")
```

Une **ancre de période unique** (`anchor: Date`) remplace le `currentMonth: string` interne
à `RoomCalendarView` : les flèches déplacent l'ancre de 7 jours en vue semaine, d'un mois
en vue mois. Bénéfice direct : basculer semaine ↔ mois **conserve la période consultée** au
lieu de ramener au mois courant.

Le `selectedRoomId` **obligatoire** (qui retombait sur `rooms[0]`) devient un `filterRoomId`
**facultatif**, valeur vide = « Toutes les salles », rendu par le `Select` existant avec sa
prop `placeholder` — même composant, même usage que le filtre de la vue liste.

### Grille semaine (salles × jours)

Grille CSS `grid-cols-[<colonne salle>_repeat(7,minmax(0,1fr))]` :

- **en-tête** : cellule « Salle » + 7 colonnes `Lun 8 … Dim 14`, jour courant mis en
  évidence ;
- **une ligne par salle affichée** : libellé (et nom de l'église propriétaire si
  `!isOwner`, comme le fait déjà la liste déroulante), puis 7 cellules ;
- **cellule** : les réservations de `groupByRoomAndDay`, chacune rendue par le même petit
  bouton `heure + titre` qu'aujourd'hui, ouvrant le détail au clic.

**Salles affichées** (arbitrage de la spec) :

```
rooms.filter(r => r.isActive || <r a au moins une réservation dans la période affichée>)
```

Le second terme se lit directement dans la `Map` de regroupement — aucun coût, aucune
requête : les jours de la période sont déjà connus.

**Mobile** : la grille est enveloppée dans un conteneur `overflow-x-auto` avec une largeur
minimale ; la colonne « Salle » est `sticky left-0` pour que l'identité de la ligne reste
lisible pendant le défilement horizontal. La page elle-même ne déborde donc jamais.

### Grille mensuelle

La grille existante est conservée telle quelle (`buildMonthDays`, mise en évidence du jour,
jours hors mois grisés). Deux changements :

- la cellule d'un jour agrège les réservations de **toutes les salles affichées** (union
  des `cellKey(room.id, day)` sur les salles visibles), triée par heure de début ;
- chaque réservation préfixe le nom de sa salle, puisqu'elles ne sont plus homogènes.

### Distinction visuelle des réservations propres

Un seul bouton de réservation, partagé par les deux grilles, avec deux styles :

- **les siennes** (`createdBy.id === currentUserId`) : violet plein (`bg-icc-violet`,
  texte blanc) ;
- **les autres** : violet léger (`bg-icc-violet/10`), soit le style actuel.

### Encart « Mes réservations »

Rendu **au-dessus** de la bascule de vue, donc affiché à l'identique en vue semaine, mois
et liste — l'indépendance vis-à-vis des filtres découle mécaniquement de sa position dans
l'arbre, pas d'un état à synchroniser.

- **Source** : `activeReservations` (déjà dérivé), filtré sur
  `createdBy.id === currentUserId` **et** `endAt >= maintenant`, trié par `startAt`
  croissant. Les 4 premières lignes sont affichées.
- **Ligne** : titre, date/heure, salle, badge de main courante
  (`CHECKLIST_BADGE` / `CHECKLIST_LABELS` existants), puis les actions.
- **Actions** : issues de `getAvailableActions(r, { currentUserId, canManage })`, la
  fonction déjà utilisée par la liste et le détail — c'est elle qui garantit qu'on ne
  propose jamais une action que le serveur refuserait. `canDeclareOpen` →
  « Déclarer l'ouverture », `canDeclareClose` → « Déclarer la fermeture », plus
  « Détails ». **Pas d'annulation** (arbitrage de la spec).
- **Repli** : un `useState` local ; l'en-tête cliquable bascule l'ouverture.
- **Débordement** : au-delà de 4 lignes, un lien bascule sur la vue liste avec
  `filterMine` activé et les autres filtres remis à zéro — la case à cocher existante est
  ainsi **réutilisée** comme destination, elle n'est pas supprimée.
- **Vide** : si l'utilisateur n'a aucune réservation à venir, le composant ne rend rien.
  Un Secrétaire, qui ne réserve jamais, ne verra donc jamais l'encart, sans qu'on ait à
  tester son rôle.

## Décisions & alternatives écartées

- **D1 — Tout garder dans `RoomsBookingClient.tsx`, n'extraire que `calendar.ts`.**
  *Pourquoi* : le fichier colocalise déjà `KeyPersonField`, `RoomCalendarView` et
  `ReservationDetailModal` ; c'est la convention du fichier. Il passerait d'environ 890 à
  environ 1 150 lignes, ce qui reste **sous** six fichiers `.tsx` existants du repo
  (jusqu'à 1 482 lignes). `calendar.ts` est extrait pour une **raison concrète**, pas
  esthétique : cf. D3.
  *Écarté* : éclater en `RoomsCalendarView.tsx` + `MyReservationsPanel.tsx` + un
  `shared.ts` pour les types et constantes communs. *Raison* : les types (`Room`,
  `Reservation`) et constantes (`CHECKLIST_BADGE`, `getAvailableActions`) vivent
  aujourd'hui dans le composant ; les partager imposerait soit un import circulaire, soit
  un troisième fichier fourre-tout — trois fichiers de plus pour zéro gain fonctionnel.

- **D2 — `calendar.ts` en frère du composant, pas dans `src/modules/rooms/`.**
  *Pourquoi* : `src/modules/rooms/index.ts` réexporte les services, qui importent
  `@/lib/prisma`. Un composant client qui importerait `@/modules/rooms` **tirerait Prisma
  dans le bundle navigateur**. Et la constitution (§I) interdit d'importer un chemin
  interne du module pour contourner l'index. Un fichier frère, sans dépendance, est la
  seule place correcte — d'autant que ces fonctions sont de la **présentation**, pas du
  métier : elles ne décident de rien, elles rangent des cases.

- **D3 — Extraire les helpers pour les rendre testables.**
  *Pourquoi* : `vitest.config.ts` a `include: ["src/**/*.test.ts", …]` (pas `.tsx`) et
  `environment: "node"`. Une logique de date laissée dans le `.tsx` serait **hors de portée
  des tests**. Or c'est précisément la logique la plus piégeuse de la feature (début de
  semaine, changement d'heure, jour local vs UTC).

- **D4 — Une ancre de période unique pour les deux vues calendaires.**
  *Pourquoi* : un seul `Date` au lieu d'un `currentMonth: string` plus un `currentWeek` ;
  la conversion se fait à l'affichage. Effet de bord recherché : la période est conservée
  quand on bascule semaine ↔ mois.
  *Écarté* : deux états de navigation indépendants. *Raison* : deux sources de vérité à
  garder cohérentes, pour un comportement moins bon.

- **D5 — Vue semaine par défaut.**
  *Pourquoi* : la spec en fait l'horizon de décision réel. Le mois reste à un clic.

- **D6 — Corriger le bug de date dans le regroupement partagé, pas dans chaque vue.**
  *Pourquoi* : `groupByRoomAndDay` est l'unique point de rattachement d'une réservation à
  un jour. Une correction là couvre semaine et mois ; une correction par vue en laisserait
  une cassée à la prochaine vue ajoutée.

- **D7 — Le filtre de salle ne masque pas l'encart.**
  *Pourquoi* : la spec exige que l'encart soit indépendant des filtres. Le placer **au-
  dessus** de la bascule rend cette indépendance structurelle plutôt que conventionnelle —
  il n'y a aucun état à ne pas oublier de propager.

## Risques & points d'attention

1. **[Tranché le 2026-08-30 — aucune action] Salles partagées : une case vide ne prouve
   pas la disponibilité.**
   `GET /api/room-reservations?churchId=` filtre sur `where: { churchId }` : il ne renvoie
   que les réservations **de l'église courante**. Sur une salle partagée par une autre
   église, la grille affichera donc une case **vide** alors que la salle est occupée. Cela
   respecte le critère « aucune réservation d'une autre église n'apparaît » de la spec,
   mais contredirait le scénario principal (« quelle salle est libre jeudi ? »).
   **Décision : ne rien changer.** Aucune salle n'est partagée entre églises en production
   aujourd'hui — le défaut est purement théorique, et le calendrier mono-salle actuel le
   porte déjà. Ni mention visuelle, ni appel supplémentaire : on n'écrit pas de code pour
   un cas qui n'existe pas.
   *Voie de sortie le jour où le partage sera utilisé* : la route sait déjà répondre, sa
   branche `?roomId=` renvoie l'occupation toutes églises confondues avec les détails
   masqués (titre `"Réservé"`, auteur `null`). Le vrai garde-fou reste de toute façon le
   contrôle de conflit **côté serveur** au moment de la création, qui, lui, voit toutes les
   églises.

2. **Chargement non borné de l'historique.** Le composant appelle
   `/api/room-reservations?churchId=` **sans `from`/`to`** : il rapatrie tout l'historique
   de l'église à chaque montage, alors qu'il n'en affiche qu'une semaine ou un mois. Le
   plafond est connu et déjà présent avant cette feature ; la spec exclut explicitement
   tout changement d'échange serveur. À marquer d'un commentaire `ponytail:` dans le code,
   avec la voie de sortie (passer `from`/`to`, que la route accepte déjà) le jour où le
   volume le justifiera.

3. **Fuseau horaire et changement d'heure.** Toute la logique repose sur l'heure **locale
   du navigateur** (`getDay`, `getHours`, `setHours(0,0,0,0)`). C'est le comportement
   voulu — l'utilisateur raisonne dans son fuseau — mais cela rend les tests sensibles à
   `TZ`. Voir la stratégie de tests pour la parade.

4. **Densité d'une cellule.** Une salle très réservée un même jour empile plusieurs
   boutons dans une case étroite. Avec moins de 10 salles et l'usage constaté, on assume ;
   la case défile si besoin. Aucune troncature « +N autres » n'est prévue à ce stade
   (non demandé par la spec).

5. **Régression de la vue mois.** Elle passe de mono-salle à multi-salles : une cellule de
   jour peut désormais contenir nettement plus d'entrées qu'avant. C'est l'effet recherché,
   mais c'est la seule partie de la feature qui **modifie un écran existant** plutôt que
   d'en ajouter un — à vérifier explicitement à la recette.

## Stratégie de tests

### Tests unitaires — `src/app/(auth)/rooms/calendar.test.ts` (Vitest)

Toute la logique piégeuse est dans `calendar.ts`, et elle est pure : c'est là que portent
les tests.

| Fonction | Cas couverts |
|---|---|
| `getWeekStart` | un jeudi ramène au lundi à 00h00 ; **un dimanche appartient à la semaine écoulée**, pas à la suivante (piège classique de `getDay() === 0`) ; idempotence sur un lundi ; franchissement du **changement d'heure** (dimanche 25 octobre 2026) sans décalage de semaine. |
| `buildWeekDays` | 7 jours consécutifs lundi → dimanche ; semaine **à cheval sur deux mois**. |
| `buildMonthDays` | grille en semaines pleines (longueur multiple de 7) ; jours de débordement marqués `inMonth: false` ; bon nombre de jours dans le mois. |
| `groupByRoomAndDay` | deux salles le même jour ne se mélangent pas ; chaque cellule triée par heure de début ; **une réservation à 23h et une à 00h30 le lendemain tombent dans deux cellules distinctes** — c'est le test qui verrouille la correction du bug UTC. |

**Neutralité au fuseau** : les dates de test sont construites avec le constructeur **local**
(`new Date(2026, 8, 10, 23)`) et les horodatages dérivés par `.toISOString()`. Les
assertions restent donc vraies quel que soit le `TZ` de la machine ou de la CI, sans avoir
à forcer un fuseau global dans `vitest.config.ts` (ce qui risquerait de déstabiliser les
tests de date existants).

### Non couvert par des tests automatisés

Le rendu React n'est pas testable en l'état : `vitest.config.ts` tourne en
`environment: "node"` et n'inclut que `*.test.ts`. Monter un environnement DOM et une
bibliothèque de rendu pour cette feature serait un chantier à part entière, hors périmètre.
La recette du rendu est donc **manuelle**, guidée par les critères d'acceptation de la
spec, avec une attention particulière sur :

- l'encart présent et identique dans les trois vues, filtres modifiés ;
- l'action proposée par l'encart qui suit l'état réel de la main courante ;
- une réservation de soirée tardive affichée au bon jour (le bug corrigé) ;
- la ligne d'une salle désactivée qui subsiste tant qu'elle porte une réservation ;
- la grille consultable sur mobile sans débordement horizontal de la page ;
- un compte Secrétaire qui ne se voit proposer aucune action.

### Portes de qualité

`npm run typecheck && npm run lint && npm run lint:boundaries && npm run test` avant PR
(constitution §V). `lint:boundaries` doit rester vert **sans modification de
`.dependency-cruiser.cjs`** : c'est la preuve que `calendar.ts` n'a introduit aucune
dépendance interdite.

---

*Aucune question ouverte. Étape suivante : `/tasks`.*
