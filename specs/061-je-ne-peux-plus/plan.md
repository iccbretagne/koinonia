# Plan technique — « Je ne peux plus » et remplacements

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-10-10
- **S'appuie sur** : spec 058 (disponibilités, ADR-0020), spec 060 (récapitulatif regroupé,
  `PlanningChangeNotice`), planificateur `/api/cron` (ADR-0021)

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : toute la logique dans `src/modules/planning/services/withdrawals/`,
  exposée par `@/modules/planning` ; routes et pages n'importent que l'index
- [x] **Sécurité** : chaque route résout l'église **de l'objet** (`resolveChurchId("event" |
  "serviceWithdrawal", id)`) puis `requireChurchPermission(perm, churchId)` ;
  `requireDepartmentAccess` sur toute action de responsable ; le désistement vérifie que la fiche
  STAR est liée au compte appelant (`isMemberLinkedToUser`)
- [x] **Permissions** via `rolePermissions` — **aucune permission nouvelle** (`planning:view`,
  `planning:department`, `planning:edit`)
- [x] **Validation** Zod sur toutes les mutations (désistement, remplacement, clôture)
- [x] **Migration** Prisma : une table + un enum (`prisma migrate dev`)
- [x] **Enums** `ServiceStatus`, `ServiceWithdrawalStatus` depuis `@/generated/prisma/client`
- [x] **UI** : `ConfirmModal`/`Modal`, `Textarea`/`Field`, `Button`, `StatusChip`, `Alert`,
  `EmptyState`, `useToast` — aucun nouveau composant de base
- [x] **Surface HTTP** (ADR-0012) : routes sous `/api/planning` et page sous `/planning`, deux
  préfixes déjà déclarés dans le manifeste `planning` — rien à ajouter

## Approche générale

Un désistement est un **objet à part entière** (`ServiceWithdrawal`), pas un drapeau sur la ligne
de planning.

1. **Se désister** : dans une transaction, on lit la ligne `Planning` du STAR (statut planifié),
   on crée un `ServiceWithdrawal` `PENDING` qui **garde le statut d'origine**, on **retire** le
   STAR du planning (`status = null`), et on enregistre sa réponse « Pas disponible » pour cet
   événement et ce département (spec 058). Hors transaction, les destinataires reçoivent une
   notification **immédiate** avec le nombre de remplaçants possibles.
2. **Remplacer** : le responsable ouvre l'écran du désistement, qui calcule à la volée les
   remplaçants possibles à partir de `getPlanningAvailability` (spec 058, déjà utilisé par la
   grille). Le choix, dans une transaction, passe le désistement à `REPLACED` **par une mise à
   jour conditionnelle** (`status = PENDING`) — le premier qui écrit gagne —, revalide le
   candidat, le place au planning avec le statut d'origine et l'enregistre dans le récapitulatif
   de la spec 060.
3. **Annuler / ne pas remplacer / relancer** : annulation par le STAR (`CANCELLED`, statut
   d'origine restauré), clôture sans remplaçant par le responsable (`CLOSED`), relance unique à
   48 h par une tâche du planificateur.

Le fil directeur : **retirer le STAR du planning dès son désistement**. Tous les lecteurs
existants des statuts planifiés (`PLANNED_STATUSES` — rappels avant service, « déjà de service
ailleurs », compteurs, vue semaine, exports, ouverture/fermeture des récapitulatifs 060) le
traitent alors **automatiquement** comme ne servant plus, sans avoir à être modifiés un par un.
Le désistement en attente porte seul l'information « place à pourvoir ».

## Modèle de données

```prisma
enum ServiceWithdrawalStatus {
  PENDING    // à remplacer
  REPLACED   // un remplaçant a été choisi
  CANCELLED  // annulé par le STAR, service rendu
  CLOSED     // clôturé par un responsable sans remplaçant
}

/// Désistement d'un STAR sur un service (spec 061). Le STAR est retiré du planning à la
/// création ; `originalStatus` est le statut repris par le remplaçant (ou restauré à l'annulation).
model ServiceWithdrawal {
  id                  String                  @id @default(cuid())
  churchId            String
  eventId             String
  departmentId        String
  memberId            String
  originalStatus      ServiceStatus
  message             String?                 @db.VarChar(500)
  status              ServiceWithdrawalStatus @default(PENDING)
  createdById         String?                 // compte qui a déclenché (le STAR)
  replacementMemberId String?
  resolvedById        String?
  resolvedAt          DateTime?
  relanceSentAt       DateTime?
  createdAt           DateTime                @default(now())
  updatedAt           DateTime                @updatedAt
  church              Church                  @relation(fields: [churchId], references: [id])
  event               Event                   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  department          Department              @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  member              Member                  @relation("WithdrawnMember", fields: [memberId], references: [id], onDelete: Cascade)
  replacementMember   Member?                 @relation("ReplacementMember", fields: [replacementMemberId], references: [id], onDelete: SetNull)

  @@index([eventId, departmentId, status])
  @@index([memberId, status])
  @@index([churchId, status])
  @@map("service_withdrawals")
}
```

- Contrainte d'unicité « un seul `PENDING` par (membre, événement, département) » : MariaDB n'a
  pas d'index partiel ; vérifiée dans la transaction de création (lecture puis écriture, sous la
  ligne `Planning` déjà verrouillée par sa mise à jour).
