# Tâches — Refonte de l'écran Offres

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : services → API → UI → tests. Aucune migration n'est prévue. Les tâches `[P]` sont
> parallélisables.

## Prérequis

- [x] Branche créée : `feat/offres`, depuis `main` à jour.
- [x] Aucune migration Prisma (plan : aucun changement de schéma).

## Tâches

### 1. Logique métier

- [x] **T1** [P] — Extraire `dayKey` et `daysUntil` vers `src/lib/paris-days.ts`, et les
  réexporter depuis `src/lib/request-queue.ts` sans changer ses appelants. *(fichiers :
  `src/lib/paris-days.ts`, `src/lib/request-queue.ts`)*
- [x] **T2** — Service de chargement de l'espace :
  - types `Publication`, `PublicationKind` (`OFFER`, `MISSION`, `SEEKER`, `FREELANCE`) et
    `PublicationState` (`active`, `retired`, `expired`, `filled`, `found`, `unavailable`) ;
  - `toPublication(kind, row, ctx)`, pure : dates sérialisées, `state` selon le tableau du plan,
    `isOwn`, `isNew` (opportunité d'autrui créée après `lastSeenAt`), `href` par type ;
  - `loadJobsBoard(session, { now })` : quatre `findMany` en parallèle ; un modérateur
    (`canManageJobs`) voit tout, les autres voient l'actif et leurs propres publications ; lit
    `JobLastSeen.seenAt` (à défaut, 30 jours) ; tri par `createdAt` décroissant ;
  - `loadPublication(session, kind, id, { now })` : `null` si la publication est introuvable ou
    non visible par l'appelant.

  *(fichier : `src/modules/jobs/services/board.ts`)*
- [x] **T3** — Exporter `loadJobsBoard`, `loadPublication` et les types depuis l'index du module.
  *(fichier : `src/modules/jobs/index.ts`)*
- [x] **T4** [P] — Helpers purs côté client :
  - `resolveInitialView`, y compris les anciennes valeurs `seekers` et `freelance` ;
  - les pastilles de chaque onglet ;
  - `matchesTypes`, `matchesQuery`, `matchesState` ;
  - `STATE_LABEL`, `STATE_TONE`, `expiryLabel` (avec le seuil `soon` de 7 jours) et `rateLabel`.

  Le fichier ne contient aucun import serveur. *(fichier : `src/app/(auth)/jobs/board.ts`)*
- [x] **T5** [P] — Message WhatsApp :
  - `type: "MISSION"` : méta « Mission · domaine · lieu », lien vers la mission, sans date
    limite ;
  - l'en-tête suit les pastilles actives : une seule pastille donne son libellé, sinon
    « Opportunités » ;
  - toujours aucune coordonnée de l'auteur.

  *(fichier : `src/app/(auth)/jobs/whatsapp-recap.ts`)*

### 2. API (route handlers existants)

- [x] **T6** [P] — `GET /api/jobs/unseen-count` additionne aux offres les missions `ACTIVE`
  d'autrui créées depuis `seenAt`. *(fichier : `src/app/api/jobs/unseen-count/route.ts`)*
- [x] **T7** [P] — Garde `PATCH` : un auteur qui n'est pas modérateur ne peut pas faire sortir de
  `ARCHIVED` un profil en recherche, une mission ou un profil freelance (`403`). Vérifier d'abord
  par `grep` qu'aucun écran ne remet en ligne un profil archivé par son auteur. *(fichiers :
  `src/app/api/jobs/seekers/[id]/route.ts`, `src/app/api/jobs/freelance/missions/[id]/route.ts`,
  `src/app/api/jobs/freelance/profiles/[id]/route.ts`)*

### 3. UI

- [x] **T8** [P] — `FilterChip` : bouton bascule `aria-pressed`, de 44 px, sur les tokens du
  design system. L'exporter depuis `index.ts`, l'utiliser dans `RequestQueue` et le documenter
  dans `docs/design-system/`. *(fichiers : `src/components/ui/FilterChip.tsx`,
  `src/components/ui/index.ts`, `src/components/requests/RequestQueue.tsx`,
  `docs/design-system/`)*
- [x] **T9** — `ListDetailLayout` : sur desktop, liste et colonne de détail collante de 420 px ;
  ailleurs, `BottomSheet`, choisi par `useViewport()`. Réécrire `RequestQueue` dessus, sans
  changer son comportement. *(fichiers : `src/components/ListDetailLayout.tsx`,
  `src/components/requests/RequestQueue.tsx`)*
- [x] **T10** — `PublicationDetail` :
  - contenu selon le type : en-tête, `Alert` d'état, bandeau « Toujours d'actualité » pour une
    offre, métadonnées, description, contact limité à `mailto:` et aux liens `http(s)` ;
  - actions de l'auteur et du modérateur selon le tableau du plan, y compris les remises en
    ligne par l'auteur (pourvue, a trouvé, indisponible → active) ;
  - `ConfirmModal` pour retirer et supprimer, `useToast` pour les retours, aucun
    `alert`/`confirm` ;
  - fonctions de rappel `onChanged` et `onDeleted`.

  *(fichier : `src/app/(auth)/jobs/PublicationDetail.tsx`)*
