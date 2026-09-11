# Tâches — Événements d'équipe

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/evenements-equipe`
- [x] Migration Prisma générée (si schéma modifié)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajoute le modèle `TeamEvent` à `prisma/schema.prisma` (champs, index, `onDelete:
      Cascade` sur `department`) et les relations inverses `Church.teamEvents`,
      `Department.teamEvents`, `User.teamEventsCreated`. *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Génère la migration `add_team_events` (`npm run db:migrate`, jamais `db push`).
      *(fichier : `prisma/migrations/…`)*
- [x] **T3** [P] — Ajoute `teamEvent: createModelMock()` au mock Prisma.
      *(fichier : `src/__mocks__/prisma.ts`)*

### 2. Logique métier (services)

- [x] **T4** — Extrait `generateRecurrenceDates` et `MAX_RECURRENCE_OCCURRENCES` de
      `request-executor.ts` vers un nouveau fichier partagé, et met à jour l'import dans
      `request-executor.ts` (aucun changement de comportement — les tests existants de
      `request-executor.test.ts` doivent continuer à passer tels quels).
      *(fichiers : `src/modules/planning/services/recurrence.ts`,
      `src/modules/planning/services/request-executor.ts`)*
- [x] **T5** — Crée `team-event.service.ts` : `listDepartmentTeamEvents`,
      `getTeamEventScopeInfo`, `createTeamEvent` (transaction, génère la série via
      `recurrence.ts`, conserve la durée, retourne `{ created, truncated }`), `updateTeamEvent`
      (`occurrence` / `following`, préserve le jour de chaque occurrence, applique la nouvelle
      heure et la nouvelle durée en heure locale), `deleteTeamEvent` (`occurrence` /
      `following`, n'affecte jamais le passé), `listTeamEventsForMember` (filtre
      `churchId` + `department.memberDepts.some({ memberId })`).
      *(fichier : `src/modules/planning/services/team-event.service.ts`)*
- [x] **T6** — Exporte les fonctions du service (et leurs types) depuis l'index du module.
      *(fichier : `src/modules/planning/index.ts`)*

### 3. API (route handlers)

- [x] **T7** — Ajoute le cas `"teamEvent"` à `resolveChurchId` (404 « Événement d'équipe
      introuvable » si absent). *(fichier : `src/lib/auth.ts`)*
- [x] **T8** — Crée `GET`/`POST /api/departments/[departmentId]/team-events` :
      `resolveChurchId("department", …)` → `requireChurchPermission("planning:department"` pour
      GET, `"planning:edit"` pour POST `)` → `requireDepartmentAccess` → appel au service ;
      `createSchema` Zod (dont le refine `endsAt > startsAt`) ; `logAudit` sur POST.
      *(fichier : `src/app/api/departments/[departmentId]/team-events/route.ts`)*
- [x] **T9** — Crée `PUT`/`DELETE /api/team-events/[teamEventId]` : résout l'église via
      `resolveChurchId("teamEvent", …)`, vérifie `planning:edit`, récupère le `departmentId` de
      l'événement via `getTeamEventScopeInfo` **avant** `requireDepartmentAccess` ;
      `updateSchema` Zod sur PUT, `?scope=occurrence|following` sur DELETE ; `logAudit` sur les
      deux, avec `scope` et le nombre d'occurrences touchées.
      *(fichier : `src/app/api/team-events/[teamEventId]/route.ts`)*
- [x] **T10** [P] — Déclare `{ path: "/api/team-events" }` dans `routes.api` du manifeste
      `planning` (surface HTTP, ADR-0012). *(fichier : `src/modules/planning/manifest.ts`)*

### 4. UI

- [x] **T11** — Ajoute le lien « Équipe » (`view=team`) à `DashboardActions.tsx`, même style que
      les autres onglets, visible dans le `flex-wrap` mobile existant.
      *(fichier : `src/components/DashboardActions.tsx`)*
- [x] **T12** — Crée `TeamEventsView.tsx` : bascule À venir/Passés, liste de cartes (titre,
      date, plage horaire, lieu, pictogramme de série), bouton « Nouvel événement d'équipe » +
      actions modifier/supprimer si `canEditPlanning`, sinon lecture seule ; `Modal` de
      création/édition (`Input`, `Select` de récurrence + date de fin à la création) ; choix
      « Cette occurrence uniquement » / « Cette occurrence et les suivantes » sur une occurrence
      de série ; message si `truncated` ; erreurs Zod affichées sous le champ concerné ; mise en
      page mobile (cartes empilées, boutons pleine largeur sous `sm`).
      *(fichier : `src/components/TeamEventsView.tsx`)*
- [x] **T13** — Branche `view === "team"` dans la page du tableau de bord : résout le
      département sélectionné, calcule/transmet `canEditPlanning` (déjà calculé plus haut dans
      la page) et rend `TeamEventsView`. *(fichier : `src/app/(auth)/dashboard/page.tsx`)*
- [x] **T14** — Ajoute `listTeamEventsForMember(churchId, link.memberId)` au `Promise.all`
      existant de la page « Mon planning » et transmet le résultat en prop `teamEvents`.
      *(fichier : `src/app/(auth)/planning/page.tsx`)*
- [x] **T15** — Fusionne `plannings` et `teamEvents` par mois dans `MyPlanningView.tsx` (tri par
      date), badge « Équipe » distinct du badge de statut de service, affichage département +
      plage horaire + lieu, état vide mis à jour (« Aucun service ni événement d'équipe »),
      `minKey`/`maxKey` couvrant les deux listes.
      *(fichier : `src/app/(auth)/planning/MyPlanningView.tsx`)*

### 5. Tests

- [x] **T16** — Tests du service : génération de série (durée conservée, `seriesId` commun,
      `truncated`), `updateTeamEvent`/`deleteTeamEvent` en `occurrence` vs `following` (bornes
      exactes, passé jamais touché), report d'heure sur une série traversant le changement
      d'heure d'été, `listTeamEventsForMember` filtré par église et appartenance — assertion
      explicite qu'un membre retiré de `member_departments` n'apparaît plus dans le résultat
      (simule le retrait entre deux appels au mock).
      *(fichier : `src/modules/planning/services/__tests__/team-event.service.test.ts`)*
- [x] **T17** — Tests de périmètre sur les routes département (même motif que
      `notices/__tests__/dept-scope.test.ts`) : Responsable hors périmètre → 403 (GET, POST) ;
      Responsable dans son périmètre → 200/201 ; Responsable adjoint → même droits que
      titulaire ; Ministre dans / hors de son ministère ; STAR → 403 ; Secrétaire GET → 200,
      POST → 403 ; Admin → 200/201 ; `endsAt <= startsAt` → 400.
      *(fichier : `src/app/api/departments/[departmentId]/team-events/__tests__/dept-scope.test.ts`)*
- [x] **T18** — Tests de périmètre sur la route événement : PUT/DELETE hors périmètre → 403 ;
      événement d'une autre église → 404 ; `scope=following` transmis correctement au service.
      *(fichier : `src/app/api/team-events/[teamEventId]/__tests__/dept-scope.test.ts`)*
- [x] **T19** [P] — Vérifie que les tests existants de récurrence
      (`request-executor.test.ts`) passent inchangés après l'extraction T4 (aucune nouvelle
      assertion attendue, juste la non-régression).
      *(fichier : `src/modules/planning/services/request-executor.test.ts`)*
- [x] **T20** [P] — Confirme que `/api/team-events` (déclaré en T10) est bien couvert par
      `routes-exhaustivite.test.ts` (préfixes résolus dynamiquement depuis les manifestes, pas
      énumérés en dur — aucune modification du test nécessaire).
      *(fichier : `src/lib/__tests__/routes-exhaustivite.test.ts`)*

### 6. Documentation

- [x] **T21** [P] — Ajoute la section « Événements d'équipe » (rôles, périmètre de
      responsabilité vs appartenance, renvoi ADR-0013) à `CLAUDE.md` et `docs/auth.md`,
      documente les 4 endpoints dans `docs/api.md`, ajoute `TeamEvent` à `docs/database.md`.
      *(fichiers : `CLAUDE.md`, `docs/auth.md`, `docs/api.md`, `docs/database.md`)*
- [x] **T22** [P] — Passe l'ADR-0013 de statut « Proposé » à « Accepté » une fois la feature
      implémentée et validée. *(fichier : `docs/adr/0013-perimetre-appartenance-lecture-seule.md`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`