- `onDelete: Cascade` sur l'événement : un événement supprimé emporte ses désistements (spec :
  « disparaît avec lui »). Un événement déplacé les conserve tels quels (aucun code).
- Migration : `prisma migrate dev --name service_withdrawals`.
- `resolveChurchId` (`src/lib/auth.ts`) : ajout du type `"serviceWithdrawal"` au registre
  `CHURCH_RESOLVERS` (lecture de `churchId`).

## API

Toutes sous `/api/planning/withdrawals` (préfixe `/api/planning` déjà déclaré).

| Endpoint | Méthode | Garde | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/planning/withdrawals` | POST | église de l'événement ; `planning:view` ; fiche liée au compte | `{ eventId, departmentId, message?: string ≤ 500 }` | `{ withdrawal }` 201 |
| `/api/planning/withdrawals/[id]` | GET | église du désistement ; `planning:department` + `requireDepartmentAccess` | — | `{ withdrawal, event, member, candidates[], canReplace }` |
| `/api/planning/withdrawals/[id]` | DELETE | église du désistement ; `planning:view` ; fiche liée au compte ; `PENDING` | — | `{ withdrawal }` (annulation) |
| `/api/planning/withdrawals/[id]/replace` | POST | `planning:edit` + `requireDepartmentAccess` ; `PENDING` ; avant le début de l'événement | `{ memberId }` | `{ withdrawal }` ; 409 si déjà pourvu, 422 si candidat invalide |
| `/api/planning/withdrawals/[id]/close` | POST | `planning:edit` + `requireDepartmentAccess` ; `PENDING` | `{}` | `{ withdrawal }` |

Modifications :

- `GET /api/events/[eventId]/departments/[deptId]/planning` : ajoute `withdrawals` (désistements
  `PENDING` du couple événement/département : id, membre, message, statut d'origine, date) pour
  le bandeau et la ligne « à remplacer » de la grille, et `counts.toReplace`.
- `PUT /api/events/[eventId]/departments/[deptId]/planning` (grille) : voir « Interaction avec la
  grille » ci-dessous.
- `PUT /api/availability` (spec 058, route qui appelle `saveResponses`) : le chemin « Pas disponible » d'un STAR planifié
  crée des désistements (voir services). `GET` de l'écran de disponibilités : chaque événement
  porte `plannedIn: { departmentId, departmentName, withdrawable }[]` pour l'avertissement.

Erreurs métier par `ApiError` : 403 (fiche non liée, hors périmètre), 404, 409 (« Ce service a
déjà été pourvu par Léa »), 422 (« Léa n'est plus disponible ce jour-là »), 400 (« La date
limite de planification est passée : contacte ton responsable »).

## Services / logique métier

Nouveau dossier `src/modules/planning/services/withdrawals/`, réexporté par
`src/modules/planning/index.ts`.

- **`withdrawable(event, now)`** (pur) : vrai si `now < event.planningDeadline ?? event.date`.
- **`createWithdrawal({ churchId, eventId, departmentId, memberId, actorId, message }, tx)`** :
  vérifie le statut planifié (`PLANNED_STATUSES`) et `withdrawable` ; refuse un `PENDING`
  existant ; crée le désistement ; `planning.update({ status: null })` ; upsert
  `AvailabilityResponse` `UNAVAILABLE` (`enteredById = actorId`) ; supprime une éventuelle
  `PlanningChangeNotice` en attente pour ce STAR sur ce service (sinon le récapitulatif 060
  enverrait « tu ne sers plus », contradictoire avec la confirmation à venir). Retourne de quoi
  notifier.
- **`withdrawService(...)`** : transaction autour de `createWithdrawal`, puis
  `notifyWithdrawal` hors transaction ; `logAudit`.
- **`resolveWithdrawalRecipients(churchId, departmentId, withdrawnMemberId, db)`** : comptes
  `DEPARTMENT_HEAD` rattachés au département via `user_departments` (principal et adjoints),
  **moins** le compte lié au STAR désisté ; si la liste est vide, les `MINISTER` du ministère.
  Distinct de `resolveResponsibleUserIds` (absences), qui met le Ministre en copie — la spec 061
  ne le prévient qu'à défaut.
- **`listReplacementCandidates(withdrawal, db, now)`** : membres du département
  (`memberDepartment`) ; exclut ceux déjà planifiés dans ce département pour l'événement et le
  STAR désisté ; appelle `getPlanningAvailability` et garde `state ∈ {AVAILABLE, IF_NEEDED}` et
  `busyElsewhere` vide ; trie Disponible puis Si besoin, puis par nom.
- **`replaceWithdrawal({ withdrawalId, memberId, actorId })`** : transaction —
  `updateMany({ where: { id, status: PENDING }, data: { status: REPLACED, … } })` ; si 0 ligne,
  relit et lève 409 avec le nom du remplaçant ; recalcule les candidats et lève 422 si
  `memberId` n'y est plus ; contrôle l'unicité de `EN_SERVICE_DEBRIEF` dans le département
  (même règle que la grille) ; upsert `Planning` avec `originalStatus` ;
  `recordPlanningChanges` pour le remplaçant (récapitulatif 060). Hors transaction :
  confirmation au STAR désisté (« Léa te remplace le dimanche 12 »).
- **`cancelWithdrawal({ withdrawalId, actorId })`** : `PENDING` → `CANCELLED` (mise à jour
  conditionnelle) ; restaure `Planning.status = originalStatus` ; réponse → `AVAILABLE` ;
  notifie les destinataires (« Paul peut finalement servir le 12 »).
- **`closeWithdrawal(...)`** : `PENDING` → `CLOSED` ; notifie le STAR (« Ton désistement du 12
  est pris en compte »).
- **`runWithdrawalRelances(now)`** : désistements `PENDING`, `relanceSentAt` nul, événement à
  venir dans les 48 h, `createdAt` antérieur à `event.date − 48 h` ; relance avec le nombre de
  candidats recalculé ; `relanceSentAt = now`.
- **Notifications** (`@/lib/notifications`, domaine `planning`, types
  `SERVICE_WITHDRAWAL`, `SERVICE_WITHDRAWAL_CANCELLED`, `SERVICE_WITHDRAWAL_RELANCE`,
  `SERVICE_WITHDRAWAL_REPLACED`, `SERVICE_WITHDRAWAL_CLOSED`) : `notifyUsers` (qui délègue l'email à `dispatchUserEmails`) après
  validation de la transaction, email selon les préférences
  (gabarit générique, pas de gabarit dédié). Lien : `/planning/remplacements/[id]` pour les
  responsables, `/planning` pour le STAR.

### Interaction avec la grille

Dans `PUT …/planning`, après les upserts :

- **STAR désisté replacé par le responsable** (statut non nul pour un membre ayant un `PENDING`
  sur ce service) : le désistement passe `CANCELLED` (le responsable a tranché).
- **Nouveau STAR placé** (statut planifié, absent auparavant) alors que des désistements `PENDING`
  existent sur ce service : le plus ancien passe `REPLACED` avec ce membre comme remplaçant,
  un par membre ajouté ; confirmation au STAR désisté. C'est le « pourvoir directement depuis la
  grille » de la spec, sans geste supplémentaire.

La logique est une fonction du service (`reconcileWithdrawalsAfterGridEdit`), appelée par la
route — pas de logique métier nouvelle dans le handler.

### Date limite de planification

Le `PUT` de la grille reste fermé aux responsables après l'échéance (inchangé). En revanche
`replaceWithdrawal` et `closeWithdrawal` **ne la contrôlent pas** : ils n'agissent que sur un
service rendu vacant avant l'échéance (la création, elle, la contrôle). Seul garde-fou : refus
après le début de l'événement.

### Depuis l'écran de disponibilités

Dans `saveResponses` (spec 058), la branche « Pas disponible d'un STAR planifié » est remplacée :

- pour chaque service planifié touché, si `withdrawable` : `createWithdrawal` dans la même
  transaction, puis `notifyWithdrawal` après (même effet que « Je ne peux plus ») ;
- sinon (échéance passée) : conserve l'actuel `notifyPlannedUnavailable`, renommé pour sa
  nouvelle portée.

### Planificateur

Nouvelle tâche dans `src/app/api/cron/route.ts` :
`{ key: "service-withdrawal-relances", schedule: { kind: "interval", minutes: 60 }, run: runWithdrawalRelances }`.

## UI / composants

- **« Mon planning »** (`src/app/(auth)/planning/MyPlanningView.tsx`, données
  `my-planning-data.ts`) :
  - carte « Prochain service » : le lien « Je ne peux pas » devient le bouton **« Je ne peux
    plus »** quand le service est `withdrawable`, sinon un `Alert` « La date limite est passée :
    contacte ton responsable » (noms des responsables) ;
  - chaque service à venir de la liste porte la même action ;
  - `ConfirmModal` avec `Textarea` facultatif (message au responsable), puis `useToast` ;
  - `loadMyPlanning` ajoute les désistements `PENDING` du membre, affichés avec un `StatusChip`
    « Désisté — en attente de remplacement » et un bouton **« Annuler mon désistement »**.
- **Écran du service à remplacer** — nouvelle page serveur
  `src/app/(auth)/planning/remplacements/[id]/page.tsx` (garde `planning:department` +
  `requireDepartmentAccess`) et composant client `ReplacementClient.tsx` : événement, STAR
  désisté et son message, liste des candidats (pastille de disponibilité réutilisée de la grille),
  bouton « Choisir » par ligne, action secondaire « Ne pas remplacer » (`ConfirmModal`), état
  terminal si déjà pourvu/annulé/clôturé ; `EmptyState` « aucun remplaçant possible ». Secrétaire
  et rôles sans `planning:edit` : lecture seule (`canReplace = false`). Conçu mobile d'abord
  (liste en cartes, boutons ≥ 44 px).
- **Grille** (`src/components/PlanningGrid.tsx`) : bandeau `Alert` « N service(s) à remplacer »
  avec lien vers l'écran de chaque désistement ; ligne du STAR désisté marquée « à remplacer »
  (et son message) ; compteur `toReplace` dans le résumé de l'événement.
- **Écran de disponibilités** (`src/app/(auth)/disponibilites/AvailabilityClient.tsx`) :
  avant d'enregistrer un « Pas disponible » (ou le raccourci période) qui touche un service
  planifié, `ConfirmModal` listant « Tu es planifié le 12 (Choristes) : ton responsable va devoir
  te remplacer ».
- **Navigation** : `/planning/remplacements/[id]` n'est atteint que par lien (notification,
  bandeau) ; le fil d'Ariane le rattache à l'espace Planning.

## Décisions & alternatives écartées

- **Choix** : table `ServiceWithdrawal` et retrait immédiat du STAR du planning — *Pourquoi* :
  tous les lecteurs de `PLANNED_STATUSES` (rappels, conflits « déjà de service », compteurs,
  vue semaine, exports, récapitulatifs) excluent le STAR désisté sans modification ; le
  désistement garde le statut à reprendre, le message, la relance et l'issue.
- **Écarté** : colonnes `withdrawnAt`/`withdrawalMessage` sur `Planning` en gardant le statut —
  *Raison* : le STAR resterait compté « en service » partout (rappel la veille, blocage
  « déjà de service ailleurs », exports) ; il faudrait filtrer chaque lecteur, avec un oubli
  probable.
- **Écarté** : nouveau statut `A_REMPLACER` dans `ServiceStatus` — *Raison* : même dispersion
  des filtres, et un enum partagé par la grille, la vue semaine et les exports.
- **Choix** : remplacement par mise à jour conditionnelle (`status = PENDING`) — *Pourquoi* :
  « premier qui écrit gagne » sans verrou applicatif, compatible MariaDB.
- **Choix** : candidats calculés à la volée, jamais stockés — *Pourquoi* : la spec exige une
  liste à jour à chaque ouverture et une revalidation au choix.
- **Choix** : réutiliser `getPlanningAvailability` — *Pourquoi* : même définition de
  « disponible / si besoin / déjà de service ailleurs » que la grille, aucune divergence.
- **Choix** : nouveau résolveur de destinataires — *Pourquoi* : `resolveResponsibleUserIds` met
  toujours le Ministre en copie, la spec ne le veut qu'à défaut.
- **Choix** : remplir depuis la grille clôt le désistement le plus ancien — *Pourquoi* : la spec
  veut que la grille suffise ; *écarté* : un bouton « marquer comme pourvu », geste de plus
  facile à oublier.
- **Choix** : pas d'ADR — la décision reste propre à cette feature (nouvelle table du module
  planning, aucun pattern transverse ni choix de stack).

## Écart avec la spec à valider

- **« Service retiré par le responsable avant tout choix »** : le STAR étant déjà sorti du
  planning à son désistement, le responsable ne peut plus « le retirer de la grille ». Le plan
  propose une action **« Ne pas remplacer »** sur l'écran du désistement, qui clôt le
  remplacement et confirme au STAR que son désistement est pris en compte. → Amender ce cas
  limite de la spec dans la même PR.
- **Services « remplaçant »** : « Mon planning » n'affiche aujourd'hui que les statuts « en
  service » et « en service + débrief » (`loadMyPlanning`), pas « remplaçant ». Un STAR planifié
  « remplaçant » ne verrait donc pas l'action. Le plan **ajoute** le statut « remplaçant » à
  « Mon planning » (affiché comme tel), puisque la spec le compte comme un service. À confirmer.

## Risques & points d'attention

- **Récapitulatif 060** : ne pas produire de « tu ne sers plus » pour le désistement lui-même
  (suppression de la notice en attente) ; le remplaçant, lui, passe bien par le récapitulatif.
- **Unicité du débrief** : le remplaçant hérite de `EN_SERVICE_DEBRIEF` ; si un autre STAR a
  reçu le débrief entre-temps, refus 422 avec message explicite.
- **Interaction grille ↔ désistement** : la réconciliation dans `PUT` doit rester idempotente
  (une même sauvegarde rejouée ne crée pas deux remplacements).
- **Reprise des données** : aucune (pas de désistement antérieur).
- **Documentation** : réaligner `docs/processus/planning-de-service.md` (la date limite est
  bloquante pour les responsables, sauf pour pourvoir un désistement), compléter `docs/api.md`,
  `docs/database.md` et le guide STAR/responsable.
- **Fuseau horaire** : « 48 h avant » et « début de l'événement » se calculent sur
  `Event.date` comme le reste du module (pas de nouveau calcul de fuseau).

## Stratégie de tests

Vitest, avec le `prismaMock` existant :

- `withdrawals/__tests__/withdrawable.test.ts` : avant/après échéance, sans échéance, événement
  commencé.
- `withdrawals/__tests__/withdraw.test.ts` : création (retrait du planning, statut d'origine,
  réponse UNAVAILABLE, notice 060 supprimée) ; refus si non planifié, si déjà `PENDING`, si
  échéance passée.
- `recipients.test.ts` : responsables et adjoints, exclusion du STAR désisté responsable lui-même,
  repli Ministre seulement à défaut.
- `candidates.test.ts` : filtrage disponibilité, « déjà de service ailleurs », déjà planifiés, tri.
- `replace.test.ts` : succès (statut d'origine, `recordPlanningChanges`, confirmation), 409 pour
  un second choix concurrent, 422 pour un candidat devenu indisponible ou un débrief en double.
- `cancel-close.test.ts` : restauration du statut et de la réponse, notifications.
- `relances.test.ts` : fenêtre 48 h, relance unique, pas de relance si désistement tardif.
- `reconcile-grid.test.ts` : replacement du STAR désisté (annulation), ajout d'un membre
  (remplacement FIFO), idempotence.
- `saveResponses` (spec 058) : un « Pas disponible » planifié crée un désistement avant
  l'échéance, notifie simplement après.
- Routes API (`src/app/api/planning/withdrawals/__tests__/`) : gardes (fiche non liée → 403,
  hors périmètre → 403, Secrétaire sans `planning:edit` → 403 sur `replace`), validation Zod,
  multi-église (désistement d'une autre église → 403/404).
- `route-exhaustiveness.test.ts` couvre automatiquement les nouvelles routes et la page.
- Vérification manuelle mobile du parcours complet (désistement → notification → choix) avant la
  PR, et `npm run build` (frontière client/serveur).
