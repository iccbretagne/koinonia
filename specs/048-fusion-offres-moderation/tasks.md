# Tâches — Fusion de la modération des offres dans l'écran « Offres »

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/fusion-offres-moderation`
- [x] Pas de migration Prisma (aucun changement de schéma)

## Tâches

### 1. Données & migration

`[Aucune]` — pas de changement de schéma.

### 2. Logique métier (services)

`[Aucune]` — pas de nouveau service, endpoints `PATCH`/`DELETE` existants réutilisés tels quels
(`/api/jobs/[id]`, `/api/jobs/seekers/[id]`, `/api/jobs/freelance/missions/[id]`,
`/api/jobs/freelance/profiles/[id]`).

### 3. API (route handlers)

`[Aucune]` — aucun endpoint modifié.

### 4. UI

- [x] **T1** — Dans `src/app/(auth)/jobs/page.tsx` : calculer `canManage` (même logique que
      `src/app/(auth)/jobs/[id]/page.tsx` : `session.user.isSuperAdmin || permissions.has("jobs:manage")`) ;
      retirer la clause `where: { status: … }` des 4 `findMany` (jobs, seekers, freelanceMissions,
      freelanceProfiles) quand `canManage` est vrai, pour charger tous les statuts ; passer
      `canManage` en prop à `JobsListClient`, `SeekersListClient` et `FreelanceTabContent`.
      *(fichier : `src/app/(auth)/jobs/page.tsx`)*
- [x] **T2** [P] — Dans `JobsListClient.tsx` : ajouter la prop `canManage`, un champ `status` sur
      le type `Job`, un filtre de statut (« Tout »/« Publiées »/« Retirées », visible seulement si
      `canManage`) à côté du filtre de type existant, et sur chaque carte un bouton
      publier/retirer (repris d'`AdminJobsClient` : `PATCH /api/jobs/[id]` avec le statut inversé,
      état de chargement par carte, `preventDefault`/`stopPropagation` pour ne pas déclencher la
      navigation du `Link` englobant). Par défaut (filtre « Tout » ou premier chargement), les
      offres `ARCHIVED` restent masquées pour respecter le comportement actuel des autres rôles.
      *(fichier : `src/app/(auth)/jobs/JobsListClient.tsx`)*
- [x] **T3** [P] — Même ajout dans `SeekersListClient.tsx` pour le statut
      (`ACTIVE`/`FOUND`/`ARCHIVED`, libellés repris d'`AdminJobsClient` : « En recherche »/« A
      trouvé »/« Archivé »), bouton d'action `PATCH /api/jobs/seekers/[id]` par carte.
      *(fichier : `src/app/(auth)/jobs/SeekersListClient.tsx`)*
- [x] **T4** [P] — Même ajout dans `FreelanceTabContent.tsx` pour les missions
      (`ACTIVE`/`FILLED`/`ARCHIVED`, `PATCH /api/jobs/freelance/missions/[id]`) et les profils
      freelance (`ACTIVE`/`UNAVAILABLE`/`ARCHIVED`, `PATCH /api/jobs/freelance/profiles/[id]`) —
      ajouter le champ `status` aux deux types (`Mission`, `FreelanceProfile`) qui ne l'exposent
      pas aujourd'hui côté client. *(fichier : `src/app/(auth)/jobs/freelance/FreelanceTabContent.tsx`)*
- [x] **T5** — Remplacer le contenu de `src/app/(auth)/admin/jobs/page.tsx` par une redirection
      inconditionnelle et silencieuse vers `/jobs` (`redirect("/jobs")`), sans contrôle de
      permission propre. *(fichier : `src/app/(auth)/admin/jobs/page.tsx`)*
- [x] **T6** — Supprimer `src/app/(auth)/admin/jobs/AdminJobsClient.tsx` (logique reprise en T2–T4).
      *(fichier : `src/app/(auth)/admin/jobs/AdminJobsClient.tsx`)*
- [x] **T7** — Dans `src/components/Sidebar.tsx` : retirer le `NavLink` « Modération offres »
      (bloc `{hasJobsManage && (...)}` autour de la ligne 813) et la prop `hasJobsManage` de
      l'interface et de la signature du composant si elle n'est plus utilisée ailleurs dans le
      fichier. *(fichier : `src/components/Sidebar.tsx`)*
- [x] **T8** [P] — Dans `src/components/MobileNavSheet.tsx` : retirer le même lien « Modération
      offres » (bloc `{hasJobsManage && (...)}` autour de la ligne 667) et la prop `hasJobsManage`
      si elle n'est plus utilisée ailleurs dans le fichier — parité desktop/mobile.
      *(fichier : `src/components/MobileNavSheet.tsx`)*
- [x] **T9** — Retirer la prop `hasJobsManage` devenue inutile de `AuthLayoutShell.tsx` et de son
      calcul/passage dans `src/app/(auth)/layout.tsx` (ligne ~397 et ~471), en vérifiant qu'aucun
      autre usage de `jobs:manage` dans ce fichier n'en dépend. *(fichiers :
      `src/components/AuthLayoutShell.tsx`, `src/app/(auth)/layout.tsx`)*

### 5. Tests

- [x] **T10** — Exécuter la suite existante (`npm run test`) et confirmer que
      `routes-exhaustivite.test.ts` passe toujours sans changement de manifeste (la route
      `/admin/jobs` reste déclarée, la page existe toujours en redirection). Aucun nouveau test
      Vitest requis : ni `AdminJobsClient` ni les composants de liste concernés n'ont de test
      unitaire aujourd'hui, et T1–T4 ne touchent à aucun endpoint API testé.
      *(vérification, pas de fichier de test dédié)*
- [x] **T11** — Vérification manuelle dans le navigateur : avec un compte `jobs:manage` (Admin/
      Secrétaire), confirmer que le filtre de statut apparaît sur les 4 catégories, que les
      éléments retirés sont accessibles via le filtre, et que le bouton publier/retirer fonctionne
      sur une carte sans quitter l'écran. Avec un compte sans ce droit (ex. STAR), confirmer que
      l'écran « Offres » est identique à avant (aucun filtre de statut, aucun bouton, aucun élément
      retiré visible) et qu'un accès direct à `/admin/jobs` redirige vers `/jobs`.
      *(vérification manuelle)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits :
  - [x] Lien « Modération offres » supprimé, un seul lien « Offres » (T7, T8)
  - [x] Actions de modération visibles sur les 4 catégories pour `jobs:manage` (T2–T4)
  - [x] Éléments retirés consultables via le filtre pour `jobs:manage` (T1–T4)
  - [x] Aucun changement visible pour les rôles sans `jobs:manage` (T1–T4, vérifié en T11)
  - [x] Ancien lien `/admin/jobs` redirige sans erreur (T5)
- [ ] PR ouverte vers `main`
