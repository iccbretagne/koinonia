# Tâches — Harmonisation et ergonomie du module Absences

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/harmonisation-ergonomie-absences`
- [ ] Migration Prisma : `[Aucune]` — pas de changement de schéma (voir `plan.md`)

## Tâches

### 1. Données & migration

`[Aucun changement]` — aucun champ Prisma ajouté (voir `plan.md`, section « Modèle de données »).

### 2. Logique métier (services)

`[Aucun changement]` — aucune règle métier de `absence.service.ts` n'est modifiée (spec hors
périmètre).

### 3. API (route handlers)

- [x] **T1** — Étendre `findActiveAbsencesByMember` pour sélectionner et renvoyer le champ `id` de
      l'absence, en plus de `startDate`/`endDate`, dans les deux branches (`eventDept` existant et
      cas `!eventDept`) *(fichier : `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`)*

### 4. UI

- [x] **T2** — Calculer `canViewAbsences` (scope église courante, permission `absences:view`) dans
      `DashboardPage`, sur le même modèle que `canEditPlanning`/`isAdmin`, et le passer en prop à
      `PlanningGrid` *(fichier : `src/app/(auth)/dashboard/page.tsx`)*
- [x] **T3** — Ajouter la prop `canViewAbsences` et le champ `id` sur `activeAbsence` dans
      `PlanningGridProps`/`MemberPlanning` ; transformer `AbsenceBadge` en lien (`next/link`) vers
      `/absences?highlightId=<id>` quand `canViewAbsences` est vrai, en conservant le style visuel
      actuel à l'identique (span passif sinon, comportement inchangé) *(fichier :
      `src/components/PlanningGrid.tsx`)*
- [x] **T4** [P] — Unifier le rendu du badge de conflit (« ⚠ Conflit planning » en texte complet)
      entre la table « Mes absences » et la table « Vue d'ensemble » *(fichier :
      `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [x] **T5** [P] — Ajouter la recherche par nom de membre (`Input`) et le filtre statut (`Select` :
      Actives par défaut / Toutes / Annulées) sur la vue d'ensemble, appliqués côté client via
      `useMemo` sur les données déjà chargées *(fichier :
      `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [x] **T6** [P] — Ajouter le filtre de période (deux `Input type="date"` Du/Au) sur la vue
      d'ensemble, filtrage client par chevauchement avec `[startDate, endDate]` *(fichier :
      `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [x] **T7** [P] — Ajouter le tri (`Select` : Date de début ↓ par défaut / Date de début ↑ / Nom du
      membre) sur la vue d'ensemble, appliqué côté client *(fichier :
      `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [x] **T8** — Réorganiser les contrôles de filtre de la vue d'ensemble en 3 groupes hiérarchisés
      (recherche+statut / période / organisationnel+tri), empilement mobile propre
      (`flex-col sm:flex-row` par groupe), à faire après T5-T7 pour éviter de réorganiser deux fois
      *(fichier : `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [x] **T9** — Lire le paramètre d'URL `highlightId` via `useSearchParams`, mettre en évidence
      visuellement la ligne correspondante dans la vue d'ensemble et l'amener dans le viewport au
      chargement (`scrollIntoView`) *(fichier : `src/app/(auth)/absences/AbsencesClient.tsx`)*
- [x] **T10** — Envelopper le rendu de `AbsencesClient` dans une limite `Suspense` côté page
      serveur pour satisfaire la contrainte Next.js App Router sur `useSearchParams` *(fichier :
      `src/app/(auth)/absences/page.tsx`)*

### 5. Tests

- [x] **T11** — Étendre les tests existants de la route de planning pour vérifier que `id` est bien
      présent dans `activeAbsence` (cas `eventDept` existant et cas `!eventDept`) *(fichier :
      `src/app/api/events/[eventId]/departments/[deptId]/planning/__tests__/route.test.ts`)*

### 6. Vérification manuelle

- [x] **T12** — Vérifier manuellement le rendu mobile (375px) : filtres de la vue d'ensemble des
      absences (groupes empilés, lisibles), badge cliquable dans `PlanningGrid`, mise en évidence
      après clic sur le badge — captures d'écran comme pour la spec 009
- [x] **T13** — Vérifier manuellement que le lien du badge de conflit n'apparaît pas pour un
      utilisateur sans `absences:view` sur l'église courante (ex. un simple STAR consultant le
      planning d'un autre département via une affectation) et que le comportement reste identique
      à l'existant dans ce cas

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Critère spec : recherche par nom de membre sur la vue d'ensemble (T5)
- [x] Critère spec : filtre par statut, actives par défaut, annulées consultables par tout
      visualiseur (T5)
- [x] Critère spec : filtre par période (T6)
- [x] Critère spec : tri sur au moins un critère (T7)
- [x] Critère spec : actions du module avec style/couleur cohérent (audit T4 + vérification, pas de
      remaniement nécessaire au-delà du badge de conflit — voir `plan.md`)
- [x] Critère spec : signal de conflit identique dans toutes les vues (T4)
- [x] Critère spec : contrôles filtre/tri utilisables sur mobile (T8, vérifié en T12)
- [x] Critère spec : clic sur le signal d'absence dans le planning → détail de l'absence (T3, T9)
- [x] Critère spec : « Mes absences » non modifiée fonctionnellement (aucune tâche ne touche à sa
      logique, seulement au rendu partagé du badge de conflit en T4)
- [x] Critère spec : aucune règle métier modifiée (confirmé — sections 1 et 2 vides par design)
- [ ] PR ouverte vers `main`
