# Tâches — Backup pour un tiers et gestion des absences par le Secrétariat

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [ ] Branche créée : `feat/backup-tiers-secretariat`
- [ ] Aucune migration Prisma requise

## Tâches

### 1. Permissions

- [ ] **T1** — Ajouter `SECRETARY` à la permission `absences:manage` dans le manifeste
      (`SECRETARY` fait déjà partie de `GLOBAL_ROLES` dans `src/lib/auth.ts`, donc
      `getUserDepartmentScope` renverra automatiquement `{ scoped: false }` pour ce rôle une fois
      la permission accordée) *(fichier : `src/modules/planning/index.ts`)*

### 2. Logique métier (services)

- [ ] **T2** — Implémenter `resolveSubjectUserId(memberId, churchId, db?)` : retourne le `userId`
      lié à ce membre via `MemberUserLink`, ou `null` *(fichier :
      `src/modules/planning/services/absence.service.ts`)*
- [ ] **T3** — Implémenter `listBackupOptions(subjectUserId, churchId, db?)` : réutilise
      `getDeclarerBackupScope(subjectUserId, ...)` pour les options STAR, résout les options
      RESPONSIBLE (Ministre du ministère / pairs Resp. département pour un Resp. département ;
      autres Ministres pour un Ministre) en excluant `subjectUserId` lui-même, retourne
      `{ eligible: boolean, options: Array<{ value, label }> }` — extrait/factorise la logique déjà
      présente dans `page.tsx` *(même fichier que T2)*
- [ ] **T4** [P] — Exporter `resolveSubjectUserId` et `listBackupOptions` depuis l'index public du
      module *(fichier : `src/modules/planning/index.ts`)*

### 3. API (route handlers)

- [ ] **T5** — `GET /api/absences/backup-options?churchId=&memberId=` *(nouveau fichier)* :
      `requireAuth()`, vérifie que `memberId` est dans le périmètre de gestion de l'appelant
      (`absences:manage` + `getUserDepartmentScope`, même logique que la déclaration pour un
      tiers), résout `resolveSubjectUserId` (T2) puis `listBackupOptions` (T3) ; `403` si hors
      périmètre, `{ eligible: false, options: [] }` si pas de compte lié ou pas de rôle
      responsable *(fichier : `src/app/api/absences/backup-options/route.ts`)*
- [ ] **T6** — `POST /api/absences` et `PATCH /api/absences/[id]` (`action: "update"`) : dans
      `assertBackupsAllowed`, quand `!isSelf`, résout le `userId` sujet via `resolveSubjectUserId`
      (T2) sur le `memberId`/`absence.memberId` ciblé (au lieu de bloquer systématiquement), et
      appelle `validateBackupTargets` avec ce `userId` sujet plutôt que celui de l'appelant ; `403`
      si aucun compte lié (backup non disponible) *(fichiers : `src/app/api/absences/route.ts`,
      `src/app/api/absences/[id]/route.ts`)*

### 4. UI

- [ ] **T7** — Remplacer le calcul inline des `backupOptions` (cas self) par un appel à
      `listBackupOptions(session.user.id, churchId)` (T3) *(fichier :
      `src/app/(auth)/absences/page.tsx`)*
- [ ] **T8** — En mode `manage` (déclaration ou édition pour un tiers), dès qu'un STAR est
      sélectionné, appelle `GET /api/absences/backup-options` (T5) pour déterminer s'il faut
      afficher le bloc `CheckboxGroup` « Backup (optionnel) » et avec quelles options ; pas
      d'appel si aucun STAR n'est sélectionné *(fichier :
      `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [ ] **T8b** — Revue d'ergonomie mobile du nouvel appel dynamique en T8 (état de chargement du
      bloc backup pendant la requête, pas de saut de mise en page) *(même fichier que T8)*

### 5. Tests

- [ ] **T9** — Tests unitaires `listBackupOptions`/`resolveSubjectUserId` : `eligible: false` sans
      rôle ou sans compte lié, options correctes pour Resp. département et Ministre, exclusion du
      sujet lui-même des options RESPONSIBLE *(fichier :
      `src/modules/planning/services/absence.service.test.ts`)*
- [ ] **T10** [P] — Tests d'intégration `GET /api/absences/backup-options` : 401, 403 hors
      périmètre, `eligible: false`/options correctes *(fichier :
      `src/app/api/absences/backup-options/__tests__/route.test.ts`)*
- [ ] **T11** [P] — Tests d'intégration `POST /api/absences` (mode tiers avec `backups`) : les
      backups sont validés par rapport au périmètre du STAR ciblé, pas de l'appelant ; un
      Secrétaire peut déclarer/modifier/annuler pour n'importe quel STAR de l'église *(fichier :
      `src/app/api/absences/__tests__/security.test.ts`)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Cohérence de la vue mobile vérifiée (T8b)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`
