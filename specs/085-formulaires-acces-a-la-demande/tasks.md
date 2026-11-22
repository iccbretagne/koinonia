# Tâches — Formulaires : accès à la demande

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/formulaires-acces-delegue`
- [ ] Migration Prisma générée (T1)

## Tâches

### 1. Données & migration

- [ ] **T1** — Modèles `FormsGrant` (`forms_grants`, unique `churchId+userId`) et `FormManager`
      (`form_managers`, clé `formId+userId`), relations inverses sur `User`, `Church`, `Form` ;
      `prisma migrate dev --name forms_grants` *(fichiers : `prisma/schema.prisma`,
      `prisma/migrations/*`)*

### 2. Logique métier (services)

- [ ] **T2** — Garde : `getFormAccess` ajoute `via: "role" | "author" | "comanager"` (accès
      délégué + appartenance à l'église requis) ; `requireFormManage(formId, { owner })` ;
      `getFormsCapability(session, churchId)` (`"all" | "own" | null`) ;
      `requireFormsCapability()` ; `requireFormsGrantAdmin()` *(fichier :
      `src/modules/forms/auth.ts`)*
- [ ] **T3** — Service des accès : `listFormsGrants`, `grantFormsAccess` (idempotent, compte
      membre de l'église, `logAudit`, notification `FORMS_ACCESS_GRANTED`), `revokeFormsAccess`
      (`FORMS_ACCESS_REVOKED`), `searchChurchUsersForFormsGrant` *(fichier :
      `src/modules/forms/services/grants.ts`)*
- [ ] **T4** — Service du partage : `listFormManagers`, `addFormManager` (cible avec accès
      délégué ou `forms:manage`, sinon 400 ; idempotent ; `FORM_SHARED`), `removeFormManager`
      (`FORM_UNSHARED`) *(fichier : `src/modules/forms/services/grants.ts`)*
- [ ] **T5** [P] — `listForms(churchId, scope?)` : filtre auteur ou co-gestionnaire, ajoute
      `createdBy { name }` *(fichier : `src/modules/forms/services/builder.ts`)*
- [ ] **T6** [P] — `signalNewResponses` : destinataires = auteur + co-gestionnaires, repli
      Admins/Secrétaires inchangé *(fichier : `src/modules/forms/services/notify.ts`)*
- [ ] **T7** — Exporter les nouveaux services par l'index ; déclarer les nouveaux types de
      notification si une liste les recense *(fichier : `src/modules/forms/index.ts`)*

### 3. API (route handlers)

- [ ] **T8** — `GET/POST /api/forms` : `requireFormsCapability`, liste filtrée pour `own` ;
      contrat mis à jour *(fichiers : `src/app/api/forms/route.ts`, `contract.ts`)*
- [ ] **T9** — `DELETE /api/forms/[id]` : `requireFormManage(id, { owner: true })` ; PATCH
      (rattachement) passe la capacité à `assertLinkableEvents` *(fichier :
      `src/app/api/forms/[id]/route.ts`)*
- [ ] **T10** — Rattachement : `linkableEvents`/`assertLinkableEvents` filtrés pour `own`
      (événements d'église si `events:view`, billetterie si `ticketing:manage` ou rôle
      d'événement) *(fichier : `src/app/api/forms/_events.ts`)*
- [ ] **T11** [P] — `GET/POST /api/forms/[id]/managers`, `DELETE
      /api/forms/[id]/managers/[userId]` + contrats *(fichiers :
      `src/app/api/forms/[id]/managers/**`)*
- [ ] **T12** [P] — `GET/POST /api/forms/grants`, `DELETE /api/forms/grants/[userId]`,
      `GET /api/forms/grants/users?q=` + contrats *(fichiers : `src/app/api/forms/grants/**`)*
- [ ] **T13** — Contrats existants `/api/forms/[id]/*` : libellé `access` mis à jour ;
      vérifier la déclaration des routes dans le manifeste ; `npm run openapi` *(fichiers :
      `src/app/api/forms/**/contract.ts`, `src/modules/forms/manifest.ts`, `docs/openapi.json`)*

### 4. UI

- [ ] **T14** — Navigation : `hasForms` inclut l'accès délégué dans l'église courante *(fichier :
      `src/app/(auth)/layout.tsx`)*
- [ ] **T15** — Liste `/formulaires` : capacité `own` ⇒ page gestionnaire filtrée (création
      possible, sans bouton « Accès ») ; `all` ⇒ mention « Créé par » et bouton « Accès »
      *(fichier : `src/app/(auth)/formulaires/page.tsx`)*
- [ ] **T16** [P] — Modal « Accès » : liste (compte, accordé par, date), recherche + Accorder,
      Retirer avec `ConfirmModal` *(fichier : `src/app/(auth)/formulaires/FormsGrantsButton.tsx`)*
- [ ] **T17** [P] — Panneau « Partage » sur `/formulaires/[id]` (auteur et gestionnaires
      modifient, co-gestionnaire en lecture) ; bouton Supprimer masqué au co-gestionnaire
      *(fichiers : `src/app/(auth)/formulaires/[id]/ManagersEditor.tsx`, `page.tsx`,
      `FormEditor.tsx`)*

### 5. Tests

- [ ] **T18** — Garde : gestionnaire, auteur avec/sans accès, co-gestionnaire avec accès / accès
      retiré, compte hors église, intervenant inchangé, `owner` refuse le co-gestionnaire
      *(fichier : `src/modules/forms/__tests__/auth.test.ts`)*
- [ ] **T19** [P] — Services : octroi idempotent (une notification), retrait, recherche bornée à
      l'église, partage refusé vers un compte sans accès, `logAudit` appelé *(fichier :
      `src/modules/forms/services/__tests__/grants.test.ts`)*
- [ ] **T20** [P] — `listForms` avec `scope`, `signalNewResponses` avec co-gestionnaires
      *(fichiers : tests existants de `builder` / `tasks.test.ts`)*
- [ ] **T21** — Routes : `GET /api/forms` filtré, `POST` par un compte délégué, `DELETE` refusé
      au co-gestionnaire, `/api/forms/grants` refusé hors `forms:manage`, formulaire d'autrui ⇒
      404 *(fichier : `src/app/api/forms/__tests__/routes.test.ts`)*

### 6. Documentation

- [ ] **T22** — `CLAUDE.md` (spécificités du module formulaires), guide utilisateur / fiche de
      l'assistant si elle décrit qui gère les formulaires, `CHANGELOG.md` (Non publié), statut
      de la spec *(fichiers : `CLAUDE.md`, `src/modules/assistant/knowledge/*`, `CHANGELOG.md`)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `grep -rn "forms:manage" src/app` relu : aucun usage restant qui exclurait à tort un compte délégué
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère (spec) | Tâches |
|---|---|
| Gestionnaires accordent / retirent / listent | T3, T12, T16, T19 |
| Aucun autre rôle n'accorde | T2, T12, T21 |
| Journal + notification | T3, T4, T19 |
| Outil visible pour un compte autorisé seulement | T14, T15 |
| Ne voit que ses formulaires (liste, export) | T2, T5, T8, T18, T21 |
| Formulaire d'autrui ⇒ comme inexistant | T2, T18, T21 |
| Tous les gestes 079 sur ses formulaires | T2 (garde élargie), T18 |
| Partage par l'auteur, co-gestionnaire sans suppression ni partage | T4, T9, T11, T17, T18 |
| Retrait ⇒ plus d'accès, formulaires toujours en ligne | T2, T18 |
| Gestionnaires voient l'auteur | T5, T15 |
| Signal à l'auteur + co-gestionnaires | T6, T20 |
| Gestionnaires, intervenants, répondants inchangés | T18, T21 (non-régression) |
