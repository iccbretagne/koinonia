# Tâches — Billetterie : inscriptions, paiements et présences des événements

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
> Livraison en **un PR**, avec **un commit par lot** (1, 2, 3).

## Prérequis

- [ ] Branche de session repartie de `main` (après la fusion de la PR #709)
- [ ] Migration Prisma générée (schéma modifié)
- [ ] Dépendance `jsqr` (Apache-2.0) ajoutée (lot 2)

## Lot 1 — Événement, inscriptions, paiements, billets, rôles

### 1.1 Données & module

- [ ] **T1** — Enums et modèles `TicketingEvent`, `TicketingTariff`, `TicketingOption`,
  `TicketingVariant`, `TicketingBooking`, `TicketingParticipant`, `TicketingItem`,
  `TicketingPayment`, `TicketingEventRole`, avec les relations inverses (`Church`, `User`)
  *(fichier : `prisma/schema.prisma`)*
- [ ] **T2** — Migration `add_ticketing` (lot 1) et `prisma generate`, plus les mocks Prisma
  *(fichiers : `prisma/migrations/…_add_ticketing/`, `src/__mocks__/prisma.ts`)*
- [ ] **T3** — Manifeste `ticketing` :
  - routes authentifiées `/billetterie` et `/api/ticketing` ;
  - routes publiques `/inscription`, `/reservation`, `/billet` et `/api/ticketing/public` ;
  - permission `ticketing:manage` (SA, Admin, Secrétaire) ;
  - domaine de notification `ticketing` ;
  - ajout à `allManifests` (16 modules).

  *(fichiers : `src/modules/ticketing/manifest.ts`, `src/lib/manifests.ts`)*
- [ ] **T4** [P] — Schémas Zod purs :
  - paramétrage, tarifs, options et variantes (menu) ;
  - inscription, modification de réservation, déclaration de paiement, encaissement ;
  - rôles ;
  - libellés.

  *(fichier : `src/modules/ticketing/schemas.ts`)*
- [ ] **T5** — Gardes `getEventAccess` et `requireEventRole`, avec la matrice des actions
  *(fichier : `src/modules/ticketing/auth.ts`)*
- [ ] **T6** [P] — Jetons : génération, empreinte SHA-256, comparaison *(fichier :
  `src/modules/ticketing/services/tokens.ts`)*

### 1.2 Services

- [ ] **T7** — Événements : création (slug, préfixe), paramétrage, états, tarifs, options,
  rôles, `getPublicEvent` (places et stock restants) *(fichier : `services/events.ts`)*
- [ ] **T8** — Inscription `createBooking` (une transaction sous verrou) :
  - places, stock, date limite ;
  - règle des mineurs ;
  - prix figés, référence, jetons ;
  - lien vers un compte.

  *(fichier : `services/booking.ts`)*
- [ ] **T9** — Gestion par jeton : options jusqu'à la date limite, ajout de participant,
  renommage, téléphone, annulations avec états de remboursement, `recoverBooking` à réponse
  constante *(fichier : `services/booking.ts`)*
- [ ] **T10** — Paiements : `declarePayment`, `confirm`/`reject`, `recordReceipt` (éléments
  choisis), `markRefunded`, `balances` *(fichier : `services/payments.ts`)*
- [ ] **T11** — Emails et notifications :
  - gabarits : réservation, paiement confirmé ou refusé, relance, option libérée, rappel de la
    veille, annulation ;
  - `sendEmail` si le contact n'a pas de compte, sinon `createNotification` (domaine
    `ticketing`) ;
  - notifications du trésorier (déclaration) et de l'organisateur (places à moins de 10 %) ;
  - liste blanche `notifications-no-direct-email`.

  *(fichiers : `services/emails.ts`, `src/lib/email.ts`)*
- [ ] **T12** — Échéances (tâche cron `ticketing`, 15 min) : relance au délai réglé, libération
  sauf paiement sur place, rappel de la veille, purge après la durée de conservation
  *(fichiers : `services/deadlines.ts`, `src/app/api/cron/route.ts`)*
- [ ] **T13** [P] — Exports : participants, règlements, remboursements, options
  *(fichier : `services/exports.ts`)*
- [ ] **T14** — Index public du module *(fichier : `src/modules/ticketing/index.ts`)*

