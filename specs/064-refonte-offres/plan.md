# Plan technique — Refonte de l'écran Offres

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-10-10

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : la page importe le chargement depuis `@/modules/jobs` (index) ; les
  composants client n'importent que des modules purs (voir « Décisions »)
- [x] **Sécurité** : aucune nouvelle route. Les routes existantes du module emploi restent sous
  `requireAuth()` + `requireJobsAuthorOrModerator` : module **transverse aux églises** (pas de
  `churchId` sur les publications), accès réglé par le helper dédié du module, conformément à
  ADR-0010 — situation existante, inchangée
- [x] **Permissions** : `canManageJobs` / `jobsAccess` (module) pour la modération ; la page cesse
  de recalculer `jobs:manage` à la main à partir de `rolePermissions` et utilise `canManageJobs`,
  qui encode la même règle
- [x] **Validation** Zod : schémas `PATCH` existants inchangés ; une garde métier ajoutée (voir API)
- [x] **Migration** : aucune — pas de changement de schéma
- [x] **Enums** : statuts lus depuis `@/generated/prisma/client` côté service
- [x] **UI** : `PageHeader`, `Tabs`, `Input`, `StatusChip`, `EmptyState`, `BottomSheet`, `Modal`,
  `ConfirmModal`, `Alert`, `useToast`, `IconButton` réutilisés ; deux extractions (chip de filtre,
  disposition liste + détail) depuis l'écran des demandes (spec 063), pas de nouveau composant
  métier dupliqué

## Approche générale

Le fil directeur reprend celui de la spec 063 (Traitement des demandes) : **un chargement unique
côté serveur** qui produit une liste homogène de publications déjà sérialisées et déjà filtrées
par visibilité, puis **un composant client** qui gère onglets, pastilles, recherche, liste compacte
et panneau de détail.

Les quatre modèles (`JobOffer`, `FreelanceMission`, `JobSeeker`, `FreelanceProfile`) sont
normalisés en un type commun `Publication` portant un `kind` (`OFFER`, `MISSION`, `SEEKER`,
`FREELANCE`), un **état d'affichage** dérivé (`active`, `retired`, `expired`, `filled`, `found`,
`unavailable`) et les champs propres au type. Les deux onglets se déduisent du `kind` :
`OFFER`/`MISSION` → « Opportunités », `SEEKER`/`FREELANCE` → « Profils disponibles ».

Les quatre composants de détail actuels (`JobDetailClient`, `MissionDetailClient`,
`SeekerDetailClient`, `FreelanceProfileDetailClient`, ~850 lignes très semblables) sont remplacés
par **un seul** `PublicationDetail`, utilisé à la fois dans le panneau et dans les pages de détail
conservées pour les liens directs (décision Q1). Les mutations passent par les routes `PATCH` /
`DELETE` existantes, par type.

Aucun changement de données, aucune nouvelle route.

## Modèle de données

`[Aucun changement]`. `JobLastSeen.seenAt` sert déjà au compteur de non vus ; il alimente aussi le
repère « Nouveau ».

## API

Aucune nouvelle route. Trois ajustements de routes existantes :

| Endpoint | Méthode | Changement |
|---|---|---|
| `/api/jobs/unseen-count` | GET | Compte aussi les `FreelanceMission` `ACTIVE` d'autrui créées depuis `seenAt` (décision Q4). Réponse inchangée : `{ count }`. |
| `/api/jobs/seekers/[id]`, `/api/jobs/freelance/missions/[id]`, `/api/jobs/freelance/profiles/[id]` | PATCH | **Garde ajoutée** : un auteur qui n'est pas modérateur ne peut plus faire **sortir** une publication de l'état `ARCHIVED` (`403`). |
| idem | GET | Inchangé (masque déjà aux tiers une publication non active). |

**Pourquoi la garde.** Pour ces trois types, seul un modérateur peut archiver (`403` « Seul un
modérateur peut archiver… »), mais rien n'empêche aujourd'hui l'auteur d'envoyer
`status: "ACTIVE"` sur une publication archivée par la modération : il annulerait une décision de
modération. L'écran actuel ne le propose pas, le nouveau non plus. La garde ferme ce contournement
d'API ; elle ne retire aucun geste disponible dans l'interface, conformément à « droits inchangés ».
Pour les **offres d'emploi**, l'auteur peut déjà archiver et republier les siennes : on n'y touche
pas.

