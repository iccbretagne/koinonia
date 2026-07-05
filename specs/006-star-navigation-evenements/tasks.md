# Tâches — Recentrage de l'espace STAR & agenda hebdomadaire

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Fait

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/star-navigation-evenements`
- [x] Aucune migration Prisma (pas de changement de schéma)

## Tâches

### 1. Helpers (lib)

- [x] **T1** [P] — Créer les helpers de dates purs : `weekBounds(ref: Date): { start: Date; end: Date }` (lundi 00:00:00 → dimanche 23:59:59) et `shiftWeek(mondayISO: string, delta: -1 | 1): string`. *(fichier : `src/lib/week.ts`)*

### 2. API & gardes — réserver « Mes demandes » aux profils de gestion (`planning:view` → `members:view`)

> Auditer **tous** les points `planning:view` du périmètre requests/annonces côté demandeur ; ne laisser aucune porte ouverte. Laisser inchangés les points de traitement (`planning:edit`, `events:manage`).

- [x] **T2** [P] — Re-gater l'API requests : `GET`/`POST` `/api/requests` et `GET`/`PATCH` côté demandeur de `/api/requests/[id]` (`planning:view` → `members:view`). Conserver `planning:edit` (traitement) et `events:manage`. *(fichiers : `src/app/api/requests/route.ts`, `src/app/api/requests/[id]/route.ts`)*
- [x] **T3** [P] — Re-gater l'API annonces : `GET`/`POST` `/api/announcements` et les points demandeur de `/api/announcements/[id]` (`planning:view` → `members:view`). *(fichiers : `src/app/api/announcements/route.ts`, `src/app/api/announcements/[id]/route.ts`)*
- [x] **T4** [P] — Re-gater les pages du périmètre : `/requests`, `/requests/new`, `/requests/[id]/edit` (`planning:view` → `members:view`). *(fichiers : `src/app/(auth)/requests/page.tsx`, `src/app/(auth)/requests/new/page.tsx`, `src/app/(auth)/requests/[id]/edit/page.tsx`)*

### 3. UI — nouvelle vue hebdomadaire des événements (STAR)

- [x] **T5** — Créer la page Server Component `/planning/events` : garde `requireChurchPermission("planning:view", churchId)` (`churchId` via `getCurrentChurchId`), lecture de `const { week } = await searchParams`, calcul de plage via `weekBounds`/`shiftWeek` (T1), requête `prisma.event.findMany({ where: { churchId, date: { gte, lte } }, orderBy: { date: "asc" }, select: { id, title, type, date } })`. Rendu : en-tête de semaine, liste de cartes (réemploi du style `MyPlanningView` : intitulé, date, horaire, type), état vide explicite, liens **précédent/suivant** en `<Link href="?week=…">`. Aucune action d'écriture. *(fichier : `src/app/(auth)/planning/events/page.tsx`)*

### 4. UI — navigation

- [x] **T6** — `layout.tsx` : (a) gater « Mes demandes » sur `members:view` au lieu de `planning:view` ; (b) masquer `mrbsUrl` si l'utilisateur est **STAR-only** (rôles de l'église courante ⊆ `{STAR}`, hors super admin/pastoral) ; (c) calculer un flag « entrée Événements STAR » = `planning:view && !events:view` et le passer aux composants de nav. *(fichier : `src/app/(auth)/layout.tsx`)*
- [x] **T7** — `Sidebar.tsx` : afficher la nouvelle entrée « Événements » → `/planning/events` quand le flag STAR est vrai ; ne pas l'afficher pour les détenteurs de `events:view` (qui gardent la section Liste/Calendrier). *(fichier : `src/components/Sidebar.tsx`)*
- [x] **T8** — `BottomNav.tsx` : rendre la destination de « Événements » conditionnelle — `/events` si `events:view`, sinon `/planning/events` — (corrige le lien actuel pointant vers une page interdite pour les STAR). *(fichier : `src/components/BottomNav.tsx`)*

### 5. Tests (Vitest)

- [x] **T9** [P] — Tests unitaires des helpers `weekBounds`/`shiftWeek` : bornes lundi/dimanche, passage de mois et d'année, semaine précédente/suivante. *(fichier : `src/lib/__tests__/week.test.ts`)*
- [x] **T10** [P] — Gardes requests/annonces : un STAR (`planning:view`, sans `members:view`) reçoit **403** sur `GET`/`POST` `/api/requests` et `/api/announcements` ; un profil de gestion (`members:view`) passe. Mettre à jour les tests de sécurité existants utilisant une session STAR + ajouter le cas STAR interdit. *(fichiers : `src/app/api/announcements/__tests__/security.test.ts`, tests requests le cas échéant)*
- [x] **T11** [P] — Vue hebdomadaire : test de la construction du filtre de requête (présence systématique de `churchId` → non-fuite multi-tenant, plage de dates cohérente). Extraire au besoin une petite fonction pure `buildWeekEventsQuery(churchId, ref)`. *(fichier : `src/app/(auth)/planning/events/__tests__/*.test.ts` ou `src/lib/__tests__/week.test.ts`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (voir couverture ci-dessous)
- [x] Mettre le statut de `spec.md` à « Implémentée »
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère (spec) | Tâche(s) |
|---|---|
| STAR ne voit plus « Mes demandes » | T4, T6 |
| STAR ne voit plus « Réservation de salles » | T6 |
| Rôles de gestion gardent « Mes demandes » | T2–T4, T6, T10 |
| « Réservation de salles » conservée pour la gestion | T6 |
| Multi-rôles STAR + gestion garde les deux | T6 (STAR-only), T10 |
| STAR voit une entrée « Événements » | T6, T7, T8 |
| Défaut = semaine en cours | T5 |
| Tous les événements de l'église pour la semaine | T5 |
| Navigation semaine précédente/suivante | T1, T5, T9 |
| Semaine sans événement → état vide | T5 |
| Événement : intitulé, date, horaire, type | T5 |
| STAR ne peut ni créer/modifier/supprimer | T5 (lecture seule, garde `planning:view`) |
| Aucun événement d'une autre église | T5, T11 |
