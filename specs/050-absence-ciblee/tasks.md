# Tâches — Absence ciblée par département et par événement

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [ ] Branche créée : `feat/absence-ciblee`
- [ ] Migration Prisma générée (schéma modifié)

## Tâches

### 1. Données & migration

- [ ] **T1** — Modifier le schéma :
  - ajouter l'enum `AbsenceKind` (`PERIOD`, `EVENTS`) ;
  - sur `Absence` : ajouter `kind` (défaut `PERIOD`) et `allDepartments` (défaut `true`), rendre
    `startDate` / `endDate` nullables, ajouter les relations `targetDepartments` et `targetEvents` ;
  - créer les modèles `AbsenceDepartment` et `AbsenceEvent` (`eventId` nullable,
    `onDelete: SetNull`, instantanés `eventTitle` / `eventDate`, contrainte unique et index) ;
  - ajouter les relations inverses sur `Department` et `Event`.

  *(fichier : `prisma/schema.prisma`)*
- [ ] **T2** — Générer la migration `add_absence_targeting` avec `npm run db:migrate`.
  - Vérifier le SQL : aucune modification de données, colonnes de dates en `NULL`.
  - Lancer `prisma generate`.

  *(fichier : `prisma/migrations/*_add_absence_targeting/migration.sql`)*

### 2. Logique métier (services)

- [ ] **T3** — Créer le module de ciblage :
  - `absenceCoverageWhere({ eventId, eventDate, departmentId? })` : filtre Prisma ;
  - `absenceCovers(...)` : même règle en fonction pure ;
  - `effectiveDepartmentIds(absence, memberDepartmentIds)` ;
  - `lastEffectiveDate(absence)` : `endDate` pour une période, dernière date d'événement encore
    existant pour des événements.

  *(fichier : `src/modules/planning/services/absence-targeting.ts`)*
- [ ] **T4** — Ajouter `validateTargeting(tx, { churchId, memberId, kind, eventIds, allDepartments, departmentIds, declarerScope })`.
  Contrôles :
  - les départements visés appartiennent au STAR, et au périmètre du déclarant s'il est restreint
    et que `allDepartments` vaut `false` ;
  - les événements sont de la même église, à venir, jamais un parent de série ;
  - chaque événement attend au moins un département visé.

  Lève `ApiError` 400 ou 403 et renvoie les instantanés à enregistrer.

  *(fichier : `src/modules/planning/services/absence-targeting.ts`)*
- [ ] **T5** — Ajouter `listTargetOptions(churchId, memberId, declarerScope, { from, to })`.
  - Départements du STAR avec `selectable`.
  - Événements futurs, 6 mois par défaut, hors parents de série, avec `departmentIds` attendus.

  *(fichier : `src/modules/planning/services/absence-targeting.ts`)*
- [ ] **T6** — Adapter `findAbsenceConflicts` pour qu'il reçoive un objet de ciblage
  (`kind`, dates, `eventIds`, `allDepartments`, `departmentIds`) au lieu de `(startDate, endDate)`.
  Filtrer les plannings `EN_SERVICE*` par date ou par événement, puis par département.

  *(fichier : `src/modules/planning/services/absence.service.ts`)*
- [ ] **T7** — `resolveResponsibleUserIds` : ajouter un paramètre optionnel `departmentIds`,
  intersecté avec les départements actuels du STAR.

  *(fichier : `src/modules/planning/services/absence.service.ts`)*
