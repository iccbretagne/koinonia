# Tâches — Service d'ouverture et de fermeture de l'église

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/ouverture-fermeture-eglise`
- [x] Migration Prisma générée (T1)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter l'enum `DutySlot` (`OPENING`, `CLOSING`) et le modèle
      `OpeningClosingAssignment` (`churchId`, `eventId`, `slot`, `memberId`, `note?`,
      `createdByUserId`, `createdAt`, contrainte `@@unique([eventId, slot, memberId])`), plus la
      relation inverse `openingClosingAssignments OpeningClosingAssignment[]` sur `Event`
      *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration (`npm run db:migrate -- --name add_opening_closing_assignment`)
      — jamais `db push`

### 2. Logique métier (services)

- [x] **T3** — `canManageOpeningClosing(session, churchId)` : `true` si `events:manage`, sinon si
      responsable/adjoint (`getUserDepartmentScope`) d'un département `function === "SECURITE"`,
      sinon si le `Member` lié (`MemberUserLink`) appartient (`member_departments`) à un
      département `function === "SECRETARIAT"` (n'importe quel rôle), sinon `false`
      *(fichier : `src/modules/planning/services/opening-closing.service.ts`)*
- [x] **T4** — `findActiveAbsenceForMember(churchId, memberId, eventDate)` : réutilise le pattern
      `Absence` `status: "ACTIVE"` + chevauchement de dates (voir
      `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)
      *(fichier : `src/modules/planning/services/opening-closing.service.ts`, même fichier que T3)*
- [x] **T5** — `notifyAssignment(memberId, event, slot)` / `notifyRemoval(memberId, event, slot)` :
      résolvent le `userId` via `MemberUserLink`, silencieux si absent, appellent
      `createNotification` (`src/lib/notifications.ts`)
      *(fichier : `src/modules/planning/services/opening-closing.service.ts`, même fichier que T3/T4)*

### 3. API (route handlers)

- [x] **T6** — `GET /api/events/[eventId]/opening-closing` : `requireChurchPermission("planning:view", churchId)`
      (via `resolveChurchId("event", eventId)`), renvoie `{ opening: [...], closing: [...] }`
      avec le membre inclus *(fichier : `src/app/api/events/[eventId]/opening-closing/route.ts`)*
- [x] **T7** — `POST /api/events/[eventId]/opening-closing` : `requireAuth()` puis
      `canManageOpeningClosing`, validation Zod (`slot`, `memberId`, `note?`), vérifie que
      l'événement et le membre appartiennent à l'église résolue, crée l'affectation,
      `findActiveAbsenceForMember` pour le flag `absenceWarning`, appelle `notifyAssignment`,
      renvoie `{ assignment, absenceWarning }` *(fichier : même fichier que T6)*
- [x] **T8** — `DELETE /api/events/[eventId]/opening-closing/[id]` : `requireAuth()` puis
      `canManageOpeningClosing`, 404 si l'affectation n'existe pas ou n'appartient pas à
      l'église/l'événement, supprime, appelle `notifyRemoval`, renvoie `{ success: true }`
      *(fichier : `src/app/api/events/[eventId]/opening-closing/[id]/route.ts`)*

### 4. UI

> **Déviation par rapport au plan initial** : le plan prévoyait la gestion sur la fiche
> événement admin (`/admin/events/[eventId]`), gardée par `events:manage` (Super
> Admin/Admin/Secrétaire uniquement). Implémentation révèle que ce guard exclurait les deux
> autres populations habilitées par la spec (responsables Sécurité, membres simples
> Secrétariat), qui n'ont pas `events:manage` et ne peuvent même pas atteindre cette page. La
> vue `/events/[eventId]/star-view` (gardée par `planning:view`, que ces trois populations
> possèdent déjà) est le seul point d'entrée commun aux trois — la gestion y est donc intégrée
> à la place, avec les contrôles visibles seulement si le serveur renvoie `canManage`.

- [x] **T9** — Section « Ouverture / Fermeture » interactive (listes, ajout par recherche de
      membre, retrait, badge « Non pourvu », avertissement absence non bloquant), visible sous
      la zone imprimable, contrôles conditionnés à `openingClosing.canManage` renvoyé par le
      serveur *(fichiers : `src/app/(auth)/events/[eventId]/star-view/OpeningClosingManager.tsx`
      nouveau, `src/app/(auth)/events/[eventId]/star-view/StarViewClient.tsx`)*
