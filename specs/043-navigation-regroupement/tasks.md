# Tâches — Regroupement et ergonomie de la navigation

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles. Les tâches `[P]` sont parallélisables entre elles (fichiers indépendants).
> Un commit par volet (1 à 4), une seule PR — voir `plan.md`.

## Prérequis

- [ ] Branche créée : `feat/navigation-regroupement`
- [ ] Aucune migration Prisma (pas de changement de schéma)

## Tâches

### Volet 1 — « Trame des annonces » + menu Événements du STAR

- [x] **T1** [P] — Renommer « Feuilles d'annonces » → « Trame des annonces » dans `Sidebar.tsx`
      (les deux occurrences : lien STAR autonome et sous-entrée de l'accordéon Événements)
      *(fichier : `src/components/Sidebar.tsx`)*
- [x] **T2** [P] — Même renommage dans `MobileNavSheet.tsx` (2 occurrences)
      *(fichier : `src/components/MobileNavSheet.tsx`)*
- [x] **T3** [P] — Renommer le titre `<h1>` de la page de liste
      *(fichier : `src/app/(auth)/events/announcement-sheets/page.tsx`)*
- [x] **T4** [P] — Renommer le titre et les confirmations dans le composant de dépôt/consultation
      *(fichier : `src/app/(auth)/events/[eventId]/star-view/AnnouncementSheetManager.tsx`)*
- [x] **T5** [P] — Renommer les titres/corps des notifications
      *(fichier : `src/modules/planning/services/announcement-sheet.service.ts`)*
- [x] **T6** [P] — Renommer les messages `ApiError`
      *(fichiers : `src/app/api/events/[eventId]/announcement-sheet/route.ts`,
      `src/app/api/events/[eventId]/announcement-sheet/sign/route.ts`)*
- [x] **T7** — Fusionner les deux liens autonomes STAR (Événements + Trame des annonces) en un
      `AccordionSection` « Événements » à deux sous-entrées (« Mes événements »,
      « Trame des annonces ») ; étendre `isEvenementsActive`/`activeSection()` pour que
      l'accordéon s'ouvre sur `/planning/events` et `/events/announcement-sheets`
      *(fichier : `src/components/Sidebar.tsx`)*
- [x] **T8** — Même fusion en `RootRow`/`SubRow` côté tiroir mobile
      *(fichier : `src/components/MobileNavSheet.tsx`)*
- [x] **T9** [P] — Mettre à jour les tests existants qui référencent l'ancien libellé ou les
      anciens messages d'erreur — aucun test n'assertait ces chaînes, rien à changer
      *(fichiers : `src/app/api/events/__tests__/announcement-sheet.test.ts`,
      `src/app/api/events/__tests__/announcement-sheets-list.test.ts`)*
- [x] **T10** — Non applicable en Vitest : `showStarEvents` (le seul flag calculé par
      `layout.tsx`) ne change pas de valeur, seule la présentation dans `Sidebar.tsx`/
      `MobileNavSheet.tsx` change — le projet ne teste pas le rendu des composants (cf. `plan.md`).
      Reportée sur la vérification manuelle **T42**.

### Volet 2 — Bandeau de préparation (page événement)

- [x] **T11** — Ajouter une prop `embedded` à `OpeningClosingManager` qui retire sa carte propre
      (`bg-white shadow mb-6`) quand `true`
      *(fichier : `src/app/(auth)/events/[eventId]/star-view/OpeningClosingManager.tsx`)*
- [x] **T12** — Même prop `embedded` sur `AnnouncementSheetManager`
      *(fichier : `src/app/(auth)/events/[eventId]/star-view/AnnouncementSheetManager.tsx`)*
- [x] **T13** — Créer `PreparationBanner.tsx` : `<details>` replié par défaut, `print:hidden`,
      `<summary>` avec l'état de la trame (pastille de statut), contient `OpeningClosingManager`
      (si `canManage`) puis `AnnouncementSheetManager` (si `canDeposit || canRead`) en `embedded`,
      séparés par `divide-y` ; ne rend rien si aucune des deux parties ne concerne l'utilisateur
      *(fichier : `src/app/(auth)/events/[eventId]/star-view/PreparationBanner.tsx`, nouveau)*
- [x] **T14** — Intégrer `PreparationBanner` dans `StarViewClient.tsx` après le lien audio et
      avant la zone imprimable (`printRef`) ; retirer les deux gestionnaires de leur ancien
      emplacement en bas de page
      *(fichier : `src/app/(auth)/events/[eventId]/star-view/StarViewClient.tsx`)*

### Volet 3 — Rendez-vous pastoral et demande comptable dans « Mes demandes »

- [x] **T15** — Ajouter une rubrique « Autres demandes » à l'étape 1 du formulaire unifié, avec
      des tuiles qui redirigent (pas de soumission locale) : « Rendez-vous pastoral » vers
      `/agenda/request?from=requests` (si `registry.has("agenda")`), « Demande comptable » vers
      `/accounting/requests/new?from=requests` (si `registry.has("accounting")` et l'utilisateur a
      le droit de soumettre — même règle que la page comptable)
      *(fichiers : `src/app/(auth)/requests/new/RequestForm.tsx`,
      `src/app/(auth)/requests/new/page.tsx`)*
- [x] **T16** — Gérer `from=requests` (liste blanche, seule valeur acceptée) sur la page RDV
      pastoral : lien retour et redirection après soumission vers `/requests`
      *(fichier : `src/app/(auth)/agenda/request/page.tsx` et/ou `RequestForm.tsx` associé)*
- [x] **T17** — Même gestion de `from=requests` sur la page de nouvelle demande comptable
      *(fichier : `src/app/(auth)/accounting/requests/new/page.tsx`,
      `NewRequestForm.tsx`)*
- [x] **T18** — Retirer le lien de menu « Demande RDV pastoral » de `requestLinks` pour les
      utilisateurs qui ont `members:view` (donc « Mes demandes ») ; le garder pour ceux qui ont
      seulement `planning:view` (le STAR)
      *(fichier : `src/app/(auth)/layout.tsx`)*
- [x] **T19** — Ajouter une section « Demandes comptables » à la page « Mes demandes » listant les
      demandes financières de l'utilisateur (église courante) avec libellé/montant/statut et lien
      vers `/accounting/requests/[id]` ; absente si le module est désactivé ou si l'utilisateur
      n'en a aucune
      *(fichier : `src/app/(auth)/requests/page.tsx`)*
- [x] **T20** — Étendre `star-navigation.test.ts` : un utilisateur avec `members:view` n'a plus
      « Demande RDV pastoral » dans `requestLinks` ; un STAR (sans `members:view`, avec
      `planning:view`) le garde
      *(fichier : `src/app/(auth)/__tests__/star-navigation.test.ts`)*

### Volet 4 — Espace « Communication & Production »

- [x] **T21** — Ajouter `requireMediaCollectionAccess(churchId)` dans `auth.ts` : passe si
      `media:manage`, ou membre `PRODUCTION_MEDIA`, ou membre `COMMUNICATION` ; ne pas toucher
      `requireMediaManageAccess` (qui protège aussi projets/événements médias/fichiers/partage)
      *(fichier : `src/lib/auth.ts`)*
- [x] **T22** — Faire passer la page Collections et la route de création sur ce nouveau garde
      *(fichiers : `src/app/(auth)/media/collections/page.tsx`,
      `src/app/api/admin/media/collections/route.ts`)*
- [x] **T23** — Créer `resolveMediaSpaceAccess(session, churchId)` et `buildMediaSpaceTabs(access)`
      (fonction pure) définissant les 5 onglets possibles (Demandes visuels, Demandes réseaux
      sociaux, Projets, Événements médias, Collections) et leurs conditions d'affichage
      *(fichier : `src/lib/media-space.ts`, nouveau)*
- [x] **T24** [P] — Extraire un composant générique `SpaceTabs` à partir d'`AudioTabs` (props
      `tabs`, `ariaLabel`), avec `overflow-x-auto` pour tenir 5 onglets sur mobile
      *(fichier : `src/components/SpaceTabs.tsx`, nouveau ; supprime
      `src/app/(auth)/audio/AudioTabs.tsx`)*
