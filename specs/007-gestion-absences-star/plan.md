# Plan technique — Gestion des absences des STAR

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-07-25

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout vit dans `src/modules/planning` (sous-domaine) — aucun nouvel
      import cross-module ; `src/app/` importe uniquement `@/modules/planning` (index public).
- [x] **Sécurité** : chaque route protégée par `requireAuth()` (self-service) ou
      `requireChurchPermission("absences:manage"/"absences:view", churchId)` ; `churchId` toujours
      dérivé côté serveur (jamais accepté tel quel sans vérification de cohérence membre/église).
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`), déclarées dans le manifeste
      `planningModule`.
- [x] **Validation** Zod sur `POST /api/absences` et `PATCH /api/absences/[id]`.
- [x] **Migration** Prisma prévue (nouveau modèle `Absence` + enum `AbsenceStatus`).
- [x] **Enums** : `AbsenceStatus` importé depuis `@/generated/prisma/client`.
- [x] **UI** : réutilise `DataTable`, `Modal`, `Button`, `Input`, `Select` de `src/components/ui/` ;
      badge ad hoc dans `PlanningGrid.tsx` (pas de nouveau composant générique nécessaire).

## Approche générale

Le module `absences` est un **sous-domaine de `planning`** (pas de module autonome — décision
prise à la spec) : nouveau modèle Prisma `Absence`, service
`src/modules/planning/services/absence.service.ts`, routes `src/app/api/absences/`.

Le service gère dans une seule transaction : écriture de l'absence, calcul des conflits (jointure
`Planning`/`EventDepartment`/`Event`, jamais stocké), création des notifications, puis émission
d'un événement sur `planningBus` (pour cohérence avec le reste du module et une éventuelle
consommation cross-module future — aucun abonnement n'est requis aujourd'hui).

Le badge de conflit dans `PlanningGrid` est obtenu en enrichissant la réponse de la route
existante `GET /api/events/[eventId]/departments/[deptId]/planning` d'un champ calculé par
membre — pas de nouvelle requête dédiée côté client.

La déclaration « pour soi-même » (STAR) n'exige aucune permission : elle repose sur une
vérification d'appartenance via `MemberUserLink` (même pattern que `POST
/api/member-user-links/self`). La déclaration « pour un tiers » (Resp. département / Ministre)
exige `absences:manage` + une vérification de périmètre départemental
(`getUserDepartmentScope`).

## Modèle de données

```prisma
enum AbsenceStatus {
  ACTIVE
  CANCELLED
}

model Absence {
  id            String        @id @default(cuid())
  memberId      String
  churchId      String
  startDate     DateTime
  endDate       DateTime
  reason        String?       @db.Text
  status        AbsenceStatus @default(ACTIVE)
  createdById   String
  cancelledById String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  cancelledAt   DateTime?

  member        Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
  church        Church @relation(fields: [churchId], references: [id])
  createdBy     User   @relation("AbsenceCreatedBy", fields: [createdById], references: [id])
  cancelledBy   User?  @relation("AbsenceCancelledBy", fields: [cancelledById], references: [id])

  @@index([churchId, startDate, endDate])
  @@index([memberId, status])
  @@map("absences")
}
```

Ajouts de relations inverses :
- `Member.absences Absence[]`
- `Church.absences Absence[]`
- `User.absencesCreated Absence[] @relation("AbsenceCreatedBy")`
- `User.absencesCancelled Absence[] @relation("AbsenceCancelledBy")`

`churchId` est redondant avec le rattachement du membre (comme sur `MemberUserLink`) — dénormalisé
volontairement pour permettre un scope multi-tenant direct sans jointure, et vérifié à l'écriture
(le `churchId` du membre doit correspondre au `churchId` transmis, sinon `ApiError(403)`).

Aucun champ ni table pour les conflits : ils sont recalculés à chaque lecture par jointure
`Planning → EventDepartment → Event`, filtrée sur `memberId`, `status IN (EN_SERVICE,
EN_SERVICE_DEBRIEF)` et `event.date BETWEEN startDate AND endDate`.

Migration : `npm run db:migrate` (nom suggéré `add_absences`).

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/absences` | GET | `requireAuth()` + scope (voir note) | query : `churchId` (requis), `scope` (`self`\|`all`), `ministryId?`, `departmentId?`, `role?` | `{ absences: Array<{ id, member, startDate, endDate, reason, status, createdBy, hasConflict, conflicts: [{eventId,title,date,departmentId}] }> }` |
| `/api/absences` | POST | self (ownership) ou `absences:manage` scoped | `{ churchId, memberId, startDate, endDate, reason? }` | `201 { id, ...absence }` |
| `/api/absences/[id]` | PATCH | créateur, membre lui-même, resp/ministre scopé, ou global manager | `{ action: "cancel" }` | `{ id, status: "CANCELLED" }` |

