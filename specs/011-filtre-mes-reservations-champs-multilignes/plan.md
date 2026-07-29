# Plan technique — Filtre « mes réservations », vue de la main courante et champs multi-lignes

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-07-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun changement — tout reste dans `src/app/(auth)/rooms/` et
      `src/app/api/room-reservations/`, aucune nouvelle dépendance entre modules.
- [x] **Sécurité** : la route `GET /api/room-reservations` étendue reste protégée par
      `requireChurchPermission("rooms:view", …)` (inchangé) ; les champs de main courante ajoutés
      à la réponse sont déjà visibles côté client aujourd'hui via `checklistStatus` et via le
      tableau de contrôle — aucune nouvelle donnée sensible exposée à un rôle qui n'y avait pas
      déjà accès.
- [x] **Permissions** : inchangées.
- [x] **Validation** : aucune nouvelle mutation ; la seule route modifiée est un `GET`.
- [x] **Migration** : `[Aucun changement]` — tous les champs affichés existent déjà en base
      (ajoutés en 009).
- [x] **Enums** : inchangés.
- [x] **UI** : réutilise `DataTable`, `Modal`, `Select`, `Button`, et le nouveau `Textarea` (à
      créer, cf. ci-dessous) ; introduit un composant de présentation partagé `ChecklistDetail`
      pour éviter de dupliquer l'affichage du détail d'une main courante entre les deux écrans qui
      en ont besoin.

## Approche générale

Cinq changements, tous côté `rooms`, qui s'appuient sur les patterns déjà établis en 009/010 :

1. **Filtre « mes réservations »** : filtre client-side supplémentaire sur la vue liste (comme les
   filtres 010).
2. **Champs multi-lignes** : nouveau composant `Textarea`, substitué à `Input` sur les champs de
   notes/écarts identifiés.
