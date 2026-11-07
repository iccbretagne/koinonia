# Tâches — Billetterie : inscriptions, paiements et présences des événements

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
> Livraison en **un PR**, avec **un commit par lot** (1, 2, 3).

## Prérequis

- [x] Branche de session repartie de `main` (après la fusion de la PR #709)
- [x] Migration Prisma générée (schéma modifié) — une seule migration `add_ticketing` porte les tables des trois lots
- [x] Dépendance `jsqr` (Apache-2.0) ajoutée (lot 2)

## Lot 1 — Événement, inscriptions, paiements, billets, rôles

### 1.1 Données & module

- [x] **T1** — Enums et modèles `TicketingEvent`, `TicketingTariff`, `TicketingOption`,
  `TicketingVariant`, `TicketingBooking`, `TicketingParticipant`, `TicketingItem`,
  `TicketingPayment`, `TicketingEventRole`, avec les relations inverses (`Church`, `User`)
  *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Migration `add_ticketing` (lot 1) et `prisma generate`, plus les mocks Prisma
  *(fichiers : `prisma/migrations/…_add_ticketing/`, `src/__mocks__/prisma.ts`)*
- [x] **T3** — Manifeste `ticketing` :
  - routes authentifiées `/billetterie` et `/api/ticketing` ;
  - routes publiques `/inscription`, `/reservation`, `/billet` et `/api/ticketing/public` ;
  - permission `ticketing:manage` (SA, Admin, Secrétaire) ;
  - domaine de notification `ticketing` ;
  - ajout à `allManifests` (16 modules).

  *(fichiers : `src/modules/ticketing/manifest.ts`, `src/lib/manifests.ts`)*
- [x] **T4** [P] — Schémas Zod purs :
  - paramétrage, tarifs, options et variantes (menu) ;
  - inscription, modification de réservation, déclaration de paiement, encaissement ;
  - rôles ;
  - libellés.

  *(fichier : `src/modules/ticketing/schemas.ts`)*
- [x] **T5** — Gardes `getEventAccess` et `requireEventRole`, avec la matrice des actions
  *(fichier : `src/modules/ticketing/auth.ts`)*
- [x] **T6** [P] — Jetons : génération, empreinte SHA-256, comparaison *(fichier :
  `src/modules/ticketing/services/tokens.ts`)*

### 1.2 Services

- [x] **T7** — Événements : création (slug, préfixe), paramétrage, états, tarifs, options,
  rôles, `getPublicEvent` (places et stock restants) *(fichier : `services/events.ts`)*
- [x] **T8** — Inscription `createBooking` (une transaction sous verrou) :
  - places, stock, date limite ;
  - règle des mineurs ;
  - prix figés, référence, jetons ;
  - lien vers un compte.

  *(fichier : `services/booking.ts`)*
- [x] **T9** — Gestion par jeton : options jusqu'à la date limite, ajout de participant,
  renommage, téléphone, annulations avec états de remboursement, `recoverBooking` à réponse
  constante *(fichier : `services/booking.ts`)*
- [x] **T10** — Paiements : `declarePayment`, `confirm`/`reject`, `recordReceipt` (éléments
  choisis), `markRefunded`, `balances` *(fichier : `services/payments.ts`)*
- [x] **T11** — Emails et notifications :
  - gabarits : réservation, paiement confirmé ou refusé, relance, option libérée, rappel de la
    veille, annulation ;
  - `sendEmail` si le contact n'a pas de compte, sinon `createNotification` (domaine
    `ticketing`) ;
  - notifications du trésorier (déclaration) et de l'organisateur (places à moins de 10 %) ;
  - liste blanche `notifications-no-direct-email`.

  *(fichiers : `services/emails.ts`, `src/lib/email.ts`)*
- [x] **T12** — Échéances (tâche cron `ticketing`, 15 min) : relance au délai réglé, libération
  sauf paiement sur place, rappel de la veille, purge après la durée de conservation
  *(fichiers : `services/deadlines.ts`, `src/app/api/cron/route.ts`)*
- [x] **T13** [P] — Exports : participants, règlements, remboursements, options
  *(fichier : `services/exports.ts`)*
