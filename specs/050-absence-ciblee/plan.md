# Plan technique — Absence ciblée par département et par événement

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-14

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : toute la logique de ciblage vit dans `src/modules/planning/services/`
      et est exposée par `@/modules/planning`. La fonction `findActiveAbsencesByMember`, aujourd'hui
      locale à la route planning, est déplacée dans le module.
- [x] **Sécurité** : les routes existantes gardent leurs gardes (`requireAuth` +
      `requireChurchPermission("absences:manage" | "absences:view", churchId)` + contrôle de
      périmètre départemental). La nouvelle route `GET /api/absences/target-options` suit le même
      schéma que `backup-options`. Chaque `eventId` et `departmentId` reçu est revérifié côté
      serveur : même église, départements du STAR, et départements du périmètre du déclarant
      s'il est restreint.
- [x] **Permissions** via `rolePermissions` : **aucune nouvelle permission**
      (`absences:view` / `absences:manage` inchangées).
- [x] **Validation** Zod : `createSchema` (POST) et la branche `update` (PATCH) sont étendus. Leur
      cohérence est vérifiée par `superRefine` : une période exige des dates, une absence sur
      événements exige au moins un événement.
- [x] **Migration** Prisma : `add_absence_targeting`, sans backfill de données (les défauts
      suffisent).
- [x] **Enums** : le nouvel enum `AbsenceKind` est importé depuis `@/generated/prisma/client`.
- [x] **UI** : le formulaire d'absence utilise `CheckboxGroup`, `Select`, `Input`, `Modal` et
      `Badge` de `src/components/ui/`. Aucun nouveau composant générique.
- [x] **Surface HTTP** (ADR-0012) : la nouvelle route `/api/absences/target-options` est déjà
      couverte par le préfixe `/api/absences` du manifeste planning. Aucune déclaration
      supplémentaire n'est nécessaire.

## Approche générale

Une absence porte désormais **deux axes de ciblage indépendants**, persistés sur l'absence
elle-même :

1. **Quand** (`kind`) :
   - `PERIOD` : dates de début et de fin, comme aujourd'hui.
   - `EVENTS` : une liste d'événements liés par référence, avec leurs dates lues en direct.
2. **Où** (`allDepartments`) :
   - `true` : tous les départements du STAR, y compris ceux qu'il rejoint plus tard.
   - `false` : une liste de départements ciblés.

Les défauts (`PERIOD` + `allDepartments = true`) donnent aux absences existantes un
comportement strictement identique, **sans migration de données**.

Le fil directeur est **un seul prédicat de couverture**, écrit une fois dans le service :
« l'absence A couvre-t-elle le couple (département D, événement E) ? ». Il existe sous deux
formes :

- une forme **filtre Prisma**, pour les requêtes (badge grille, conflits, ouverture/fermeture) ;
- une forme **fonction pure**, pour les tests et l'enrichissement en mémoire.

Tous les effets actuels (badge, conflits, notifications, visibilité, filtres, export) sont
réécrits pour passer par ce prédicat, au lieu de raisonner sur « la date chevauche la période ».

Le « département quitté » ne nécessite **aucune écriture** : le prédicat croise toujours
le ciblage avec l'appartenance courante (`member_departments`). « Événement déplacé » ne
nécessite rien non plus, puisque la date de l'événement est lue en direct.

## Modèle de données

```prisma
enum AbsenceKind {
  PERIOD   // plage de dates (comportement historique)
  EVENTS   // liste d'événements précis
}

model Absence {
  // … champs existants
  kind           AbsenceKind @default(PERIOD)
  allDepartments Boolean     @default(true)
  startDate      DateTime?   // devient nullable : renseigné ssi kind = PERIOD
  endDate        DateTime?   // idem

  targetDepartments AbsenceDepartment[]
  targetEvents      AbsenceEvent[]
}

/// Départements visés quand allDepartments = false.
model AbsenceDepartment {
  id           String @id @default(cuid())
  absenceId    String
  departmentId String

  absence    Absence    @relation(fields: [absenceId], references: [id], onDelete: Cascade)
  department Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@unique([absenceId, departmentId])
  @@index([departmentId])
  @@map("absence_departments")
}

/// Événements visés quand kind = EVENTS. La référence passe à NULL si l'événement est
/// supprimé ; l'instantané (titre, date) permet d'afficher « événement supprimé » dans
/// l'historique.
model AbsenceEvent {
  id         String    @id @default(cuid())
  absenceId  String
  eventId    String?
  eventTitle String    @db.VarChar(255)  // instantané à la déclaration, rafraîchi à chaque modification
  eventDate  DateTime                    // idem — affichage uniquement, jamais utilisé pour un effet

  absence Absence @relation(fields: [absenceId], references: [id], onDelete: Cascade)
  event   Event?  @relation(fields: [eventId], references: [id], onDelete: SetNull)

  @@unique([absenceId, eventId])
  @@index([eventId])
  @@map("absence_events")
}
```

