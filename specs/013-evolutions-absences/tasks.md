# Tâches — Évolutions du module Absences

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/evolutions-absences`
- [x] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter l'enum `AbsenceBackupType` (`STAR`/`RESPONSIBLE`), le modèle
      `AbsenceBackup` (`absenceId`, `type`, `memberId?`, `userChurchRoleId?`) et les relations
      inverses (`Absence.backups`, `Member.absenceBackups`, `UserChurchRole.absenceBackups`)
      *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer et vérifier la migration (`npm run db:migrate` — nom
      `add_absence_backups`) ; contrôler le SQL généré *(fichier : `prisma/migrations/…`)*

### 2. Logique métier (services)

- [x] **T3** — Implémenter `validateBackupTargets(declarerRole, declarerScope, backups)` :
      vérifie pour chaque entrée `STAR` l'appartenance au département (Resp. département) ou au
      ministère (Ministre) du déclarant, et pour chaque entrée `RESPONSIBLE` la cible autorisée
      (Ministre du ministère ou autre Resp. département du même ministère pour un Resp.
      département ; autre Ministre de l'église, jamais lui-même, pour un Ministre) ; lève
      `ApiError(403)` sinon *(fichier : `src/modules/planning/services/absence.service.ts`)*
- [x] **T4** — Étendre `declareAbsence(params)` : accepte `backups?: BackupInput[]`, crée les
      lignes `AbsenceBackup` dans la même transaction, notifie chaque backup
      (`ABSENCE_BACKUP_ASSIGNED`) — via `MemberUserLink` pour `STAR` (silencieux si non lié),
      directement via `userChurchRole.userId` pour `RESPONSIBLE` *(même fichier que T3)*
- [x] **T5** — Implémenter `updateAbsence(params)` : recharge l'absence, refuse (`409`) si déjà
      passée, refuse (`400`) une nouvelle `startDate` antérieure à celle déjà enregistrée si
      l'absence est en cours, recalcule les conflits avant/après via `findAbsenceConflicts`,
      applique les champs fournis (`startDate`/`endDate`/`reason`), remplace intégralement les
      `AbsenceBackup` si `backups` est fourni, notifie `ABSENCE_UPDATED` à l'union des
      destinataires (anciens + nouveaux), notifie `ABSENCE_CONFLICT` si un nouveau conflit
      apparaît, émet `planning:absence:updated` *(même fichier que T3)*
- [x] **T6** [P] — Étendre `cancelAbsence` : inclut dans `recipients` les utilisateurs résolus
      depuis les backups de l'absence annulée *(même fichier que T3)*
- [x] **T7** [P] — Ajouter le type `planning:absence:updated` à `PlanningEvents` *(fichier :
      `src/modules/planning/events.ts`)*
- [x] **T8** [P] — Exporter `updateAbsence` et `validateBackupTargets` depuis l'index public du
      module *(fichier : `src/modules/planning/index.ts`)*

### 3. API (route handlers)

- [x] **T9** — `POST /api/absences` : ajoute `backupSchema` (union discriminée `STAR`/
      `RESPONSIBLE`) et le champ `backups?` à `createSchema` ; si `backups` non vide, refuse
      (`403`) quand `!isSelf` ou quand le déclarant n'a ni rôle `DEPARTMENT_HEAD` ni `MINISTER`
      pour `churchId`, sinon appelle `validateBackupTargets` (T3) puis passe `backups` à
      `declareAbsence` (T4) *(fichier : `src/app/api/absences/route.ts`)*
- [x] **T10** — `PATCH /api/absences/[id]` : remplace le schéma par une union discriminée
      `{ action: "cancel" }` / `{ action: "update", startDate?, endDate?, reason?, backups? }` ;
      réutilise l'autorisation existante (créateur, self, resp/ministre scopé, manager global) ;
      pour `action: "update"` avec `backups`, mêmes règles de validation que T9 (`isSelf` requis,
      rôle requis, `validateBackupTargets`) puis appelle `updateAbsence` (T5) *(fichier :
      `src/app/api/absences/[id]/route.ts`)*
- [x] **T11** [P] — `GET /api/absences` : enrichit chaque absence retournée d'un champ
      `backups: Array<{ id, type, name, role? }>` (résolu depuis `AbsenceBackup` + `Member`/
      `UserChurchRole.user`) *(même fichier que T9)*
- [x] **T12** — `POST /api/absences/export` *(nouveau fichier)* : valide `{ churchId,
      absenceIds }` (Zod), `requireChurchPermission("absences:view", churchId)`, filtre
      `absenceIds` à ceux dans le périmètre de l'appelant (`getUserDepartmentScope`), charge les
      absences correspondantes (avec backups), génère un classeur `ExcelJS` (colonnes STAR,
      département, ministère, période, motif, statut, conflit, backup(s) — cf.
      `src/app/api/discipleships/export/route.ts` pour le pattern), retourne le fichier en
      `attachment` *(fichier : `src/app/api/absences/export/route.ts`)*

### 4. UI

- [ ] **T13** — Page serveur : détecte si l'utilisateur a le rôle `DEPARTMENT_HEAD`/`MINISTER`
      pour `churchId`, résout par fiche STAR self les options de backup éligibles (STAR du
      périmètre + responsables cibles autorisés selon T3), passe le tout en props à
      `AbsencesClient` *(fichier : `src/app/(auth)/absences/page.tsx`)*
- [ ] **T14** — Composant client (extension) :
      - bloc `CheckboxGroup` « Backup (optionnel) » dans le formulaire de déclaration, visible
        uniquement en mode self avec rôle éligible ;
      - bouton « Modifier » (visible si `status === "ACTIVE"` et date de fin non passée) ouvrant
        le même `Modal` pré-rempli, soumis via `PATCH .../[id]` `action: "update"` ;
      - colonne « Backup(s) » dans les deux `DataTable` ;
      - date de fin pré-remplie sur la date de début à la sélection, `min={formStartDate}`,
        réalignement automatique si la date de fin devient antérieure ;
      - bouton « Exporter » (vue d'ensemble) appelant `POST /api/absences/export` avec les IDs de
        `displayedAbsences`, téléchargement du fichier reçu ;
      - bascule « Tableau / Frise » au-dessus de la vue d'ensemble, partageant `displayedAbsences`
      *(fichier : `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [ ] **T15** [P] — Composant `AbsencesTimeline.tsx` *(nouveau)* : rendu en frise des absences
      reçues (regroupées par membre, positionnement `%` sur un axe de dates), interaction de clic
      cohérente avec `DataTable` *(fichier : `src/app/(auth)/absences/AbsencesTimeline.tsx`)*