- [x] **T11** [P] — `PublishChooser` : le bouton « Publier » ouvre un choix entre les quatre
  types, en `BottomSheet` sur mobile et en `Modal` ailleurs. Chaque option est un lien vers le
  formulaire existant ; une prop `only` restreint le choix aux types d'un onglet. *(fichier :
  `src/app/(auth)/jobs/PublishChooser.tsx`)*
- [x] **T12** — `JobsBoard` :
  - `Tabs` pilotés par l'URL, avec le compteur des publications actives ;
  - barre d'outils : recherche, pastilles de type, « Mes publications », filtre d'état pour le
    modérateur, « Copier pour WhatsApp » sur « Opportunités » (toast, repli `Modal`) ;
  - cartes faites d'un seul bouton, avec le point « Nouveau » (calculé sur un `lastSeenAt` figé)
    et l'échéance ;
  - les deux états vides ;
  - le panneau `PublicationDetail` dans `ListDetailLayout`, qui se ferme si la publication
    disparaît.

  *(fichier : `src/app/(auth)/jobs/JobsBoard.tsx`)*
- [x] **T13** — Page `/jobs` : `loadJobsBoard`, `PageHeader` « Offres » avec `PublishChooser`, et
  la vue initiale passée à `JobsBoard`. *(fichier : `src/app/(auth)/jobs/page.tsx`)*
- [x] **T14** — Les quatre pages de détail passent par `loadPublication` puis
  `PublicationDetail`, avec un lien de retour vers « Offres ». Si la publication manque, un
  `EmptyState` « Cette publication n'est plus disponible » remplace le 404. *(fichiers :
  `src/app/(auth)/jobs/[id]/page.tsx`, `seekers/[id]/page.tsx`,
  `freelance/missions/[id]/page.tsx`, `freelance/profiles/[id]/page.tsx`)*
- [x] **T15** [P] — Dans les formulaires, faire pointer les liens de retour vers
  `?tab=opportunites` ou `?tab=profils`. *(fichiers : `src/app/(auth)/jobs/**/new/*`,
  `**/edit/*`)*
- [x] **T16** — Supprimer `JobsTabBar.tsx`, `JobsListClient.tsx`, `SeekersListClient.tsx`,
  `freelance/FreelanceTabContent.tsx`, les quatre `*DetailClient.tsx` et `job-status.ts` avec son
  test, après vérification par `grep` qu'ils ne servent plus. *(dossier : `src/app/(auth)/jobs/`)*

### 4. Tests

- [x] **T17** — Tests du service, avec `prismaMock` :
  - `where` du modérateur et du non-modérateur, offres actives bornées par la date limite ;
  - état dérivé, `isNew` et `href` ;
  - `loadPublication` : `null` pour la publication non active d'un tiers, une publication pour
    son auteur et pour un modérateur.

  *(fichier : `src/modules/jobs/__tests__/board.test.ts`)*
- [x] **T18** [P] — Tests des helpers purs : anciens onglets, profil qui vise plusieurs contrats,
  accents dans la recherche, filtres d'état, échéance et seuil de 7 jours, tarif. *(fichier :
  `src/app/(auth)/jobs/__tests__/board.test.ts`)*
- [x] **T19** [P] — Test du message WhatsApp : missions et en-tête selon les pastilles. *(fichier :
  `src/app/(auth)/jobs/whatsapp-recap.test.ts`)*
- [x] **T20** [P] — Test du compteur de non vus : il additionne offres et missions avec les mêmes
  bornes. *(fichier : `src/app/api/jobs/__tests__/unseen-count.test.ts`)*
- [x] **T21** [P] — Tests des trois `PATCH` :
  - un auteur qui sort une publication de `ARCHIVED` reçoit un `403` ;
  - un modérateur le peut ;
  - l'auteur peut toujours remettre en ligne une publication pourvue, a trouvé ou indisponible.

  *(fichiers : `src/app/api/jobs/**/__tests__/`)*

### 5. Documentation

- [x] **T22** [P] — Guide (section Offres) et fiche processus. *(fichiers :
  `src/components/GuideContent.tsx`, `docs/processus/offres-et-missions.md`)*
- [x] **T23** [P] — API : compteur de non vus étendu aux missions, garde d'archivage. *(fichier :
  `docs/api.md`)*
- [x] **T24** — CHANGELOG « Non publié » (mentionner que la pastille du menu compte désormais les
  missions). Passer la spec à « Implémentée », le plan à « Implémenté » et ces tâches à
  « Terminé ». *(fichiers : `CHANGELOG.md`, `specs/064-refonte-offres/*`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint` (aucune couleur en dur, aucun SVG en ligne ni emoji d'interface)
- [x] `npm run lint:boundaries`
- [x] `npm run lint:prisma-boundary` (seuil inchangé à 143)
- [x] `npm run test`, y compris `route-exhaustiveness.test.ts`
- [x] `npm run build` (frontière client/serveur)
- [x] Contrôle à l'écran, à 360 px et en desktop, de « Offres » et de « Traitement des demandes »
      (après le refactor) : pas de défilement horizontal, cibles de 44 px, aucun bouton qui
      déborde.
- [x] Tous les critères d'acceptation de `spec.md` sont satisfaits.
- [x] PR ouverte vers `main` (ferme #678).
