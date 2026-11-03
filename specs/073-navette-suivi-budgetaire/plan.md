# Plan technique — Navette : suivi budgétaire déclaratif

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-11-03

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe que `@/modules/shuttle`, `@/modules/shuttle/auth` et `@/modules/shuttle/schemas`
- [x] **Sécurité** : chaque route passe par `requireShuttleAccess(churchId)`, garde du module bâtie sur `requireAuth` ; `churchId` toujours explicite (église courante pour les collections, église de la ligne pour les routes `[id]`)
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) : nouvelle permission `shuttle:manage`, plus l'appartenance à une fonction `NAVETTE` (ADR-0014, règle 5 amendée)
- [x] **Validation** Zod sur toutes les mutations, schémas dans les `contract.ts` et `@/modules/shuttle/schemas`
- [x] **Migration** Prisma `add_shuttle_ledger` (pas de `db push`)
- [x] **Enums** importés depuis `@/generated/prisma/enums` / `client`
- [x] **UI** : `PageHeader`, `Tabs`, `DataTable`, `Modal`/`BottomSheet`, `Field`, `StatusChip`, `EmptyState`, `ConfirmModal`, `useToast` réutilisés

## Approche générale

Un **nouveau module `shuttle`** (« Navette » à l'écran), qui dépend de `accounting`
(`dependsOn: ["core", "planning", "accounting"]`). On le désactive avec `ENABLED_MODULES` :
pages et API répondent alors 404, et les données restent en base (comportement standard des
modules, ADR-0011/0012). Le circuit des demandes de `accounting` n'est pas modifié.

Le cœur est un **registre de lignes signées** : une entrée est positive, une sortie négative.
Le solde est la somme des lignes non supprimées. Le relevé et les totaux d'une période sont
calculés en mémoire : il y a quelques centaines de lignes par an, ce qui reste raisonnable.

Deux populations y ont accès :
- **les gestionnaires** (`shuttle:manage` : Super Admin, Admin, Comptable) ;
- **l'équipe navette** : membres et responsables d'un département de fonction `NAVETTE`.

Le justificatif est stocké comme les pièces de la comptabilité (`storeFile`, clé
`shuttle/<churchId>/…`). L'historique s'appuie sur `logAudit`, avec les valeurs avant et après.

## Modèle de données

```prisma
enum ShuttleEntryKind {
  OPENING_BALANCE   // solde de départ, un seul par église (signé)
  FUNDING           // abondement de l'église (+)
  DEPOSIT_RETURN    // caution restituée (+), liée à la caution d'origine si connue
  VENDOR_REFUND     // remboursement du loueur (+)
  EXPENSE           // dépense (−)
}

enum ShuttleExpenseCategory {
  FUEL
  MILEAGE
  RENTAL
  DEPOSIT
  TOLL_PARKING
  CLEANING
  DAMAGE_FINE
  INSURANCE
  OTHER
}

enum ShuttlePaymentMethod { TRANSFER CASH CHURCH_CARD CHEQUE }

model ShuttleEntry {
  id              String                  @id @default(cuid())
  churchId        String
  kind            ShuttleEntryKind
  category        ShuttleExpenseCategory? // EXPENSE uniquement
  /// Montant signé : + entrée, − sortie (EXPENSE). Le solde de départ peut être négatif.
  amount          Decimal                 @db.Decimal(10, 2)
  date            DateTime                @db.Date
  label           String?                 @db.VarChar(200) // libellé (obligatoire si OTHER), commentaire
  vendor          String?                 @db.VarChar(120)
  paymentMethod   ShuttlePaymentMethod?   // FUNDING
  liters          Decimal?                @db.Decimal(7, 2)
  kilometers      Int?
  personalAdvance Boolean                 @default(false)
  rentalId        String?
  /// DEPOSIT_RETURN → la caution (EXPENSE/DEPOSIT) qu'elle solde.
  returnOfId      String?                 @unique
  /// Caution marquée « non restituée » par la compta.
  depositRetainedAt DateTime?
  depositRetainedNote String?             @db.VarChar(300)
  receiptKey      String?                 @db.VarChar(512) // obligatoire pour EXPENSE, DEPOSIT_RETURN, VENDOR_REFUND
  receiptName     String?                 @db.VarChar(255)
  receiptMime     String?                 @db.VarChar(100)
  receiptSize     Int?
  flagNote        String?                 @db.VarChar(300)
  flaggedAt       DateTime?
  flaggedById     String?
  createdById     String?
  updatedById     String?
  deletedAt       DateTime?               // suppression logique : sort des calculs, reste dans l'historique
  deletedById     String?
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  church    Church         @relation(fields: [churchId], references: [id], onDelete: Cascade)
  rental    ShuttleRental? @relation(fields: [rentalId], references: [id], onDelete: SetNull)
  returnOf  ShuttleEntry?  @relation("DepositReturn", fields: [returnOfId], references: [id], onDelete: SetNull)
  returnedBy ShuttleEntry? @relation("DepositReturn")
  createdBy User?          @relation("ShuttleEntryCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  // updatedBy, flaggedBy, deletedBy : relations SetNull analogues

  @@index([churchId, deletedAt, date])
  @@index([rentalId])
  @@map("shuttle_entries")
}

model ShuttleRental {
  id          String    @id @default(cuid())
  churchId    String
  vendor      String    @db.VarChar(120)
  vehicle     String?   @db.VarChar(120)
  startDate   DateTime  @db.Date
  endDate     DateTime? @db.Date
  createdById String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  entries     ShuttleEntry[]
  church      Church    @relation(fields: [churchId], references: [id], onDelete: Cascade)
  @@index([churchId, startDate])
  @@map("shuttle_rentals")
}

model ShuttleSettings {
  churchId            String   @id
  /// Seuil d'alerte de solde bas ; null = alerte désactivée.
  lowBalanceThreshold Decimal? @db.Decimal(10, 2)
  updatedById         String?
  updatedAt           DateTime @updatedAt
  church              Church   @relation(fields: [churchId], references: [id], onDelete: Cascade)
  @@map("shuttle_settings")
}
```

Migration `add_shuttle_ledger`, générée par `prisma migrate diff` puis rejouée en CI (job
`migrations`).

`DEPT_FN.NAVETTE` (« Navette ») est ajouté dans `src/lib/department-functions.ts` et dans
`access-overview.ts`. Pas de migration pour cela : `Department.function` est une chaîne.

## Accès

`src/modules/shuttle/auth.ts` :

- `getShuttleAccess(session, churchId)` → `{ manager: boolean, member: boolean }` :
  - `manager` : Super Admin, ou `shuttle:manage` dans `churchId` (`rolePermissions`) ;
  - `member` : la fiche liée au compte (`member_user_links`) appartient à un département de
    fonction `NAVETTE` de l'église (`member_departments`), **ou** l'utilisateur en est
    responsable ou adjoint (`user_departments`), **ou** il est Ministre du ministère qui le
    porte. L'identité est résolue côté serveur (ADR-0013, règle 2) et l'accès est calculé à
    chaque requête (règle 5).
- `requireShuttleAccess(churchId)` → `{ session, manager, member }`. Lève `FORBIDDEN` si
  l'appelant n'est ni gestionnaire ni membre.
- `requireShuttleManager(churchId)` : gestionnaire uniquement (abondements, solde de départ,
  signalement, caution non restituée, réglages).

**ADR-0014, règle 5** : `NAVETTE` est ajoutée à la liste des fonctions qui confèrent des droits
d'écriture. Les droits sont énumérés : déclarer des sorties, des restitutions et des
remboursements du loueur ; créer et modifier des locations ; corriger ou supprimer ses propres
lignes pendant 48 heures.

## Règles métier (services `src/modules/shuttle/services/`)

- **`ledger.ts`**
  - `createEntry(churchId, input, file?, actor)`, `updateEntry(id, input, file?, actor)`,
    `deleteEntry(id, actor)` : contrôles d'écriture, signe du montant, justificatif, audit,
    notification, alerte de seuil.
  - **Justificatif obligatoire** pour `EXPENSE`, `DEPOSIT_RETURN` et `VENDOR_REFUND`, facultatif
    pour `FUNDING`, et sans objet pour `OPENING_BALANCE`.
  - **Droits par type** : `FUNDING` et `OPENING_BALANCE` sont réservés aux gestionnaires. Les
    autres types sont ouverts aux gestionnaires et aux membres.
  - **Unicité du solde de départ** : un seul `OPENING_BALANCE` non supprimé par église, vérifié
    dans une transaction.
  - **`OTHER`** : `label` obligatoire.
  - **Fenêtre de correction** : un membre ne modifie ou ne supprime que **ses** lignes, et
    seulement si `now − createdAt ≤ 48 h`. Un gestionnaire modifie tout, à tout moment. Une
    ligne supprimée n'est plus modifiable.
  - **Suppression logique** (`deletedAt`). Le justificatif est conservé.
  - **Audit** : `logAudit` avec `entityType: "ShuttleEntry"`, l'action `CREATE`, `UPDATE` ou
    `DELETE`, et dans `details` les champs avant et après.
  - **Notification des gestionnaires** à chaque mutation faite par un **non-gestionnaire**.
    Destinataires : les `ACCOUNTANT` de l'église, à défaut les `ADMIN` (`notifyUsersWithRole`).
    Domaine `shuttle`. Exemple : « Navette : dépense de 62,00 € (Carburant) déclarée par Prénom
    Nom », avec un lien vers `/accounting/navette?ligne=<id>`. Le texte se lit sans risque sur un écran
    verrouillé.
  - **Alerte de solde bas** : après chaque mutation, on compare le solde avant et après au
    seuil. On notifie au **franchissement à la baisse** seulement, pas à chaque ligne sous le
    seuil. Destinataires : les gestionnaires, plus les responsables et adjoints des départements
    `NAVETTE` (`user_departments`).
- **`ledger-read.ts`**
  - `getLedger(churchId, { from?, to? }, filters)` renvoie :
    - `balanceToDate` ;
    - `period` (`openingBalance`, `inflows`, `outflows`, `net`, `closingBalance`) ;
    - `entries` triées par (`date`, `createdAt`), avec le `runningBalance` après chaque ligne ;
    - `byCategory`, `byMonth`, `byRental` (sorties nettes, hors cautions et restitutions) ;
    - `outstandingDeposits` (cautions sans restitution liée, non marquées « non restituée »,
      avec leur ancienneté) ;
    - `personalAdvances` (lignes de la période où `personalAdvance` est coché).
  - Le solde de début de période est la somme des lignes datées **avant** `from`.
  - `getEntryHistory(id)` : lignes d'audit de l'entrée.
- **`flags.ts`** : `flagEntry(id, note, actor)` et `clearFlag(id, actor)`, réservés au
  gestionnaire, avec audit et notification de l'auteur de la ligne.
  `markDepositRetained(id, note, actor)` : caution « non restituée ».
- **`rentals.ts`** : `listRentals`, `createRental`, `updateRental`, ouverts aux membres et aux
  gestionnaires, avec audit.
- **`settings.ts`** : `getSettings`, `updateThreshold`, réservés au gestionnaire.
- **`export.ts`** : `buildExport(churchId, period)` produit un ZIP (`archiver`) qui contient :
  - `releve.xlsx` (`exceljs`) : relevé avec solde courant, plus une feuille de synthèse par
    type et par mois ;
  - `justificatifs/AAAA-MM-JJ_type_montant_id.ext`.
- **Justificatifs** : JPEG, PNG, WebP ou PDF, 10 Mo au plus. Le type est vérifié sur les octets
  (signature du fichier, pas le type déclaré), puis le fichier est stocké par `storeFile`.

## API

Toutes les routes sont déclarées dans `routes.api` du manifeste (`/api/accounting/navette`), avec un
`contract.ts` voisin, puis `npm run openapi`.

| Endpoint | Méthode | Accès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/accounting/navette` | GET | membre ou gestionnaire, église courante | `?from&to&category&author&rental&flagged` | relevé et synthèses (`getLedger`) |
| `/api/accounting/navette/entries` | POST | membre (types ouverts) ou gestionnaire | multipart : `data` (JSON validé Zod) + `file` | entrée créée (201) |
| `/api/accounting/navette/entries/[id]` | PATCH | auteur sous 48 h ou gestionnaire, église de la ligne | multipart : `data` partiel + `file?` | entrée |
| `/api/accounting/navette/entries/[id]` | DELETE | auteur sous 48 h ou gestionnaire | — | `{ ok }` |
| `/api/accounting/navette/entries/[id]/receipt` | GET | membre ou gestionnaire de l'église de la ligne | — | fichier (`nosniff`, `private`) |
| `/api/accounting/navette/entries/[id]/history` | GET | membre ou gestionnaire | — | historique |
| `/api/accounting/navette/entries/[id]/flag` | PUT, DELETE | gestionnaire | `{ note }` | entrée |
| `/api/accounting/navette/entries/[id]/retained` | PUT | gestionnaire | `{ note }` | entrée |
| `/api/accounting/navette/rentals` | GET, POST | membre ou gestionnaire | `{ vendor, vehicle?, startDate, endDate? }` | location(s) |
| `/api/accounting/navette/rentals/[id]` | PATCH | membre ou gestionnaire | partiel | location |
| `/api/accounting/navette/settings` | GET, PUT | gestionnaire | `{ lowBalanceThreshold: number \| null }` | réglages |
| `/api/accounting/navette/export` | GET | gestionnaire | `?from&to` | ZIP |

**Église** : les collections utilisent l'église courante (`getCurrentChurchId`). Les routes
`[id]` utilisent l'**église de la ligne** (lue en base), jamais le contexte affiché. Une ligne
d'une autre église répond 404.

**Taille** : POST et PATCH bornent `Content-Length` (11 Mo) **avant** de lire le corps (411/413),
comme `/api/giving/logo`. Débit limité (`RATE_LIMIT_MUTATION`).

## UI / composants

- **Navigation, sous « Comptabilité »** (`(auth)/layout.tsx` → `navigation.ts`) :
  - nouveau drapeau `hasShuttle`, calculé seulement si `registry.has("shuttle")`. Il vaut vrai
    pour un gestionnaire dont l'église a au moins un département `NAVETTE`, et pour un membre de
    l'équipe ;
  - dans l'espace **Demandes**, la sidebar affiche un bloc **« Comptabilité »** qui regroupe
    « Demandes » (`/accounting/requests`, pour `accounting:view`) et, juste en dessous,
    « Navette » (`/accounting/navette`). Le regroupement passe par `sidebarBlock` et
    `sidebarLabel` ;
  - un membre de l'équipe sans `accounting:view` (un STAR, par exemple) voit le bloc
    « Comptabilité » avec la seule entrée « Navette » ;
  - sur mobile, le panneau « Plus » liste « Comptabilité » puis « Navette » ;
  - l'entrée active est celle du préfixe le plus long : `/accounting/navette` allume
    « Navette », pas « Comptabilité » ;
  - `MoreSheet.tsx` et `NavPageList.tsx` ne sont pas modifiés : ils consomment `navigation.ts`.
- **`/accounting/navette`** (`src/app/(auth)/accounting/navette/page.tsx`, Server Component) : `requireShuttleAccess`
  sur l'église courante, puis `ShuttleClient` avec les données initiales.
  - **En-tête** (`PageHeader`) : « Navette », avec le **solde à date** bien visible, en rouge
    s'il est négatif. Actions : « Déclarer une dépense » (principale) et « Autre entrée ».
    Les gestionnaires ont en plus « Abondement » et « Exporter ».
  - **Sélecteur de période** en chips : Depuis le début, Ce mois, Mois dernier, 3 derniers mois,
    Personnalisée (deux dates). Il est reflété dans l'URL (`?du=&au=`).
  - **Synthèse** : solde de début, entrées, sorties, écart, solde de fin.
  - **Onglets** (`Tabs`) :
    - **Relevé** : `DataTable` avec la date, le libellé ou type, l'auteur, le montant signé, le
      solde courant, une icône de justificatif, la pastille « signalée » et la pastille
      « avance perso ». Filtres. Ouvrir une ligne affiche son détail (`BottomSheet` sur
      mobile), avec le justificatif, l'historique et les actions permises.
    - **Répartition** : par type, par mois, par location (barres simples en tokens, sans
      bibliothèque).
    - **Cautions & avances** : cautions en cours, avec leur ancienneté et l'action
      « Restituée » (qui pré-remplit une restitution liée) ou « Non restituée » pour le
      gestionnaire ; avances personnelles de la période.
    - **Locations** : liste et création, avec le coût de chaque location.
    - **Réglages**, gestionnaire seulement : seuil d'alerte et solde de départ (saisie unique,
      puis correction).
  - **Formulaire de ligne** (`Modal`, ou `BottomSheet` sur mobile) :
    - le type d'abord, puis les champs utiles à ce type ;
    - le justificatif par `<input type="file" accept="image/*,application/pdf" capture="environment">`,
      avec un aperçu ;
    - le montant saisi en euros, toujours positif. Le signe est déduit du type, sauf pour le
      solde de départ ;
    - « Super U Location » proposé par défaut pour le fournisseur ;
    - la location à choisir dans les locations récentes ;
    - pour un membre, un rappel : « modifiable pendant 48 h ».
- **Onglets de la comptabilité** : `AccountingNav` gagne un onglet « Navette » (Demandes,
  Statistiques, Navette) quand `hasShuttle`, pour passer d'un écran à l'autre sans le menu.
- **Guide** (`GuideContent.tsx`) : une section « Navette ». ADR-0014 exige de documenter que la
  composition du département Navette donne des droits.

## Manifeste du module

```ts
defineModule({
  name: "shuttle",
  dependsOn: ["core", "planning", "accounting"],
  routes: { authenticated: [{ path: "/accounting/navette" }], api: [{ path: "/api/accounting/navette" }] },
  permissions: { "shuttle:manage": ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
  notificationDomains: [{ key: "shuttle", label: "Navette", description: "Dépenses déclarées, signalements, solde bas.", defaultEmail: true, visibleWith: ["shuttle:manage"] }],
});
```

Ajouté à `src/lib/manifests.ts` (15 modules). Il faut mettre à jour en même temps :
- la matrice figée de `src/core/__tests__/permissions.test.ts` ;
- le tableau des permissions du `CLAUDE.md` et `docs/auth.md`.

## Décisions & alternatives écartées

- **Choix** : les adresses `/accounting/navette` et `/api/accounting/navette` appartiennent au
  module `shuttle`, sous le préfixe `/accounting` de la comptabilité. *Pourquoi* : l'écran est
  rangé sous la comptabilité, dans l'URL comme dans le menu. La résolution des routes donne la
  priorité au préfixe le plus long, et seuls les préfixes **identiques** sont interdits
  (`routes-exhaustivite.test.ts`). Il n'existe aucun layout `/accounting` qui exigerait
  `accounting:view` et bloquerait un STAR de l'équipe : le contrôle reste dans chaque page.
- **Écarté** : une adresse `/navette` à la racine. *Raison* : l'écran serait séparé de la
  comptabilité, alors qu'il en est une extension.

- **Choix** : un module `shuttle` distinct qui dépend de `accounting`. *Pourquoi* : il se
  désactive seul (`ENABLED_MODULES`), sans toucher au circuit des demandes ; c'est
  l'« extension » demandée.
- **Écarté** : ajouter des tables et des routes dans le module `accounting`. *Raison* : on ne
  pourrait pas désactiver la navette sans désactiver la comptabilité.
- **Choix** : un montant signé dans une seule table. *Pourquoi* : solde et soldes courants par
  simple somme ; un seul relevé chronologique.
- **Écarté** : deux tables (recettes, dépenses). *Raison* : double requête et fusion pour chaque
  relevé, sans bénéfice.
- **Choix** : le solde courant est calculé à la lecture. *Pourquoi* : une ligne antidatée,
  corrigée ou supprimée est toujours juste, et les volumes sont faibles.
- **Écarté** : un solde stocké sur chaque ligne. *Raison* : il faudrait recalculer toutes les
  lignes suivantes à chaque modification.
- **Choix** : la suppression logique et l'historique par `logAudit`. *Pourquoi* : la spec exige
  de garder une ligne supprimée visible dans l'historique, et l'audit existe déjà avec la
  convention avant/après.
- **Choix** : `Decimal(10,2)`, comme les montants de `accounting`. *Pourquoi* : cohérence des
  exports pour la compta.
- **Choix** : une permission propre `shuttle:manage`, plutôt que de réutiliser
  `accounting:manage`. *Pourquoi* : elle disparaît avec le module (désactivation propre) et
  reste ajustable seule. Ses titulaires initiaux sont les mêmes.
- **Choix** : un domaine de notification `shuttle`. *Pourquoi* : chaque mutation notifie la
  compta, qui doit pouvoir régler l'email de ce flux séparément des demandes comptables.
- **Choix** : une alerte de solde bas au **franchissement** du seuil uniquement. *Pourquoi* :
  éviter une alerte à chaque dépense tant que le solde reste bas.
- **Choix** : le lien de navigation n'apparaît au gestionnaire que si l'église a un département
  `NAVETTE`. *Pourquoi* : une église sans navette ne voit rien. La page reste accessible au
  gestionnaire, avec un registre vide, comme le prévoit la spec.
- **Écarté** : un hors-ligne pour la saisie. *Raison* : hors spec ; la saisie se fait après la
  dépense, avec du réseau.

## Risques & points d'attention

- **Composition du département Navette = droits** (ADR-0014). Il faut le documenter dans le
  guide et dans la vue des accès (`access-overview`).
- **Photos lourdes depuis le téléphone** : la limite est de 10 Mo. On envisagera une
  compression côté client si les envois échouent en recette.
- **HEIC (iPhone)** : Safari convertit en JPEG à l'envoi par `<input type="file">`. On le
  vérifiera en recette sur un iPhone ; sinon, refus explicite avec un message.
- **Volume de notifications** : chaque dépense notifie la compta. C'est voulu, et l'email se
  règle par domaine.
- **Concurrence sur le solde de départ** : l'unicité est vérifiée dans une transaction, en
  sérialisant par `churchId` (verrou sur `ShuttleSettings`).

## Stratégie de tests

- **`auth`** : `getShuttleAccess` distingue gestionnaire, membre par fiche liée, responsable,
  Ministre, autre rôle, autre église, et membre d'un département d'une autre fonction.
- **`ledger`** :
  - le signe des montants ;
  - le justificatif obligatoire selon le type ;
  - `FUNDING` et `OPENING_BALANCE` refusés à un membre ;
  - l'unicité du solde de départ ;
  - la fenêtre de 48 h (auteur dedans ou dehors, autre membre, gestionnaire) ;
  - la suppression logique, exclue des sommes ;
  - l'audit avant et après ;
  - une notification pour un non-gestionnaire, aucune pour un gestionnaire ;
  - l'alerte au seul franchissement du seuil.
- **`ledger-read`** :
  - soldes de début et de fin de période ;
  - solde courant, y compris avec une ligne antidatée ;
  - répartitions ;
  - cautions en cours (restituée, non restituée, en cours) ;
  - avances personnelles.
- **Routes** :
  - 401 et 403 : hors équipe, autre église, membre sur une route de gestionnaire ;
  - 411 et 413 ;
  - 404 pour une ligne d'une autre église ;
  - validation Zod ;
  - en-têtes du justificatif.
- **Export** : le ZIP contient le classeur et les justificatifs de la période seulement.
- **Navigation** : `hasShuttle` ajoute « Navette » au bon espace, et ne l'ajoute pas quand le
  module est désactivé.
- **Exhaustivité et contrats** : `route-exhaustiveness`, `openapi.test`, `permissions.test` et
  `manifests.test` mis à jour.
