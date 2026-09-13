# Plan technique — Fusion de la modération des offres dans l'écran « Offres »

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-13

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import cross-module ; tout reste dans les pages/composants existants du module `jobs`
- [x] **Sécurité** : `canManage` dérivé de `rolePermissions` (`jobs:manage`), calculé côté serveur dans chaque page — inchangé par rapport à l'existant
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune nouvelle permission créée
- [x] **Validation** Zod — aucune nouvelle mutation, les endpoints PATCH existants (`/api/jobs/[id]`, etc.) sont réutilisés tels quels
- [x] **Migration** — `[Aucun changement]`, aucun changement de schéma
- [x] **Enums** — aucun nouvel enum
- [x] **UI** : réutilisation intégrale des composants et de la logique déjà présents dans `src/components/ui/` et dans les pages de détail existantes

## Approche générale

Le constat de l'issue est en partie inexact : `/jobs` et `/admin/jobs` ne listent pas *exactement*
le même contenu. `/jobs` filtre sur les statuts actifs (`PUBLISHED`/`ACTIVE`) alors que
`/admin/jobs` charge tous les statuts. Et l'action de modération (bascule publié/retiré) **existe
déjà**, mais uniquement sur les quatre pages de détail (`/jobs/[id]`, `/jobs/seekers/[id]`,
`/jobs/freelance/missions/[id]`, `/jobs/freelance/profiles/[id]`), déjà conditionnée par le même
`canManage` — c'est `/admin/jobs` qui duplique une liste, pas une action.

La fusion consiste donc à :
1. Faire remonter `canManage` (déjà calculé de façon identique sur les 4 pages de détail) sur la
   page `/jobs`, qui charge déjà les 4 collections en une fois.