- [x] **T14** — Index public du module *(fichier : `src/modules/ticketing/index.ts`)*

### 1.3 API

Chaque route a son `contract.ts`.

- [x] **T15** — `/api/ticketing/events` (GET, POST) et `/events/[id]` (GET, PATCH)
- [x] **T16** [P] — `/events/[id]/options` et `/options/[optionId]` (organisateur),
  `/events/[id]/roles`
- [x] **T17** [P] — `/events/[id]/bookings`, `/bookings/[bookingId]`,
  `/payments/[paymentId]`, `/bookings/[bookingId]/receipts`
- [x] **T18** [P] — `/events/[id]/export`, `/events/[id]/poster`, `/api/ticketing/my`
- [x] **T19** — Routes publiques (Turnstile, débit) : `public/[churchSlug]/[eventSlug]` (GET),
  `…/bookings` (POST), `…/recover` (POST), `public/bookings/[token]` (GET, PATCH),
  `…/payment` (POST), `public/tickets/[token]` (GET)
- [x] **T20** — `npm run openapi` *(fichier : `docs/openapi.json`)*

### 1.4 UI

- [x] **T21** — Navigation : drapeau `hasTicketing` et « Billetterie » dans l'espace Agenda
  *(fichiers : `src/app/(auth)/layout.tsx`, `src/lib/navigation.ts`)*
- [x] **T22** — `/billetterie` : liste des événements et « Créer un événement »
- [x] **T23** — `/billetterie/[id]` : onglets Aperçu (lien public et QR), Paramètres (infos,
  jauge, tarifs, options et variantes, paiements, règles, mineurs, ajout sur place,
  conservation), Inscrits, Règlements, et Équipe (rôles)
- [x] **T24** — Page publique d'inscription `/inscription/[churchSlug]/[eventSlug]` :
  formulaire par étapes, Turnstile, « Retrouver ma réservation »
- [x] **T25** — Page publique `/reservation/[token]` :
  - récapitulatif et instructions de paiement ;
  - « J'ai payé » ;
  - billets et partage ;
  - modifications et annulations.
- [x] **T26** [P] — Page publique `/billet/[token]` (billet seul et QR), et
  `/billetterie/mes-reservations`

### 1.5 Tests (lot 1)

- [x] **T27** — `auth` : matrice des rôles, organisateur implicite, autre église en 404
- [x] **T28** — `booking` :
  - places, stock, date limite, mineurs ;
  - prix figés, référence, jetons ;
  - modifications, annulations, remboursements ;
  - `recoverBooking`.
- [x] **T29** — `payments` et `deadlines` : déclaration, confirmation, refus, encaissement
  partiel, relance, libération, rappel, purge
- [x] **T30** — Routes publiques et authentifiées : jetons inconnus, billet seul, Turnstile,
  débit, brouillon invisible, 403/404, Zod
- [x] **T31** — Matrices : `permissions.test` (`ticketing:manage`), `manifests`,
  `routes-exhaustivite`, `openapi`, liste blanche email, navigation
- [x] **T32** — Commit « lot 1 »

## Lot 2 — Équipe et contrôle des présences

- [x] **T33** — Modèles `TicketingPost`, `TicketingAssignment`, `TicketingPassage`, et migration
  *(fichiers : `prisma/schema.prisma`, migration `add_ticketing_presence`)*
- [x] **T34** — Équipe : postes, affectations (membre ou invité), badges,
  `listAssignmentsForUser` *(fichier : `services/team.ts`)*
- [x] **T35** — Instantané pour l'accueil (empreintes, sans coordonnées ni montants d'options)
  *(fichier : `services/snapshot.ts`)*
- [x] **T36** — Synchronisation idempotente : passages, comptage manuel, ajout sur place,
  encaissement d'une entrée, anomalies, correction de l'horloge *(fichier : `services/sync.ts`)*
- [x] **T37** — Présences : catégories, mineurs, seuils de 90 % et 100 % notifiés une fois,
  registre *(fichier : `services/presence.ts`)*
- [x] **T38** — API : `/posts`, `/assignments`, `/snapshot`, `/sync`, `/presence`, et l'export
  `passages`