## Services / logique métier

### `src/modules/jobs/services/board.ts` (nouveau)

- `loadJobsBoard(session, { now })` → `{ publications: Publication[]; canManage: boolean;
  lastSeenAt: string | null }`.
  - Quatre `findMany` en parallèle (comme la page actuelle), avec `JOBS_AUTHOR_INCLUDE`.
  - **Visibilité** :
    - modérateur (`canManageJobs`) : tout ;
    - autre utilisateur : publications **actives** + **ses propres publications quel que soit
      leur état** (décision Q3). Le `where` devient `{ OR: [<actif>, { authorId: userId }] }`.
      Offres actives : `PUBLISHED` et (`deadline` nulle ou `>= now`).
  - Lit `JobLastSeen.seenAt` de l'appelant **avant** que le client ne le remette à zéro
    (`AuthLayoutShell` le fait après le montage, par `POST /api/jobs/unseen-count`). À défaut de
    ligne, fenêtre de 30 jours, comme le compteur.
  - Tri : `createdAt` décroissant.
- `loadPublication(session, kind, id, { now })` → `Publication | null` pour les pages de détail ;
  `null` si introuvable **ou** non visible pour l'appelant (même règle de visibilité).
- `toPublication(kind, row, ctx)`, fonction pure exportée pour les tests : sérialise les dates,
  calcule `state`, `isOwn`, `isNew` (opportunité, auteur ≠ appelant, `createdAt > lastSeenAt`) et
  `href` du détail (`/jobs/[id]`, `/jobs/freelance/missions/[id]`, `/jobs/seekers/[id]`,
  `/jobs/freelance/profiles/[id]`).
- **État dérivé** :

  | Type | Statut | Condition | État |
  |---|---|---|---|
  | Offre | `PUBLISHED` | `deadline` passée | `expired` |
  | Offre | `PUBLISHED` | sinon | `active` |
  | Tous | `ARCHIVED` | | `retired` |
  | Mission | `FILLED` | | `filled` |
  | Recherche | `FOUND` | | `found` |
  | Freelance | `UNAVAILABLE` | | `unavailable` |
  | Autres | `ACTIVE` | | `active` |

  (La tâche périodique archive déjà les offres échues : `expired` couvre l'intervalle avant son
  passage.)

Exportés par `src/modules/jobs/index.ts` : `loadJobsBoard`, `loadPublication`, types
`Publication`, `PublicationKind`, `PublicationState`.

### `src/app/(auth)/jobs/board.ts` (nouveau, pur, sans import serveur)

Même arbitrage que `whatsapp-recap.ts` : colocalisé et sans dépendance, pour être importable par
les composants client sans embarquer Prisma (l'index du module réexporte des services Prisma).

- `TAB_KINDS`, `tabOf(kind)`, `resolveInitialView(searchParams)` : onglet `opportunites` /
  `profils` ; anciennes valeurs `?tab=seekers` → `profils`, `?tab=freelance` → `opportunites`
  avec la pastille `MISSION` active ; valeur inconnue → `opportunites`.
- Pastilles par onglet : `EMPLOI`, `STAGE`, `ALTERNANCE`, `MISSION` / `EMPLOI`, `STAGE`,
  `ALTERNANCE`, `FREELANCE`. `matchesTypes(pub, active)` : ensemble vide = tout ; un profil en
  recherche correspond si l'un de ses types voulus est actif.
- `matchesQuery(pub, q)` : titre, entreprise ou domaine ou secteur, lieu, description ; sans
  accents ni casse (même normalisation que `src/lib/request-queue.ts`).
- `matchesState(pub, filter, { canManage, mine })` : non-modérateur hors « Mes publications » →
  `active` uniquement ; « Mes publications » → toutes celles de l'auteur ; modérateur → filtre
  `active` / `inactive` / `all`.
- `STATE_LABEL` / `STATE_TONE` (« Retirée », « Expirée », « Pourvue », « A trouvé »,
  « Indisponible ») ; `expiryLabel(deadline, now)` → « Expire aujourd'hui / demain / dans N j »
  et `soon` (moins de 7 jours) ; `rateLabel(daily, hourly)`.

Les calculs de jour calendaire à Paris (`dayKey`, `daysUntil`) sont **extraits** de
`src/lib/request-queue.ts` vers `src/lib/paris-days.ts`, réexportés par `request-queue.ts` pour
ne rien changer à ses appelants.

### `whatsapp-recap.ts` (modifié)

- `RecapJob` accepte `type: "MISSION"` : la ligne méta affiche « Mission · domaine · lieu », le
  lien pointe vers `/jobs/freelance/missions/[id]`, pas de ligne de date limite.
- L'en-tête suit les pastilles actives : une seule pastille → son libellé actuel (« Stages »…, et
  « Missions freelance ») ; zéro ou plusieurs → « Opportunités ». La signature passe d'un filtre
  unique à la liste des types actifs.
