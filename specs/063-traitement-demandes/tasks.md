# Tâches — Refonte des écrans de traitement des demandes

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : services → API → UI → tests. Aucune migration n'est prévue. Les tâches `[P]` sont
> parallélisables.

## Prérequis

- [x] Branche créée : `feat/traitement-demandes`, depuis `main` à jour.
- [x] Aucune migration Prisma (plan : aucun changement de schéma).

## Tâches

### 1. Logique métier (services)

- [x] **T1** [P] — `requestDeadline(item, ctx)`, fonction pure, renvoie `{ date, kind }` selon le
  type :
  - annonce et publication : premier culte ciblé encore à venir, sinon date d'événement ;
  - ajout d'événement : `payload.eventDate` ;
  - modification ou annulation d'événement : date de l'événement ;
  - modification de planning : `planningDeadline`, sinon date de l'événement ;
  - visuel : `payload.deadline`, sinon la règle de l'annonce ;
  - demande d'accès : `none`.

  *(fichier : `src/modules/planning/services/request-queue/deadline.ts`)*
- [x] **T2** [P] — `eventChangeSummary(changes, event)`, fonction pure, renvoie
  `{ label, before, after }[]` pour `title`, `type`, `date` et `planningDeadline`. *(fichier :
  `request-queue/event-change-summary.ts`)*
- [x] **T3** [P] — `resolveRequestQueueAccess(session, churchId, fn)` renvoie
  `{ configured, allowed, canManage }`. Les permissions sont calculées sur l'église courante :
  `events:manage` ou appartenance à un département de la fonction. Si aucun département n'est
  configuré, `configured: false`. *(fichier : `request-queue/access.ts`)*