3. **Détail complet de la main courante** : un composant de présentation partagé `ChecklistDetail`
   (aucune logique, juste de l'affichage) qui rend l'ensemble des champs d'une main courante
   (déclaration d'ouverture, de fermeture, résultat du contrôle), avec un libellé « non renseigné »
   pour les champs vides. Utilisé (a) dans le détail de réservation du calendrier
   (`ReservationDetailModal`, 009), qui nécessite d'abord que l'API renvoie le détail complet de la
   main courante (aujourd'hui seul le statut est renvoyé) ; (b) dans le tableau de contrôle, où le
   bouton d'action existant (« Contrôler ») devient le point d'entrée unique vers un même écran de
   détail — éditable quand une action est possible (fermeture déclarée à contrôler), lecture seule
   sinon.
4. **Filtres date et responsable** sur le tableau de contrôle : mêmes `useMemo`/`Select` que les
   filtres salle/statut déjà en place (010), plus deux champs de date (« Du » / « Au »).
5. **Bouton de retour** sur la page du tableau de contrôle : lien simple vers `/rooms`, ajouté au
   Server Component de la page (pas de nouvel état client).

Chaque contrôle ajouté (filtres, boutons) suit les conventions responsive déjà utilisées dans ces
mêmes écrans (`flex flex-col sm:flex-row` pour empiler les filtres sur mobile, largeurs `w-full
sm:w-*`, cibles tactiles `min-h-[44px]`) — `DataTable` gère déjà nativement une vue carte sur
mobile, aucun changement nécessaire de ce côté.

## Modèle de données

`[Aucun changement]`

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/room-reservations` (sans `roomId`) | GET | `rooms:view` — inchangé | inchangée | `checklist` étendu du simple statut à l'objet complet (voir ci-dessous) |

Le `select` Prisma du `checklist` dans la branche « historique de l'église » (sans `roomId`) passe
de `{ status: true }` à l'ensemble des champs déjà exposés par le tableau de contrôle
(`openedAt`, `keyReceivedFromName`, `openingNotes`, `closedAt`, `closedProperly`, `cleaned`,
`equipmentOk`, `equipmentNotes`, `keyReturnedToName`, `closingNotes`, `incidentNotes`,
`closedWithoutDeclaration`) **plus** les champs de résultat de contrôle non encore exposés nulle
part côté client (`validatedAt`, `validatedClosedProperly`, `validatedCleaned`,
`validatedEquipmentOk`) — ces derniers manquaient déjà au tableau de contrôle lui-même (gap
constaté en explorant le code, à combler dans la même tâche). La réponse conserve le champ
`checklistStatus` existant (utilisé par le calendrier/la liste/les actions) et ajoute un champ
`checklist: {...} | null` avec le détail complet, pour ne rien casser des usages actuels.

## Services / logique métier

`[Aucun changement]`

## UI / composants

- **Nouveau** `src/components/ui/Textarea.tsx` : cf. décisions déjà actées pour cette spec (champ
  `<textarea>` sur le modèle d'`Input`, `rows` par défaut `3`).
- **Nouveau** `src/app/(auth)/rooms/ChecklistDetail.tsx` : composant de présentation partagé
  (aucun état, aucune requête) qui prend un `checklist: Checklist | null` et affiche : déclaration
  d'ouverture (heure, clés reçues, notes), déclaration de fermeture (heure, état
  fermeture/propreté/matériel, notes matériel, clés remises, notes), résultat du contrôle (heure,
  concordance constatée, écart le cas échéant) — chaque section absente affichant « Non renseigné »
  plutôt que d'être omise silencieusement, pour rendre visible ce qui manque (cohérent avec
  l'exigence de la spec 008 sur les mains courantes non déclarées).
- `src/app/(auth)/rooms/RoomsBookingClient.tsx` :
  - Vue liste : case à cocher « Mes réservations uniquement » dans le `useMemo`
    `displayedReservations` existant (`r.createdBy.id === currentUserId`).
  - Champs `checklistNotes` et `equipmentNotes` de la modale de déclaration : `Input` → `Textarea`.
  - `Reservation` gagne un champ `checklist: Checklist | null` (nouvelle donnée de l'API) ;
    `ReservationDetailModal` rend `<ChecklistDetail checklist={reservation.checklist} />` en plus
    du badge de statut déjà affiché.
- `src/app/(auth)/rooms/checklists/RoomChecklistsClient.tsx` :
  - Champs `incidentNotes` (modale de contrôle) et `followUpNotes` (modale de suivi) : `Input` →
    `Textarea`.
  - Le bouton d'action par ligne devient toujours présent (« Contrôler » si `CLOSED_DECLARED`,
    sinon « Détails »), ouvrant dans les deux cas la même modale : celle-ci rend désormais
    `<ChecklistDetail checklist={r.checklist} />` en tête, suivi — uniquement si `CLOSED_DECLARED`
    — des contrôles éditables et du bouton « Valider le contrôle » déjà existants.
  - Ajout des filtres « Date » (deux `Input type="date"`, « Du »/« Au », filtrant sur `startAt`) et
    « Responsable » (`Select`, options dérivées de `reservations` comme `roomOptions`), intégrés
    au même `useMemo` `displayedReservations` que les filtres salle/statut (010).
- `src/app/(auth)/rooms/checklists/page.tsx` :
  - Étend le `select` Prisma pour inclure `validatedAt`, `validatedClosedProperly`,
    `validatedCleaned`, `validatedEquipmentOk` (déjà en base depuis 009, jamais exposés côté
    client) et les transmet dans le mapping vers `RoomChecklistsClient`.
  - Ajoute un lien de retour explicite vers `/rooms` à côté du titre `<h1>` (Server Component,
    `next/link`, même style que le lien existant « Contrôle des mains courantes » sur `/rooms`).

## Décisions & alternatives écartées

- **Choix** : composant `ChecklistDetail` partagé plutôt que dupliquer l'affichage dans les deux
  écrans — *Pourquoi* : le tableau de contrôle affichait déjà un résumé de la déclaration
  (« Déclaré par l'utilisateur : … ») sous une forme ad hoc (paragraphe concaténé) ; le
  généraliser en composant réutilisable évite d'avoir deux formats différents pour la même
  information entre le calendrier et le tableau de contrôle, et centralise le traitement
  « non renseigné ».
- **Choix** : un seul bouton par ligne du tableau de contrôle (« Contrôler » / « Détails » selon
  le statut) plutôt qu'un bouton « Détails » séparé en plus de « Contrôler » — *Pourquoi* : évite
  deux boutons qui ouvriraient la même modale avec un contenu qui se chevauche ; le libellé du
  bouton indique déjà si une action est possible ou non.
- **Choix** : filtre de date en `Input type="date"` « Du »/« Au » plutôt qu'un `Select` de
  périodes prédéfinies — *Pourquoi* : cohérent avec le sélecteur de période déjà utilisé dans le
  calendrier des événements (`type="month"` « Du »/« Au »), plus flexible qu'une liste de
  périodes fixes pour une recherche ponctuelle.
- **Écarté** : rendre les lignes du `DataTable` cliquables pour ouvrir le détail (au lieu d'un
  bouton dédié) — *Raison* : `DataTable` est un composant partagé par de nombreux écrans de
  l'application ; lui ajouter un comportement de clic de ligne serait un changement d'API plus
  large que nécessaire pour ce besoin, alors qu'un bouton dans la colonne actions déjà prévue à
  cet effet suffit et reste cohérent avec le reste de l'app.

## Risques & points d'attention

- **Volume de la réponse `GET /api/room-reservations`** : le détail complet de la main courante
  est désormais renvoyé pour chaque réservation de la liste (jusqu'à ~100 lignes, cf. `take` déjà
  en place ailleurs dans le module) — volumétrie négligeable, mêmes ordres de grandeur que le
  tableau de contrôle qui le fait déjà.
- Aucun autre risque notable : changements additifs, aucune donnée supplémentaire au-delà de ce
  qui est déjà accessible via le tableau de contrôle pour l'équipe dédiée, ou via la propre
  réservation pour son créateur.

## Stratégie de tests

Aucun test automatisé nouveau pour les changements UI (aucune convention de test de composants
dans ce repo, comme documenté en 009/010). La route `GET /api/room-reservations` étant déjà
couverte par `src/app/api/room-reservations/__tests__/security.test.ts` pour l'autorisation
(inchangée ici), aucun nouveau cas n'est nécessaire côté sécurité ; une vérification manuelle
couvre le contenu de la réponse étendue.

Vérification manuelle via le serveur de dev : filtre « mes réservations » (010, avec liste vide) ;
saisie multi-lignes sur les 4 champs concernés ; détail complet d'une main courante à tous les
statuts (y compris « non renseigné ») depuis le calendrier et depuis le tableau de contrôle ;
filtres date/responsable combinés aux filtres existants ; bouton de retour de la page de contrôle ;
lecture des écrans modifiés en largeur mobile (empilement des filtres, boutons atteignables).