- Toujours aucune coordonnée de l'auteur dans le message (spec 035).

## UI / composants

### Extractions partagées (depuis la spec 063)

- **`src/components/ui/FilterChip.tsx`** : bouton bascule `aria-pressed`, 44 px, tokens du
  design system — le style aujourd'hui en ligne dans `RequestQueue.tsx`. `RequestQueue` l'utilise.
  Ajouté à `src/components/ui/index.ts` et à `docs/design-system/` (composants).
- **`src/components/ListDetailLayout.tsx`** : liste + détail. Sur desktop, grille
  `minmax(0,1fr) 420px` avec colonne de détail collante ; sinon `BottomSheet`. Repose sur
  `useViewport()`. `RequestQueue` est réécrit pour l'utiliser (comportement identique).

### `src/app/(auth)/jobs/page.tsx` (réécrit, serveur)

- `auth()` → `loadJobsBoard(session, { now })` (via `@/modules/jobs`).
- `PageHeader` titre **« Offres »**, action : bouton **« Publier »**.
- Passe à `JobsBoard` : publications, `canManage`, `currentUserId`, `lastSeenAt`, `nowMs`,
  vue initiale (`resolveInitialView`).

### `JobsBoard.tsx` (nouveau, client — remplace `JobsTabBar`, `JobsListClient`, `SeekersListClient`, `FreelanceTabContent`)

- `Tabs` pilotés par l'URL (`?tab=opportunites|profils`), compteur = publications **actives** de
  l'onglet.
- Barre d'outils, qui passe à la ligne sur mobile : `Input` de recherche, `FilterChip` de types,
  `FilterChip` « Mes publications », pour un modérateur trois `FilterChip` d'état exclusifs
  (« Actives » par défaut, « Retirées », « Toutes ») ; sur « Opportunités », « Copier pour
  WhatsApp » (icône lucide, toast de confirmation avec le nombre copié, repli dans un `Modal` si
  le presse-papier échoue — logique existante reprise).
- Liste : une carte = **un seul** `<button>` (ouvre le détail ; `aria-current` sur la sélection),
  sans lien ni bouton imbriqué. Contenu : `StatusChip` de type, titre, entreprise ou domaine,
  lieu, tarif pour mission et freelance, ligne d'échéance (`warning` sous 7 jours), point
  « Nouveau » (`brand`, avec libellé accessible), `StatusChip` d'état si non active, mention
  « Ma publication ».
- `lastSeenAt` est figé dans un état initial : un `router.refresh()` après une action ne fait pas
  disparaître les repères « Nouveau » pendant la visite.
- États vides : `EmptyState` « Aucun résultat pour ces filtres » + « Effacer les filtres » quand
  l'onglet a des publications visibles mais aucune ne passe les filtres ; sinon `EmptyState`
  d'invitation avec « Publier » ouvrant le choix filtré sur l'onglet.
- Sélection : `?id=` n'est **pas** mis dans l'URL (le lien partageable reste la page de détail) ;
  si la publication sélectionnée disparaît après un rafraîchissement (supprimée), le panneau se
  ferme.

### `PublishChooser.tsx` (nouveau, client)

