# Tâches — Suppression des demandes du suivi pastoral et de l'intégration

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/suppression-demandes`
- [ ] Migration Prisma générée (T3)

## Tâches

### 1. Décision, données & migration

- [ ] **T1** — Rédiger l'ADR-0019 « Effacement d'une demande supprimée » : suppression
      physique, effacement des lignes `audit_logs` de l'objet (première fois que le journal est
      réécrit — portée bornée à l'effacement de données personnelles d'un objet supprimé), une
      ligne `DELETE` sans `details`, suppression des notifications rattachées, résidu des
      notifications antérieures à lien générique ; l'ajouter à l'index
      *(fichiers : `docs/adr/0019-effacement-demande-supprimee.md`, `docs/adr/README.md`)*
- [ ] **T2** — Ajouter `entityType String? @db.VarChar(50)`, `entityId String?` et
      `@@index([entityType, entityId])` au modèle `Notification` *(fichier : `prisma/schema.prisma`)*
- [ ] **T3** — Générer la migration `add_notification_entity` (`prisma migrate dev`), vérifier
      qu'elle ne fait qu'ajouter deux colonnes nullables et un index (aucune reprise de
      données), régénérer le client
      *(fichier : `prisma/migrations/*_add_notification_entity/migration.sql`)*
- [ ] **T4** [P] — Documenter les deux colonnes *(fichier : `docs/database.md`)*

### 2. Noyau & permissions

- [ ] **T5** — `NotificationInput` : ajouter `entityType?`/`entityId?`, transmis par
      `createNotification`, `notifyUsers`, `notifyUsersWithRole`, `notifyDeptMembers` ; ajouter
      `deleteItemNotifications(tx, entityType, entityId, links)` (`deleteMany` sur
      `{ entityType, entityId }` **ou** `link ∈ links`) *(fichier : `src/lib/notifications.ts`)*
- [ ] **T6** — Déclarer `"care:delete": ["SUPER_ADMIN", "ADMIN"]` et
      `"integration:delete": ["SUPER_ADMIN", "ADMIN"]` — **à commiter avec T24 et T26** (règle
      CLAUDE.md n° 10) *(fichiers : `src/modules/care/manifest.ts`,
      `src/modules/integration/manifest.ts`)*
- [ ] **T7** — `requireCareDelete(churchId)` et `canDelete` dans `CareAccess` (résolu par
      `rolePermissions`, comme `canQualify`) *(fichier : `src/modules/care/auth.ts`)*
- [ ] **T8** [P] — `requireIntegrationDelete(churchId)` et
      `canDeleteIntegrationRequest(session, churchId)` (via `rolePermissions`, sans la délégation
      équipe/berger de `requireIntegrationAccess`) *(fichier : `src/modules/integration/auth.ts`)*

### 3. Rattachement des notifications émises

- [ ] **T9** — Renseigner `entityType`/`entityId` sur chaque notification `care` liée à une
      demande ou un suivi : nouvelle demande, affectation, réaffectation, retour au référent, à
      planifier, planifiée, non retenue, relances « à confier »/« à planifier », notifications de
      suivi *(fichiers : `src/modules/care/services/notifications.ts`, `appointments.ts`,
      `followups.ts`, `relances.ts`)*
- [ ] **T10** [P] — Idem pour l'affectation au berger et le renvoi à l'équipe
      *(fichier : `src/modules/integration/services/family-service.ts`)*
- [ ] **T11** [P] — Idem pour « Rendez-vous pastoral confirmé »
      *(fichier : `src/app/api/agenda/requests/[id]/schedule/route.ts`)*

### 4. Logique métier (suppression)

- [ ] **T12** — `deleteAppointmentRequest({ id, churchId, actorId })` : transaction — chargement
      avec `msdpFollowUp` (`409` si présent), suppression de l'entrée d'agenda, des lignes
      `audit_logs` de l'objet, des notifications (`deleteItemNotifications`, liens
      `/care/requests/{id}`), puis `deleteMany({ id, churchId })` (`404` si `count === 0`) ;
      après validation, `logAudit` `DELETE` sans `details`
      *(fichier : `src/modules/care/services/deletion.ts`)*
- [ ] **T13** — `deleteMsdpFollowUp({ id, churchId, actorId })` : même schéma sans contrôle de
      dépendance (liens `/care/followups/{id}`) *(fichier : `src/modules/care/services/deletion.ts`)*
- [ ] **T14** — `countCareItemsFromIntegrationRequest(tx, requestId)` (rendez-vous par
      `sourceIntegrationRequestId` + suivi par `requestId`) ; exporter T7, T12-T14 depuis l'index
      *(fichiers : `src/modules/care/services/deletion.ts`, `src/modules/care/index.ts`)*
- [ ] **T15** [P] — `deleteIntegrationRequest(tx, { id, churchId })` : lignes `audit_logs`,
      notifications (liens `/integration/requests/{id}` et `/admin/integration/requests/{id}`),
      puis `deleteMany` (`404` si `count === 0`) — sans `logAudit` ; exporter avec T8 depuis
      l'index *(fichiers : `src/modules/integration/services/deletion.ts`,
      `src/modules/integration/index.ts`)*

### 5. API (route handlers)

- [ ] **T16** — `DELETE /api/care/requests/[id]` : `requireAuth` → `await params` → chargement
      (`404`) → `requireCareDelete(item.churchId)` → `deleteAppointmentRequest` → `{ id }`
      *(fichier : `src/app/api/care/requests/[id]/route.ts`)*
- [ ] **T17** [P] — `DELETE /api/care/followups/[id]`, même schéma avec `deleteMsdpFollowUp`
      *(fichier : `src/app/api/care/followups/[id]/route.ts`)*
- [ ] **T18** [P] — `DELETE /api/integration/requests/[id]` : chargement (`404`) →
      `requireIntegrationDelete(req.churchId)` → `prisma.$transaction` (`409` si
      `countCareItemsFromIntegrationRequest > 0`, puis `deleteIntegrationRequest`) → `logAudit`
      `DELETE` après la transaction *(fichier : `src/app/api/integration/requests/[id]/route.ts`)*

### 6. UI

- [ ] **T19** — Rendez-vous : `page.tsx` passe `canDelete`, `linkedFollowUpId` et la présence
      d'une entrée d'agenda ; `RequestActions.tsx` ajoute « Supprimer » (`Button
      variant="danger"`, séparé du workflow), `ConfirmModal` de confirmation (mention de
      l'agenda si besoin), modale d'explication sans confirmation quand un suivi est lié (lien
      vers le suivi), `toast` et `router.push("/care")`, `409` affiché en `toast.error`
      *(fichiers : `src/app/(auth)/care/requests/[id]/page.tsx`, `RequestActions.tsx`)*
- [ ] **T20** [P] — Suivi : même ajout, sans blocage
      *(fichiers : `src/app/(auth)/care/followups/[id]/page.tsx`, `FollowupActions.tsx`)*
- [ ] **T21** [P] — Intégration : `page.tsx` passe `canDelete` et les éléments `care` liés
      (rendez-vous, suivi) ; bouton + modales dans `RequestDetail.tsx` sans restructurer le
      composant ; retour `/integration`
      *(fichiers : `src/app/(auth)/integration/requests/[id]/page.tsx`, `RequestDetail.tsx`)*
- [ ] **T22** [P] — `not-found.tsx` dans les trois segments `[id]` : `EmptyState` « Cette
      demande n'existe plus » (« …ou vous n'y avez pas accès ») + retour à la liste — vérifier
      d'abord le comportement de `not-found.tsx` de segment dans
      `node_modules/next/dist/docs/` *(fichiers : `src/app/(auth)/care/requests/[id]/not-found.tsx`,
      `care/followups/[id]/not-found.tsx`, `integration/requests/[id]/not-found.tsx`)*
- [ ] **T23** [P] — Entrée de guide « Supprimer une demande » (Admin/Super Admin)
      *(fichier : `src/components/GuideContent.tsx`)*

### 7. Documentation

- [ ] **T24** — Permissions `care:delete`/`integration:delete` dans la matrice de `CLAUDE.md`
      et le détail par module *(fichiers : `CLAUDE.md`, `docs/auth.md`)*
- [ ] **T25** [P] — Entrée « Non publié » : suppression des trois types de demande, effacement
      de l'historique et des notifications, résidu des anciennes notifications à lien générique
      *(fichier : `CHANGELOG.md`)*

### 8. Tests

- [ ] **T26** — Matrice figée : `care:delete` et `integration:delete` pour `SUPER_ADMIN`/`ADMIN`
      uniquement *(fichier : `src/core/__tests__/permissions.test.ts`)*
- [ ] **T27** [P] — `deleteItemNotifications` (filtre `OR`, sans liens ⇒ rattachement seul) et
      transmission de `entityType`/`entityId` par les helpers
      *(fichier : `src/lib/__tests__/notifications.test.ts`)*
- [ ] **T28** [P] — Suppression `care` : `409` sans rien supprimer si suivi lié ; ordre agenda →
      historique → notifications → demande ; `404` si `count === 0` ; ligne `DELETE` après la
      transaction et sans `details` ; suivi supprimé sans toucher la demande d'origine ;
      `countCareItemsFromIntegrationRequest` 0/rendez-vous/suivi/les deux
      *(fichier : `src/modules/care/__tests__/deletion.test.ts`)*
- [ ] **T29** [P] — `deleteIntegrationRequest` : historique, notifications (deux liens), demande ;
      `404` *(fichier : `src/modules/integration/__tests__/deletion.test.ts`)*
- [ ] **T30** [P] — Émissions rattachées : compléter les tests existants des notifications
      `care` (dont relances) et de `family-service` pour vérifier `entityType`/`entityId`
      *(fichiers : `src/modules/care/__tests__/*`, `src/modules/integration/__tests__/*`)*
- [ ] **T31** — Routes `DELETE` (auth mockée) : Admin → `200` ; Secrétaire, Référent soins
      pastoraux, membre de l'équipe Intégration → `403` ; Admin d'une autre église → `403` ; id
      inconnu → `404` ; dépendance → `409`
      *(fichiers : `__tests__/route.test.ts` des trois routes `[id]`)*
- [ ] **T32** — Vérification manuelle en dev : les trois suppressions, suppression bloquée,
      disparition des notifications de la cloche, lien vers une demande supprimée, entrée
      d'agenda supprimée, rendu à 390 px ; remettre la base de dev dans son état initial

## Couverture des critères d'acceptation

| Critère (`spec.md`) | Tâches |
|---|---|
| Admin et Super Admin suppriment les trois types de demande de leur église | T6, T12-T18, T31 |
| Aucun autre rôle ne voit l'action ; tentative directe refusée | T7, T8, T19-T21, T26, T31 |
| Confirmation explicite | T19-T21, T32 |
| Demande supprimée absente partout (listes, relances, statistiques, exports) | T12, T13, T15 (suppression physique), T32 |
| Refus si suivi ou rendez-vous lié, avec marche à suivre | T12, T14, T18, T19, T21, T28, T31 |
| Historique : trace de suppression sans donnée personnelle | T1, T12, T13, T18, T28 |
| Notifications supprimées ; lien vers une demande supprimée clair | T2, T3, T5, T9-T11, T22, T27, T30, T32 |
| Pas de suppression dans une autre église | T16-T18, T31 |
| Utilisable sur mobile | T19-T21, T32 |

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run build` (frontière client/serveur des composants modifiés)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] CHANGELOG (section non publiée) mis à jour
- [ ] PR ouverte vers `main`
