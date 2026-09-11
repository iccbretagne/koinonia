# Tâches — Service d'ouverture et de fermeture de l'église

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/ouverture-fermeture-eglise`
- [ ] Migration Prisma générée (T1)

## Tâches

### 1. Données & migration

- [ ] **T1** — Ajouter l'enum `DutySlot` (`OPENING`, `CLOSING`) et le modèle
      `OpeningClosingAssignment` (`churchId`, `eventId`, `slot`, `memberId`, `note?`,
      `createdByUserId`, `createdAt`, contrainte `@@unique([eventId, slot, memberId])`), plus la
      relation inverse `openingClosingAssignments OpeningClosingAssignment[]` sur `Event`
      *(fichier : `prisma/schema.prisma`)*
- [ ] **T2** — Générer la migration (`npm run db:migrate -- --name add_opening_closing_assignment`)
      — jamais `db push`

### 2. Logique métier (services)

- [ ] **T3** — `canManageOpeningClosing(session, churchId)` : `true` si `events:manage`, sinon si
      responsable/adjoint (`getUserDepartmentScope`) d'un département `function === "SECURITE"`,
      sinon si le `Member` lié (`MemberUserLink`) appartient (`member_departments`) à un
      département `function === "SECRETARIAT"` (n'importe quel rôle), sinon `false`
      *(fichier : `src/modules/planning/services/opening-closing.service.ts`)*
- [ ] **T4** — `findActiveAbsenceForMember(churchId, memberId, eventDate)` : réutilise le pattern
      `Absence` `status: "ACTIVE"` + chevauchement de dates (voir
      `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)
      *(fichier : `src/modules/planning/services/opening-closing.service.ts`, même fichier que T3)*
- [ ] **T5** — `notifyAssignment(memberId, event, slot)` / `notifyRemoval(memberId, event, slot)` :
      résolvent le `userId` via `MemberUserLink`, silencieux si absent, appellent
      `createNotification` (`src/lib/notifications.ts`)
      *(fichier : `src/modules/planning/services/opening-closing.service.ts`, même fichier que T3/T4)*

### 3. API (route handlers)

- [ ] **T6** — `GET /api/events/[eventId]/opening-closing` : `requireChurchPermission("planning:view", churchId)`
      (via `resolveChurchId("event", eventId)`), renvoie `{ opening: [...], closing: [...] }`
      avec le membre inclus *(fichier : `src/app/api/events/[eventId]/opening-closing/route.ts`)*
- [ ] **T7** — `POST /api/events/[eventId]/opening-closing` : `requireAuth()` puis
      `canManageOpeningClosing`, validation Zod (`slot`, `memberId`, `note?`), vérifie que
      l'événement et le membre appartiennent à l'église résolue, crée l'affectation,
      `findActiveAbsenceForMember` pour le flag `absenceWarning`, appelle `notifyAssignment`,
      renvoie `{ assignment, absenceWarning }` *(fichier : même fichier que T6)*
- [ ] **T8** — `DELETE /api/events/[eventId]/opening-closing/[id]` : `requireAuth()` puis
      `canManageOpeningClosing`, 404 si l'affectation n'existe pas ou n'appartient pas à
      l'église/l'événement, supprime, appelle `notifyRemoval`, renvoie `{ success: true }`
      *(fichier : `src/app/api/events/[eventId]/opening-closing/[id]/route.ts`)*

### 4. UI

- [ ] **T9** — Section « Ouverture / Fermeture » sur la fiche événement admin : deux listes
      (créneaux), noms désignés + bouton retirer, sélecteur de membre + bouton ajouter, badge
      « Non pourvu » si vide, toast non bloquant si `absenceWarning`. Actions visibles seulement
      si le serveur les autorise *(fichier : `src/app/(auth)/admin/events/[eventId]/EventDetailClient.tsx`)*
- [ ] **T10** [P] — Ajouter `openingClosingAssignments` à l'`include` Prisma de la route
      star-view et à la réponse mappée *(fichier : `src/app/api/events/[eventId]/star-view/route.ts`)*
- [ ] **T11** — Affichage en lecture seule des désignations d'ouverture/fermeture sur la vue
      consultation d'événement *(fichier : `src/app/(auth)/events/[eventId]/star-view/StarViewClient.tsx`)*
- [ ] **T12** [P] — « Mon planning » : requête `prisma.openingClosingAssignment.findMany({ where: { memberId } })`
      côté serveur, carte supplémentaire par événement côté client
      *(fichiers : `src/app/(auth)/planning/page.tsx`, `src/app/(auth)/planning/MyPlanningView.tsx`)*

### 5. Tests

- [ ] **T13** [P] — Tests de `canManageOpeningClosing` (les 4 branches) et
      `findActiveAbsenceForMember` (absence chevauchante, hors période, aucune)
      *(fichier : `src/modules/planning/services/__tests__/opening-closing.service.test.ts`)*
- [ ] **T14** [P] — Tests de la route `opening-closing` : GET (vide, peuplé), POST (création +
      notification, 403 rôle non habilité, `absenceWarning`, 400 payload invalide, doublon
      `@@unique`), DELETE (retrait + notification, 403, 404)
      *(fichier : `src/app/api/events/__tests__/opening-closing.test.ts`)*
- [ ] **T15** [P] — Étendre le test existant de `star-view` pour vérifier la présence
      d'`openingClosingAssignments` dans la réponse
      *(fichier : `src/app/api/events/__tests__/star-view.test.ts` ou équivalent existant)*

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

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`