2. Quand `canManage` est vrai, charger **tous les statuts** au lieu de seulement les actifs.
3. Ajouter, dans chacun des 3 composants de liste (`JobsListClient`, `SeekersListClient`,
   `FreelanceTabContent`), un filtre de statut visible uniquement pour `canManage` — les éléments
   retirés restent masqués par défaut (comportement identique à aujourd'hui pour tout le monde),
   et n'apparaissent que si la personne habilitée active ce filtre.
4. Supprimer l'écran et le lien de navigation dédiés à la modération ; transformer
   `/admin/jobs` en redirection silencieuse vers `/jobs`.

L'action de modération (publier/retirer) est ajoutée directement sur chaque carte de liste, en
plus de rester disponible sur la page de détail. Décision actée : la carte doit permettre d'agir
sans ouvrir le détail — reprendre le pattern déjà utilisé dans `AdminJobsClient` (bouton
publier/retirer par carte, avec état de chargement) sur les 4 catégories.

## Modèle de données

`[Aucun changement]`

## API

`[Aucun changement]` — les endpoints `PATCH /api/jobs/[id]`, `PATCH /api/jobs/seekers/[id]`,
`PATCH /api/jobs/freelance/missions/[id]`, `PATCH /api/jobs/freelance/profiles/[id]` existent déjà
et gèrent déjà le changement de statut derrière `jobs:manage`/auteur. Aucun nouvel endpoint.

## Services / logique métier

Aucun service de module concerné (le module `jobs` n'a pas de couche services pour ces listes ;
la lecture reste dans les route/page handlers, cohérent avec l'existant — pas de refonte
d'architecture dans cette feature).

## UI / composants

- **`src/app/(auth)/jobs/page.tsx`** : calcule `canManage` (identique aux 4 pages de détail) ;
  retire le filtre de statut des requêtes Prisma quand `canManage` est vrai (les 4 `findMany`
  passent de `where: { status: … }` à un `where` sans condition de statut) ; passe `canManage` aux
  3 composants clients.
- **`JobsListClient.tsx`** : ajoute un filtre « Retirées » (à côté du filtre de type existant),
  visible seulement si `canManage` ; par défaut les offres `ARCHIVED` restent masquées. Chaque
  carte affiche, pour `canManage`, un bouton publier/retirer (repris d'`AdminJobsClient` : bascule
  de statut via `PATCH /api/jobs/[id]`, état de chargement, sans navigation).
- **`SeekersListClient.tsx`** : ajoute un filtre de statut (`ACTIVE`/`FOUND`/`ARCHIVED`), même
  logique, visible seulement si `canManage` ; même bouton d'action par carte.
- **`FreelanceTabContent.tsx`** : même ajout pour les missions (`ACTIVE`/`FILLED`/`ARCHIVED`) et
  les profils freelance (`ACTIVE`/`UNAVAILABLE`/`ARCHIVED`), avec le même bouton d'action par carte
  sur les deux catégories.

Le clic sur le bouton d'action doit stopper la propagation vers le `Link` englobant de la carte
(`e.preventDefault()`/`e.stopPropagation()`), pour ne pas déclencher une navigation vers le détail
en plus du changement de statut.
- **`src/app/(auth)/admin/jobs/page.tsx`** : remplacé par une redirection (`redirect("/jobs")`),
  sans contrôle de permission propre (la page cible gère son propre accès).
- **`src/app/(auth)/admin/jobs/AdminJobsClient.tsx`** : supprimé (568 lignes, logique reprise/déjà
  présente ailleurs).
- **`src/components/Sidebar.tsx`** : retire le `NavLink` « Modération offres » et la prop
  `hasJobsManage` qui ne sert plus qu'à ça.
- **`src/components/MobileNavSheet.tsx`** : même retrait pour la parité mobile (le lien existe
  aussi dans la nav mobile).
- **`src/components/AuthLayoutShell.tsx`** et **`src/app/(auth)/layout.tsx`** : suppression de la
  prop `hasJobsManage` devenue inutile, en remontant jusqu'à son calcul dans `layout.tsx`.

## Décisions & alternatives écartées

- **Choix** : dupliquer le bouton publier/retirer sur chaque carte de liste, en plus de la page de
  détail — *Pourquoi* : décision explicite de l'utilisateur, l'action doit rester accessible sans
  quitter l'écran de liste, cohérent avec le motif déjà utilisé dans `AdminJobsClient` avant sa
  suppression (la logique de bascule n'est donc pas inventée, seulement redéplacée).
- **Choix** : conserver `/admin/jobs/page.tsx` comme redirection plutôt que le supprimer — *Pourquoi* :
  la spec exige qu'un ancien lien ne tombe pas en erreur ; une redirection est plus simple qu'une
  page 410/410-like custom, et cohérente avec le reste de l'app (aucune page « déplacée » n'existe
  encore comme précédent, celle-ci fixe le pattern).
- **Écarté** : fusionner aussi la logique de lecture dans un service de module (`src/modules/jobs/services/`)
  à cette occasion — *Raison* : hors périmètre de la spec (elle ne demande pas de refonte
  architecturale), et le reste des routes `jobs` n'a pas de couche services aujourd'hui ; l'ajouter
  seulement ici serait une incohérence locale, pas un progrès mesuré (cf. chantier 2 de
  `docs/roadmap-modularite.md`, à traiter globalement, pas au fil d'une feature).

## Risques & points d'attention

- Le filtre de statut ajouté par catégorie doit rester cohérent avec les libellés déjà utilisés
  dans `AdminJobsClient` (repris tels quels : « Publiées »/« Retirées », « En recherche »/« A
  trouvé »/« Archivés », etc.) pour ne pas introduire un vocabulaire différent de l'existant.
- Vérifier `routes-exhaustivite.test.ts` après suppression d'`AdminJobsClient.tsx` : la route
  `/admin/jobs` reste déclarée dans le manifeste (`jobsModule`), la page existe toujours (en
  redirection) — aucun changement de manifeste attendu.
- Mobile : la nav mobile (`MobileNavSheet.tsx`) doit perdre le même lien, sous peine
  d'incohérence entre desktop et mobile (cf. retour utilisateur déjà noté sur l'ergonomie mobile).

## Stratégie de tests

- Pas de nouveau test d'API (aucun endpoint modifié).
- Test manuel/visuel (pas de test Vitest existant sur ces composants clients aujourd'hui — cohérent
  avec l'absence de tests existants sur `AdminJobsClient`/`JobsListClient`/etc.) : vérifier au
  moins une fois dans le navigateur, pour un compte `jobs:manage` et un compte sans ce droit, que
  le filtre apparaît/disparaît et que les éléments retirés sont bien accessibles/masqués en
  conséquence.
- `routes-exhaustivite.test.ts` (existant) doit continuer de passer sans changement de manifeste.