Relations inverses à ajouter : `Department.absenceTargets` et `Event.absenceTargets`.

Migration `prisma migrate dev --name add_absence_targeting` :

- `ALTER` des colonnes `startDate` / `endDate` en `NULL`.
- Ajout de `kind` (défaut `PERIOD`) et `allDepartments` (défaut `1`).
- Création des deux tables avec leurs clés étrangères.

Aucune donnée n'est modifiée. Le job CI `migrations` rejoue la migration sur une base vierge.

Invariants garantis par le service (et non par la base) :

| kind | startDate/endDate | targetEvents |
|---|---|---|
| `PERIOD` | non nuls, `start ≤ end` | vide |
| `EVENTS` | nuls | ≥ 1 à la création |

| allDepartments | targetDepartments |
|---|---|
| `true` | vide |
| `false` | ≥ 1 |

`deleteEvents` (`event.service.ts`) fait un `deleteMany` sur `event`. Le `ON DELETE SET NULL`
de la clé étrangère s'applique donc côté MariaDB, sans modification du service.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/absences` | POST | soi-même, ou `absences:manage` + périmètre | `createSchema` étendu (voir ci-dessous) | absence + ciblage + conflits |
| `/api/absences/[id]` | PATCH `update` | créateur / soi / manager dans le périmètre (inchangé) | mêmes champs de ciblage, optionnels | idem |
| `/api/absences/[id]` | PATCH `cancel` | inchangé | inchangé | inchangé |
| `/api/absences` | GET `scope=self\|all` | inchangé | inchangé | chaque absence porte en plus `kind`, `allDepartments`, `targetDepartments[{id,name}]`, `targetEvents[{eventId\|null, title, date, deleted}]` |
| `/api/absences/export` | POST | inchangé | inchangé | nouvelles colonnes « Départements visés » et « Événements visés » ; « Début/Fin » vides pour une absence sur événements |
| `/api/absences/target-options` *(nouveau)* | GET | soi-même, ou `absences:manage` + périmètre (même logique que `backup-options`) | `?churchId=&memberId=&from=&to=` | `{ departments[{id,name,selectable}], events[{id,title,date,departmentIds[]}] }` |

Extension Zod (partagée POST / PATCH) :

```ts
const targetingSchema = z.object({
  kind: z.enum(["PERIOD", "EVENTS"]).default("PERIOD"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventIds: z.array(z.string().min(1)).max(52).default([]),
  allDepartments: z.boolean().default(true),
  departmentIds: z.array(z.string().min(1)).default([]),
}).superRefine(/* PERIOD ⇒ dates, EVENTS ⇒ eventIds.length ≥ 1, !allDepartments ⇒ departmentIds.length ≥ 1 */);
```

Un client ancien qui n'envoie que `startDate` et `endDate` reste valide grâce aux défauts.

`target-options` :

- `departments` : les départements du STAR. `selectable = false` pour ceux hors du périmètre
  d'un déclarant restreint (spec : « seuls ceux de son périmètre lui sont proposés »).
- `events` : les événements futurs de l'église (`date ≥ now`, borné à `to`, 6 mois par défaut)
  ayant au moins un `EventDepartment` sur un département du STAR. `departmentIds` liste ces
  départements attendus, ce qui permet à l'UI de filtrer les événements selon les
  départements cochés.

## Services / logique métier

Nouveau fichier `src/modules/planning/services/absence-targeting.ts`, réexporté par l'index :

- `absenceCoverageWhere({ eventId, eventDate, departmentId? })` : fragment Prisma `AbsenceWhereInput`.
  ```
  AND [
    OR [ {kind: PERIOD, startDate ≤ eventDate, endDate ≥ eventDate},
         {kind: EVENTS, targetEvents: some {eventId}} ],
    departmentId ? OR [ {allDepartments: true}, {targetDepartments: some {departmentId}} ] : {}
  ]
  ```