- [x] **T4** — Type `QueueItem` sérialisable et fonctions de chargement :
  - `loadRequestQueue(churchId, fn)` renvoie `{ open, done: { items, nextCursor } }`. Les demandes
    ouvertes sont celles en attente et en cours. La première page de « Traitées » couvre 30 jours,
    au plus 30 éléments ;
  - `listDoneRequests(churchId, fn, { cursor, q })` lit 30 éléments triés par `updatedAt` desc puis
    `id`. Avec `q`, la recherche (titre, titre de l'annonce, demandeur, département, ministère)
    porte sur toutes les dates ;
  - périmètre par fonction : demandes racines pour `SECRETARIAT`, type `RESEAUX_SOCIAUX` ou
    `VISUEL` pour les autres ;
  - lecture groupée des événements référencés dans les payloads ;
  - enrichissement de chaque élément : `deadline`, `deadlineKind`, `eventChanges`, `children`,
    `mediaProject` (visuels : nom et jeton de partage), `executionError`.

  *(fichier : `request-queue/queue.ts`)*
- [x] **T5** — Exporter `loadRequestQueue`, `listDoneRequests`, `resolveRequestQueueAccess` et les
  types `QueueItem`/`QueueFunction` depuis l'index. *(fichier : `src/modules/planning/index.ts`)*

### 2. API (route handlers)

- [x] **T6** — Nouvelle route `GET /api/requests/queue` :
  - validation Zod de `churchId`, `fn`, `cursor?` et `q?` (100 caractères au plus) ;
  - `requireChurchPermission("planning:view", churchId)`, puis `resolveRequestQueueAccess`, qui
    renvoie 403 si l'appelant n'est pas dans l'équipe et une liste vide si la fonction n'est pas
    configurée ;
  - aucun import de Prisma.

  *(fichier : `src/app/api/requests/queue/route.ts`)*
- [x] **T7** — `PATCH /api/requests/[id]` :
  - `expectedStatus?` dans `patchSchema`, vérifié dans la transaction, avec un 409 « Cette demande
    a été modifiée entre-temps » ;
  - une annulation (`ANNULE`) par quelqu'un d'autre que le demandeur sans `reviewNotes` renvoie
    400 ;
  - `notifySubmitter` gère un cas `ANNULE` posé par un tiers : type `REQUEST_CANCELLED`, domaine
    `requests`, avec le motif.

  *(fichier : `src/app/api/requests/[id]/route.ts`)*

### 3. UI

- [x] **T8** [P] — Utilitaires côté client :
  - `groupByDeadline(items, now)` répartit en groupes `overdue`/`week`/`later`/`none`, sans groupe
    vide, triés par échéance puis ancienneté ;
  - `relativeDeadline(date, now)`, calculé au jour près en fuseau `Europe/Paris` ;
  - `matchesQuery(item, q)` ;
  - libellés et icônes lucide par type.

  *(fichier : `src/lib/request-queue.ts`)*
- [x] **T9** — `ReasonForm` : motif obligatoire, bouton de confirmation inactif tant que le motif
  est vide, avertissement facultatif sur les suites annulées en cascade. *(fichier :
  `src/components/requests/ReasonForm.tsx`)*
- [x] **T10** — `RequestQueue`, composant générique :
  - **onglets** `Tabs` sur `?tab=todo|doing|done`, avec compteurs mis à jour localement après
    chaque action ;
  - **recherche** locale sur « À traiter » et « En cours », et via la route (300 ms d'attente) sur
    « Traitées » ;
  - **pastilles de type** en option ;
  - **groupes et lignes** compactes (44 px minimum, `StatusChip`) ;
  - **panneau** sur `?id=` : colonne sur desktop, `BottomSheet` sinon, via `useViewport` ;
  - **actions** : helper `runAction` qui envoie `expectedStatus`, affiche un toast avec
    « Annuler » optionnel et gère le 409 (toast puis `router.refresh()`) ;
  - **états vides** `EmptyState` et bouton « Voir plus ».

  *(fichier : `src/components/requests/RequestQueue.tsx`)*
- [x] **T11** — `SecretariatDetail` : texte complet, cultes ciblés, résumé des données (tableau
  avant → après pour une modification d'événement), suites demandées, note, erreur d'exécution.
  Actions :
  - annonce : « Marquer diffusée » en principal, « Mettre en cours » (avec « Annuler » dans le
    toast) et « Annuler l'annonce » (motif et avertissement sur les suites) ;
  - demande : « Approuver » et « Refuser » (motif) ;
  - demande traitée : « Supprimer » (`canManage`, `ConfirmModal` qui nomme la demande).

  *(fichier : `src/components/requests/SecretariatDetail.tsx`)*
- [x] **T12** [P] — `CommunicationDetail` :
  - « Prendre en charge », avec « Annuler » dans le toast ;
  - « Marquer publiée », avec un lien facultatif et « Annuler » dans le toast ;
  - « Annuler la publication », avec motif ;
  - état et lien du visuel associé, lien « Voir le post publié ».

  *(fichier : `src/components/requests/CommunicationDetail.tsx`)*
- [x] **T13** [P] — `VisuelDetail` :
  - brief, format, date limite, annonce et canal ;
  - prise en charge dans le panneau : projet existant ou nouveau, le nom étant obligatoire.
    « Annuler » n'apparaît dans le toast que pour un projet existant, et il remet `mediaProjectId`
    à `null` ;
  - « Marquer livré », avec un lien facultatif quand aucun projet n'est rattaché ;
  - liens vers le projet et le téléchargement ;
  - « Annuler la demande », avec motif.

  *(fichier : `src/components/requests/VisuelDetail.tsx`)*
- [x] **T14** — Page secrétariat : `resolveRequestQueueAccess` puis `loadRequestQueue`,
  `PageHeader` avec le badge « À traiter », bannière de configuration via `Alert`, `RequestQueue`
  avec pastilles de type et `SecretariatDetail`. Supprimer `RequestsDashboard.tsx`. *(fichiers :
  `src/app/(auth)/secretariat/requests/page.tsx`, `RequestsDashboard.tsx`)*
- [x] **T15** [P] — Page communication, sur le même modèle avec `CommunicationDetail`, sans
  pastilles. Supprimer `CommunicationDashboard.tsx`. *(fichiers :
  `src/app/(auth)/communication/requests/page.tsx`, `CommunicationDashboard.tsx`)*
- [x] **T16** [P] — Page Visuels › Demandes, sur le même modèle avec `VisuelDetail`, sans
  pastilles, et la liste des projets toujours chargée par la page. Supprimer `MediaDashboard.tsx`.
  *(fichiers : `src/app/(auth)/media/(visuels)/requests/page.tsx`, `MediaDashboard.tsx`)*
- [x] **T17** — Supprimer `RequestStatusSections.tsx`, ainsi que `ExpandableText.tsx` si `grep` ne
  lui trouve plus aucun utilisateur. Vérifier les `loading.tsx` des trois pages (squelette
  cohérent). *(fichiers : `src/components/`)*

### 4. Tests

- [x] **T18** [P] — `deadline.test.ts` et `event-change-summary.test.ts` : chaque type, culte passé
  ignoré, visuel qui retombe sur l'annonce, `MODIFICATION_PLANNING` sans date limite, changements
  partiels. *(fichiers : `src/modules/planning/services/request-queue/__tests__/`)*
- [x] **T19** [P] — `src/lib/__tests__/request-queue.test.ts` : groupes et ordre, départage par
  ancienneté, groupes vides absents, délai relatif autour de minuit (Europe/Paris), recherche
  locale.
- [x] **T20** — `queue.test.ts` et `access.test.ts` avec `prismaMock` :
  - périmètre par fonction (racines pour le secrétariat), fenêtre de 30 jours, curseur, `q` sur
    toutes les dates, lecture groupée des événements ;
  - accès : `events:manage`, membre de la fonction, tiers refusé, non configuré, rôle d'une autre
    église ignoré.

  *(fichiers : `request-queue/__tests__/`)*
- [x] **T21** — `queue/route.test.ts` : 400 Zod, 403 hors équipe, liste vide si non configuré,
  curseur et `q` transmis au service. *(fichier : `src/app/api/requests/queue/__tests__/`)*
- [x] **T22** — Tests du `PATCH` :
  - `expectedStatus` différent de l'état courant donne 409 ;
  - annulation par l'équipe sans motif donne 400 ; avec motif, elle passe et envoie la
    notification `REQUEST_CANCELLED` ;
  - annulation par le demandeur sans motif passe ;
  - retour `LIVRE → EN_COURS` accepté ;
  - `payload.mediaProjectId: null` est bien fusionné.

  *(fichier : `src/app/api/requests/[id]/__tests__/`, à créer ou compléter)*

### 5. Documentation

- [x] **T23** [P] — API : `GET /api/requests/queue`, `expectedStatus`, motif d'annulation et
  notification `REQUEST_CANCELLED`. *(fichier : `docs/api.md`)*
- [x] **T24** [P] — Guide (secrétariat, communication, production média) et fiche processus des
  demandes si elle existe. *(fichiers : `src/components/GuideContent.tsx`, `docs/processus/`)*
- [x] **T25** — CHANGELOG « Non publié », statut de la spec à « Implémentée », du plan à
  « Implémenté » et de ces tâches à « Terminé ». *(fichiers : `CHANGELOG.md`, `specs/063-…/`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint` (aucune couleur en dur ni emoji d'interface)
- [x] `npm run lint:boundaries`
- [x] `npm run lint:prisma-boundary` (seuil inchangé à 143)
- [x] `npm run test`, y compris `route-exhaustiveness.test.ts`
- [x] `npm run build` (frontière client/serveur)
- [x] Contrôle à l'écran à 360 px : pas de défilement horizontal, cibles de 44 px, motif visible
  au-dessus du clavier.
- [x] Tous les critères d'acceptation de `spec.md` sont satisfaits.
- [x] PR ouverte vers `main` (ferme #677, PR #680).
