# Plan technique — Billetterie : inscriptions, paiements et présences des événements

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-11-03

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe que `@/modules/ticketing`, `@/modules/ticketing/auth` et `@/modules/ticketing/schemas`
- [x] **Sécurité** :
  - routes authentifiées protégées par `requireCurrentChurchPermission("ticketing:manage")` (création, liste) ou par `requireEventRole(eventId, roles)` (garde du module, sur l'église **de l'événement**) ;
  - routes publiques déclarées en `routes.public`, avec jeton secret, limite de débit et Turnstile ;
  - `churchId` toujours explicite.
- [x] **Permissions** via `rolePermissions` : nouvelle permission `ticketing:manage` ; les rôles d'événement sont des données, vérifiées objet par objet
- [x] **Validation** Zod sur toutes les mutations (`schemas.ts`, contrats)
- [x] **Migration** Prisma `add_ticketing` (pas de `db push`)
- [x] **Enums** depuis `@/generated/prisma/enums` / `client`
- [x] **UI** : `PageHeader`, `Tabs`, `DataTable`, `Modal`/`BottomSheet`, `Field`, `StatusChip`, `FilterChip`, `EmptyState`, `ConfirmModal`, `useToast`
- [x] **ADR** : un nouvel ADR-0026, « Écrans utilisables hors ligne », pour un patron durable (voir Décisions)

## Approche générale

