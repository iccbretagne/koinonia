# Tâches — Refonte onboarding (liaison par email)

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : P1 terminée

> Feature livrée en plusieurs phases (voir `plan.md`). Ce fichier décrit **la Phase 1 uniquement** ;
> les tâches P2 (réconciliation + auto-liaison) et P3 (parcours self-service) seront ajoutées quand
> la P1 sera livrée et validée.
>
> **Stratégie multi-PR** : branche de base `feat/onboarding-liaison-email` ; la P1 est développée sur
> une sous-branche `feat/onboarding-p1-email-dedup` qui **merge dans la branche de base** (pas dans
> `main`).

---

## Phase 1 — Email de première classe à la création + garde-fou anti-doublon

**Objectif** : capturer l'email à la création d'une fiche membre et empêcher la création d'un
doublon (même email ou même nom dans l'église) en proposant de rattacher à l'existante.
**Aucune migration Prisma** (le champ `Member.email` existe déjà).

### Prérequis

- [x] Sous-branche créée : `feat/onboarding-p1-email-dedup` (depuis `feat/onboarding-liaison-email`)
- [ ] ~~Migration Prisma~~ — **sans objet** en P1

### Tâches

#### 1. Logique métier (helper)

- [x] **T1** — Créer `src/lib/onboarding.ts` avec :
  - `normalizeName(s: string): string` (minuscules, accents retirés — aligné sur la normalisation de
    `src/app/api/members/search/route.ts`)
  - `normalizeEmail(email: string): string`
  - `findDuplicateCandidates(churchId, { email?, firstName, lastName }): Promise<Member[]>` — fiches
    de l'église (via `departments → department → ministry → churchId`) dont l'**email correspond
    exactement** OU dont le **nom normalisé** correspond. Retourne les candidats (id, nom, email,
    département principal).

#### 2. API — création membre

- [x] **T2** — `src/app/api/members/route.ts` (POST) :
  - Étendre `createSchema` avec `email: z.string().email().optional()` (et `phone` si pertinent).
  - Ajouter un flag `confirmDuplicate: z.boolean().optional()` au body.
  - Avant création : appeler `findDuplicateCandidates`. Si des candidats existent **et** que
    `confirmDuplicate !== true` → renvoyer **409** avec `{ duplicates: [...] }` (ne pas créer).
  - Sinon créer la fiche (email persisté).
- [x] **T3** — `src/app/api/member-link-requests/[id]/route.ts` (PATCH, approbation « nouveau STAR »)
  : avant la création d'une fiche à l'approbation, appliquer le même garde-fou
  `findDuplicateCandidates` → si doublon, signaler à l'admin les candidats (permettre le
  rattachement à l'existante plutôt que la création). Comportement `displayName` **inchangé**.

#### 3. UI

- [x] **T4** — Formulaire de création de membre (`src/app/(auth)/admin/members/…`) : ajouter le champ
  **email** (fortement incité, non bloquant). Gérer la réponse **409** : afficher les fiches
  candidates (« Ces fiches existent déjà — rattacher ou créer quand même ? ») ; bouton « créer quand
  même » renvoie la requête avec `confirmDuplicate: true`.

#### 4. Tests

- [x] **T5** — Unitaire `src/lib/__tests__/onboarding.test.ts` : `normalizeName`/`normalizeEmail` ;
  `findDuplicateCandidates` (match email exact, match nom normalisé accent-insensible, scoping
  église correct, aucun faux positif hors église).
- [x] **T6** — Route `POST /api/members` : création avec email OK ; garde-fou → **409 + duplicates**
  quand doublon et pas de confirmation ; création forcée avec `confirmDuplicate: true`.

### Couverture des critères d'acceptation (P1)

| Critère (spec) | Tâche(s) |
|---|---|
| Création capture l'email (incité, non bloquant) | T2, T4 |
| Blocage/alerte si email ou nom déjà présent dans l'église + proposition de rattachement | T1, T2, T3, T4 |

> Les autres critères de la spec (réconciliation email, parcours « nouveau STAR » recherche-d'abord,
> rôle sans STAR, multi-tenant) relèvent des phases P2/P3.

### Vérification finale (P1)

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [ ] Test manuel : créer une fiche avec un email/nom déjà présent → alerte + candidats ; forcer →
      création ; créer une fiche distincte → OK
- [ ] PR ouverte vers `feat/onboarding-liaison-email` (pas vers `main`)