- [x] **T25** [P] — Faire utiliser `SpaceTabs` par l'espace Audio existant (rendu inchangé)
      *(fichier : `src/app/(auth)/audio/layout.tsx`)*
- [x] **T26** — Créer le layout de l'espace Médias : appelle `resolveMediaSpaceAccess` +
      `buildMediaSpaceTabs`, affiche `SpaceTabs` si plus d'un onglet
      *(fichier : `src/app/(auth)/media/layout.tsx`, nouveau)*
- [x] **T27** — Même layout côté Communication (même logique, même accès)
      *(fichier : `src/app/(auth)/communication/layout.tsx`, nouveau)*
- [x] **T28** — Créer `/media` : redirige vers le premier onglet accessible, `notFound()` sinon
      (calqué sur `audio/page.tsx`)
      *(fichier : `src/app/(auth)/media/page.tsx`, nouveau)*
- [x] **T29** — Remplacer les liens Visuels/Communication/Événements/Projets/Collections par une
      entrée unique `{ href: "/media", label: "Communication & Production" }`, présente si
      `buildMediaSpaceTabs(access)` n'est pas vide ; construire `access` à partir des données déjà
      chargées (`serviceDepts`/`isMemberOf`) sans requête supplémentaire
      *(fichier : `src/app/(auth)/layout.tsx`)*
