# Tâches — Rôle Reporter géré comme rôle transverse

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé *(a posteriori — code déjà mergé via PR #454)*

## Prérequis

- [x] Branche créée : `fix/reporter-transverse-role`
- [x] Migration Prisma : `[Aucune]`

## Tâches

### 1. UI

- [x] **T1** — Étendre `TransverseRole`, `TRANSVERSE_ROLE_LABELS`,
      `TRANSVERSE_ROLE_COLORS` avec `REPORTER` ; extraire la constante
      `TRANSVERSE_ROLES`. *(fichier : `src/app/(auth)/admin/access/AccessClient.tsx`)*
- [x] **T2** — Remplacer les 3 littéraux de tableau de rôles par
      `TRANSVERSE_ROLES` dans le rendu de l'onglet "Rôles transverses".
      *(fichier : `src/app/(auth)/admin/access/AccessClient.tsx`)*
- [x] **T3** — Supprimer l'onglet `"reporters"` : retrait du type `Tab`, du
      bouton d'onglet, du bloc JSX "Comptes rendus", de l'état
      `reporterLoading`/`reporterSearch`, du dérivé `filteredReporterUsers` et
      de la fonction `toggleReporter`. *(fichier : `src/app/(auth)/admin/access/AccessClient.tsx`)*

### 2. Tests

- [ ] **T4** — *(non fait)* Vérification manuelle en recette : attribution et
      retrait du rôle Reporter depuis l'onglet "Rôles transverses".

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries` *(rattrapage post-merge 2026-08-23 : 519 modules, aucune violation)*
- [x] `npm run test` *(rattrapage post-merge 2026-08-23 : 629/629)*
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (revue de code)
- [x] PR ouverte et mergée vers `main` (#454)
