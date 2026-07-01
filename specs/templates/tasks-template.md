# Tâches — [NOM DE LA FEATURE]

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire | En cours | Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [ ] Branche créée : `feat/nom-feature`
- [ ] Migration Prisma générée (si schéma modifié)

## Tâches

### 1. Données & migration

- [ ] **T1** — … *(fichier : `prisma/schema.prisma`)*

### 2. Logique métier (services)

- [ ] **T2** — … *(fichier : `src/modules/X/services/…`)*

### 3. API (route handlers)

- [ ] **T3** — … *(fichier : `src/app/api/…/route.ts`)*

### 4. UI

- [ ] **T4** [P] — … *(fichier : `src/app/(auth)/…`)*

### 5. Tests

- [ ] **T5** — … *(fichier : `…test.ts`)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers la branche cible