Bouton « Publier » → choix des quatre types : `BottomSheet` sur mobile, `Modal` sinon. Chaque
option est un lien plein largeur (icône, titre, phrase d'explication) vers le formulaire
existant (`/jobs/new`, `/jobs/freelance/missions/new`, `/jobs/seekers/new`,
`/jobs/freelance/profiles/new`). Une prop `only` restreint aux deux types de l'onglet pour l'état
vide.

### `PublicationDetail.tsx` (nouveau, client — remplace les quatre `*DetailClient`)

- Contenu selon le `kind` : en-tête (type, titre, entreprise ou domaine, lieu, modalité),
  `Alert` d'état si non active, bandeau de relance « Toujours d'actualité » pour une offre
  (logique existante), métadonnées (durée, date limite, disponibilité, tarif, auteur, date),
  description complète, bloc « Candidature » ou « Contact » (`mailto:` et lien externe
  `http(s)` uniquement).
- Actions, **selon les règles actuelles de l'API** :

  | Type | Auteur | Modérateur |
  |---|---|---|
  | Offre | Modifier (publiée), Retirer / Republier, Toujours d'actualité, Supprimer | Retirer / Republier, Supprimer |
  | Mission | Modifier, « Mission pourvue » (active) ; « Remettre en ligne » (pourvue) ; Supprimer | Retirer / Republier, Supprimer |
  | Recherche | Modifier, « J'ai trouvé » (active) ; « Je cherche de nouveau » (a trouvé) ; Supprimer | Retirer / Republier, Supprimer |
  | Freelance | Modifier, « Plus disponible » (active) ; « De nouveau disponible » (indisponible) ; Supprimer | Retirer / Republier, Supprimer |

  Les gestes de « remise en ligne » de l'auteur (`→ ACTIVE` depuis pourvue, a trouvé,
  indisponible) sont déjà autorisés par l'API et répondent à Q3 (republier depuis « Mes
  publications »). Jamais depuis `ARCHIVED` pour ces trois types (garde API ci-dessus).
- Retirer et Supprimer passent par `ConfirmModal` ; erreurs et succès par `useToast` ; plus
  aucun `alert()`/`confirm()`.
- `onChanged` : `router.refresh()` ; après suppression, `onDeleted` (panneau : fermeture ; page :
  retour à `/jobs`).

### Pages de détail conservées (liens directs)

