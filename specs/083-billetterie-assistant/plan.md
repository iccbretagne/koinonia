# Plan technique — Billetterie dans les assistants IA connectés

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-11-21

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : les actions MCP (`src/app/api/mcp/_actions/`) n'importent que
      `@/modules/ticketing`, `@/modules/ticketing/auth` et `@/modules/ticketing/schemas`
- [x] **Sécurité** : aucune nouvelle route HTTP ; chaque outil passe par le serveur MCP existant
      (jeton porteur → session reconstruite). Les droits se vérifient **par événement** avec
      `getEventAccess(ctx.session, eventId)` + `canDo(access, action)`, dont l'église fait foi
      (`access.churchId === ctx.churchId`, sinon « introuvable »)
- [x] **Permissions** : `ticketing:manage` lu via `isTicketingManager` (qui s'appuie sur
      `rolePermissions`) ; rôles d'événement via `EVENT_ACTIONS` — aucune matrice nouvelle
- [x] **Validation** Zod : chaque entrée d'outil a son schéma ; les corps métier réutilisent les
      schémas des écrans (`@/modules/ticketing/schemas`)
- [x] **Migration** Prisma : aucune
- [x] **Enums** depuis `@/generated/prisma/client` (`TicketingRole`, `TicketingEventStatus`…)
- [x] **UI** : aucune nouvelle UI ; seuls des textes (guide, page Assistants, fiches de Nia) bougent

## Approche générale

On ajoute un fichier d'actions `src/app/api/mcp/_actions/ticketing.ts`, branché dans
`MCP_ACTIONS` comme `serving.ts`/`events.ts`. Chaque action appelle **le service que l'écran
appelle déjà** (`updateEvent`, `confirmPayment`, `createAssignment`…) avec **le schéma Zod de
l'écran** : l'assistant ne peut rien faire que l'écran ne permette, et toute règle métier (places
sous les inscrits, IBAN invalide, plat déjà réservé…) reste à un seul endroit.

Les 14 paires aperçu/confirmation ont toutes la même forme ; un petit constructeur local
`eventAction({...})` produit les deux définitions (`…_preview`, `…_confirm`) à partir de :
- l'`EventAction` requise (`configure`, `payments`, `reception`, `catering`, `menu`) ;
- `prepare(input, ctx, access)` → `{ lines, payload, fp }` ou un refus ;
- `state(payload)` → l'état à re-empreinter à la confirmation (`fingerprint` de `common.ts`) ;
- `execute(payload, ctx)` → le texte de résultat.

Le constructeur s'occupe du reste, identique pour toutes : droit vérifié à l'aperçu **et** à la
confirmation, jeton (`createConfirmation`/`consumeConfirmation`), empreinte comparée (`CHANGED`),
`ApiError` du service convertie en refus lisible, audit « via l'assistant IA », lien vers l'écran.

## Outils

### Lectures sans case « actions » (questions de données, aussi utiles à Nia)

Ajoutées dans `src/app/api/assistant/_data/ticketing.ts` et à la liste blanche `MCP_TOOLS` ;
audience `predicates: ["ticketing"]` (déjà calculé par `_viewer.ts`) :

| Question | Contenu |
|---|---|
| `ticketing.myEvents` | événements visibles (`listEvents`) : titre, dates, état, inscrits/places/jauge, mes rôles, nombre de points bloquants avant ouverture |
| `ticketing.paymentsToHandle` | pour les événements où j'ai `payments` : « J'ai payé » en attente (référence, nom du contact, moyen, montant, ancienneté), remboursements à faire |

### Lectures liées aux actions (case « actions », `kind: "read"`)

| Outil | Rôle requis | Contenu |
|---|---|---|
| `ticketing_event` | `read` | détail (`getEventDetail`) : paramètres, tarifs, moyens de paiement **IBAN masqué**, options et plats avec identifiants, équipe et postes, « Prêt à ouvrir ? » |
| `ticketing_bookings` | `read` | réservations (`listBookings(eventId, false)` : **jamais de coordonnées**), filtre par nom/référence, pagination |
| `ticketing_presence` | `read` | compteur et jauge (`getPresence`) |
| `ticketing_catering` | `catering` ou `read` | plats, stock restant, à remettre (`cateringBoard`) |
| `ticketing_accounts` | `configure` | comptes de l'église (`listChurchAccounts`) cherchés par nom, pour les rôles et affectations — nom seulement |

### Actions (aperçu puis confirmation)