- [x] **T30** — Ajouter un `matchPrefixes` optionnel aux types de liens de `Sidebar.tsx` et
      l'utiliser dans `activeOperationsHref` pour que `/communication/*` allume le lien `/media`
      *(fichier : `src/components/Sidebar.tsx`)*
- [x] **T31** — Même changement côté `MobileNavSheet.tsx`
      *(fichier : `src/components/MobileNavSheet.tsx`)*
- [x] **T32** [P] — Aligner les titres de page sur les libellés d'onglets : « Demandes visuels »,
      « Demandes réseaux sociaux », « Événements médias »
      *(fichiers : `src/app/(auth)/media/requests/page.tsx`,
      `src/app/(auth)/communication/requests/page.tsx`,
      `src/app/(auth)/media/events/page.tsx`)*
- [x] **T33** [P] — Renommer le libellé de navigation du manifeste média
      « Médias » → « Communication & Production »
      *(fichier : `src/modules/media/manifest.ts`)*
- [x] **T34** — Tests `buildMediaSpaceTabs` : Production média seule (4 onglets, sans Réseaux
      sociaux), Communication seule (4 onglets, sans Visuels), les deux (5, sans doublon), Admin
      (5), Secrétaire (sans Collections si hors périmètre), aucun droit (vide), ordre stable
      *(fichier : `src/lib/__tests__/media-space.test.ts`, nouveau)*
- [x] **T35** — Tests `requireMediaCollectionAccess` (accepte `media:manage`, membre Production
      média, membre Communication ; refuse un STAR sans département de service) et non-régression
      de `requireMediaManageAccess` (refuse toujours un membre Communication)
      *(fichier : `src/lib/__tests__/auth-media-collections.test.ts`, nouveau)*
- [x] **T36** — Étendre le test de la route Collections : un membre Communication obtient 201
      *(fichier : `src/app/api/admin/media/collections/__tests__/route.test.ts`)*
- [x] **T37** — Étendre `star-navigation.test.ts` : un membre Production média a une seule entrée
      « Communication & Production » (plus aucun lien Visuels/Projets/Collections séparé) ; un
      utilisateur sans droit média n'a pas l'entrée ; Audio reste présent et distinct
      *(fichier : `src/app/(auth)/__tests__/star-navigation.test.ts`)*

### Documentation utilisateur [P]

- [x] **T38** [P] — Mettre à jour le texte de l'étape guidée du menu (section Opérations)
      *(fichier : `src/lib/tour-steps.ts`)*
- [x] **T39** [P] — Mettre à jour les cartes du guide (Visuels, Communication, RDV pastoral, note
      de bas de page) avec les nouveaux libellés/points d'entrée
      *(fichier : `src/components/GuideContent.tsx`)*
- [x] **T40** [P] — Documenter l'espace « Communication & Production » et le nouveau garde
      Collections dans les spécificités du module média
      *(fichier : `CLAUDE.md`)*

### Vérification manuelle (non automatisable, à consigner en recette)

- [ ] **T41** — Bandeau de préparation : espacement net avec le bloc planning, sur desktop et
      ~400 px (mobile)
- [ ] **T42** — Menu STAR en accordéon : rendu correct desktop + tiroir mobile
- [ ] **T43** — Barre d'onglets `SpaceTabs` à 5 onglets : défilement horizontal propre sur mobile,
      sticky correct sous les en-têtes des pages médias

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`
