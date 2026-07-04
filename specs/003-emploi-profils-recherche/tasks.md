# Tâches — Profils de recherche d'emploi

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → module → API → UI → tests. Les tâches `[P]` sont parallélisables.

---

## Prérequis

- [ ] Branche créée : `feat/emploi-profils-recherche`

---

## Tâches

### 1. Données & migration

- [ ] **T1** — Ajouter l'enum `JobSeekerStatus` (`ACTIVE`, `FOUND`, `ARCHIVED`) et le modèle `JobSeeker` au schéma Prisma ; ajouter la relation `jobSeekers JobSeeker[]` sur `User` ; ajouter `wantSeekers Boolean @default(false)` sur `JobNotificationSubscription` ; ajouter `JOB_SEEKER` à l'enum `NotificationType`.
  *(fichier : `prisma/schema.prisma`)*

- [ ] **T2** — Générer la migration Prisma : `npm run db:migrate -- --name add_job_seeker_profiles` puis vérifier le fichier SQL généré.
  *(fichier : `prisma/migrations/…/migration.sql`)*

- [ ] **T3** — Régénérer le client Prisma : `npx prisma generate` et vérifier que `JobSeeker`, `JobSeekerStatus` sont bien exportés depuis `@/generated/prisma/client`.
  *(fichier : `src/generated/prisma/`)*

### 2. Module

- [ ] **T4** — Ajouter la permission `jobs:seek` dans le module emploi, avec les mêmes rôles que `jobs:post`.
  *(fichier : `src/modules/jobs/index.ts`)*

### 3. API

- [ ] **T5** — Créer `GET /api/jobs/seekers` (liste les profils `ACTIVE`, filtre optionnel `?type=EMPLOI|STAGE|ALTERNANCE` via OR sur les booleans, tri `createdAt desc`) et `POST /api/jobs/seekers` (requirePermission `jobs:seek`, validation `createSeekerSchema` Zod avec refine au moins un type de contrat, création + fire-and-forget `notifySeekerSubscribers`).
  *(fichier : `src/app/api/jobs/seekers/route.ts`)*

- [ ] **T6** — Créer `GET /api/jobs/seekers/[id]` (requireAuth, profil FOUND/ARCHIVED visible uniquement par auteur ou jobs:manage), `PATCH /api/jobs/seekers/[id]` (patchSeekerSchema, règles auteur vs admin décrites dans le plan), `DELETE /api/jobs/seekers/[id]` (auteur ou jobs:manage).
  *(fichier : `src/app/api/jobs/seekers/[id]/route.ts`)*

- [ ] **T7** — Modifier `PUT /api/jobs/subscription` : ajouter `wantSeekers: z.boolean().optional()` au `subSchema` Zod existant.
  *(fichier : `src/app/api/jobs/subscription/route.ts`)*

### 4. UI — pages et composants

> Les tâches T8 à T13 sont parallélisables entre elles une fois T5–T7 terminées.

- [ ] **T8** [P] — Créer `SeekersListClient.tsx` : liste des profils ACTIVE avec filtre multi-type (toggles boutons, OR combiné), tri chronologique, carte profil (auteur, titre, badges types, localisation, télétravail, dispo, extrait description, badge "Mon profil"), état vide avec CTA "Publier mon profil".
  *(fichier : `src/app/(auth)/jobs/SeekersListClient.tsx`)*

- [ ] **T9** [P] — Créer `SeekerFormClient.tsx` : formulaire création/édition (titre obligatoire, checkboxes types de contrat — au moins un requis côté client, secteur, localisation, toggle télétravail, date de dispo, description obligatoire, email pré-rempli via props, lien externe), submit POST ou PATCH selon mode, redirect vers `/jobs/seekers/{id}`.
  *(fichier : `src/app/(auth)/jobs/seekers/new/SeekerFormClient.tsx`)*