- [ ] **T8** — `declareAbsence` :
  - accepter le ciblage et appeler `validateTargeting` ;
  - enregistrer `AbsenceDepartment` et `AbsenceEvent` dans la transaction ;
  - notifier uniquement les responsables des départements effectifs ;
  - adapter les textes de notification (période ou liste d'événements).

  *(fichier : `src/modules/planning/services/absence.service.ts`)*
- [ ] **T9** — `updateAbsence` :
  - permettre de modifier le ciblage, remplacer les lignes de liaison et rafraîchir les instantanés ;
  - fonder le contrôle « absence passée » sur `lastEffectiveDate` ;
  - envoyer `ABSENCE_UPDATED` à l'union dédupliquée des responsables avant et après.

  *(fichier : `src/modules/planning/services/absence.service.ts`)*
- [ ] **T10** — `cancelAbsence` : notifier les responsables des départements effectifs.

  *(fichier : `src/modules/planning/services/absence.service.ts`)*
- [ ] **T11** — Types du bus :
  - `planning:absence:declared|updated` : `startDate` et `endDate` passent en `string | null` ;
    ajouter `kind`, `allDepartments`, `departmentIds` et `eventIds` ;
  - mettre à jour les émissions correspondantes.

  *(fichiers : `src/modules/planning/events.ts`, `absence.service.ts`)*
- [ ] **T12** — Déplacer `findActiveAbsencesByMember` de la route planning vers le module, sous
  le nom `findActiveAbsencesForPlanning(churchId, memberIds, { eventId, eventDate, departmentId })`.
  Il utilise `absenceCoverageWhere` et renvoie `{ id, kind, startDate, endDate, eventCount }`.

  *(fichier : `src/modules/planning/services/absence-targeting.ts`)*
- [ ] **T13** — `findActiveAbsenceForMember` (ouverture/fermeture) : ne prendre en compte que les
  absences `allDepartments = true` qui couvrent l'événement (période ou événement ciblé).

  *(fichier : `src/modules/planning/services/opening-closing.service.ts`)*
- [ ] **T14** — Ajouter le filtre de visibilité et de filtrage :
  - `absenceVisibilityWhere(departmentIds)` : absence « tous départements » d'un membre de ces
    départements, ou absence ciblée sur l'un d'eux ;
  - `absenceDepartmentFilterWhere(departmentId | ministryId)`.

  *(fichier : `src/modules/planning/services/absence-targeting.ts`)*
- [ ] **T15** — Exporter les nouvelles fonctions et types depuis l'index du module.

  *(fichier : `src/modules/planning/index.ts`)*

### 3. API (route handlers)

- [ ] **T16** — POST `/api/absences` :
  - étendre `createSchema` avec le ciblage (`superRefine` : une période exige des dates, des
    événements exigent au moins un événement, un ciblage de départements exige au moins un
    département) ;
  - passer le périmètre du déclarant au service.

  *(fichier : `src/app/api/absences/route.ts`)*
- [ ] **T17** — GET `/api/absences` :
  - remplacer le filtre de périmètre restreint et les filtres département/ministère par
    `absenceVisibilityWhere` et `absenceDepartmentFilterWhere` ;
  - inclure `kind`, `allDepartments`, `targetDepartments` (tous, noms compris) et `targetEvents`
    (`deleted` si `eventId` est nul, dates vivantes sinon) ;
  - enrichir les conflits avec le ciblage.

  *(fichier : `src/app/api/absences/route.ts`)*
- [ ] **T18** — PATCH `/api/absences/[id]` : ajouter les champs de ciblage, optionnels, à la
  branche `update`.

  *(fichier : `src/app/api/absences/[id]/route.ts`)*
- [ ] **T19** [P] — Export :
  - réappliquer `absenceVisibilityWhere` ;
  - ajouter les colonnes « Départements visés » (« Tous » par défaut) et « Événements visés »
    (« événement supprimé » le cas échéant) ;
  - laisser « Début » et « Fin » vides pour une absence sur événements.

  *(fichier : `src/app/api/absences/export/route.ts`)*
- [ ] **T20** [P] — Nouvelle route `GET /api/absences/target-options` : gardes identiques à
  `backup-options` (soi-même, ou `absences:manage` + périmètre + même église), puis appel à
  `listTargetOptions`.

  *(fichier : `src/app/api/absences/target-options/route.ts`)*
- [ ] **T21** [P] — Route planning : utiliser `findActiveAbsencesForPlanning` depuis
  `@/modules/planning` (événement et département courants) et supprimer la fonction locale.

  *(fichier : `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)*

### 4. UI

- [ ] **T22** — Formulaire de déclaration et de modification :
  - bloc « Quand ? » : période (défaut) ou événements précis, ces derniers en cases à cocher
    groupées par mois ;
  - bloc « Pour quels départements ? » : tous (défaut) ou certains (`CheckboxGroup`, départements
    non `selectable` masqués) ;
  - chargement de `target-options` au changement de STAR ;
  - filtrage des événements selon les départements cochés, avec décochage et message ;
  - blocs repliés affichant un résumé ; pré-remplissage en modification ;
  - envoi du ciblage.

  *(fichier : `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [ ] **T23** — Tableau :
  - colonne « Période » renommée « Quand » (période, ou premier événement « +N » avec détail ;
    événement supprimé barré avec sa mention) ;
  - nouvelle colonne « Départements » ;
  - dates nullables gérées dans le tri.

  *(fichier : `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [ ] **T24** [P] — Frise : barre pour une période, marqueurs aux dates des événements existants
  pour des événements ; événements supprimés ignorés.

  *(fichier : `src/app/(auth)/absences/AbsencesTimeline.tsx`)*
- [ ] **T25** [P] — `AbsenceBadge` : libellé « Absent · période » ou « Absent · cet événement »
  selon `kind`.

  *(fichier : `src/components/PlanningGrid.tsx`)*
- [ ] **T26** — Vérification mobile à 375 px :
  - cibles tactiles d'au moins 44 px ;
  - liste d'événements avec défilement interne ;
  - aucun défilement horizontal de la page.

  *(fichiers : `AbsencesClient.tsx`, `AbsencesTimeline.tsx`)*

### 5. Tests

- [ ] **T27** [P] — Tests du module de ciblage :
  - table de vérité de `absenceCovers` (période ou événements × tous ou certains départements ×
    département dedans ou dehors × événement dedans, dehors, entre deux événements ciblés ou
    supprimé) ;
  - `effectiveDepartmentIds` (département quitté, département rejoint ensuite) ;
  - `validateTargeting` : chaque cas d'erreur 400 et 403 ;
  - `listTargetOptions` (parents de série exclus, `selectable`).

  *(fichier : `src/modules/planning/services/absence-targeting.test.ts`)*
- [ ] **T28** — Tests du service d'absence :
  - adapter les appels existants à la nouvelle signature ;
  - conflit ciblé : Accueil planifié et absence Louange donnent zéro conflit ; l'événement
    intermédiaire n'est pas touché ;
  - notifications limitées aux départements visés, à la déclaration, à la modification (union
    avant/après) et à l'annulation ;
  - non-régression d'une absence avec les valeurs par défaut ;
  - payload du bus.

  *(fichier : `src/modules/planning/services/absence.service.test.ts`)*
- [ ] **T29** — Tests de sécurité :
  - un responsable Accueil ne voit pas une absence Louange seule, mais voit une absence
    Louange + Accueil avec les deux noms ;
  - POST avec un département hors périmètre : 403 ; POST « tous départements » : 201 ;
  - événement d'une autre église : 400 ;
  - `target-options` : 403 hors périmètre ou autre église ;
  - export : identifiants hors périmètre ignorés et colonnes de ciblage présentes.

  *(fichier : `src/app/api/absences/__tests__/security.test.ts`)*
- [ ] **T30** [P] — Route planning : `activeAbsence` présent pour le département et l'événement
  ciblés, absent pour un autre département ou l'événement suivant.

  *(fichier : `src/app/api/events/[eventId]/departments/[deptId]/planning/__tests__/route.test.ts`)*
- [ ] **T31** [P] — Ouverture/fermeture : `absenceWarning` levé pour une absence « tous
  départements », pas pour une absence ciblée.

  *(fichier : `src/modules/planning/services/opening-closing.service.test.ts`, à créer ou étendre)*

### 6. Documentation

- [ ] **T32** [P] — Documenter le nouveau schéma (tables `absence_departments` et
  `absence_events`), la route `target-options` et les champs de ciblage.

  *(fichiers : `docs/database.md`, `docs/api.md`)*
- [ ] **T33** [P] — Mettre à jour le CHANGELOG, section « Non publié » : absence ciblée, et
  changement de visibilité pour les responsables.

  *(fichier : `CHANGELOG.md`)*

## Vérification finale

- [ ] `npm run typecheck` (aucun `!` pour contourner la nullabilité des dates)
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run build` (lot UI : frontière client/serveur)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] Déploiement staging : les absences existantes s'affichent à l'identique après
      `migrate deploy`, et vérification manuelle mobile
- [ ] Spec au statut `Implémentée`, plan au statut `Implémenté`
- [ ] PR ouverte vers `main` (référence `specs/050-absence-ciblee/`, `Closes #557`)

## Couverture des critères d'acceptation

| Critère (spec) | Tâches |
|---|---|
| Période + tous départements sans étape en plus | T1, T22, T28 (non-régression) |
| Restreindre à certains départements | T4, T16, T22, T27 |
| Événements précis parmi ceux où un département est attendu | T4, T5, T20, T22, T27 |
| Combinaison des deux ciblages | T3, T27 |
| Badge limité aux couples couverts | T12, T21, T25, T30 |
| Événement intermédiaire non affecté | T3, T27, T28, T30 |
| Conflit limité aux couples couverts | T6, T28 |
| Notifications limitées aux responsables concernés | T7–T10, T28 |
| Absence ciblée hors périmètre invisible pour un responsable | T14, T17, T29 |
| Responsable : « tous » toujours possible, ciblage limité à son périmètre | T4, T5, T22, T29 |
| Responsable voit tous les départements visés | T17, T23, T29 |
| Jamais de changement automatique de statut | Aucune écriture sur `Planning` (T8/T9), vérifié en T28 |
| Événement supprimé : reste dans l'historique | T1, T17, T23, T27 |
| L'absence suit l'événement déplacé | T3 (dates lues en direct), T27 |
| Absences existantes inchangées | T1, T2, T28 |
| Filtres ministère/département respectent le ciblage | T14, T17, T29 |
| Export indique le ciblage | T19, T29 |
| Motif, backups, modification, annulation | T8–T10, T18, T28 |
| Utilisable sur mobile | T22, T26 |
| Aucune fuite entre églises | T4, T20, T29 |
