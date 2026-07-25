# Tâches — Gestion des absences des STAR

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/gestion-absences-star`
- [x] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter l'enum `AbsenceStatus` (`ACTIVE`/`CANCELLED`), le modèle `Absence` et les
      relations inverses (`Member.absences`, `Church.absences`, `User.absencesCreated`,
      `User.absencesCancelled`) *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer et vérifier la migration (`npm run db:migrate` — nom `add_absences`) ;
      contrôler le SQL généré *(fichier : `prisma/migrations/…`)*

### 2. Logique métier (services)

- [x] **T3** — Implémenter `findAbsenceConflicts(memberId, churchId, startDate, endDate)` :
      jointure `Planning → EventDepartment → Event`, filtrée sur `status IN (EN_SERVICE,
      EN_SERVICE_DEBRIEF)` et chevauchement de dates *(fichier :
      `src/modules/planning/services/absence.service.ts`)*
- [x] **T4** — Implémenter `resolveResponsibleUserIds(memberId, churchId)` : union dédupliquée des
      Resp. département + Ministres couvrant tous les départements du membre *(même fichier que T3)*
- [x] **T5** — Implémenter `declareAbsence(params)` : vérification membre/église, autorisation
      (self via `MemberUserLink` ou périmètre départemental via `getUserDepartmentScope`),
      transaction (création `Absence`, calcul conflits via T3, notifications `ABSENCE_DECLARED` +
      `ABSENCE_CONFLICT` via T4), émission `planning:absence:declared` *(même fichier que T3)*
- [x] **T6** — Implémenter `cancelAbsence(absenceId, cancelledById)` : vérification autorisation
      (créateur, membre lui-même, resp/ministre scopé, ou manager global), transaction (statut
      `CANCELLED`, notification `ABSENCE_CANCELLED` aux destinataires initiaux), émission
      `planning:absence:cancelled` *(même fichier que T3)*
- [x] **T7** [P] — Ajouter les types `planning:absence:declared` et `planning:absence:cancelled`
      à `PlanningEvents` *(fichier : `src/modules/planning/events.ts`)*
- [x] **T8** [P] — Ajouter les permissions `absences:view` (`SUPER_ADMIN`, `ADMIN`, `SECRETARY`,
      `MINISTER`, `DEPARTMENT_HEAD`) et `absences:manage` (`SUPER_ADMIN`, `ADMIN`, `MINISTER`,
      `DEPARTMENT_HEAD`) au manifeste, et exporter `declareAbsence`, `cancelAbsence`,
      `findAbsenceConflicts` depuis l'index public *(fichier : `src/modules/planning/index.ts`)*

### 3. API (route handlers)

- [x] **T9** — `GET /api/absences` : query `churchId` (requis), `scope` (`self`\|`all`),
      `ministryId?`, `departmentId?`, `role?` ; `scope=self` via `requireAuth()` uniquement ;
      `scope=all` via `requireChurchPermission("absences:view", churchId)` +
      `getUserDepartmentScope` ; réponse enrichie de `hasConflict`/`conflicts` par absence (via T3)
      *(fichier : `src/app/api/absences/route.ts`)*
- [x] **T10** — `POST /api/absences` : validation Zod (`churchId`, `memberId`, `startDate`,
      `endDate`, `reason?`, `endDate >= startDate`), appel `declareAbsence` (T5), `201`
      *(même fichier que T9)*
- [x] **T11** [P] — `PATCH /api/absences/[id]` : action `cancel` uniquement, appel `cancelAbsence`
      (T6), `404` si absence introuvable, `403` si hors périmètre *(fichier :
      `src/app/api/absences/[id]/route.ts`)*
- [x] **T12** [P] — Enrichir la réponse de `GET` avec `activeAbsence: { startDate, endDate } | null`
      par membre (requête `Absence` `status: ACTIVE` chevauchant `event.date`) *(fichier :
      `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)*

### 4. UI

- [x] **T13** — Page serveur : résout `churchId` courant (`getCurrentChurchId`), charge les
      absences « self » + (si `absences:view`) la vue transverse scopée, passe les données au
      composant client *(fichier : `src/app/(auth)/absences/page.tsx`)*
- [x] **T14** — Composant client : section « Mes absences » (liste + formulaire déclaration via
      `Modal`/`Input`/`Button` + annulation), section « Vue d'ensemble » avec `DataTable` et
      filtres ministère/département/rôle (visible si `absences:view`), action « Déclarer pour un
      STAR » scopée (si `absences:manage`) *(fichier :
      `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [x] **T15** [P] — Ajouter l'entrée de navigation « Absences » (`/absences`), visible à tout
      utilisateur authentifié comme « Mes demandes » *(fichier : `src/components/Sidebar.tsx`)*
- [x] **T16** [P] — Ajouter un badge visuel (icône + tooltip période) sur la ligne d'un membre
      dont `activeAbsence` (T12) chevauche la date de l'événement affiché *(fichier :
      `src/components/PlanningGrid.tsx`)*

### 5. Tests

- [x] **T17** — Tests unitaires `declareAbsence`/`cancelAbsence`/`findAbsenceConflicts` : absence
      sans conflit, conflit détecté uniquement sur `EN_SERVICE`/`EN_SERVICE_DEBRIEF` (pas
      `INDISPONIBLE`/`REMPLACANT`/`null`), notification de tous les responsables sans doublon
      (STAR multi-départements, utilisateur cumulant Resp. + Ministre), 403 si déclarant hors
      périmètre (STAR pour un autre STAR, Resp. hors département), 403 si `churchId` incohérent
      avec l'église du membre, annulation notifie les destinataires initiaux (avec/sans conflit
      préalable), 403 si annulation hors périmètre *(fichier :
      `src/modules/planning/services/absence.service.test.ts`)*
- [x] **T18** — Tests de non-fuite multi-église : un utilisateur avec fiche STAR en église A et
      rôle responsable en église B ne reçoit aucune notification et ne voit aucune absence de
      l'église A dans le contexte de l'église B, et réciproquement *(même fichier que T17)*
- [x] **T19** [P] — Tests d'intégration légers des routes : codes 401/403/404/201/200 sur
      `GET`/`POST /api/absences` et `PATCH /api/absences/[id]` selon rôle/périmètre (self, resp.
      scopé, resp. hors périmètre, Secrétaire lecture seule, Admin) *(fichier :
      `src/app/api/absences/route.test.ts`, `src/app/api/absences/[id]/route.test.ts`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [x] PR ouverte vers `main`