### 1.3 API

Chaque route a son `contract.ts`.

- [ ] **T15** — `/api/ticketing/events` (GET, POST) et `/events/[id]` (GET, PATCH)
- [ ] **T16** [P] — `/events/[id]/options` et `/options/[optionId]` (organisateur),
  `/events/[id]/roles`
- [ ] **T17** [P] — `/events/[id]/bookings`, `/bookings/[bookingId]`,
  `/payments/[paymentId]`, `/bookings/[bookingId]/receipts`
- [ ] **T18** [P] — `/events/[id]/export`, `/events/[id]/poster`, `/api/ticketing/my`
- [ ] **T19** — Routes publiques (Turnstile, débit) : `public/[churchSlug]/[eventSlug]` (GET),
  `…/bookings` (POST), `…/recover` (POST), `public/bookings/[token]` (GET, PATCH),
  `…/payment` (POST), `public/tickets/[token]` (GET)
- [ ] **T20** — `npm run openapi` *(fichier : `docs/openapi.json`)*

### 1.4 UI

- [ ] **T21** — Navigation : drapeau `hasTicketing` et « Billetterie » dans l'espace Agenda
  *(fichiers : `src/app/(auth)/layout.tsx`, `src/lib/navigation.ts`)*
- [ ] **T22** — `/billetterie` : liste des événements et « Créer un événement »
- [ ] **T23** — `/billetterie/[id]` : onglets Aperçu (lien public et QR), Paramètres (infos,
  jauge, tarifs, options et variantes, paiements, règles, mineurs, ajout sur place,
  conservation), Inscrits, Règlements, et Équipe (rôles)
- [ ] **T24** — Page publique d'inscription `/inscription/[churchSlug]/[eventSlug]` :
  formulaire par étapes, Turnstile, « Retrouver ma réservation »
- [ ] **T25** — Page publique `/reservation/[token]` :
  - récapitulatif et instructions de paiement ;
  - « J'ai payé » ;
  - billets et partage ;
  - modifications et annulations.
- [ ] **T26** [P] — Page publique `/billet/[token]` (billet seul et QR), et
  `/billetterie/mes-reservations`

### 1.5 Tests (lot 1)

- [ ] **T27** — `auth` : matrice des rôles, organisateur implicite, autre église en 404
- [ ] **T28** — `booking` :
  - places, stock, date limite, mineurs ;
  - prix figés, référence, jetons ;
  - modifications, annulations, remboursements ;
  - `recoverBooking`.
- [ ] **T29** — `payments` et `deadlines` : déclaration, confirmation, refus, encaissement
  partiel, relance, libération, rappel, purge
- [ ] **T30** — Routes publiques et authentifiées : jetons inconnus, billet seul, Turnstile,
  débit, brouillon invisible, 403/404, Zod
- [ ] **T31** — Matrices : `permissions.test` (`ticketing:manage`), `manifests`,
  `routes-exhaustivite`, `openapi`, liste blanche email, navigation
- [ ] **T32** — Commit « lot 1 »

## Lot 2 — Équipe et contrôle des présences

- [ ] **T33** — Modèles `TicketingPost`, `TicketingAssignment`, `TicketingPassage`, et migration
  *(fichiers : `prisma/schema.prisma`, migration `add_ticketing_presence`)*
- [ ] **T34** — Équipe : postes, affectations (membre ou invité), badges,
  `listAssignmentsForUser` *(fichier : `services/team.ts`)*
- [ ] **T35** — Instantané pour l'accueil (empreintes, sans coordonnées ni montants d'options)
  *(fichier : `services/snapshot.ts`)*
- [ ] **T36** — Synchronisation idempotente : passages, comptage manuel, ajout sur place,
  encaissement d'une entrée, anomalies, correction de l'horloge *(fichier : `services/sync.ts`)*
- [ ] **T37** — Présences : catégories, mineurs, seuils de 90 % et 100 % notifiés une fois,
  registre *(fichier : `services/presence.ts`)*
- [ ] **T38** — API : `/posts`, `/assignments`, `/snapshot`, `/sync`, `/presence`, et l'export
  `passages`
- [ ] **T39** — Client hors ligne :
  - file IndexedDB, empreinte via `crypto.subtle` ;
  - boucle de synchronisation ;
  - état du réseau.

  *(fichiers : `src/lib/offline/` ou `…/billetterie/[id]/_offline/`)*