Un **nouveau module `ticketing`** (« Billetterie » à l'écran), qui dépend de `core` et de
`planning` pour les affectations dans « Mon planning ». Il se désactive avec `ENABLED_MODULES`.

Il porte trois familles d'écrans :
1. **Gestion** (authentifiée, `/billetterie`) : liste des événements, tableau de bord à onglets,
   puis deux écrans de terrain, **Contrôle** et **Restauration**, conçus pour le téléphone et
   utilisables **hors ligne**.
2. **Public**, sans compte :
   - inscription : `/inscription/<église>/<événement>` ;
   - « Ma réservation » : `/reservation/<jeton>` ;
   - billet : `/billet/<jeton>`.
3. **« Mon planning »** et « Mes réservations » : lecture des affectations et des réservations
   de l'utilisateur connecté.

**Jetons secrets** : chaque accès sans compte repose sur un jeton aléatoire de 64 caractères
hexadécimaux (`generateToken`, module `storage`). On ne stocke en base que son **empreinte
SHA-256**. Quatre jetons distincts :
- **gestion** de la réservation (lien « Ma réservation ») ;
- **scan** de la réservation (code de groupe) ;
- **billet** d'un participant ;
- **badge** d'un membre de l'équipe.

Le jeton de gestion n'apparaît jamais dans un QR, et le jeton de scan ne donne aucun droit de
modification.

**Hors ligne** : les écrans de terrain téléchargent un **instantané** de l'événement, qui ne
contient que des empreintes, aucun jeton. Ils valident un QR en calculant son empreinte sur
l'appareil (`crypto.subtle`). Ils mettent les opérations en **file locale** (IndexedDB) et les
**synchronisent** par un point d'entrée idempotent, chaque opération portant un identifiant
généré par l'appareil.

## Modèle de données

Migration `add_ticketing`. Montants en `Decimal(10,2)`, comme la comptabilité. Toutes les tables
portent `eventId`, et l'événement porte `churchId`.

```prisma
enum TicketingEventStatus { DRAFT OPEN CLOSED ARCHIVED }   // « complet » est calculé
enum TicketingAgeGroup { ADULT TEEN CHILD INFANT }         // adulte, 12–17, enfant, < 3 ans
enum TicketingOptionType { CHOICE QUANTITY CHECKBOX }
enum TicketingOptionScope { PARTICIPANT BOOKING }
enum TicketingChargeStatus { FREE DUE DECLARED PAID REFUND_DUE REFUNDED RELEASED CANCELLED }
enum TicketingRole { ORGANIZER TREASURER RECEPTION CATERING OBSERVER }
enum TicketingPaymentKind { DECLARATION RECEIPT REFUND }
enum TicketingPaymentStatus { PENDING CONFIRMED REJECTED }
enum TicketingPassageSubject { PARTICIPANT STAFF MANUAL }
enum TicketingDirection { IN OUT }

model TicketingEvent {
  id, churchId, slug (unique par église), title, description Text?, location?, posterKey?,
  startsAt, endsAt, registrationDeadline?, capacity Int (jauge), seatsOpen Int,
  status TicketingEventStatus @default(DRAFT),
  paymentMethods Json        // { wero?: {target}, revolut?: {link}, transfer?: {iban, holder}, onsite: bool }
  optionPaymentDeadline DateTime?, reminderDaysBefore Int @default(3),
  allowOnsitePayment Boolean, allowUnaccompaniedMinors Boolean, allowWalkIns Boolean,
  questions Json             // [{ id, label, required }]
  referencePrefix VarChar(8), nextReference Int @default(1),
  retentionDays Int @default(90), closedAt?, purgedAt?, createdById?, timestamps
}
model TicketingTariff   { id, eventId, ageGroup, price Decimal, @@unique([eventId, ageGroup]) }
model TicketingOption   { id, eventId, label, type, scope, price Decimal, stock Int?, pickup Boolean,
                          refundable Boolean, refundDeadline DateTime?, position }
model TicketingVariant  { id, optionId, label, stock Int?, prepared Int?, position }   // CHOICE ; préparés : Agapé
model TicketingBooking  {
  id, eventId, reference (unique par événement), contactName, contactEmail, contactPhone?,
  userId?                    // compte dont l'email correspond, pour « Mes réservations »
  guardianName?, guardianPhone?, guardianConsentAt?,   // mineur non accompagné
  answers Json, source (ONLINE | ONSITE),
  manageTokenHash @unique, scanTokenHash @unique,
  status (ACTIVE | CANCELLED), reminderSentAt?, dayBeforeSentAt?, timestamps
}
model TicketingParticipant {
  id, bookingId, firstName, lastName, ageGroup, ticketTokenHash @unique,
  status (ACTIVE | CANCELLED), entryPrice Decimal, entryStatus TicketingChargeStatus
}
model TicketingItem {        // option choisie, par participant ou par réservation
  id, bookingId, participantId?, optionId, variantId?, quantity Int, unitPrice Decimal,
  status TicketingChargeStatus, deliveredQty Int @default(0), deliveredAt?, deliveredById?
}
model TicketingPayment {     // déclaration, encaissement, remboursement
  id, bookingId, kind, status, method (WERO | REVOLUT | TRANSFER | CASH | CHEQUE),
  amount Decimal, chargeRefs Json,   // [{ type: "entry" | "item", id }] couverts
  reason?, recordedById?, confirmedById?, confirmedAt?, timestamps
}
model TicketingEventRole { id, eventId, userId, role TicketingRole, @@unique([eventId, userId, role]) }
model TicketingPost      { id, eventId, name, position }
model TicketingAssignment {
  id, eventId, postId?, userId?, guestName?,   // membre de l'église, ou intervenant sans compte
  startsAt?, endsAt?, badgeTokenHash @unique, timestamps
}
model TicketingPassage {
  id String @id               // identifiant généré par l'appareil : idempotence
  eventId, subject TicketingPassageSubject, participantId?, assignmentId?,
  direction TicketingDirection, delta Int @default(1), reason?,  // MANUAL : +1 / −1 et motif
  deviceId, operatorId?, gate?, scannedAt (horloge de l'appareil), receivedAt @default(now()),
  anomaly Boolean @default(false)
  @@index([eventId, scannedAt])
}
model TicketingOnsiteSale { id String @id, eventId, optionId, variantId?, quantity, amount, method,
                            soldById?, soldAt }   // vente sur place (Agapé), idempotente
```

**États de paiement par élément.** Chaque élément payant porte son état :
- `entryStatus` pour l'entrée d'un participant ;
- `status` pour un `TicketingItem`.

Le prix est figé à l'inscription. Une déclaration « J'ai payé » couvre les éléments **dus à cet
instant** (`chargeRefs`) :
- **confirmer** la déclaration les passe à `PAID` ;
- **refuser** la déclaration les remet à `DUE`.

Un encaissement direct (espèces ou chèque, à la porte ou au retrait) porte sur les éléments
cochés par l'agent. On n'a donc jamais à répartir un montant après coup.

## Accès

`src/modules/ticketing/auth.ts` :
- `getEventAccess(session, eventId)` lit l'événement et son église, puis renvoie
  `{ churchId, roles: Set<TicketingRole> }`. Un détenteur de `ticketing:manage` dans l'église
  de l'événement, ou un Super Admin, a implicitement `ORGANIZER`.
- `requireEventRole(eventId, allowed[])` lève `FORBIDDEN` si aucun rôle permis. Un événement
  d'une autre église, ou introuvable, répond `404`.
- Matrice des actions, appliquée dans les services et vérifiée par les tests :

| Action | Rôles d'événement |
|---|---|
| paramétrer, rôles, équipe | ORGANIZER |
| règlements, remboursements | ORGANIZER, TREASURER |
| contrôle d'accès, ajout sur place | ORGANIZER, RECEPTION |
| distribution, stock | ORGANIZER, CATERING |
| tableaux en lecture | tous les rôles |

- **Données servies à RECEPTION** : nom, tranche d'âge, état « à régler » de l'entrée, et
  téléphone du responsable légal pour un mineur non accompagné. Jamais l'email, le téléphone du
  contact ni les montants des options.

Nouvelle permission `ticketing:manage` : Super Admin, Admin, Secrétaire. Il faut mettre à jour
la matrice figée, `CLAUDE.md` et `docs/auth.md`.

## Services (`src/modules/ticketing/services/`)

- **`events.ts`**
  - création (slug, préfixe de référence) et mise à jour du paramétrage ;
  - changements d'état ;
  - tarifs, options et variantes ;
  - rôles d'événement ;
  - `getPublicEvent(churchSlug, eventSlug)`, qui renvoie seulement l'événement `OPEN` ou
    `CLOSED`, avec les places et le stock restants.
- **`booking.ts`**
  - **`createBooking`** (public), en une transaction :
    - contrôles : événement ouvert, date limite, places et stock ;
    - règle des mineurs, avec le responsable légal exigé si besoin ;
    - prix figés ;
    - référence `PREFIX-0042` (compteur incrémenté) ;
    - jetons créés, et leurs empreintes enregistrées ;
    - lien vers un compte si l'email correspond.

    Les contrôles de places et de stock se font sous verrou de l'événement (`SELECT … FOR UPDATE`
    par une mise à jour de son compteur), pour qu'il n'y ait pas de survente concurrente.
  - **gestion par jeton** : `getBookingByManageToken`, `updateOptions` (jusqu'à la date limite),
    `addParticipant`, `renameParticipant` (jusqu'au début), `updatePhone`, `cancelParticipant`,
    `cancelBooking`.
  - **`recoverBooking(email)`** : renvoie les liens de gestion de toutes les réservations de cet
    email pour l'événement. La réponse est toujours identique, et le débit est limité.
  - **annulation** : places et stock rendus, et état de chaque élément selon ses règles :
    - `PAID` remboursable dans le délai : `REFUND_DUE` ;
    - `PAID` hors délai : reste `PAID`, marqué non remboursé ;
    - `DUE` ou `DECLARED` : `CANCELLED`.
- **`payments.ts`**
  - `declarePayment` (public, jeton de gestion) ;
  - `confirm` et `reject` (trésorier) ;
  - `recordReceipt` (encaissement direct sur les éléments choisis) ;
  - `markRefunded` ;
  - `balances` (dû, déclaré, payé, reste).
- **`deadlines.ts`** (tâche cron `ticketing`, toutes les 15 minutes)
  - relance à `optionPaymentDeadline − reminderDaysBefore`, une seule fois (`reminderSentAt`) ;
  - à la date limite, éléments `DUE` des options passés à `RELEASED`, sauf si
    `allowOnsitePayment` ; stock rendu ; email au participant ;
  - rappel la veille (`dayBeforeSentAt`) ;
  - purge des données nominatives après `closedAt + retentionDays` : noms, contacts et réponses
    anonymisés, compteurs gardés, puis `purgedAt`.
- **`team.ts`** : postes, affectations (membre de l'église ou invité nommé) et badges ;
  `listAssignmentsForUser(userId)` pour « Mon planning ».
- **`snapshot.ts`** : instantané pour un rôle de terrain (`RECEPTION` ou `CATERING`).
  - participants actifs : id, nom, tranche d'âge, empreinte du billet, empreinte du code de la
    réservation, état de l'entrée, mineur seul et téléphone du responsable ;
  - badges : empreinte, nom, poste ;
  - présence courante de chaque sujet ;
  - pour `CATERING` : éléments « à retirer » de chaque participant et de chaque réservation,
    avec leur état de paiement, et le stock par variante ;
  - version et horodatage.
- **`sync.ts`** : `applyOperations(eventId, deviceId, ops[])`, idempotent par `op.id`.
  - opérations : `passage`, `manual`, `walkin` (réservation `ONSITE` et encaissement),
    `delivery`, `onsiteSale`, `receipt` ;
  - un passage incohérent (entrée d'un sujet déjà à l'intérieur selon `scannedAt`) est gardé et
    marqué `anomaly`, puis signalé à l'organisateur ;
  - renvoie l'état mis à jour : compteur, présences, stock.
- **`presence.ts`** : présents par catégorie, calculés à partir des passages dans l'ordre de
  `scannedAt`. Le dernier sens de chaque sujet compte, et on ajoute la somme des `MANUAL`.
  `capacityLevel` vaut `ok`, `90` ou `100`. Une notification à l'organisateur part au premier
  franchissement des 90 % et des 100 %.
- **`catering.ts`** : à préparer par variante (payés et dus), stock en direct, non retirés.
- **`exports.ts`** (`exceljs`) : participants, règlements, remboursements, options, registre
  des passages.
- **`emails.ts`** : gabarits en `buildXxxEmail` (`@/lib/email`).
  - **contact sans compte** : `sendEmail` direct, dans la liste blanche (« destinataire sans
    compte », comme les formulaires publics) ;
  - **contact lié à un compte** : `createNotification` dans le domaine `ticketing`, avec le même
    contenu, pour respecter sa préférence d'email.

## API

Toutes les routes ont leur `contract.ts`, et `npm run openapi` est relancé.

**Authentifiées** (`/api/ticketing`)

| Endpoint | Méthode | Accès |
|---|---|---|
| `/api/ticketing/events` | GET, POST | `ticketing:manage` (église courante) ; GET liste aussi les événements où l'on a un rôle |
| `/api/ticketing/events/[id]` | GET, PATCH | rôle ; PATCH : ORGANIZER |
| `…/[id]/options`, `…/options/[optionId]` | POST, PATCH, DELETE | ORGANIZER |
| `…/[id]/roles` | GET, PUT | ORGANIZER |
| `…/[id]/bookings` | GET | ORGANIZER, TREASURER, OBSERVER (données réduites pour OBSERVER) |
| `…/[id]/bookings/[bookingId]` | GET, PATCH (annulation par l'organisateur) | ORGANIZER, TREASURER |
| `…/[id]/payments/[paymentId]` | PATCH (`confirm`, `reject`, `refunded`) | TREASURER, ORGANIZER |
| `…/[id]/bookings/[bookingId]/receipts` | POST (encaissement direct) | TREASURER, ORGANIZER, RECEPTION (entrée), CATERING (options à retirer) |
| `…/[id]/posts`, `…/[id]/assignments` | CRUD | ORGANIZER |
| `…/[id]/snapshot` | GET `?for=reception\|catering` | RECEPTION ou CATERING (et ORGANIZER) |
| `…/[id]/sync` | POST | RECEPTION ou CATERING selon les opérations |
| `…/[id]/presence` | GET | tous les rôles |
| `…/[id]/variants/[variantId]` | PATCH (`prepared`) | CATERING, ORGANIZER |
| `…/[id]/export` | GET `?type=participants\|payments\|options\|passages` | ORGANIZER ; TREASURER pour les règlements |
| `…/[id]/poster` | GET, PUT, DELETE | lecture publique si l'événement est publié ; écriture ORGANIZER |
| `/api/ticketing/my` | GET | session : mes réservations et mes affectations |

**Publiques** (`/api/ticketing/public`, en `routes.public`)

| Endpoint | Méthode | Protection |
|---|---|---|
| `/public/[churchSlug]/[eventSlug]` | GET | événement publié uniquement |
| `/public/[churchSlug]/[eventSlug]/bookings` | POST | Turnstile, débit 5/min/IP |
| `/public/[churchSlug]/[eventSlug]/recover` | POST | Turnstile, débit 3/min/IP, réponse constante |
| `/public/bookings/[token]` | GET, PATCH | jeton de gestion ; débit |
| `/public/bookings/[token]/payment` | POST | jeton de gestion (« J'ai payé ») |
| `/public/tickets/[token]` | GET | jeton de billet : ce billet seul |

**Corps.** Les mutations publiques valident leur corps avec Zod. Elles bornent la taille du
corps, refusent les champs inconnus et ne renvoient jamais d'information sur d'autres
réservations.

**Erreurs.** Un jeton inconnu répond toujours `404`, avec le même message.

## UI

**Gestion** (`src/app/(auth)/billetterie/`)
- **`page.tsx`** : événements de l'église (`ticketing:manage`, ou un rôle sur l'événement), et
  « Créer un événement ».
- **`[id]/page.tsx`** : tableau de bord à onglets (`?vue=`), affichés selon les rôles :
  - **Aperçu** : places, présents, recettes, options, lien public avec QR à partager ;
  - **Paramètres** : informations, jauge, tarifs, options et variantes, paiements, règles,
    mineurs, ajout sur place, conservation ;
  - **Inscrits** ;
  - **Règlements** : déclarés à confirmer en tête, encaissements, à rembourser ;
  - **Équipe** : rôles, postes, affectations, badges imprimables ;
  - **Présences** : compteur, courbe, anomalies, registre ;
  - **Restauration** : à préparer, stock, non retirés.
- **`[id]/controle/page.tsx`** et **`[id]/restauration/page.tsx`** : écrans de terrain, plein
  écran et gros boutons.
  - scanner : `getUserMedia` avec `BarcodeDetector` quand il existe, sinon **`jsqr`** ;
  - choix du mode Entrée / Sortie / Auto ;
  - bandeau d'état du réseau (dernière mise à jour, opérations en attente) ;
  - résultat en grand (vert, orange, rouge) ;
  - recherche par nom ;
  - compteur et alerte de jauge ;
  - ajout sur place ;
  - +1 / −1 avec motif.
- **`mes-reservations/page.tsx`** : réservations liées au compte.

**« Mon planning »** : un encart « Événements » liste les affectations de billetterie (poste,
horaires, badge). La page appelle l'index du module si `registry.has("ticketing")`. Le module
`planning` n'importe pas `ticketing`.

**Navigation** : « Billetterie » dans l'espace **Agenda**, pour `ticketing:manage` ou un rôle
d'événement actif (drapeau `hasTicketing` dans `(auth)/layout.tsx`).

**Public** (hors `(auth)`, déclaré en `routes.public` du manifeste)
- **`src/app/inscription/[churchSlug]/[eventSlug]/page.tsx`** : présentation, formulaire par
  étapes (participants, options, questions, contact, récapitulatif, paiement), Turnstile et
  « Retrouver ma réservation ».
- **`src/app/reservation/[token]/page.tsx`** :
  - récapitulatif et instructions de paiement (référence copiable, numéro Wero, lien Revolut,
    IBAN copiable) ;
  - « J'ai payé » ;
  - code de réservation, et billets à afficher ou partager (`navigator.share`, WhatsApp) ;
  - modifier les options, ajouter un participant, corriger un nom ;
  - annuler, avec un avertissement si aucun remboursement n'est possible.
- **`src/app/billet/[token]/page.tsx`** : billet seul, avec le QR (`src/lib/qr.ts`), le nom,
  l'événement et la date.

**Service worker** (`public/sw.js`, cache `koinonia-v6`)
- `/_next/static/*` en **cache d'abord** : fichiers immuables à empreinte, pour que les écrans
  de terrain se rechargent hors ligne après une première visite ;
- les pages restent en réseau d'abord, avec le cache en repli (comportement actuel).

## Décisions & alternatives écartées

- **Choix** : jetons secrets stockés **en empreinte** ; quatre jetons de portée distincte.
  *Pourquoi* : une fuite de la base ne permet pas de forger un billet ; un QR scanné ne donne
  jamais la gestion de la réservation.
- **Écarté** : un compte obligatoire pour réserver. *Raison* : la majorité du public n'a pas de
  compte, et l'inscription doit se faire en une minute depuis WhatsApp.
- **Choix** : l'état de paiement est porté **par élément** et une déclaration couvre les
  éléments dus. *Pourquoi* : c'est ce qu'exigent la spec (libérer un repas non payé, rembourser
  un élément) et la restauration (« ce repas est-il payé ? »), sans algorithme de répartition.
- **Choix** : écrans de terrain **hors ligne**, avec instantané d'empreintes, file IndexedDB et
  synchronisation idempotente ; `/_next/static` mis en cache. *Pourquoi* : c'est une exigence
  réglementaire dans une salle au réseau incertain. Ce patron est durable et transverse, d'où
  l'**ADR-0026**.
- **Écarté** : WebSocket ou temps réel serveur. *Raison* : l'infrastructure n'en a pas, et une
  synchronisation toutes les 5 s, plus à chaque scan en ligne, suffit pour une ou deux portes.
- **Choix** : décodage QR par `BarcodeDetector` quand il existe, sinon **`jsqr`** (Apache-2.0,
  sans dépendance). *Pourquoi* : Safari iOS n'a pas `BarcodeDetector`.
- **Écarté** : `@zxing/browser`. *Raison* : plus lourd, et inutile pour du QR seul.
- **Choix** : présence calculée à partir des passages, jamais stockée. *Pourquoi* : des passages
  reçus en retard ou dans le désordre donnent quand même un compteur exact.
- **Choix** : équipe et postes **dans le module**. *Pourquoi* : la spec exclut de toucher au
  planning des départements ; « Mon planning » les lit seulement.
- **Choix** : contact lié à un compte, notification avec email (préférence respectée) ; sinon
  `sendEmail` direct, dans la liste blanche. *Pourquoi* : c'est la règle de la spec 053.
- **Choix** : un seul module, livré en un PR, avec un commit par lot (1, 2, 3). *Pourquoi* :
  c'est la demande (« on livre tout »), et chaque lot reste relisible.

## Risques & points d'attention

- **Survente concurrente** : on verrouille la ligne de l'événement pendant la réservation, et des
  tests vérifient le refus au-delà des places et du stock.
- **Horloge des téléphones** : `scannedAt` vient de l'appareil. On corrige l'écart d'horloge
  mesuré à chaque synchronisation (heure serveur renvoyée), et `receivedAt` sert d'arbitre.
- **Caméra** : elle exige HTTPS et l'autorisation de l'utilisateur. Sans autorisation, la
  recherche par nom reste toujours disponible.
- **Taille de l'instantané** : environ 400 participants, quelques dizaines de Ko, ce qui va bien.
- **Données personnelles** : la purge automatique est testée, et l'accueil ne reçoit pas les
  coordonnées.
- **Turnstile en recette** : les clés doivent être présentes en staging, sinon l'inscription
  publique est refusée (comportement fail-closed existant).
- **Échéance du 31/12** : la recette du lot 2 doit se faire sur deux téléphones réels, en mode
  avion.

## Stratégie de tests

- **`auth`** :
  - matrice des rôles par action ;
  - un détenteur de `ticketing:manage` est organisateur implicite ;
  - un événement d'une autre église répond 404 ;
  - un rôle retiré n'a plus d'effet.
- **`booking`** :
  - places, stock et date limite ;
  - mineurs (adulte requis ; responsable exigé si autorisé) ;
  - prix figés et référence incrémentée ;
  - jetons en empreinte ;
  - modification des options jusqu'à la date limite ;
  - ajout et renommage ;
  - annulations et états de remboursement ;
  - lien vers un compte ;
  - `recoverBooking` à réponse constante.
- **`payments`** :
  - déclaration, puis confirmation ou refus, sur les éléments couverts ;
  - encaissement direct partiel ;
  - remboursement.
- **`deadlines`** :
  - relance unique au délai réglé ;
  - libération sauf paiement sur place ;
  - rappel la veille ;
  - purge.
- **`sync` et `presence`** :
  - idempotence (même opération rejouée) ;
  - désordre de réception ;
  - anomalie de double entrée ;
  - comptage manuel ;
  - catégories et mineurs ;
  - seuils de 90 % et 100 % notifiés une fois ;
  - ajout sur place hors ligne.
- **`catering`** : stock (préparés, réservés, remis, disponibles), remise avec encaissement,
  vente sur place.
- **`snapshot`** : l'accueil ne reçoit ni email, ni téléphone de contact, ni montants d'options.
- **Routes publiques** :
  - jeton inconnu en 404 ;
  - un billet ne voit que lui-même ;
  - Turnstile et débit ;
  - événement en brouillon invisible.
- **Routes authentifiées** : 403 hors rôle, 404 autre église, Zod.
- **Client hors ligne** : file IndexedDB et calcul d'empreinte (fonctions pures testées ;
  IndexedDB simulé).
- **Exhaustivité** : `permissions.test` (`ticketing:manage`), `routes-exhaustivite`,
  `openapi.test`, liste blanche `notifications-no-direct-email`, navigation.