- [ ] **T10** [P] — Créer `SeekerDetailClient.tsx` : vue détail complète, actions auteur (Modifier, J'ai trouvé, Supprimer), actions admin/secrétaire (Archiver, Supprimer), bannières statut FOUND/ARCHIVED.
  *(fichier : `src/app/(auth)/jobs/seekers/[id]/SeekerDetailClient.tsx`)*

- [ ] **T11** [P] — Créer les pages serveur pour les profils de recherche :
  - `/jobs/seekers/new/page.tsx` : auth guard, précharge l'email session en props pour `SeekerFormClient`
  - `/jobs/seekers/[id]/page.tsx` : auth guard, charge le profil, passe `canManage` et `isAuthor`
  - `/jobs/seekers/[id]/edit/page.tsx` : auth guard, vérifie que l'utilisateur est auteur, précharge le profil pour `SeekerFormClient`
  *(fichiers : `src/app/(auth)/jobs/seekers/*/page.tsx`)*

- [ ] **T12** [P] — Refondre `src/app/(auth)/jobs/page.tsx` : lire `searchParams.tab` (`"offers"` par défaut | `"seekers"`), charger les données du tab actif côté serveur, rendre un composant client léger `JobsTabBar` pour la navigation entre onglets, adapter le CTA principal selon le tab.
  *(fichiers : `src/app/(auth)/jobs/page.tsx`, `src/app/(auth)/jobs/JobsTabBar.tsx`)*

- [ ] **T13** [P] — Étendre la page d'administration des offres : ajouter un onglet "Profils de recherche" dans `AdminJobsClient.tsx` listant tous les profils (ACTIVE + FOUND + ARCHIVED) avec actions Archiver/Republier/Supprimer ; mettre à jour `admin/jobs/page.tsx` pour charger les seekers.
  *(fichiers : `src/app/(auth)/admin/jobs/page.tsx`, `src/app/(auth)/admin/jobs/AdminJobsClient.tsx`)*

- [ ] **T14** — Ajouter le toggle `wantSeekers` dans l'interface de gestion des abonnements aux notifications emploi (là où `wantEmploi/wantStage/wantAlternance` sont déjà exposés).
  *(fichier : à localiser via grep sur `wantEmploi` dans les composants UI)*

### 5. Tests

- [ ] **T15** — Créer `seekers.test.ts` couvrant : POST sans auth → 401 ; POST body invalide (aucun type de contrat) → 400 ; POST succès → 201 ; GET filtre par type → profils ACTIVE matching ; PATCH auteur → FOUND 200 ; PATCH auteur tente ARCHIVED → 403 ; PATCH tiers → 403 ; DELETE auteur → 200 ; DELETE tiers → 403.
  *(fichier : `src/app/api/jobs/__tests__/seekers.test.ts`)*

---

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] **CA1** — Un utilisateur connecté peut créer un profil avec au minimum titre + 1 type de contrat *(T5, T9)*
- [ ] **CA2** — Un utilisateur peut avoir plusieurs profils actifs simultanément *(T5, T8)*
- [ ] **CA3** — Les profils actifs sont visibles par tous les membres connectés *(T5, T8, T12)*
- [ ] **CA4** — L'auteur peut modifier son profil tant qu'il est actif *(T6, T10, T11)*
- [ ] **CA5** — L'auteur peut clôturer son profil ("J'ai trouvé") ; il disparaît de la liste publique *(T6, T10)*
- [ ] **CA6** — Un admin/secrétaire peut supprimer n'importe quel profil *(T6, T10, T13)*
- [ ] **CA7** — La liste peut être filtrée par type de contrat *(T5, T8)*
- [ ] **CA8** — Les abonnés avec `wantSeekers` reçoivent une notification in-app à chaque nouveau profil *(T5, T7)*
- [ ] **CA9** — La page `/jobs` présente deux onglets sans régression sur "Offres" *(T12)*
- [ ] **CA10** — Un utilisateur non connecté ne peut pas accéder aux profils *(T5, T6)*
- [ ] PR ouverte vers `main`
