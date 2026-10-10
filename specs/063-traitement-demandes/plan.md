# Plan technique — Refonte des écrans de traitement des demandes

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-10-10

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : les pages et la nouvelle route n'appellent la logique de file que
  via `@/modules/planning`. Cela vaut aussi pour la page Visuels, qui relève du module `media` :
  `src/app` a le droit d'importer l'index de n'importe quel module, et les demandes appartiennent
  au module `planning`.
- [x] **Sécurité** : la nouvelle route `GET /api/requests/queue` exige un `churchId` et appelle
  `requireChurchPermission("planning:view", churchId)`, puis le même contrôle d'équipe que les
  pages (`events:manage` ou membre d'un département de la fonction). Le `PATCH` existant garde ses
  contrôles et en ajoute deux (voir API).
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`). Aucune permission nouvelle.
- [x] **Validation** Zod sur les paramètres de la nouvelle route et sur le nouveau champ du `PATCH`.
- [x] **Migration** : aucun changement de schéma.
- [x] **Enums** `RequestType` et `RequestStatus` importés depuis `@/generated/prisma/client`.
- [x] **UI** : réutilisation de `Tabs`, `StatusChip`, `EmptyState`, `BottomSheet`, `Button`,
  `IconButton`, `Field`/`Textarea`/`Input`/`Select`, `Toast` (prop `action` pour « Annuler ») et
  `ConfirmModal`. Les icônes viennent de lucide.

## Approche générale

Les trois écrans gardent leur URL, leur garde d'accès et leur bannière « aucun département
configuré ». Seul le corps change.

- **File partagée.** Un composant client générique, `RequestQueue`, porte tout ce qui est commun :
  - onglets à compteurs, pilotés par l'URL `?tab=` ;
  - recherche ;
  - pastilles de type, en option ;
  - groupes par échéance ;
  - lignes compactes ;
  - panneau de détail : colonne à droite sur desktop, `BottomSheet` sinon ;
  - toasts avec « Annuler ».
- **Panneaux propres à chaque écran.** Chaque écran fournit son contenu de panneau et ses actions :
  - `SecretariatDetail` (annonces et demandes exécutables) ;
  - `CommunicationDetail` (publication) ;
  - `VisuelDetail` (prise en charge avec projet, livraison).
- **Chargement côté serveur.** Les données sont préparées dans un service du module `planning`
  (`services/request-queue/`). Il calcule :
  - l'échéance de chaque demande ;
  - le résumé d'une modification d'événement (valeurs actuelles de l'événement → valeurs
    demandées) ;
  - la liste « ouverte » (en attente et en cours, complète) ;
  - la première page de « Traitées » (30 derniers jours).
- **Chargement à la demande.** « Voir plus » et la recherche dans « Traitées » passent par la
  nouvelle route `GET /api/requests/queue`, qui appelle le même service. La route n'importe pas
  Prisma, donc le seuil `lint:prisma-boundary` reste à 143.
- **Calculs dans le navigateur.** Le regroupement (En retard, Cette semaine, Plus tard, Sans
  échéance) et le délai relatif dépendent de « maintenant ». Ils sont calculés côté client par une
  fonction pure de `src/lib/request-queue.ts`, sans dépendance serveur et testable isolément.
- **Route `PATCH` existante.** On ne la réécrit pas. On lui ajoute :
  - un contrôle d'état attendu (`expectedStatus`), qui sert à la fois au retour arrière et à la
    détection d'une modification concurrente ;
  - le motif obligatoire pour une annulation par l'équipe qui traite ;
  - la notification du demandeur sur annulation.

## Modèle de données

[Aucun changement]

- « Traitées » est trié par `Request.updatedAt` décroissant. La fenêtre de 30 jours porte sur ce
  champ, qui change à chaque changement d'état.
- L'index existant `@@index([churchId, type, status])` suffit pour les volumes d'une église.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/requests/queue` (nouveau) | GET | `planning:view` + équipe de la fonction (`events:manage` ou membre d'un département de la fonction) | query Zod : `churchId`, `fn` ∈ `SECRETARIAT`/`COMMUNICATION`/`PRODUCTION_MEDIA`, `cursor?` (ISO `updatedAt` + `id`), `q?` (≤ 100 car.) | `{ items: QueueItem[], nextCursor: string \| null }`, seulement les demandes traitées |
| `/api/requests/[id]` (modifié) | PATCH | inchangée | ajout de `expectedStatus?: RequestStatus` | inchangée ; `409` si l'état a changé |

### `GET /api/requests/queue`

- **Contenu.** Seulement les demandes **traitées** de la fonction : demandes racines
  (`parentRequestId: null`) pour le secrétariat, et toutes les demandes du type pour la
  communication et les visuels, comme aujourd'hui.
- **Pagination.** 30 éléments par page, triés par `updatedAt` desc puis `id`.
- **Sans `q`.** La première page est servie par la page serveur, et la route sert les suivantes.
- **Avec `q`.** La recherche porte sur toutes les dates : `contains` sur `title`, le titre de
  l'annonce, `submittedBy.name`/`displayName`, `department.name` et `ministry.name`. La collation
  MariaDB est insensible à la casse.
- **Contrôle d'accès.** Il est factorisé dans `resolveRequestQueueAccess(session, churchId, fn)`
  (service), qui renvoie `{ allowed, canManage }`. Les trois pages l'utilisent aussi, à la place
  de leur code dupliqué. Le comportement est inchangé : si aucun département ne porte la
  fonction, la page affiche la bannière de configuration, et la route renvoie une liste vide.

### `PATCH /api/requests/[id]`, trois ajouts

1. **`expectedStatus`** (facultatif) : il est vérifié dans la transaction. Si
   `existing.status !== expectedStatus`, la route renvoie
   `ApiError(409, "Cette demande a été modifiée entre-temps")`. L'interface l'envoie sur **chaque**
   action. Cela couvre le cas limite « traitée par quelqu'un d'autre » et sécurise le retour
   arrière : on ne restaure que depuis l'état qu'on vient de poser.
2. **Motif obligatoire à l'annulation** : si `status === "ANNULE"`, que l'appelant n'est pas le
   demandeur et que `reviewNotes` est vide, la route renvoie `400`. L'annulation de sa propre
   demande en attente par le demandeur reste possible sans motif, comme aujourd'hui (« Mes
   demandes »).
3. **`notifySubmitter`** ajoute un cas `ANNULE` posé par un tiers, dans le domaine `requests`
   existant, avec le type `REQUEST_CANCELLED`, le titre « Demande annulée », le message
   « … a été annulée. Motif : … » et le lien `/requests`.

**Retour arrière.** Les transitions `EN_COURS → EN_ATTENTE` et `LIVRE → EN_COURS` (ou
`LIVRE → EN_ATTENTE` pour une annonce marquée diffusée directement) passent déjà par la route :
`patchSchema.status` accepte `EN_ATTENTE`, et aucune machine à états ne les bloque. Sur Visuels,
annuler une prise en charge envoie `payload: { mediaProjectId: null }`. Les deux effets de bord
sont sans conséquence :
- `syncAnnouncementStatus` recalcule le statut de l'annonce depuis les statuts restaurés ;
- l'événement `planning:request:status_changed` n'a aucun abonné aujourd'hui.

## Services / logique métier

Nouveau dossier `src/modules/planning/services/request-queue/`, exporté par `index.ts`.

- **`deadline.ts`** (pur) : `requestDeadline(item, ctx)` renvoie `{ date: string | null, kind }`,
  avec `kind` ∈ `culte`/`event`/`planning`/`brief`/`none` :
  - `DIFFUSION_INTERNE` et `RESEAUX_SOCIAUX` : le premier `targetEvents.event.date` ≥ début du
    jour, sinon `announcement.eventDate` ;
  - `AJOUT_EVENEMENT` : `payload.eventDate` ;
  - `MODIFICATION_EVENEMENT` et `ANNULATION_EVENEMENT` : la date de l'événement `payload.eventId` ;
  - `MODIFICATION_PLANNING` : `event.planningDeadline`, sinon `event.date` ;
  - `VISUEL` : `payload.deadline`, sinon la règle de l'annonce ;
  - `DEMANDE_ACCES` : `none`.
- **`event-change-summary.ts`** (pur) : liste les changements `{ label, before, after }` pour
  `title`, `type`, `date` et `planningDeadline`, à partir de `payload.changes` et de l'événement
  courant.
- **`queue.ts`** :
  - `loadRequestQueue(churchId, fn)` renvoie `{ open: QueueItem[], done: { items, nextCursor } }` ;
  - `listDoneRequests(churchId, fn, { cursor, q })` sert la route ;
  - une seule requête `request.findMany` par liste, puis une requête `event.findMany` groupée sur
    les `eventId` des payloads ;
  - sérialisation en `QueueItem`, avec les dates en chaînes ISO et ces champs : `deadline`,
    `deadlineKind`, `eventChanges?`, `children` (suites, avec leur état et leur lien de livraison),
    `mediaProject?` (Visuels : nom, lien, jeton de téléchargement), `executionError` ;
  - pour Visuels, la liste des projets proposée à la prise en charge reste chargée par la page,
    comme aujourd'hui.
- **`access.ts`** : `resolveRequestQueueAccess` (voir API).

## UI / composants

**`src/lib/request-queue.ts`** (sans dépendance serveur, importable côté client) :
- `groupByDeadline(items, now)` répartit en groupes ordonnés (`overdue`, `week`, `later`, `none`),
  sans groupe vide. Le tri se fait par échéance croissante, puis par `submittedAt` croissant ;
- `relativeDeadline(date, now)` renvoie « aujourd'hui », « demain », « dans 3 j » ou « en retard
  de 2 j ». Les comparaisons se font au jour près, en fuseau `Europe/Paris` ;
- `matchesQuery(item, q)` est la recherche locale des onglets « À traiter » et « En cours ».

**`src/components/requests/`** (client) :
- **`RequestQueue.tsx`** :
  - **onglets** `Tabs` en liens `?tab=todo|doing|done`, avec `count`. Aucun nouveau composant :
    `Tabs` accepte déjà un `href` avec query et `active` explicite ;
  - **recherche** : `Input` de type `search`. Elle filtre en local sur À traiter et En cours. Sur
    Traitées, elle appelle la route après 300 ms d'inactivité ;
  - **pastilles de type** : boutons `aria-pressed`, de 44 px minimum, en option (secrétariat
    seulement) ;
  - **lignes** : `<button>` pleine largeur de 44 px minimum. On y trouve l'icône lucide du type,
    le titre, le demandeur et l'origine, l'échéance avec son délai relatif, et les `StatusChip`
    Urgent, Save the Date, Sans annonce ou Erreur ;
  - **panneau** : la sélection est gardée en `?id=`. Le gabarit vient de `useViewport()`
    (`shell-state.ts`) : en `desktop`, grille `lg:grid-cols-[minmax(0,1fr)_420px]` avec panneau
    collant ; sinon `BottomSheet`. Ainsi un seul panneau est monté ;
  - **actions** : les retours passent par `useToast`. Le toast propose `action: { label:
    "Annuler", onClick }` seulement pour les transitions sans effet, et le retour arrière renvoie
    `expectedStatus` égal au statut qu'on vient de poser. Sur `409`, un toast d'erreur s'affiche
    et la page se recharge (`router.refresh()`) ;
  - **états vides** : `EmptyState`, avec trois textes selon l'onglet et une action « Effacer la
    recherche » ;
  - **« Voir plus »** : un `Button` secondaire sous Traitées.
- **`ReasonForm.tsx`** : `Textarea` obligatoire, bouton de confirmation inactif tant qu'il est
  vide, et texte d'avertissement sur les suites annulées en cascade. Il sert au refus, à
  l'annulation d'annonce, à l'annulation de publication et à l'annulation de visuel.
- **`SecretariatDetail.tsx`** : texte complet, cultes ciblés, résumé des données (dont le tableau
  avant → après d'une modification d'événement), suites avec `StatusChip`, note facultative,
  erreur d'exécution.
  - **Annonce** : action principale « Marquer diffusée », secondaires « Mettre en cours » et
    « Annuler l'annonce ».
  - **Demande** : action principale « Approuver », secondaire « Refuser ».
  - **Suppression** (`canManage`, demande traitée) : `ConfirmModal` qui nomme la demande.
- **`CommunicationDetail.tsx`** : « Prendre en charge », puis « Marquer publiée » avec un `Input`
  URL facultatif, ou « Annuler la publication ». Le visuel associé est affiché avec son état et
  son lien.
- **`VisuelDetail.tsx`** : brief, format, date limite, annonce et canal. La prise en charge se fait
  dans le panneau : choix entre un projet existant (`Select`) et un nouveau projet (`Input`
  obligatoire). Le retour arrière n'est proposé que si un projet existant a été choisi. Ensuite :
  « Marquer livré », avec un lien facultatif quand aucun projet n'est rattaché ; liens vers le
  projet et vers le téléchargement ; « Annuler la demande ».

**Pages.** Chaque page appelle `resolveRequestQueueAccess` et `loadRequestQueue`, puis rend
`PageHeader` (titre et badge « À traiter ») et `RequestQueue`. Les bannières de configuration sont
réécrites avec `Alert`.

**Suppressions.** `RequestsDashboard.tsx`, `CommunicationDashboard.tsx`, `MediaDashboard.tsx` et
`RequestStatusSections.tsx` sont supprimés. `ExpandableText.tsx` l'est aussi s'il n'a plus
d'utilisateur, ce qu'on vérifiera avec `grep`.

## Décisions & alternatives écartées

- **Choix** : une file générique, avec un panneau par écran. — *Pourquoi* : les trois écrans ont la
  même mécanique (onglets, échéance, recherche, panneau) mais des actions différentes. Un seul
  composant à configurations évite trois réécritures divergentes.
- **Choix** : `expectedStatus` sur le `PATCH` existant, plutôt qu'une route « undo ». —
  *Pourquoi* : le retour arrière n'est qu'un changement d'état ordinaire. La garde d'état protège
  aussi les actions normales contre le traitement concurrent, l'autre cas limite de la spec.
- **Choix** : l'échéance est calculée côté serveur, le groupe côté client. — *Pourquoi* :
  l'échéance demande des données (événements ciblés) ; le groupe ne dépend que de « maintenant »
  et se recalcule sans requête.
- **Choix** : « Voir plus » charge les 30 demandes traitées suivantes, plutôt qu'une fenêtre de
  30 jours. — *Pourquoi* : une fenêtre calendaire peut être vide et obligerait à cliquer plusieurs
  fois. Le premier affichage reste borné aux 30 derniers jours, comme le demande la spec. **Écart
  mineur** par rapport au libellé « charge la période précédente » de la spec.
- **Choix** : notification `REQUEST_CANCELLED` dans le domaine `requests` existant. —
  *Pourquoi* : la spec veut que le demandeur reçoive le motif. Or aujourd'hui, aucune notification
  n'est envoyée sur annulation par l'équipe (`notifySubmitter` ne couvre que l'approbation et le
  refus). Ajouter ce cas au domaine existant reste dans l'esprit de « pas de nouvelle
  notification » : pas de domaine ni de préférence nouveaux. **Écart à valider** (voir Risques).
- **Écarté** : élargir `GET /api/requests`. — *Raison* : cette route filtre sur `canManage` ou le
  demandeur, et un membre d'équipe sans `events:manage` n'y verrait que ses propres demandes. La
  changer touche « Mes demandes ».
- **Écarté** : charger tout l'historique dans la page et filtrer en local. — *Raison* : c'est
  précisément le problème 5 de la spec.
- **Écarté** : un délai avant l'exécution des approbations. — *Raison* : tranché en spec (Q1).
- **Écarté** : un ADR. — *Raison* : la décision reste propre à cette feature, sans pattern
  transverse durable.

## Risques & points d'attention

- **Notification d'annulation** : c'est un léger dépassement de la spec, qui exclut « toute
  nouvelle notification ». Il est nécessaire pour que le motif atteigne le demandeur. À confirmer
  avec l'utilisateur avant l'implémentation.
- **Motif obligatoire côté serveur** : un autre client qui annulerait sans motif (s'il en existe)
  recevrait `400`. Les seuls appelants actuels sont les trois écrans refaits et « Mes demandes »,
  où le demandeur reste exempté.
- **Fuseau des échéances** : les dates « jour » (`payload.deadline` au format `YYYY-MM-DD`,
  `payload.eventDate`) sont lues sans décalage. Les dates d'événement en `DateTime` sont ramenées
  au jour `Europe/Paris`. Les cas limites à minuit sont couverts par les tests.
- **Taille de la file ouverte** : elle est chargée en entier. C'est acceptable, puisqu'elle ne
  contient que les demandes non terminées.
- **Mobile** : le motif et la note doivent rester visibles au-dessus du clavier dans
  `BottomSheet`, sans défilement horizontal à 360 px. À vérifier à l'écran sur un émulateur.
- **`next build`** : les nouveaux composants client ne doivent importer que `src/lib/request-queue.ts`
  et des types, jamais le service. On le vérifie avec `npm run build` avant le déploiement.

## Stratégie de tests

- **Purs** (`request-queue/__tests__/deadline.test.ts`, `event-change-summary.test.ts`,
  `src/lib/__tests__/request-queue.test.ts`) :
  - échéance par type, culte passé ignoré, visuel sans date limite qui retombe sur l'annonce,
    `MODIFICATION_PLANNING` sans `planningDeadline` ;
  - groupes et ordre, départage par ancienneté, groupes vides absents ;
  - délai relatif autour de minuit ;
  - recherche locale.
- **Service** (`queue.test.ts`, `access.test.ts`, avec `prismaMock`) :
  - filtrage par fonction, racines seulement pour le secrétariat ;
  - fenêtre de 30 jours et curseur ;
  - recherche sur toutes les dates ;
  - requête événements groupée ;
  - accès : `events:manage`, membre de la fonction, tiers refusé, fonction non configurée.
- **Routes** :
  - `queue/route.test.ts` : 400 Zod, 403 hors équipe, curseur, `q` ;
  - `[id]` PATCH : `expectedStatus` incorrect donne 409 ; annulation par l'équipe sans motif
    donne 400, avec motif elle passe et notifie `REQUEST_CANCELLED` ; annulation par le demandeur
    sans motif passe ; retour `LIVRE → EN_COURS` accepté ; `payload.mediaProjectId: null`
    fusionné.
- **`route-exhaustiveness.test.ts`** : `/api/requests/queue` est couvert par le préfixe
  `/api/requests` du manifeste `planning`.
- **Contrôles** : `npm run typecheck`, `lint`, `lint:boundaries`, `lint:prisma-boundary` (seuil
  inchangé), `test`, `build`.