Note sur `GET` : `scope=self` retourne uniquement les absences des fiches STAR liées au compte
appelant (aucune permission requise au-delà de `requireAuth`) ; `scope=all` exige
`requireChurchPermission("absences:view", churchId)` et applique `getUserDepartmentScope` (un
Resp. département/Ministre scoped ne voit que les absences des membres de ses départements ; les
rôles globaux — Secrétaire/Admin/Super Admin — voient tout, cohérent avec `members:view`).

Schéma Zod (`POST`) :
```ts
z.object({
  churchId: z.string().min(1),
  memberId: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(500).optional(),
}).refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
  message: "endDate doit être postérieure ou égale à startDate",
})
```

Enrichissement de route existante :

| Endpoint | Changement |
|---|---|
| `GET /api/events/[eventId]/departments/[deptId]/planning` | Ajoute par membre un champ `activeAbsence: { startDate, endDate } \| null`, calculé par une requête `Absence` (`status: ACTIVE`, période chevauchant `event.date`) — permet le badge dans `PlanningGrid` avant toute affectation. |

## Services / logique métier

`src/modules/planning/services/absence.service.ts` :

- `declareAbsence(params): Promise<Absence>`
  - Résout le membre (`memberId`), vérifie qu'il appartient bien à `churchId`.
  - Vérifie l'autorisation : soit `createdById` a un `MemberUserLink` vers ce `memberId`/`churchId`
    (self), soit le périmètre départemental du `createdById` (via `getUserDepartmentScope`)
    intersecte les départements du membre.
  - Transaction : crée l'`Absence`, calcule les conflits (jointure décrite ci-dessus), résout la
    liste des responsables à notifier (tous les Resp. département + Ministres des départements du
    membre — via `MemberDepartment → Department → UserDepartment`/`UserChurchRole.ministryId`),
    crée les notifications (`ABSENCE_DECLARED` pour tous les responsables ; `ABSENCE_CONFLICT`
    supplémentaire pour le STAR + les responsables des départements en conflit, un seul envoi même
    si plusieurs événements en conflit).
  - Émet `planning:absence:declared` sur `planningBus`.

- `cancelAbsence(absenceId, cancelledById): Promise<Absence>`
  - Vérifie l'autorisation (créateur, membre lui-même via `MemberUserLink`, resp/ministre scopé,
    ou global manager).
  - Transaction : passe `status = CANCELLED`, `cancelledAt`, `cancelledById`.
  - Renvoie la liste des destinataires initialement notifiés (déclaration + conflit) et crée une
    notification `ABSENCE_CANCELLED` pour chacun.
  - Émet `planning:absence:cancelled`.

- `findAbsenceConflicts(memberId, churchId, startDate, endDate)` — fonction pure de requête,
  réutilisée par `declareAbsence`, par `GET /api/absences` (calcul de `hasConflict`) et par
  l'enrichissement de la route planning existante.

- `resolveResponsibleUserIds(memberId, churchId)` — retourne l'ensemble dédupliqué des
  utilisateurs Resp. département + Ministre couvrant tous les départements du membre.

Nouveaux événements dans `PlanningEvents` (`src/modules/planning/events.ts`) :

```ts
"planning:absence:declared": {
  absenceId: string;
  churchId: string;
  memberId: string;
  startDate: string;
  endDate: string;
  createdById: string;
  hasConflict: boolean;
};
"planning:absence:cancelled": {
  absenceId: string;
  churchId: string;
  memberId: string;
  cancelledById: string;
  hadConflict: boolean;
};
```

Aucun abonnement cross-module requis aujourd'hui (pas de handler dans `registry.ts`) — ces
événements sont émis par cohérence avec le reste du module et pour permettre une extension future
(ex. discipolat, reporting) sans modifier le service.

Permissions ajoutées au manifeste `planningModule` (`src/modules/planning/index.ts`) :

```ts
"absences:view":   ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD"],
"absences:manage": ["SUPER_ADMIN", "ADMIN", "MINISTER", "DEPARTMENT_HEAD"],
```

La déclaration/annulation « pour soi-même » ne passe par aucune de ces permissions — uniquement
par la vérification d'appartenance (`MemberUserLink`), comme le self-link d'onboarding.

## UI / composants