- [x] **T10** [P] — Ajouter `openingClosingAssignments` à l'`include` Prisma de la route
      star-view, la réponse mappée (`opening`/`closing`) et le flag `canManage`
      (`canManageOpeningClosing`) *(fichier : `src/app/api/events/[eventId]/star-view/route.ts`)*
- [x] **T10bis** — Nouvel endpoint `GET /api/events/[eventId]/opening-closing/members` (recherche
      de membres « n'importe qui dans l'église », gardé par `canManageOpeningClosing` — `/api/members`
      existant ne convient pas, son scoping par département de responsabilité empêcherait un
      responsable Sécurité de désigner un membre hors de son département)
      *(fichier : `src/app/api/events/[eventId]/opening-closing/members/route.ts`)*
- [x] **T11** — Affichage en lecture seule (noms ou « Non pourvu ») dans l'en-tête imprimable de
      la vue consultation, visible à tous les détenteurs de `planning:view`
      *(fichier : `src/app/(auth)/events/[eventId]/star-view/StarViewClient.tsx`, même fichier que T9)*
- [x] **T12** [P] — « Mon planning » : requête `prisma.openingClosingAssignment.findMany({ where: { memberId } })`
      côté serveur, entrées synthétiques (pas de département propre) réutilisant l'affichage
      existant de `MyPlanningView` sans le modifier
      *(fichier : `src/app/(auth)/planning/page.tsx`)*

### 5. Tests

- [x] **T13** [P] — Tests de `canManageOpeningClosing` (les 4 branches) et
      `findActiveAbsenceForMember` (absence chevauchante, hors période, aucune)
      *(fichier : `src/modules/planning/services/__tests__/opening-closing.service.test.ts`)*
- [x] **T14** [P] — Tests de la route `opening-closing` : GET (vide, peuplé), POST (création +
      notification, 403 rôle non habilité, `absenceWarning`, 400 payload invalide, 404 événement/
      membre hors église, erreur sur doublon `@@unique`), DELETE (retrait + notification, 403, 404)
      — ajoute aussi le mock `openingClosingAssignment` manquant dans `src/__mocks__/prisma.ts`
      *(fichier : `src/app/api/events/__tests__/opening-closing.test.ts`)*
- [x] **T15** [P] — Aucun test existant pour la route `star-view` (contrairement à ce que
      supposait la tâche) : création d'un test dédié, focalisé sur `openingClosing`
      (`opening`/`closing`/`canManage`) plutôt qu'une extension d'un fichier inexistant
      *(fichier : `src/app/api/events/__tests__/star-view.test.ts`, nouveau)*

> **Correction découverte pendant T13** : ajouter les exports de `opening-closing.service.ts` à
> `src/modules/planning/index.ts` (nécessaire pour T6-T12) faisait charger `@/lib/auth` et
> `@/lib/notifications` — donc `next-auth`/`next/server` et le vrai client Prisma — au simple
> import de `@/modules/planning`, cassant plusieurs tests préexistants (`absence.service.test.ts`,
> `event-service.test.ts`, `request-executor.test.ts`, `planning-bus.test.ts`,
> `permissions.test.ts`) qui importent l'index sans mocker `@/lib/auth`/`@/lib/prisma`. Corrigé en
> différant ces deux imports (même pattern que `defaultDb()`) à l'intérieur des fonctions qui en
> ont besoin. Suite complète revérifiée verte après coup (145 fichiers, 1548 tests).

## Vérification manuelle

- [ ] Un responsable Sécurité désigne une personne pour l'ouverture d'un événement — le nom
      apparaît sur la fiche événement et dans « Mon planning » de la personne désignée
- [ ] Un membre simple (non responsable) du département Secrétariat peut aussi désigner
- [ ] Un rôle non habilité (ex. STAR d'un autre département) ne voit pas les actions de
      désignation
- [ ] Désigner une personne en absence déclarée sur la date de l'événement déclenche un
      avertissement visible, sans bloquer la désignation
- [ ] Un créneau sans désignation affiche « Non pourvu »
- [ ] Retirer une désignation la fait disparaître partout (fiche événement, Mon planning) et
      notifie la personne retirée
- [ ] Cohérent sur mobile (fiche événement admin + vue consultation)

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` (145 fichiers, 1548 tests)
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (couverts par T6-T12 + tests T13-T15 ;
      la vérification manuelle en environnement navigateur+BDD seedée n'a pas été effectuée dans
      cette session, voir case ci-dessus)
- [ ] PR ouverte vers `main`