`/jobs/[id]`, `/jobs/freelance/missions/[id]`, `/jobs/seekers/[id]`,
`/jobs/freelance/profiles/[id]` : `loadPublication` puis `PublicationDetail` dans une carte, avec
un lien de retour vers « Offres ». Si `null` (supprimée, ou non visible pour l'appelant) :
`EmptyState` « Cette publication n'est plus disponible » + retour, au lieu du 404 actuel.
Les pages de **formulaire** (`new`, `edit`) ne changent pas, hormis les liens « retour » qui
pointaient vers `?tab=seekers` / `?tab=freelance` (toujours valides grâce au mapping, mis à jour
quand même vers les nouvelles valeurs).

### Fichiers supprimés

`JobsTabBar.tsx`, `JobsListClient.tsx`, `SeekersListClient.tsx`, `freelance/FreelanceTabContent.tsx`,
les quatre `*DetailClient.tsx`, `job-status.ts` (et son test, remplacé), après vérification par
`grep` qu'ils n'ont plus d'usage.

### Documentation

`GuideContent.tsx` (section Offres), `docs/processus/offres-et-missions.md`, `docs/api.md`
(compteur de non vus étendu, garde d'archivage), CHANGELOG.

## Décisions & alternatives écartées

- **Choix** : chargement normalisé dans un service du module (`loadJobsBoard`) — *Pourquoi* : la
  page actuelle fait quatre requêtes Prisma et la règle de visibilité elle-même ; la règle change
  (Q3) et doit être identique pour la liste et les pages de détail, donc en un seul endroit,
  testé.
- **Choix** : un seul `PublicationDetail` pour panneau et page — *Pourquoi* : la spec exige le même
  contenu et les mêmes actions aux deux endroits ; quatre composants presque identiques
  divergeraient.
- **Choix** : filtrage et recherche côté client sur tout le jeu chargé — *Pourquoi* : volumes
  faibles (annonces d'une communauté, les offres échues sont archivées par la tâche périodique) ;
  la page charge déjà tout aujourd'hui. Pas de pagination dans ce lot.
- **Choix** : point « Nouveau » calculé côté serveur à partir de `seenAt` lu avant remise à zéro —
  *Pourquoi* : aucun changement de schéma, et la même source que la pastille du menu.
- **Choix** : extraire `FilterChip` et `ListDetailLayout` — *Pourquoi* : deuxième usage du même
  motif (spec 063) ; les copier ferait dériver les deux écrans.
- **Écarté** : sélection dans l'URL (`?id=`) pour partager le panneau — *Raison* : le lien
  partageable existe déjà (page de détail) et c'est celui que le message WhatsApp utilise ; deux
  formes de lien pour la même chose brouilleraient.
- **Écarté** : nouvelle route API de liste unifiée — *Raison* : tout est rendu côté serveur par la
  page ; une route ne servirait à aucun appel client.
- **Écarté** : statut `EXPIRED` en base — *Raison* : la tâche périodique archive déjà les offres
  échues ; l'état « Expirée » est un état d'affichage de l'intervalle.

## Risques & points d'attention

- **Garde d'archivage** : seul changement de comportement d'API. Vérifier qu'aucun écran ne
  s'appuyait sur la remise en ligne d'un profil archivé par son auteur (`grep` des appels
  `status: "ACTIVE"`).
- **Compteur du menu** : il augmente pour les utilisateurs quand des missions sont publiées
  (voulu, Q4) — à mentionner dans le CHANGELOG.
- **Visibilité des publications de l'auteur** : le `where` `OR` doit rester borné à
  `authorId = appelant` ; un test vérifie qu'un tiers ne reçoit jamais une publication non active
  d'autrui.
- **Refactor de `RequestQueue`** vers `ListDetailLayout` : écran fraîchement livré (spec 063) ;
  contrôle visuel à 360 px et en desktop des deux écrans.
- **Frontière client/serveur** : `board.ts` et `whatsapp-recap.ts` ne doivent rien importer de
  serveur ; `npm run build` avant déploiement.
- `lint:prisma-boundary` : aucun `route.ts` nouveau ; `unseen-count/route.ts` importe déjà Prisma
  — seuil inchangé (143).

## Stratégie de tests

- `src/modules/jobs/__tests__/board.test.ts` (`prismaMock`) :
  - modérateur : `where` sans filtre ; non-modérateur : `OR` actif / `authorId` propre, offres
    actives bornées par la date limite ;
  - `toPublication` : état dérivé pour chaque ligne du tableau, `isNew` (opportunité d'autrui
    après `seenAt` ; jamais la sienne ni un profil), `href` par type ;
  - `loadPublication` : `null` pour une publication non active d'autrui, objet pour l'auteur et
    pour un modérateur.
- `src/app/(auth)/jobs/__tests__/board.test.ts` : `resolveInitialView` (anciens onglets),
  `matchesTypes` (profil multi-contrats), `matchesQuery` (accents, champs), `matchesState`
  (non-modérateur, « Mes publications », filtre modérateur), `expiryLabel` (aujourd'hui, demain,
  N j, seuil de 7 jours), `rateLabel`.
- `whatsapp-recap.test.ts` : missions (lien, méta, pas de date limite), en-tête selon les pastilles.
- `src/app/api/jobs/__tests__/unseen-count.test.ts` : somme offres + missions, mêmes bornes.
- Tests des trois `PATCH` : `403` pour un auteur qui sort une publication de `ARCHIVED` ; un
  modérateur le peut ; l'auteur peut toujours passer de pourvue / a trouvé / indisponible à
  active.
- `src/lib/__tests__/request-queue.test.ts` inchangé et vert après l'extraction de
  `paris-days.ts`.
- Vérifications : typecheck, lint, `lint:boundaries`, `lint:prisma-boundary` (143), test,
  `npm run build`, contrôle à l'écran à 360 px et en desktop (Offres et Traitement des demandes).