- [x] **T39** — Client hors ligne :
  - file IndexedDB, empreinte via `crypto.subtle` ;
  - boucle de synchronisation ;
  - état du réseau.

  *(fichiers : `src/lib/offline/` ou `…/billetterie/[id]/_offline/`)*
- [x] **T40** — Scanner : `BarcodeDetector`, sinon `jsqr` (caméra arrière), et décodage des
  codes (billet, réservation, badge, étiquette) *(fichier : `…/billetterie/[id]/_scanner/`)*
- [x] **T41** — Écran `/billetterie/[id]/controle` :
  - modes Entrée, Sortie et Auto ;
  - résultat en vert, orange ou rouge ;
  - code de réservation avec cases à cocher ;
  - recherche par nom ;
  - ajout sur place ;
  - +1 / −1 avec motif ;
  - compteur et alerte de jauge ;
  - sortie d'un mineur non accompagné.
- [x] **T42** — Onglets Équipe (postes, affectations, badges imprimables) et Présences
  (compteur, courbe, anomalies, registre) *(fichier : `…/billetterie/[id]/`)*
- [x] **T43** — « Mon planning » : encart des affectations de billetterie, avec le badge
  *(fichier : `src/app/(auth)/planning/…`)*
- [x] **T44** — Service worker : `/_next/static` en cache d'abord, cache `koinonia-v6`
  *(fichier : `public/sw.js`)*
- [x] **T45** — ADR-0026 « Écrans utilisables hors ligne », et son entrée dans l'index
  *(fichiers : `docs/adr/0026-…md`, `docs/adr/README.md`)*