| Action (`…_preview` / `…_confirm`) | `EventAction` | Service appelé |
|---|---|---|
| `create_ticketing_event` | `ticketing:manage` dans l'église | `createEvent` |
| `update_ticketing_event` (infos, jauge, places, tarifs, moyens de paiement, règles) | `configure` | `updateEvent` (corps partiel `eventUpdateSchema`, sans `status`) |
| `set_ticketing_status` (ouvrir, fermer, rouvrir, clôturer) | `configure` | `updateEvent({ status })` après `readinessChecks` |
| `edit_ticketing_option` (créer, modifier, supprimer) | `configure` | `createOption`/`updateOption`/`deleteOption` |
| `edit_ticketing_dish` (ajouter, modifier, fermer, supprimer) | `menu` | `addVariant`/`updateVariant`/`deleteVariant` |
| `set_ticketing_roles` | `configure` | `setRoles` (liste complète recalculée à partir de l'existant ± le changement demandé) |
| `edit_ticketing_post` (créer, renommer, supprimer) | `configure` | `createPost`/`renamePost`/`deletePost` |
| `edit_ticketing_assignment` (affecter, modifier, retirer) | `configure` | `createAssignment`/`updateAssignment`/`deleteAssignment` |
| `handle_ticketing_payments` (confirmer ou rejeter, 1 à 50) | `payments` | `confirmPayment`/`rejectPayment` |
| `record_ticketing_receipt` (espèces, chèque) | `payments` | `recordReceipt` |
| `mark_ticketing_refunded` | `payments` | `markRefunded` |
| `cancel_ticketing_booking` | `payments` (comme la route de l'écran) | `cancelByOrganizer` |
| `add_ticketing_walkin` | `reception` | `createWalkIn` (refusé si `allowWalkIns` faux, comme à l'écran) |
| `ticketing_catering_sale` (remise d'un article, vente sur place) | `catering` | `deliverItem`/`recordOnsiteSale` |

`available(viewer)` = module `ticketing` actif **et** prédicat `ticketing` (manager ou rôle sur un
événement actif) ; `create_ticketing_event` exige en plus `ticketing:manage`. Le rôle **sur
l'événement visé** est vérifié dans `prepare` et au `confirm` : un observateur voit les outils
mais chaque aperçu lui répond « Vous n'avez pas ce rôle sur cet événement ».

**Désignation des objets** : l'assistant passe des identifiants obtenus par `ticketing_event` /
`ticketing_bookings` / `ticketing_accounts`. Pas de résolution par nom côté actions, sauf
`eventId` qui accepte aussi un titre (unique parmi `listEvents`, sinon refus listant les
candidats — spec « plusieurs événements au même nom »).

## Services / logique métier

- **Aucun nouveau service métier.** Deux ajustements :
  1. **`readinessChecks` passe dans le module** : déplacée de
     `src/app/(auth)/billetterie/[id]/_components/readiness.ts` vers
     `src/modules/ticketing/readiness.ts`, exportée par `@/modules/ticketing/schemas` (pure, sans
     Prisma). L'écran et l'assistant l'importent tous deux ; le test existant suit le fichier.
  2. **IBAN masqué** : `maskIban(iban)` (`FR76 •••• 1234`) dans `src/lib/iban.ts` (fonctions IBAN pures),
     appliqué à toute sortie MCP (lecture, aperçu, résultat). L'IBAN dicté n'apparaît en clair
     que dans l'entrée de l'outil, jamais dans une réponse.
- **Empreintes** (`fingerprint`) :
  - paramétrage : `updatedAt` de l'événement + l'objet visé (option, plat, poste, affectation) ;
  - paiements : `id`, `status`, `amount` de chaque paiement de la série ;
  - réservation : `status` et soldes de la réservation ;
  - statut : statut courant + résultat de `readinessChecks`.
- **Audit « via l'assistant IA »** : les services de billetterie journalisent déjà eux-mêmes. Pour
  ne pas doubler chaque entrée ni modifier quinze signatures, `src/lib/audit.ts` gagne un contexte
  `withAuditContext({ via: "mcp" }, fn)` (`AsyncLocalStorage`) fusionné dans `details` par
  `logAudit`. Le constructeur `eventAction` enveloppe chaque `execute`. Les services qui ne
  journalisent pas (paiements, réservations) reçoivent une entrée d'audit écrite par le
  constructeur, comme `serving.ts` aujourd'hui.
- **Notifications** : celles des services, inchangées (spec : « ni plus, ni moins »).
- **Module `mcp`** : `consumeConfirmation(grantId, action, token, now, { erase: true })` — option
  qui vide le payload de la ligne consommée une fois lu (voir « Risques », IBAN). Exportée par
  `@/modules/mcp`, sans effet pour les appelants actuels.

## Textes à mettre à jour

- `src/app/api/mcp/server/route.ts` : libellés des nouvelles actions dans `ACTION_LABELS`
  (instructions du serveur « Seules ces actions modifient Koinonia : … »).
- Page « Assistants IA connectés », `GuideContent.tsx`, fiche KB-111 de Nia, fiches billetterie
  d'`espaces.ts` : mention des actions de billetterie.
- `docs/auth.md` (section MCP) : levée de l'exclusion financière **pour la billetterie seule** ;
  `specs/081-serveur-mcp/spec.md` « Hors périmètre » renvoie à la spec 083.

## Décisions & alternatives écartées

- **Choix** : appeler les services du module avec les schémas des écrans — *Pourquoi* : une seule
  source de règles ; l'assistant hérite automatiquement de toute évolution de l'écran.
- **Choix** : constructeur local `eventAction` — *Pourquoi* : 14 paires identiques à 90 % ; sans
  lui, ~1 500 lignes de copier-coller où une vérification de droit oubliée passerait inaperçue.
  Reste local au fichier (pas de généralisation aux autres actions MCP).
- **Choix** : actions « par entité » avec `op` (`create`/`update`/`delete`) plutôt qu'une action
  par geste — *Pourquoi* : 14 paires au lieu d'une trentaine ; la liste d'outils exposée aux
  assistants reste lisible.
- **Choix** : contexte d'audit `AsyncLocalStorage` — *Pourquoi* : marque « via mcp » sans toucher
  aux signatures des services ni dupliquer les entrées. Interne à `src/lib/audit.ts`, réversible,
  sans effet hors de l'enveloppe : pas d'ADR.
- **Écarté** : appeler les routes HTTP de la billetterie depuis le serveur MCP — *Raison* : elles
  reposent sur `requireAuth()` (session navigateur) ; le serveur MCP a sa propre session.
- **Écarté** : une action « tout paramétrer d'un coup » — *Raison* : aperçu illisible et refus en
  bloc ; l'assistant enchaîne les étapes, chacune confirmée.
- **Écarté** : scan et compteur manuel par l'assistant — hors périmètre (spec).

## Livraison

Branche `feat/billetterie-assistant`, sous-PR par lot vers elle, PR finale vers `main`, puis
release v1.38.0 (avec PayPal, déjà sur `main`) :
1. socle (`eventAction`, audit contextuel, `readinessChecks` déplacée, `maskIban`) + lectures ;
2. création et paramétrage, options, plats, statut ;
3. équipe (rôles, postes, affectations) ;
4. paiements ;
5. réservations, ajout sur place, restauration ; textes et documentation.

## Risques & points d'attention

- **Nombre d'outils** : ~33 de plus pour un organisateur. Mitigé par `available` (aucun pour qui
  n'a pas la billetterie) et des descriptions courtes. À surveiller sur la qualité de choix des
  assistants.
- **`setRoles` remplace la liste** : l'aperçu doit montrer la liste finale complète ; empreinte
  sur la liste existante pour ne pas écraser un changement concurrent.
- **IBAN dans l'entrée** : il transite par la conversation de l'assistant, choix assumé par la
  spec. Vérifié : le journal des appels MCP (`McpCall`) ne stocke pas les arguments, et l'audit
  de `updateEvent` ne garde que les noms de champs. En revanche, le **payload de confirmation**
  (`McpConfirmation`) le contiendrait en clair jusqu'à la purge (expiration + 1 jour). Décision :
  le payload de `update_ticketing_event` garde l'IBAN normalisé (nécessaire à l'exécution) et
  `consumeConfirmation` n'est pas modifié ; à la confirmation, le constructeur **efface le
  payload** de la ligne consommée (`erase: true`) pour toutes les actions de billetterie. Une
  confirmation jamais consommée est purgée sous 1 jour + 5 min, comme aujourd'hui.
- **Clôture** irréversible côté rôles d'équipe : l'aperçu le dit explicitement.
- **Règles uniquement côté client** : « Prêt à ouvrir ? » n'est aujourd'hui vérifié qu'à l'écran ;
  l'assistant le vérifie côté serveur. L'écran ne change pas (hors périmètre).

## Stratégie de tests

Vitest, prisma mocké, sur le modèle de `src/app/api/mcp/__tests__/serving-actions.test.ts` :
- **Constructeur** : droit refusé à l'aperçu ; droit perdu entre aperçu et confirmation ; jeton
  expiré ; empreinte changée ⇒ `CHANGED` et service non appelé ; `ApiError` ⇒ refus lisible.
- **Matrice des rôles** : pour chaque action, organisateur / trésorier / accueil / restauration /
  observateur / sans rôle — proposé ou refusé exactement comme `EVENT_ACTIONS`.
- **Paiements** : série de 3 confirmée en une fois ; un paiement déjà traité ⇒ rien n'est fait ;
  au-delà de 50 ⇒ refus.
- **Statut** : ouverture refusée avec point bloquant ; clôture annonce la fin des rôles.
- **Données personnelles** : aucune sortie (lecture, aperçu, résultat) ne contient email,
  téléphone ni IBAN en clair (assertion sur le texte et le `structured`).
- **Audit** : `withAuditContext` ajoute `via: "mcp"` ; sans enveloppe, `details` inchangé.
- **Lectures** : `ticketing.myEvents` et `ticketing.paymentsToHandle` respectent `listEvents`
  (rôles actifs, pas d'événement clôturé pour un non-manager).
- `tools.test.ts` / `server.test.ts` : nouvelles clés dans la liste blanche et les libellés.