- **Page** `src/app/(auth)/absences/page.tsx` (Server Component) : résout `churchId` courant
  (`getCurrentChurchId`), charge les absences « self » (fiches liées à l'utilisateur) et, si
  `absences:view` est présent, les absences transverses scopées ; passe le tout à un composant
  client.
- **Composant client** `AbsencesClient.tsx` (`"use client"`) :
  - Section « Mes absences » (toujours visible) : liste + formulaire de déclaration (`Modal` +
    `Input` dates + champ motif optionnel) + bouton annuler par ligne.
  - Section « Vue d'ensemble » (visible seulement si `absences:view`) : `DataTable` avec colonnes
    Membre / Département / Ministère / Période / Motif / Déclaré par / Conflit (badge), filtres
    ministère/département/rôle du déclarant en en-tête. Si `absences:manage`, une action
    « Déclarer pour un STAR » scoped à son périmètre + bouton annuler sur les lignes de son
    périmètre.
- **Navigation** : nouvelle entrée « Absences » dans `Sidebar.tsx`, visible à tout utilisateur
  authentifié (comme « Mes demandes ») — la page adapte son contenu selon les permissions, pas la
  visibilité du lien.
- **`PlanningGrid.tsx`** : badge (icône + tooltip, ex. « Absence déclarée du JJ/MM au JJ/MM ») sur
  la ligne d'un membre dont `activeAbsence` est non-null pour la date de l'événement affiché —
  affiché même si aucun statut n'est encore renseigné.

## Décisions & alternatives écartées

- **Choix** : sous-domaine de `planning` plutôt que module autonome — *Pourquoi* : couplage fort
  avec `Member`/`Planning`/`Event`, déjà possédés par `planning` ; évite une dépendance
  inter-module pour un besoin cœur du domaine planning (décidé avec l'utilisateur).
- **Choix** : conflits calculés à la volée, jamais persistés — *Pourquoi* : élimine tout risque de
  désynchronisation avec l'état réel du planning (déjà justifié à la conception, avant
  d'abandonner le statut `CONFIRMED`).
- **Choix** : notification uniquement, aucune bascule automatique de `Planning.status` —
  *Pourquoi* : imposé par la spec (Hors périmètre) ; le responsable garde l'arbitrage.
- **Écarté** : ajouter `absences:declare` comme permission dédiée pour l'auto-déclaration —
  *Raison* : inutile, l'auto-déclaration est une question d'appartenance (ownership), pas de rôle ;
  ajouter une permission créerait une distinction artificielle avec le pattern self-link existant.
- **Écarté** : notifier via abonnement `planningBus.on(...)` dans `registry.ts` plutôt que directement
  dans le service — *Raison* : la notification est un effet intra-module immédiat et testable ;
  le bus reste réservé à l'extensibilité cross-module, cohérent avec `deleteEvents` qui fait son
  nettoyage directement et émet l'événement seulement pour les autres modules.
- **Écarté** : endpoint séparé pour les conflits (`GET /api/absences/[id]/conflicts`) — *Raison* :
  surcoût d'aller-retour réseau côté UI sans bénéfice ; le calcul est inclus directement dans la
  réponse de liste et dans l'enrichissement de la route planning existante.

## Risques & points d'attention

- **Performance de `findAbsenceConflicts`** : jointure `Planning`/`EventDepartment`/`Event` par
  église pour chaque déclaration et pour l'enrichissement de la grille planning — volumétrie
  attendue faible (nombre d'événements par église par an), mais à surveiller si le nombre
  d'absences actives par membre croît fortement ; index `@@index([memberId, status])` et
  `@@index([churchId, startDate, endDate])` couvrent les accès prévus.
- **Notification multi-départements** : `resolveResponsibleUserIds` doit dédupliquer strictement
  (un même utilisateur Resp. département de deux départements du STAR, ou à la fois Resp. et
  Ministre, ne doit recevoir qu'une seule notification par événement).
- **Cohérence multi-église** : toute requête doit filtrer `churchId` explicitement à chaque étape
  (résolution du membre, calcul des responsables, calcul des conflits) — ne jamais déduire le
  périmètre uniquement de `memberId`, car rien n'empêche structurellement (au niveau du schéma)
  qu'un `memberId` invalide pour l'église transmise soit fourni par erreur côté client ; toujours
  vérifier `member.departments[].department.ministry.churchId === churchId` avant tout accès.
- **Annulation par un tiers hors périmètre** : bien vérifier que ni un autre STAR, ni un
  responsable d'un département non lié au membre, ne puisse annuler une absence — tester
  explicitement le cas 403.

## Stratégie de tests

Tests unitaires (Vitest) dans `src/modules/planning/services/absence.service.test.ts` :

- `declareAbsence` crée l'absence et retourne `hasConflict: false` quand aucun chevauchement.
- `declareAbsence` détecte un conflit avec un `Planning.status = EN_SERVICE` chevauchant la
  période, et pas avec `INDISPONIBLE`/`REMPLACANT`/`null`.
- `declareAbsence` notifie tous les responsables de tous les départements du membre (cas
  multi-départements), sans doublon pour un utilisateur cumulant plusieurs rôles.
- `declareAbsence` refuse (403) une déclaration par un tiers hors périmètre (STAR pour un autre
  STAR, Resp. département hors du département du membre).
- `declareAbsence` refuse une incohérence membre/église (`churchId` transmis ≠ église du membre).
- `cancelAbsence` notifie les responsables initialement notifiés, y compris en cas de conflit
  préalable ; refuse l'annulation par un utilisateur hors périmètre.
- Tests de scope multi-église : un utilisateur avec fiche STAR en église A et rôle responsable en
  église B ne reçoit aucune notification et ne voit aucune absence de l'église A dans le contexte
  de l'église B (et réciproquement).

Tests d'intégration légers sur les routes (`GET`/`POST`/`PATCH /api/absences`) pour vérifier les
codes de statut (401/403/404/201/200) selon les combinaisons rôle/périmètre déjà couvertes côté
service — pas de duplication exhaustive de la logique métier au niveau route.