- [x] **T46** — Tests :
  - `team`, `snapshot` (aucune donnée sensible pour l'accueil) ;
  - `sync` (idempotence, désordre, anomalie, ajout sur place) ;
  - `presence` (catégories, seuils) ;
  - file hors ligne et empreinte ;
  - routes du lot 2.
- [x] **T47** — Commit « lot 2 »

## Lot 3 — Restauration (Agapé)

- [x] **T48** — Champs du menu et des étiquettes (`namedPrep`, variante : description,
  allergènes, préparés, fermeture ; élément : code d'étiquette, versions) et migration
  `add_ticketing_catering`, plus le modèle `TicketingOnsiteSale`
- [x] **T49** — Menu par la restauration : variantes, allergènes, stock et fermeture, avec ses
  limites (plat réservé non supprimable, stock jamais sous le réservé, champs réservés à
  l'organisateur) et l'audit *(fichier : `services/menu.ts`)*
- [x] **T50** — Restauration : à préparer par variante, stock en direct, remise avec
  encaissement, vente sur place, non retirés ; instantané `catering` et opérations de
  synchronisation `delivery` et `onsiteSale` *(fichiers : `services/catering.ts`,
  `snapshot.ts`, `sync.ts`)*
- [x] **T51** — Étiquettes : sélections (tout, plat, réservation, modifiées), contenu, code
  d'étiquette, `markPrinted`, incrément de `labelVersion` *(fichier : `services/labels.ts`)*
- [x] **T52** — API : `/options/[optionId]/variants`, `/variants/[variantId]`, `/labels`
- [x] **T53** — Écran `/billetterie/[id]/restauration` :
  - onglet Distribution : scan, fiche, « Remis » avec encaissement, vente sur place, hors ligne,
    badge « étiquette à refaire » ;
  - onglet Menu ;
  - onglet Stock.
- [x] **T54** — Page d'impression `/billetterie/[id]/etiquettes` : formats de planche A4,
  `@media print`, QR facultatif, et « marquer imprimées »
- [x] **T55** — Onglet Restauration du tableau de bord : à préparer, stock, non retirés, ventes
  sur place
- [x] **T56** — Tests :
  - `menu` (droits, limites, audit) ;
  - `catering` (stock, remise, vente sur place) ;
  - `labels` (sélections, « à régler », étiquette périmée, code refusé au contrôle) ;
  - routes du lot 3.
- [x] **T57** — Commit « lot 3 »

## Documentation

- [x] **T58** — Documentation :
  - `CLAUDE.md` : tableau des permissions et spécificités de la billetterie ;
  - `docs/auth.md` ;
  - `docs/database.md` ;
  - guide utilisateur ;
  - `CHANGELOG.md`.

## Évolutions après livraison (6 novembre 2026)

- [x] **T59** — Groupes d'options au choix unique : `choiceGroup` et migration, règle dans
  `planSelections`, contrôles d'organisation (`checkChoiceGroup`), champ dans la fiche option,
  `OptionList` sur le formulaire public et « Ma réservation » ; tests `rules.test.ts`,
  `option-groups.test.ts`.
- [x] **T60** — Planning de l'équipe : `PATCH` d'une affectation (`updateAssignment`), comptes avec
  départements et liste des départements, vue par poste, renommage de poste, filtre et recherche ;
  test `team-planning.test.ts`.
- [x] **T61** — Documentation : spec, plan, `docs/database.md`, guide utilisateur, fiches de
  l'assistant (KB-145, KB-146), `CHANGELOG.md`, `docs/openapi.json`.

- [x] **T62** — Ergonomie de la préparation : onglet Options et `DishList`, fenêtre d'option à
  exemples, checklist d'ouverture (`readiness.ts`, test `readiness.test.ts`), paramètres
  repliables, menu compact côté restauration ; documentation (spec, plan, fiche KB-145,
  `CHANGELOG.md`).

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries` et `npm run lint:prisma-boundary`
- [x] `npm run test`
- [x] `npm run build`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] Commit et push, déploiement en staging, PR vers `main`

## Couverture des critères d'acceptation

| Critère | Tâches |
|---|---|
| Création réservée à SA, Admin et Secrétaire | T3, T5, T15, T27, T31 |
| Rôles d'événement attribués, accès limité au rôle | T5, T7, T16, T23, T27 |
| Concert gratuit, repas payants, entrée payante | T7, T23, T28 |
| Gestion de la réservation par lien ou par « retrouver », billet seul sans droits | T9, T19, T25, T26, T28, T30 |
| « Retrouver » à réponse constante | T9, T19, T30 |
| Inscription de 4 personnes, billets transmissibles, instructions | T8, T11, T24–T26, T28 |
| Places et stock jamais dépassés | T8, T28 |
| Mineurs : adulte requis, ou responsable légal | T8, T24, T28 |
| « J'ai payé », confirmation ou refus avec motif | T10, T11, T17, T25, T29 |
| Encaissement espèces ou chèque | T10, T17, T29 |
| Relance, puis libération sauf paiement sur place | T12, T29 |
| Annulation, places et stock rendus, remboursement ou avertissement | T9, T25, T28 |
| Aucune donnée bancaire de l'église | T4, T7, T23 |
| Exports participants, règlements, options | T13, T18 |
| Postes, affectations, « Mon planning », badges | T34, T38, T42, T43 |
| Entrées décalées, compteur exact | T36, T37, T41, T46 |
| Double entrée sans double comptage, billet annulé ou d'un autre événement refusé | T36, T41, T46 |
| Hors ligne puis synchronisation sans doublon | T36, T39, T44, T46 |
| Équipe et intervenants comptés à part | T37, T46 |
| Alerte de jauge à 90 % et 100 % | T37, T41, T46 |
| Sortie d'un mineur non accompagné signalée | T35, T41 |
| Accueil sans coordonnées ni montants | T35, T46 |
| Registre exportable | T37, T38 |
| Distribution : scan, paiement, « Remis », hors ligne | T50, T53, T56 |
| Stock en direct, vente sur place | T50, T53, T56 |
| À préparer par variante | T50, T55 |
| Menu composé par la restauration, avec ses limites | T49, T52, T53, T56 |
| Étiquettes : sélections, étiquette périmée signalée | T51, T54, T53, T56 |
| Code d'étiquette refusé au contrôle | T36, T51, T56 |
| Module désactivé, puis réactivé intact | T3, T21, T31 |
| Aucune fuite entre églises | T5, T27, T30 |
| Purge après la durée de conservation | T12, T29 |
