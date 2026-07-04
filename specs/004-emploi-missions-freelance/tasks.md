# Tâches — Module emploi : missions freelance

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Dépendances : migration → module → API → UI → tests.
> Les tâches `[P]` sont parallélisables.

---

## Prérequis

- [ ] Branche créée : `feat/emploi-missions-freelance`
- [ ] Migration Prisma appliquée après T2

---

## 1. Données & migration

- [ ] **T1** — Ajouter les enums `FreelanceModality`, `FreelanceMissionStatus`, `FreelanceProfileStatus` dans le schéma Prisma
  *(fichier : `prisma/schema.prisma`)*

- [ ] **T2** — Ajouter les modèles `FreelanceMission` et `FreelanceProfile` + relations `User.freelanceMissions` / `User.freelanceProfiles` + champs `wantFreelanceMissions`/`wantFreelanceProfiles` sur `JobNotificationSubscription`
  *(fichier : `prisma/schema.prisma`)*

- [ ] **T3** — Générer et appliquer la migration : `prisma migrate dev --name add_freelance_module`
  (ou création manuelle du fichier SQL si Docker indisponible)
  *(fichier : `prisma/migrations/YYYYMMDDHHMMSS_add_freelance_module/migration.sql`)*

- [ ] **T4** — Ajouter `freelanceMission: createModelMock()` et `freelanceProfile: createModelMock()` au mock Prisma pour que les tests compilent
  *(fichier : `src/__mocks__/prisma.ts`)*

---

## 2. Module `jobs` — permission

- [ ] **T5** — Ajouter la permission `jobs:freelance` (tous rôles) dans le module jobs
  *(fichier : `src/modules/jobs/index.ts`)*

---

## 3. API — missions freelance

- [ ] **T6** [P] — Créer `GET /api/jobs/freelance/missions` (liste ACTIVE, `requireAuth()`) et `POST` (créer mission, `requirePermission("jobs:freelance")`, schema Zod `createMissionSchema`, notification fire-and-forget `notifyFreelanceMissionSubscribers`)
  *(fichier : `src/app/api/jobs/freelance/missions/route.ts`)*

- [ ] **T7** [P] — Créer `GET/PATCH/DELETE /api/jobs/freelance/missions/[id]` : GET visible à tous (FILLED/ARCHIVED réservé auteur+admin), PATCH avec règles auteur/admin (auteur→FILLED, admin→ARCHIVED, tiers→403), DELETE auteur+admin
  *(fichier : `src/app/api/jobs/freelance/missions/[id]/route.ts`)*

---

## 4. API — profils freelance

- [ ] **T8** [P] — Créer `GET /api/jobs/freelance/profiles` (liste ACTIVE, `requireAuth()`) et `POST` (créer profil, `requirePermission("jobs:freelance")`, schema Zod `createProfileSchema`, notification fire-and-forget `notifyFreelanceProfileSubscribers`)
  *(fichier : `src/app/api/jobs/freelance/profiles/route.ts`)*

- [ ] **T9** [P] — Créer `GET/PATCH/DELETE /api/jobs/freelance/profiles/[id]` : même logique que T7, statut auteur→UNAVAILABLE, admin→ARCHIVED
  *(fichier : `src/app/api/jobs/freelance/profiles/[id]/route.ts`)*

---

## 5. API — abonnements notifications

- [ ] **T10** — Ajouter `wantFreelanceMissions: z.boolean().optional()` et `wantFreelanceProfiles: z.boolean().optional()` au `subSchema` de la route abonnement
  *(fichier : `src/app/api/jobs/subscription/route.ts`)*

---

## 6. UI — navigation & onglets

- [ ] **T11** — Ajouter l'onglet "Freelance" dans `JobsTabBar` (3 onglets : Offres / En recherche / Freelance)
  *(fichier : `src/app/(auth)/jobs/JobsTabBar.tsx`)*

- [ ] **T12** — Mettre à jour `/jobs/page.tsx` : accepter `tab=freelance`, charger `FreelanceMission[]` et `FreelanceProfile[]` ACTIVE en parallèle quand `tab=freelance`, passer au composant `FreelanceTabContent`, CTAs doubles "Proposer une mission" + "Proposer mes services"
  *(fichier : `src/app/(auth)/jobs/page.tsx`)*

---

## 7. UI — onglet Freelance (liste)

- [ ] **T13** — Créer `FreelanceTabContent` : filtre client `Tout | Missions | Disponibles`, section "Missions à pourvoir" (cartes `MissionCard`), section "Freelances disponibles" (cartes `FreelanceProfileCard`), états vides avec CTAs
  *(fichier : `src/app/(auth)/jobs/freelance/FreelanceTabContent.tsx`)*

---

## 8. UI — création mission

- [ ] **T14** [P] — Créer la page serveur de création de mission (auth guard, email session pré-chargé)
  *(fichier : `src/app/(auth)/jobs/freelance/missions/new/page.tsx`)*

