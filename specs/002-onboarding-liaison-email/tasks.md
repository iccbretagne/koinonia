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
- [x] PR ouverte vers `feat/onboarding-liaison-email` (pas vers `main`) — **#400 mergée**

---

## Phase 2 — Réconciliation par email + auto-liaison STAR (proposition à confirmer)

**Objectif** : à l'arrivée dans l'onboarding, proposer à la personne les fiches STAR **non liées**
dont l'email correspond à son **email de compte vérifié** ; sur **confirmation**, établir le lien
directement (rôle STAR), **sans validation admin** — le serveur vérifiant l'égalité des emails.

> **Sécurité** : `assertSelfLinkAllowed` doit être infaillible (email normalisé identique, fiche non
> liée dans l'église visée, cohérence église). Aucune attribution de rôle autre que `STAR`.
> Sous-branche : `feat/onboarding-p2-reconciliation` (depuis `feat/onboarding-liaison-email`).

### Prérequis

- [x] Sous-branche créée : `feat/onboarding-p2-reconciliation`
- [ ] ~~Migration Prisma~~ — **index `Member.email` différé** (simple optimisation ; la réconciliation
      fonctionne sans, à l'échelle d'une personne/église). À ajouter dans une petite migration
      dédiée quand une base de dev est disponible. **P2 reste sans migration ni changement de
      `schema.prisma`.**

### Tâches

#### 1. Logique métier (helper `src/lib/onboarding.ts`)

- [x] **T2** — `findUnlinkedMembersByEmail(email): Promise<CandidateMember[]>` — fiches dont l'email
      normalisé correspond, **et qui n'ont pas de `MemberUserLink`** (non liées), avec leur église
      (via département principal) et leur département principal. Toutes églises confondues.
- [x] **T3** — `assertSelfLinkAllowed(sessionEmail, member, churchId)` — lève `ApiError(403)` si :
      email de session normalisé ≠ email fiche normalisé, OU fiche déjà liée dans cette église, OU
      la fiche n'appartient pas à `churchId`. Sinon retourne OK.

#### 3. API

- [x] **T4** — `GET /api/onboarding/candidates` (nouveau) : `requireAuth` ; retourne
      `findUnlinkedMembersByEmail(session.user.email)`. Ne fuite rien d'autre que les fiches
      correspondant à l'email du demandeur.
- [x] **T5** — `POST /api/member-user-links/self` (nouveau) : `requireAuth` ; body Zod
      `{ memberId, churchId }` ; charge la fiche ; `assertSelfLinkAllowed(session.user.email, member,
      churchId)` ; transaction : crée le `MemberUserLink` (validé) + `UserChurchRole` STAR si absent ;
      `logAudit`. **Aucune** validation admin, **aucun** rôle autre que STAR.

#### 4. UI (`src/app/no-access/NoAccessClient.tsx`)

- [x] **T6** — Nouvelle **première étape « réconciliation email »** : à l'entrée, appeler
      `GET /api/onboarding/candidates`. Si résultat(s) : afficher « Cette fiche vous correspond-elle ? »
      (nom, église, département) avec **Confirmer** → `POST /api/member-user-links/self` puis
      rafraîchir la session / rediriger vers `/dashboard`. Bouton « Aucune de ces fiches » → bascule
      vers le parcours par nom existant. Si aucun candidat : parcours par nom inchangé.

#### 5. Tests

- [x] **T7** — Unitaires (`src/lib/__tests__/onboarding.test.ts`) : `findUnlinkedMembersByEmail`
      (match email, exclusion des fiches déjà liées, multi-église) ; `assertSelfLinkAllowed` (succès +
      chaque refus : email différent, fiche déjà liée, mauvaise église).
- [x] **T8** — Routes : `POST /api/member-user-links/self` (succès crée lien + rôle STAR ; refus 403
      sur email différent / fiche liée / mauvaise église) ; `GET /api/onboarding/candidates` (renvoie
      les fiches de l'email de session, rien d'autre).

### Couverture des critères d'acceptation (P2)

| Critère (spec) | Tâche(s) |
|---|---|
| Rapprochement d'abord par l'email vérifié, toutes églises | T2, T4, T6 |
| Fiche proposée → confirmation → lien établi directement (sans validation admin) | T5, T6 |
| Multi-tenant : rattachements par église sur un même compte | T2, T3, T5 |
| Journalisation des rattachements établis | T5 |

*(Index `Member.email` — optimisation différée, hors P2.)*

### Vérification finale (P2)

- [x] `npm run typecheck` · `npm run lint` · `npm run lint:boundaries` · `npm run test`
- [ ] Test manuel (recette) : fiche avec email == compte → proposée → confirmée → accès STAR ;
      email différent → refus ; fiche déjà liée → non proposée
- [x] PR ouverte vers `feat/onboarding-liaison-email` (pas vers `main`) — **#401 mergée**

---

## Phase 3 — Parcours self-service refondu

- **Statut** : **Couverte par P1 + P2 + le flux existant — aucun développement structurel requis.**

Après revue de `src/app/no-access/NoAccessClient.tsx` (post-P2), tous les critères d'acceptation
« P3 » de la spec sont déjà satisfaits :

| Critère (spec) | Couvert par | Preuve |
|---|---|---|
| « Je suis un STAR » recherche-d'abord, jamais de création directe | flux existant | recherche auto dès l'étape identité ; « nouveau STAR » uniquement sous « aucune ne correspond » ou si 0 résultat ; `type:"new"` en fin de parcours |
| Réconciliation email tentée en premier quelle que soit l'intention | **P2** | étape `reconcile` au boot, avant tout |
| Rôle sans STAR toujours validé par un admin | flux existant | `POST /api/member-link-requests` → approbation admin ; `/self` ne crée que STAR |
| Backstop anti-doublon à la création | **P1** | `findDuplicateCandidates` à l'approbation |
| Identité ≠ autorisation | **P2** + flux | réconciliation (identité) vs demande de rôle (autorisation) |

**Conclusion** : pas de tâches P3. La refonte est fonctionnellement complète avec P1 + P2. Reste la
**validation manuelle en recette** puis la **PR finale `feat/onboarding-liaison-email` → `main`**.