- [ ] **T15b** — Vérifier et ajuster l'ergonomie mobile de tout ce qui a été ajouté en T14/T15 :
      bloc backup (`CheckboxGroup`) et bouton « Modifier » dans le `Modal` de déclaration/édition,
      colonne « Backup(s) » dans les `DataTable` (mode carte mobile), bouton « Exporter »,
      bascule « Tableau / Frise » et lisibilité de la frise elle-même sur petit écran (scroll
      horizontal contenu, pas de débordement de page) — tester dans le navigateur en largeur
      mobile avant de considérer la tâche terminée *(fichiers : ceux de T14/T15)*

### 5. Tests

- [ ] **T16** — Tests unitaires `declareAbsence` avec backups : crée les `AbsenceBackup` attendus
      pour `STAR` (avec/sans `MemberUserLink`) et `RESPONSIBLE`, notifie chaque destinataire
      résolu ; vérifie la non-régression sans backups *(fichier :
      `src/modules/planning/services/absence.service.test.ts`)*
- [ ] **T17** — Tests unitaires `updateAbsence` : modification de période avec recalcul de
      conflits et notification des nouveaux conflits, notification de l'union des destinataires
      (anciens + nouveaux backups), `409` si déjà passée, `400` si `startDate` reculée alors que
      l'absence est en cours, remplacement complet des backups quand fournis / inchangés quand
      omis *(même fichier que T16)*
- [ ] **T18** [P] — Tests unitaires `cancelAbsence` : notifie aussi les backups de l'absence
      annulée *(même fichier que T16)*
- [ ] **T19** [P] — Tests d'intégration routes : `POST /api/absences` avec `backups` — `403` si
      `!isSelf`, `403` si rôle non éligible, `403` si backup hors périmètre (autre ministère pour
      un Resp. département, auto-désignation pour un Ministre), `201` sinon ; `PATCH
      .../[id]` `action: "update"` — mêmes codes d'autorisation que `cancel`, `409` si déjà
      passée ; `GET /api/absences` retourne bien `backups` ; `POST /api/absences/export` — `403`
      sans `absences:view`, fichier `.xlsx` généré n'incluant que les IDs dans le périmètre de
      l'appelant même si la requête en fournit hors périmètre *(fichiers :
      `src/app/api/absences/__tests__/route.test.ts`,
      `src/app/api/absences/[id]/__tests__/route.test.ts`,
      `src/app/api/absences/export/__tests__/route.test.ts`)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Cohérence de la vue mobile vérifiée (T15b) sur l'ensemble des écrans touchés
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`