- `absenceCovers(absence, { eventId, eventDate, departmentId })` : version pure, testée sur la
  même table de vérité.
- `effectiveDepartmentIds(absence, memberDepartmentIds)` : `allDepartments` renvoie
  l'appartenance courante, sinon l'intersection ciblage ∩ appartenance.
- `validateTargeting(tx, { churchId, memberId, kind, eventIds, allDepartments, departmentIds, declarerScope })` :
  - départements ⊂ départements du STAR, et ⊂ périmètre du déclarant s'il est restreint et
    que `allDepartments = false` ;
  - événements de la même église, **futurs** (même règle de modification que les absences
    passées aujourd'hui), avec au moins un département visé attendu ;
  - lève `ApiError(400|403)`.
  - Renvoie les instantanés (titre, date) à persister.
- `listTargetOptions(churchId, memberId, declarerScope, range)` : alimente `target-options`.

Modifications de `absence.service.ts` :

- **`findAbsenceConflicts`** : prend un objet de ciblage au lieu de `(startDate, endDate)`.
  - Filtre les plannings `EN_SERVICE*` par date (`PERIOD`) ou par `eventId ∈ eventIds`
    (`EVENTS`).
  - Filtre par `departmentId ∈ departmentIds` si `!allDepartments`.
  - L'enrichissement `conflicts` de la GET liste passe par ce même chemin.
- **`resolveResponsibleUserIds`** : ajoute un paramètre optionnel `departmentIds`. Quand il est
  fourni, les responsables et ministres sont restreints à ces départements (intersectés avec
  l'appartenance du STAR).
- **`declareAbsence` / `updateAbsence`** :
  - appellent `validateTargeting` et persistent `AbsenceDepartment` / `AbsenceEvent` dans la
    transaction existante ;
  - notifient les responsables des départements **effectifs**.
  - En modification, notification `ABSENCE_UPDATED` à l'**union** des responsables avant et après,
    pour que les « nouvellement concernés » soient prévenus. Le responsable retiré est aussi
    notifié, car l'absence ne le concerne plus.
  - Le contrôle « absence passée non modifiable » se base sur `endDate` (`PERIOD`) ou sur la
    dernière date d'événement vivante (`EVENTS`).
- **`cancelAbsence`** : notifie les responsables des départements effectifs.
- **Bus** (`events.ts`) :
  - `planning:absence:declared|updated` : `startDate` / `endDate` deviennent `string | null`,
    avec en plus `kind`, `allDepartments`, `departmentIds: string[]` et `eventIds: string[]`.
  - Vérifier les abonnés existants (grep `planning:absence:`) et adapter ceux qui lisent les
    dates.

Déplacé et adapté :

- **`findActiveAbsencesForPlanning(churchId, memberIds, { eventId, eventDate, departmentId })`**
  remplace `findActiveAbsencesByMember` de la route planning.
  - Utilise `absenceCoverageWhere`.
  - Renvoie `Map<memberId, { id, kind, startDate, endDate, eventCount }>` pour le badge.
  - Si plusieurs absences couvrent le même membre, on garde la première : le badge s'affiche une
    fois (spec « Chevauchement »).
- **`findActiveAbsenceForMember`** (ouverture/fermeture, `opening-closing.service.ts`) : la
  tâche d'ouverture/fermeture n'est rattachée à aucun département.
  - Sans `departmentId`, seules les absences `allDepartments = true` qui couvrent l'événement
    déclenchent l'avertissement.
  - Une absence « Louange seulement » n'empêche pas d'ouvrir l'église (voir Décisions).

Visibilité (GET `scope=all`, export) :

- Filtre de périmètre restreint :
  - avant : « le membre appartient à un de mes départements » ;
  - après : `OR [ {allDepartments: true, member: {departments: some ∈ scope}}, {allDepartments: false, targetDepartments: some ∈ scope} ]`.
- Filtres `departmentId` / `ministryId` : même forme, avec le département ou ministère filtré
  à la place du périmètre.
- La réponse inclut **tous** les départements visés, noms compris, même hors périmètre (spec).
- L'export réapplique le même filtre sur `absenceIds` : un identifiant hors périmètre est ignoré,
  comme aujourd'hui.

## UI / composants

`src/app/(auth)/absences/AbsencesClient.tsx` (formulaire de déclaration et de modification) :

- Sous « Pour qui », deux blocs repliés par défaut pour ne rien ajouter au cas courant
  (critère « exactement comme aujourd'hui, sans étape supplémentaire ») :
  1. **Quand ?** — segmenté « Sur une période » (défaut, champs dates actuels) / « Sur des
     événements précis » (liste de cases à cocher des événements à venir, groupés par mois, avec
     date, titre et départements attendus en petit).
  2. **Pour quels départements ?** — « Tous mes départements » (défaut) / « Certains
     départements » (`CheckboxGroup` sur `target-options.departments` ; les non `selectable`
     sont masqués).
- La liste d'événements est filtrée en direct selon les départements cochés. Un événement déjà
  coché qui disparaît du filtre est décoché, avec un message discret.
- Données chargées par `target-options` lors du changement de STAR (même déclencheur que
  `backup-options`).
- **Mobile** : cibles tactiles de 44px minimum, liste d'événements en pleine largeur avec
  défilement interne (`max-h` + `overflow-y-auto`), pas de tableau.
  - Blocs empilés, résumé « 2 événements · Louange » visible quand le bloc est replié.
- Colonne DataTable « Période » renommée **« Quand »** :
  - période : `12 → 19 oct.` ;
  - événements : `Culte 6 oct. +1` avec infobulle et détail, un événement supprimé étant barré
    avec la mention « événement supprimé ».
  - Nouvelle colonne **« Départements »** : « Tous » ou la liste des noms.
- `AbsencesTimeline.tsx` :
  - une absence `PERIOD` garde sa barre ;
  - une absence `EVENTS` est rendue en marqueurs ponctuels aux dates des événements vivants ;
  - les événements supprimés sont ignorés.

`src/components/PlanningGrid.tsx` — `AbsenceBadge` : libellé « Absent · période » ou
« Absent · cet événement », lien `highlightId` inchangé. La présence du badge est déjà
décidée côté serveur (le badge s'affiche seulement si l'absence couvre le département).

`src/app/(auth)/guide/` : ajouter un paragraphe « Absence ciblée » dans la section absences du
guide STAR / responsable, s'il existe une section absences.

## Décisions & alternatives écartées

- **Choix : deux axes orthogonaux sur `Absence` (`kind` + `allDepartments`) et deux tables de
  liaison.**
  *Pourquoi* : c'est exactement le modèle de la spec (période | événements × tous | certains).
  Les défauts rendent la rétrocompatibilité gratuite, et une déclaration reste un objet unique
  pour le motif, les backups, l'annulation et l'historique.
  - *Écarté* : **une absence par couple (département, événement)**. *Raison* : casse
    l'unité de la déclaration (motif et backups dupliqués, annulation multiple), multiplie les
    notifications, et ne sait pas exprimer « tous départements, y compris futurs ».
  - *Écarté* : **colonnes JSON `departmentIds` / `eventIds`**. *Raison* : pas de clé
    étrangère (donc pas de `SET NULL` à la suppression d'un événement), filtres de visibilité
    non indexables en MariaDB.
- **Choix : `startDate` / `endDate` nullables pour `EVENTS`, dates lues en direct sur `Event`.**
  *Pourquoi* : « l'absence suit l'événement » sans synchronisation.
  - *Écarté* : **dénormaliser min/max des dates d'événements dans `startDate` / `endDate`**.
    *Raison* : il y a sept appels `event.update`/`updateMany` susceptibles de modifier `Event.date` (routes
    `events/[eventId]` et `events` pour les séries, `request-executor`). Une resynchronisation
    oubliée produirait des badges faux, silencieusement.
- **Choix : instantané `eventTitle` / `eventDate` sur `AbsenceEvent` + `ON DELETE SET NULL`.**
  *Pourquoi* : c'est le seul moyen d'afficher « événement supprimé » dans l'historique sans
  empêcher la suppression d'événements.
  - *Écarté* : **`ON DELETE CASCADE`**. *Raison* : ferait disparaître la ligne et
    laisserait une absence `EVENTS` sans cible, illisible.
  - *Écarté* : **bloquer la suppression d'un événement ciblé**. *Raison* : hors du
    périmètre de la spec, et gênant pour le secrétariat.
- **Choix : l'appartenance courante est croisée à la lecture (département quitté) plutôt que
  de purger `AbsenceDepartment` à la sortie du département.**
  *Pourquoi* : aucun couplage avec les écrans membres, et l'historique conserve le ciblage
  d'origine.
- **Choix : l'ouverture/fermeture ne réagit qu'aux absences « tous départements ».**
  *Pourquoi* : la tâche n'appartient à aucun département ; une absence ciblée Louange
  signifie « disponible pour le reste ». La spec ne tranche pas explicitement ; c'est
  l'interprétation la plus fidèle à l'esprit de l'issue.
- **Choix : pas d'ADR.** *Pourquoi* : le changement reste interne au module planning, sans
  nouveau pattern transverse (le périmètre de visibilité reste celui d'ADR-0009 ; seul le prédicat
  « l'absence touche mon département » change).

## Risques & points d'attention

- **Nullabilité de `startDate` / `endDate`** : c'est la principale source de régressions de
  typage. Consommateurs à revoir : liste, frise, export, tri, `updateAbsence`, planning,
  ouverture/fermeture, payloads bus et notifications (texte « du X au Y »). `npm run typecheck`
  les signalera tous : ne pas les masquer par des `!`.
- **Changement de visibilité volontaire** : un responsable perd la vue des absences ciblées hors
  de ses départements. Le mentionner dans la PR et le CHANGELOG.
- **Performance du filtre de visibilité** : le `OR` sur relation est à surveiller. Les index
  `absence_departments(departmentId)` et `absence_events(eventId)` couvrent les jointures ; les
  volumes sont faibles (quelques centaines d'absences par église).
- **Événements récurrents** : `target-options` liste les occurrences (enfants de série), jamais
  le parent `isRecurrenceParent`, qu'il faut exclure.
- **Notifications en modification** : dédupliquer l'union avant/après pour ne pas notifier deux
  fois le même responsable.
- **Tests existants** : `absence.service.test.ts` et `security.test.ts` appellent
  `findAbsenceConflicts(start, end)`. Adapter leurs appels et leurs mocks Prisma (`include` du
  ciblage).
- **Frontière client/serveur** : lancer `npm run build` avant le déploiement staging (lot UI).

## Stratégie de tests

Vitest, mocks Prisma existants (`@/__mocks__/prisma`) :

- **`absence-targeting.test.ts`** (nouveau)
  - Table de vérité `absenceCovers` : PERIOD/EVENTS × all/certains × département
    dedans/dehors × événement dedans/dehors/entre deux ciblés/supprimé.
  - `effectiveDepartmentIds` : département quitté, département rejoint après coup.
  - `validateTargeting` :
    - département hors du STAR → 400 ;
    - département hors du périmètre d'un déclarant restreint → 403 ;
    - événement d'une autre église → 400 ;
    - événement passé → 400 ;
    - événement sans département visé attendu → 400 ;
    - PERIOD sans dates → Zod.
- **`absence.service.test.ts`** (étendu)
  - `findAbsenceConflicts` : planifié à l'Accueil + absence Louange le même jour ⇒ aucun
    conflit ; EVENTS ⇒ pas de conflit sur l'événement intermédiaire.
  - `resolveResponsibleUserIds` avec `departmentIds` ⇒ seuls les responsables de Louange.
  - `updateAbsence` : ajout d'un département ⇒ son responsable reçoit `ABSENCE_UPDATED`.
  - Absence historique (défauts) : comportement inchangé (régression).
  - Payload bus contenant le ciblage.
- **`src/app/api/absences/__tests__/security.test.ts`** (étendu)
  - Responsable Accueil : GET `scope=all` n'inclut pas une absence ciblée Louange d'un STAR
    commun ; inclut une absence Louange + Accueil avec les deux noms.
  - POST par un responsable avec `departmentIds` hors périmètre ⇒ 403 ; `allDepartments: true` ⇒ 201.
  - `target-options` : STAR hors périmètre ⇒ 403 ; autre église ⇒ 403 ; départements
    non `selectable` hors périmètre.
  - Export : ids hors périmètre ignorés ; colonnes de ciblage présentes.
- **Route planning** (`events/[eventId]/departments/[deptId]/planning`)
  - `activeAbsence` présent pour une absence ciblée sur ce département et cet événement,
    absent pour un autre département ou l'événement suivant.
- **`opening-closing`** : `absenceWarning` levé pour une absence « tous départements », pas pour
  une absence ciblée.
- **Migration** : le job CI `migrations` rejoue sur une base vierge. Vérification manuelle sur
  staging (base persistante) que les absences existantes s'affichent à l'identique après
  `migrate deploy`.