- [ ] **T15** [P] — Créer `MissionFormClient` : champs titre, domaine, durée, TJM (optionnel), modalité (REMOTE/ONSITE/HYBRID), localisation, description, contactEmail (pré-rempli), contactUrl ; POST puis redirect vers `/jobs/freelance/missions/{id}`
  *(fichier : `src/app/(auth)/jobs/freelance/missions/new/MissionFormClient.tsx`)*

---

## 9. UI — détail & édition mission

- [ ] **T16** [P] — Créer la page serveur détail mission (charge la mission + auteur, auth guard)
  *(fichier : `src/app/(auth)/jobs/freelance/missions/[id]/page.tsx`)*

- [ ] **T17** [P] — Créer `MissionDetailClient` : affichage complet, bannières FILLED/ARCHIVED, actions auteur (Modifier / "Mission pourvue" / Supprimer), actions admin (Archiver / Republier / Supprimer)
  *(fichier : `src/app/(auth)/jobs/freelance/missions/[id]/MissionDetailClient.tsx`)*

- [ ] **T18** [P] — Créer la page serveur d'édition de mission (charge la mission, vérifie que l'utilisateur est auteur)
  *(fichier : `src/app/(auth)/jobs/freelance/missions/[id]/edit/page.tsx`)*

---

## 10. UI — création profil freelance

- [ ] **T19** [P] — Créer la page serveur de création de profil freelance
  *(fichier : `src/app/(auth)/jobs/freelance/profiles/new/page.tsx`)*

- [ ] **T20** [P] — Créer `FreelanceProfileFormClient` : champs titre, domaine, TJM (optionnel), modalité, localisation, disponibilité (date), description, contactEmail (pré-rempli), contactUrl ; POST puis redirect vers `/jobs/freelance/profiles/{id}`
  *(fichier : `src/app/(auth)/jobs/freelance/profiles/new/FreelanceProfileFormClient.tsx`)*

---

## 11. UI — détail & édition profil freelance

- [ ] **T21** [P] — Créer la page serveur détail profil freelance
  *(fichier : `src/app/(auth)/jobs/freelance/profiles/[id]/page.tsx`)*

- [ ] **T22** [P] — Créer `FreelanceProfileDetailClient` : affichage complet, bannières UNAVAILABLE/ARCHIVED, actions auteur (Modifier / "Plus disponible" / Supprimer), actions admin (Archiver / Republier / Supprimer)
  *(fichier : `src/app/(auth)/jobs/freelance/profiles/[id]/FreelanceProfileDetailClient.tsx`)*

- [ ] **T23** [P] — Créer la page serveur d'édition de profil freelance
  *(fichier : `src/app/(auth)/jobs/freelance/profiles/[id]/edit/page.tsx`)*

---

## 12. UI — admin

- [ ] **T24** — Mettre à jour la page admin jobs : charger missions et profils freelance en parallèle avec les offres/seekers existants
  *(fichier : `src/app/(auth)/admin/jobs/page.tsx`)*

- [ ] **T25** — Ajouter l'onglet "Freelance" dans `AdminJobsClient` avec deux sous-listes (Missions / Profils), filtre de statut ACTIVE/FILLED|UNAVAILABLE/ARCHIVED, actions Archiver/Republier/Supprimer
  *(fichier : `src/app/(auth)/admin/jobs/AdminJobsClient.tsx`)*

---

## 13. UI — profil utilisateur (abonnements)

- [ ] **T26** — Ajouter les deux toggles "Missions freelance" et "Profils freelance disponibles" dans le composant d'abonnement emploi
  *(fichier : `src/app/(auth)/profile/JobSubscriptionClient.tsx`)*

---

## 14. Tests

- [ ] **T27** — Écrire les 15 tests Vitest couvrant POST/GET/PATCH/DELETE missions et profils freelance (voir plan.md § Stratégie de tests)
  *(fichier : `src/app/api/jobs/__tests__/freelance.test.ts`)*

---

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Critère 1 — publier une mission (titre + domaine minimum) ✓
- [ ] Critère 2 — publier un profil freelance (titre + domaine minimum) ✓
- [ ] Critère 3 — plusieurs missions/profils actifs simultanément ✓
- [ ] Critère 4 — contenu actif visible par tous les membres connectés ✓
- [ ] Critère 5 — auteur marque mission "Pourvue" → disparaît du sous-flux public ✓
- [ ] Critère 6 — auteur marque profil "Indisponible" → disparaît du sous-flux public ✓
- [ ] Critère 7 — admin/secrétaire peut supprimer n'importe quelle mission ou profil ✓
- [ ] Critère 8 — notification in-app aux abonnés "missions freelance" ✓
- [ ] Critère 9 — notification in-app aux abonnés "profils freelance" ✓
- [ ] Critère 10 — trois onglets sur `/jobs` sans régression Offres/En recherche ✓
- [ ] Critère 11 — TJM optionnel, jamais affiché si absent ✓
- [ ] PR ouverte vers `main`