- [ ] **T40** — Scanner : `BarcodeDetector`, sinon `jsqr` (caméra arrière), et décodage des
  codes (billet, réservation, badge, étiquette) *(fichier : `…/billetterie/[id]/_scanner/`)*
- [ ] **T41** — Écran `/billetterie/[id]/controle` :
  - modes Entrée, Sortie et Auto ;
  - résultat en vert, orange ou rouge ;
  - code de réservation avec cases à cocher ;
  - recherche par nom ;
  - ajout sur place ;
  - +1 / −1 avec motif ;
  - compteur et alerte de jauge ;
  - sortie d'un mineur non accompagné.
- [ ] **T42** — Onglets Équipe (postes, affectations, badges imprimables) et Présences
  (compteur, courbe, anomalies, registre) *(fichier : `…/billetterie/[id]/`)*
- [ ] **T43** — « Mon planning » : encart des affectations de billetterie, avec le badge
  *(fichier : `src/app/(auth)/planning/…`)*
- [ ] **T44** — Service worker : `/_next/static` en cache d'abord, cache `koinonia-v6`
  *(fichier : `public/sw.js`)*
- [ ] **T45** — ADR-0026 « Écrans utilisables hors ligne », et son entrée dans l'index
  *(fichiers : `docs/adr/0026-…md`, `docs/adr/README.md`)*
- [ ] **T46** — Tests :
  - `team`, `snapshot` (aucune donnée sensible pour l'accueil) ;
  - `sync` (idempotence, désordre, anomalie, ajout sur place) ;
  - `presence` (catégories, seuils) ;
  - file hors ligne et empreinte ;
  - routes du lot 2.
- [ ] **T47** — Commit « lot 2 »

## Lot 3 — Restauration (Agapé)

- [ ] **T48** — Champs du menu et des étiquettes (`namedPrep`, variante : description,
  allergènes, préparés, fermeture ; élément : code d'étiquette, versions) et migration
  `add_ticketing_catering`, plus le modèle `TicketingOnsiteSale`
- [ ] **T49** — Menu par la restauration : variantes, allergènes, stock et fermeture, avec ses
  limites (plat réservé non supprimable, stock jamais sous le réservé, champs réservés à
  l'organisateur) et l'audit *(fichier : `services/menu.ts`)*
- [ ] **T50** — Restauration : à préparer par variante, stock en direct, remise avec
  encaissement, vente sur place, non retirés ; instantané `catering` et opérations de
  synchronisation `delivery` et `onsiteSale` *(fichiers : `services/catering.ts`,
  `snapshot.ts`, `sync.ts`)*
- [ ] **T51** — Étiquettes : sélections (tout, plat, réservation, modifiées), contenu, code
  d'étiquette, `markPrinted`, incrément de `labelVersion` *(fichier : `services/labels.ts`)*
- [ ] **T52** — API : `/options/[optionId]/variants`, `/variants/[variantId]`, `/labels`
- [ ] **T53** — Écran `/billetterie/[id]/restauration` :
  - onglet Distribution : scan, fiche, « Remis » avec encaissement, vente sur place, hors ligne,
    badge « étiquette à refaire » ;
  - onglet Menu ;
  - onglet Stock.
- [ ] **T54** — Page d'impression `/billetterie/[id]/etiquettes` : formats de planche A4,
  `@media print`, QR facultatif, et « marquer imprimées »
- [ ] **T55** — Onglet Restauration du tableau de bord : à préparer, stock, non retirés, ventes
  sur place
- [ ] **T56** — Tests :
  - `menu` (droits, limites, audit) ;
  - `catering` (stock, remise, vente sur place) ;
  - `labels` (sélections, « à régler », étiquette périmée, code refusé au contrôle) ;
  - routes du lot 3.
- [ ] **T57** — Commit « lot 3 »

## Documentation

- [ ] **T58** — Documentation :
  - `CLAUDE.md` : tableau des permissions et spécificités de la billetterie ;
  - `docs/auth.md` ;
  - `docs/database.md` ;
  - guide utilisateur ;
  - `CHANGELOG.md`.

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries` et `npm run lint:prisma-boundary`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
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
