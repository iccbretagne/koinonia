# Tâches — Plusieurs départements pour une même fonction

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : helpers → services → API → UI → tests → documentation. Les tâches `[P]` sont
> parallélisables (fichiers indépendants).

## Prérequis

- [x] Branche créée : `feat/fonctions-multi-departements`
- [x] PR #561 mergée dans `main` (lien de menu Intégration en `count`, prérequis du plan)
- [x] Branche rebasée sur `origin/main` (elle précédait les merges #560 → #565 et #561)
- [x] Migration Prisma : **aucune** (voir `plan.md`)

## Tâches

### 1. Helpers partagés (noyau)

- [ ] **T1** — Dans `src/lib/department-functions.ts`, ajouter `MSDP` à `DEPT_FN` s'il manque,
      `DEPT_FN_LABEL` (libellé français par fonction) et `REQUEST_TYPE_FUNCTION:
      Record<RequestType, …>` + `functionForRequestType(type)`. Import de type uniquement
      (`import type { RequestType }` depuis `@/generated/prisma/client`) : le fichier doit rester
      importable côté client. *(fichier : `src/lib/department-functions.ts`)*
- [ ] **T2** — Créer `src/lib/function-departments.ts` (serveur) : `getFunctionDepartmentIds(churchId,
      fn, db?)` trié par `id`, `isMemberOfFunction(userDeptIds, churchId, fn, db?)`,
      `getFunctionDepartmentsMap(churchId, fns, db?)` → `Map<fn, { id, name }[]>` en **une**
      requête, noms triés. Import différé de Prisma (même motif que `defaultDb` d'audio).
      *(fichier : `src/lib/function-departments.ts`)*
- [ ] **T3** — Ajouter (à côté de T1) `formatAssignedDepts(fn, depts)` (pur) → « Nom » / « A, B » /
      « {libellé} (non configuré) », réutilisé par l'UI et l'export.
      *(fichier : `src/lib/department-functions.ts` — pur, importable client)*

### 2. Logique métier (services de modules)

- [ ] **T4** [P] — Audio : remplacer `getCaptureDepartmentId` par `getCaptureDepartmentIds`
      (via T2) ; `isCaptureTeamMember` et `isCaptureTeamLead` testent l'intersection ; mettre à
      jour l'export de `src/modules/audio/index.ts`.
      *(fichiers : `src/modules/audio/services/access.ts`, `src/modules/audio/index.ts`)*
- [ ] **T5** [P] — Intégration : `getManagers` (relance demandes sans suite) récupère les
      membres de **tous** les départements INTEGRATION, dédoublonnés par `userId`.
      *(fichier : `src/modules/integration/services/family-service.ts`)*
- [ ] **T6** [P] — MSDP : même traitement pour `getMsdpManagers`.
      *(fichier : `src/modules/integration/services/msdp-service.ts`)*

### 3. API (route handlers)

- [ ] **T7** [P] — `PATCH /api/departments/[departmentId]` : supprimer le `updateMany` qui
      désassigne les autres départements portant la même fonction. Garde, Zod et audit inchangés.
      *(fichier : `src/app/api/departments/[departmentId]/route.ts`)*
- [ ] **T8** — `POST /api/requests` (VISUEL et demandes Secrétariat) : retirer les `findFirst`
      de département destinataire, ne plus renseigner `assignedDeptId`. `GET /api/requests` :
      retirer le filtre `assignedDeptId`, remplacer `assignedDept` (demande + sous-demandes) par
      `assignedFunction` + `assignedDepts` via `getFunctionDepartmentsMap` (une requête).
      *(fichier : `src/app/api/requests/route.ts`)*
- [ ] **T9** — `GET/PATCH /api/requests/[id]` : `isAssignedDeptMember` devient
      `isMemberOfFunction(userDeptIds, churchId, functionForRequestType(type))` (ajouter `type` au
      `select` minimal du GET) ; réponse GET : `assignedFunction` + `assignedDepts` pour la demande
      et ses `childRequests`. *(fichier : `src/app/api/requests/[id]/route.ts`)*
- [ ] **T10** — `POST /api/announcements` : `findDeptByFunction` remplacé par un contrôle
      « au moins un département » (messages d'erreur inchangés), plus d'`assignedDeptId` sur les
      demandes créées. `GET` liste et `GET /api/announcements/[id]` : `assignedDept` →
      `assignedFunction` + `assignedDepts`.
      *(fichiers : `src/app/api/announcements/route.ts`, `src/app/api/announcements/[id]/route.ts`)*

### 4. UI

- [ ] **T11** [P] — File Secrétariat : garde d'accès via `getFunctionDepartmentIds` (vide →
      écran « non configuré » actuel) ; requête `type ∈ types SECRETARIAT`, `parentRequestId:
      null` au lieu de `assignedDeptId`. *(fichier : `src/app/(auth)/secretariat/requests/page.tsx`)*
- [ ] **T12** [P] — File Demandes visuels : idem, file `type: VISUEL`.
      *(fichier : `src/app/(auth)/media/requests/page.tsx`)*
- [ ] **T13** [P] — File Demandes réseaux sociaux : idem, file `type: RESEAUX_SOCIAUX`.
      *(fichier : `src/app/(auth)/communication/requests/page.tsx`)*
- [ ] **T14** — Mes demandes : `requests/page.tsx` charge `assignedDepts`/`assignedFunction`
      (même helper que T8) ; `RequestsList.tsx` affiche `formatAssignedDepts` sur la ligne, les
      sous-demandes et l'export. Vérifier le rendu mobile (noms multiples → retour à la ligne,
      pas de débordement). *(fichiers : `src/app/(auth)/requests/page.tsx`,
      `src/app/(auth)/requests/RequestsList.tsx`)*
- [ ] **T15** — Configuration des fonctions : `<select>` remplacé par `CheckboxGroup` groupé par
      ministère ; cocher → `PATCH { function }`, décocher → `PATCH { function: null }` ;
      département portant une autre fonction désactivé et suffixé de son libellé ; résumé « ✓ A,
      B » ou avertissement actuel ; liste `max-h` + `overflow-y-auto` ; retirer le texte de page
      « quel département » au singulier. Vérifier que `CheckboxGroup` gère `disabled` et les
      groupes, sinon composer localement sans créer de nouveau composant UI.
      *(fichiers : `src/app/(auth)/admin/departments/functions/DeptFunctionsClient.tsx`,
      `…/functions/page.tsx`)*

### 5. Tests

- [ ] **T16** [P] — Helpers : `REQUEST_TYPE_FUNCTION` couvre toutes les valeurs de l'enum
      `RequestType` (exhaustivité) ; `formatAssignedDepts` pour 0 / 1 / 2 départements.
      *(fichier : `src/lib/__tests__/department-functions.test.ts`)*
- [ ] **T17** [P] — `function-departments` : 0 / 1 / N départements, isolation par église (le
      `where` porte `ministry.churchId`), ordre déterministe, intersection, une seule requête pour
      la map. *(fichier : `src/lib/__tests__/function-departments.test.ts`)*
- [ ] **T18** [P] — PATCH département : assigner une fonction n'appelle aucune mise à jour sur un
      autre département. *(fichier : `src/app/api/departments/__tests__/route.test.ts`)*
- [ ] **T19** [P] — `/api/requests/[id]` : membre d'un 2ᵉ département de la fonction → autorisé ;
      membre d'un département ne portant plus la fonction → 403 ; auteur et manager inchangés ;
      `assignedDepts` renvoyé. *(fichier : `src/app/api/requests/__tests__/security.test.ts`)*
- [ ] **T20** [P] — `POST /api/announcements` : fonction portée par 2 départements → création
      sans `assignedDeptId` ; aucune → 400 inchangé.
      *(fichier : `src/app/api/announcements/__tests__/security.test.ts`)*
- [ ] **T21** [P] — Audio : membre et responsable d'un 2ᵉ département de captation → accès et
      dépublication ; hors départements → refus.
      *(fichier : `src/modules/audio/services/__tests__/access.test.ts`)*
- [ ] **T22** [P] — Relances intégration et MSDP : deux départements, une personne dans les deux
      → une seule notification ; conseillers MSDP de deux départements, sans doublon. *(fichiers : `src/modules/integration/__tests__/msdp-service.test.ts`,
      `src/app/api/integration/msdp/counselors/__tests__/route.test.ts` — à créer,
      `src/modules/integration/__tests__/family-service.test.ts` — à créer)*
- [ ] **T23** — Mettre à jour les tests existants cassés par la disparition d'`assignedDeptId` /
      `getCaptureDepartmentId` (sans affaiblir leurs assertions de sécurité).

### 6. Documentation

- [ ] **T24** [P] — `CLAUDE.md` et `docs/auth.md` : « le département de captation » et les
      fonctions au pluriel ; routage des demandes par type → fonction. *(fichiers : `CLAUDE.md`,
      `docs/auth.md`)*
- [ ] **T25** [P] — `docs/api.md` (`assignedDepts`/`assignedFunction`, filtre retiré),
      `docs/database.md` (`assignedDeptId` obsolète, suppression à venir),
      `src/components/GuideContent.tsx` (page fonctions : plusieurs départements possibles).
- [ ] **T26** — Préparer pour la PR : requête SQL de contrôle recette (demandes dont la fonction du
      département assigné ≠ fonction du type ; attendu : uniquement `assignedDeptId` null) et
      script de backfill `assignedDeptId` en cas de retour arrière. *(corps de PR, pas de fichier)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run build` (frontière client/serveur : `department-functions.ts` importé par des composants client)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (table ci-dessous)
- [ ] Recette : configuration à 2 départements, file partagée, affichage destinataire, mobile
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère (spec) | Tâches |
|---|---|
| Associer 0, 1 ou N départements, en retirer un sans affecter les autres | T7, T15, T18 |
| Un 2ᵉ département ne retire pas le premier | T7, T15, T18 |
| Membre de n'importe quel département → écrans et lien de menu | T4, T11–T13, T21 (Intégration/Protocole/trame/ouverture déjà `count`/`some`, #561) |
| Membre d'un département retiré → perd les accès | T9, T11–T13, T19, T21 |
| Notifications et relances → tous les départements, une fois par personne | T5, T6, T22 (`notifyDeptMembers` déjà conforme) |
| Demande multi-départements visible et traitable par chacun, sans choix du demandeur | T8–T13, T19, T20 |
| Demande reçue avant un retrait reste traitable par la fonction | T9, T11–T13, T19 |
| Demandeur voit les départements actuels ; identique avec un seul | T3, T8–T10, T14, T16 |
| Conseillers MSDP de tous les départements MSDP | déjà conforme (`some`) — vérifié en T22 |
| Aucun choix arbitraire entre départements | T2, T4–T6, T8, T10–T13, T17 |
| Église mono-département : aucun changement visible | T14, T16, recette |
