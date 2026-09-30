# Tâches — Accompagnants déclarés du suivi pastoral

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/accompagnants-declares`
- [ ] Migration Prisma générée (T2)

## Tâches

### 1. Données & migration

- [ ] **T1** — Ajouter l'enum `CareCompanionMode` (`ADDED`, `EXCLUDED`) et le modèle
      `CareCompanion` (`@@unique([churchId, userId])`, `@@index([churchId])`, `@@map("care_companions")`,
      `onDelete: Cascade` sur église et utilisateur, `SetNull` sur `createdById`) ; relations
      inverses sur `Church` et `User` *(fichier : `prisma/schema.prisma`)*
- [ ] **T2** — Générer la migration `add_care_companions` (`prisma migrate dev`), vérifier
      qu'elle ne fait que créer la table et l'enum, régénérer le client
      *(fichier : `prisma/migrations/*_add_care_companions/migration.sql`)*
- [ ] **T3** [P] — Documenter le modèle *(fichier : `docs/database.md`)*

### 2. Logique métier (services)

- [ ] **T4** — Créer `services/companions.ts` : type `CompanionCandidate`, fonction pure
      `isCompanionEligible(candidate)` (règle du plan) et `listCompanionCandidates(churchId)`
      (une requête : utilisateurs à `MemberUserLink` validé dans l'église, départements de la
      fiche, appartenance MSDP par fiche ou par responsabilité, exception)
      *(fichier : `src/modules/care/services/companions.ts`)*
- [ ] **T5** — Ajouter `listEligibleCompanions(churchId)` (tri par nom) et
      `isEligibleCompanion(churchId, userId)` (requête ciblée, même règle)
      *(fichier : `src/modules/care/services/companions.ts`)*
- [ ] **T6** — Ajouter `getCompanionSettings(churchId)` → `{ msdp, added, candidates }` avec
      `activeAssignments` par personne (deux `groupBy` : rendez-vous `VALIDATED`/`SCHEDULED` par
      `assignedMemberId`, suivis `ASSIGNED`/`CONTACTED`/`IN_FORMATION` par
      `assignedConseillerMsdpId`) *(fichier : `src/modules/care/services/companions.ts`)*
- [ ] **T7** — Ajouter `setCompanionState({ churchId, userId, state, actorId })` : `ADDED`
      exige un compte validé, `EXCLUDED` exige l'appartenance MSDP, `DEFAULT` supprime
      (idempotent) ; `logAudit` seulement sur changement effectif ; renvoie `activeAssignments`
      *(fichier : `src/modules/care/services/companions.ts`)*
- [ ] **T8** — `resolveAssignee` (branche `MEMBER`) : remplacer la requête de #616 par
      `isEligibleCompanion` ; message « Cette personne n'est pas un accompagnant possible de
      l'église » *(fichier : `src/modules/care/services/assignee.ts`)*
- [ ] **T9** — Supprimer `listMsdpCounselors` ; exporter `listEligibleCompanions`,
      `getCompanionSettings`, `setCompanionState` et leurs types depuis l'index du module
      *(fichiers : `src/modules/care/services/followups.ts`, `src/modules/care/index.ts`)*

### 3. API (route handlers)

- [ ] **T10** — `GET /api/care/companions` : renvoyer `{ profiles, members }` via
      `listEligibleCompanions` *(fichier : `src/app/api/care/companions/route.ts`)*
- [ ] **T11** — `PUT /api/care/companions` : Zod `{ churchId, userId, state }`,
      `requireCareQualify(churchId)`, `setCompanionState` avec l'utilisateur de la session
      *(fichier : `src/app/api/care/companions/route.ts`)*

### 4. UI

- [ ] **T12** — Page Paramètres : charger `getCompanionSettings` et afficher une seconde carte
      « Accompagnants » sous les délais ; ajuster le texte d'introduction
      *(fichier : `src/app/(auth)/care/parametres/page.tsx`)*
- [ ] **T13** — Composant client `CompanionsSettings` :
      - groupe « Équipe MSDP » (une `Checkbox` « Accompagnant » par membre, départements, « N en
        cours ») ;
      - groupe « Ajoutés hors MSDP » (`IconButton` « Retirer », `EmptyState` si vide) ;
      - recherche locale (`Input`) avec bouton « Ajouter » ;
      - `ConfirmModal` quand `activeAssignments > 0` ;
      - `useToast` puis `router.refresh()`.
      Mise en page mobile d'abord (lignes pleine largeur `min-h-12`, pas de table)
      *(fichier : `src/app/(auth)/care/parametres/CompanionsSettings.tsx`)*
- [ ] **T14** [P] — `AssigneeSelect` : lire `members`, groupe « STAR accompagnants », option
      désactivée « Aucun STAR accompagnant — voir Paramètres » si vide
      *(fichier : `src/app/(auth)/care/AssigneeSelect.tsx`)*
- [ ] **T15** [P] — Guide utilisateur (Référent soins pastoraux) : section « Accompagnants »
      *(fichier : `src/components/GuideContent.tsx`)*
- [ ] **T16** [P] — Documentation : accompagnant possible (règle, exceptions) et nouvelle méthode
      `PUT` *(fichiers : `docs/auth.md`, `docs/api.md`)*

### 5. Tests

- [ ] **T17** — `isCompanionEligible` : matrice MSDP par fiche / par responsabilité / hors MSDP
      × aucune exception / `ADDED` / `EXCLUDED` × compte validé ou non
      *(fichier : `src/modules/care/__tests__/companions.test.ts`)*
- [ ] **T18** — `listEligibleCompanions` et `isEligibleCompanion` donnent le même verdict pour un
      même utilisateur (garde anti-dérive #616) *(fichier : `src/modules/care/__tests__/companions.test.ts`)*
- [ ] **T19** — `setCompanionState` : refus `ADDED` sans compte validé, refus `EXCLUDED` hors
      MSDP, `DEFAULT` idempotent, audit uniquement sur changement, `activeAssignments`
      *(fichier : `src/modules/care/__tests__/companions.test.ts`)*
- [ ] **T20** — `resolveAssignee` : accepte un STAR `ADDED` hors MSDP, refuse un membre MSDP
      `EXCLUDED` ; mettre à jour les cas existants *(fichier : `src/modules/care/__tests__/assignee.test.ts`)*
- [ ] **T21** — Routes : `GET`/`PUT` renvoient 403 sans `care:qualify` (Secrétaire incluse), 400
      sur body invalide, refus d'une autre église ; `PUT` appelle `setCompanionState` avec
      l'acteur de la session *(fichier : `src/app/api/care/companions/__tests__/route.test.ts`)*
- [ ] **T22** — Vérification manuelle en dev (Playwright, 390 px et bureau) :
      - exclure un membre du MSDP, ajouter un STAR hors MSDP, retirer une personne ayant une
        demande en cours (confirmation) ;
      - confier une demande au STAR hors MSDP, puis l'ouvrir et la traiter avec son compte ;
      - la Secrétaire n'a pas accès à la carte.

## Couverture des critères d'acceptation

| Critère (`spec.md`) | Tâches |
|---|---|
| Exclure/réintégrer, ajouter/retirer réservé au référent, Admin, Super Admin | T7, T11, T13, T21 |
| STAR hors MSDP ajouté, puis confié et traité jusqu'au bout | T7, T8, T20, T22 |
| Membre MSDP exclu ni proposé ni affectable | T5, T8, T14, T17, T20 |
| Arrivée dans le MSDP proposée sans action | T4, T17 |
| Aucun changement juste après déploiement | T2 (migration sans données), T17 |
| Exclure/retirer ne retire aucune demande en cours | T6, T7, T13, T19, T22 |
| STAR sans compte validé non déclarable | T7, T17, T19 |
| Aucun effet d'une église sur l'autre | T4, T5, T21 |
| Changements tracés dans l'historique | T7, T19 |
| Utilisable sur mobile | T13, T22 |

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run build` (lot UI : frontière client/serveur)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] CHANGELOG (section non publiée) mis à jour
- [ ] PR ouverte vers `main`
