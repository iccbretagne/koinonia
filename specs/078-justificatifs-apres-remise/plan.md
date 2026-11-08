# Plan technique — Justificatifs après la remise des fonds

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-11-08

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : toute la logique vit dans `src/modules/accounting/services/justifications.ts`,
  exposée par `@/modules/accounting` ; la trésorerie lit les restitutions par cet index (ADR-0027,
  sens accounting ← treasury inchangé) ; `accounting` n'importe jamais `treasury`
- [x] **Sécurité** : routes derrière `requireAuth()` + église courante ; geste du demandeur vérifié sur
  `submittedById`, gestes de la compta sur `accounting:manage`, lecture par `accountingScopeWhere` ;
  l'église qui fait foi est celle de la justification
- [x] **Permissions** via `rolePermissions` ; **aucune permission nouvelle**
- [x] **Validation** Zod (union discriminée par `action`) dans les `contract.ts`
- [x] **Migration** Prisma `20261109090000_financial_justifications`
- [x] **Enums** depuis `@/generated/prisma/client`
- [x] **UI** : `Button`, `Input`, `Select`, `Modal`, `StatusChip`, `Alert`, `EmptyState`, composant
  de dépôt de pièces déjà utilisé par `NewRequestForm`
- [x] **Seuil Prisma des routes** (143) : les nouvelles routes n'importent pas Prisma, elles passent
  par les services du module

## Approche générale

Une **justification** est un objet à part, ouvert au moment où le dernier versement d'une demande
est confirmé. Elle porte tout ce qui vient après la remise des fonds : date limite, relances,
factures, montant dépensé, décision de la compta, reliquat et sa restitution. Les demandes et leurs
paiements ne changent pas de sens ; leur statut `APPROVED` reste vrai, la justification dit si elles
sont soldées.

Un objet séparé plutôt que des champs sur la demande, parce qu'une **avance récurrente** se justifie
**par mois** : une justification regroupe les occurrences de la même série remises dans le même mois.
Une avance ponctuelle ou une note de frais en a une seule, pour une seule demande. Le même modèle
couvre les deux cas.

Une tâche planifiée (`accounting-justifications`, horaire, idempotente) relance, puis prévient le
responsable du département et le Ministre à partir de la troisième relance.

## Modèle de données

```prisma
enum FinancialJustificationStatus {
  AWAITING      // justificatifs attendus (relancés)
  SUBMITTED     // déposés, à vérifier par la compta
  RETURN_DUE    // acceptés (ou dispensés), reliquat à rendre
  SETTLED       // soldée
}

model FinancialJustification {
  id             String                       @id @default(cuid())
  churchId       String
  /// Avance récurrente : série et mois (« 2026-11 ») regroupés ; null pour une demande ponctuelle.
  seriesId       String?
  period         String?                      @db.Char(7)
  status         FinancialJustificationStatus @default(AWAITING)
  /// Total remis sur les demandes couvertes, figé à l'ouverture (augmenté si une occurrence du
  /// même mois s'ajoute tant que la justification attend).
  releasedAmount Decimal                      @db.Decimal(10, 2)
  /// Déclaré par le demandeur (ou retenu par la compta en cas de dispense).
  spentAmount    Decimal?                     @db.Decimal(10, 2)
  dueAt          DateTime
  nextReminderAt DateTime
  reminderCount  Int                          @default(0)
  submittedAt    DateTime?
  rejectionReason String?                     @db.VarChar(500)
  waiverReason   String?                      @db.VarChar(500)
  decidedById    String?
  decidedAt      DateTime?
  /// Restitution du reliquat ; compte de trésorerie facultatif (null = compte commun, non suivi).
  returnedAmount Decimal?                     @db.Decimal(10, 2)
  returnedAt     DateTime?
  returnedById   String?
  returnTreasuryAccountId String?
  createdAt      DateTime                     @default(now())
  updatedAt      DateTime                     @updatedAt

  church      Church                @relation(fields: [churchId], references: [id])
  series      FinancialSeries?      @relation(fields: [seriesId], references: [id])
  requests    FinancialRequest[]    @relation("RequestJustification")
  attachments FinancialAttachment[]
  /// Notes de frais liées couvrant un dépassement.
  overages    FinancialRequest[]    @relation("JustificationOverage")
  returnTreasuryAccount TreasuryAccount? @relation(fields: [returnTreasuryAccountId], references: [id], onDelete: SetNull)

  @@index([churchId, status])
  @@index([status, nextReminderAt])
  @@index([seriesId, period])
  @@map("financial_justifications")
}

model FinancialJustificationSettings {
  churchId             String   @id
  firstReminderDays    Int      @default(7)
  reminderIntervalDays Int      @default(7)
  updatedAt            DateTime @updatedAt
  church Church @relation(fields: [churchId], references: [id])
  @@map("financial_justification_settings")
}

// Ajouts
model FinancialRequest {
  justificationId          String?  // justification qui couvre cette demande
  overageOfJustificationId String?  // note de frais liée : complément d'un dépassement
}
model FinancialAttachment {
  justificationId String?   // facture déposée après la remise des fonds
}
```

Migration additive (colonnes nullables, deux tables) : aucune demande existante n'est touchée, ce
qui réalise « pas de relance rétroactive » sans traitement de reprise.

## API

Pas de prisma dans les routes ; une route de collection, une route d'objet à actions, une route de
réglages.

| Endpoint | Méthode | Accès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/accounting/justifications` | GET | `accounting:manage` → toutes ; sinon `accounting:view`/demandeur → `accountingScopeWhere` | `?status=&late=1` | liste (demandes, montants, échéance, retard, reliquat) |
| `/api/accounting/justifications/[id]` | GET | idem, objet par objet (église de la justification) | — | détail + pièces + notes liées |
| `/api/accounting/justifications/[id]` | PATCH | `submit` : demandeur ; autres : `accounting:manage` | union `action` (ci-dessous) | justification mise à jour |
| `/api/accounting/justifications/settings` | GET / PUT | `accounting:manage` | `{ firstReminderDays: 1–60, reminderIntervalDays: 1–30 }` | réglages |

Actions du `PATCH` (`justificationActionSchema`, `z.discriminatedUnion("action")`) :
- `submit` : `{ spentAmount ≥ 0, attachmentIds: string[1..20] }` — pièces déposées par la route
  existante `/api/accounting/attachments`, rattachées via `assertAttachmentsAssignable` (église de
  dépôt, spec 025). Dépôts successifs possibles (`attachmentIds` cumulés) ; la dernière déclaration
  fixe `spentAmount`. Note de frais : `spentAmount` imposé au montant de la note.
- `accept` / `reject` (`reason` 1–500, obligatoire pour `reject`)
- `waive` : `{ reason, retainedAmount ≥ 0 ≤ releasedAmount }`
- `return` : `{ returnedAt, treasuryAccountId?: string | null }` — validé dans la route comme pour
  « Payé depuis » (`resolveTreasuryAccount`, déjà présent dans `payments/[id]/route.ts`, extrait
  dans un helper partagé `src/app/api/accounting/_treasury.ts`) : compte actif de l'église, mois
  ouvert (`assertTreasuryDateOpen`), trésorerie active.

Note de frais liée : `POST /api/accounting/requests` accepte `overageOfJustificationId` (contrat
existant étendu) — vérifie que l'appelant est le demandeur, que la justification est acceptée ou
déposée avec `spentAmount > releasedAmount`, et préremplit ; aucune pièce n'est exigée (celles de
la justification couvrent l'achat).

`npm run openapi` et `docs/openapi.json` régénéré.

## Services / logique métier

`src/modules/accounting/services/justifications.ts` (+ règles pures dans `justification-rules.ts`) :

- **`openJustificationIfDue(requestId, tx)`** — appelé par la route de versement après la
  confirmation, dans sa transaction, quand plus aucune tranche n'est en attente. Ouvre (ou complète)
  une justification si :
  - avance de budget, ou note de frais **sans pièce jointe** ;
  - département sans fonction `NAVETTE` (`DEPT_FN`, `@/lib/department-functions`) ;
  - demande non issue de la navette (`shuttleReimbursedEntry`, `shuttleImportedEntry`) ;
  - pas une note de frais liée (`overageOfJustificationId`).
  Série : rejoint la justification `AWAITING` de la même série et du même mois (montant cumulé,
  échéance repoussée) ; sinon en crée une. `dueAt = dernière remise + firstReminderDays`.
- **`submitJustification`**, **`reviewJustification`**, **`waiveJustification`**,
  **`recordReturn`** — transitions gardées par `nextStatus` (fonction pure) :
  `AWAITING →submit→ SUBMITTED →accept→ RETURN_DUE | SETTLED`, `SUBMITTED →reject→ AWAITING`
  (échéance remise à `now + reminderIntervalDays`), `AWAITING|SUBMITTED →waive→ RETURN_DUE | SETTLED`,
  `RETURN_DUE →return→ SETTLED`. Reliquat = `max(0, released − spent)`. `logAudit` à chaque geste,
  notification au demandeur (domaine `accounting`).
- **`runJustificationReminders(now)`** — pour chaque justification `AWAITING` ou `RETURN_DUE` dont
  `nextReminderAt ≤ now` : prise atomique (`updateMany where { id, nextReminderAt }` → `count === 1`)
  qui avance `nextReminderAt` et incrémente `reminderCount`, puis notification. À partir de la
  3e relance, et si les demandes ont un département : responsables (`user_departments`, principal et
  adjoints) et Ministre du ministère (`user_church_roles.ministryId`), lus directement en base sans
  importer `planning`. Demandeur sans rôle dans l'église : pas de notification, la ligne reste
  dans la liste.
- **`listJustifications`**, **`getJustification`**, **`getJustificationSettings`**,
  **`updateJustificationSettings`**.
- **`listTreasuryReturns(churchId)`** (dans `treasury-link.ts`) : restitutions avec
  `returnTreasuryAccountId`, lues par `src/modules/treasury/services/reprises.ts` comme lignes
  **IN** de la catégorie système des notes de frais, lien vers la demande, en lecture seule —
  même mécanisme que `listTreasuryPayments` (ADR-0027).
- **Statistiques** (`stats.ts`) : `effectiveAmount(request)` = montant de la demande, sauf demande
  couverte par une justification `SETTLED` : part du montant dépensé (ou retenu) au prorata du
  remis de chaque demande de la justification. Utilisé par le total engagé, la répartition par
  département et par type. Compteurs ajoutés : justifications en attente, en retard, reliquats dus.

Cron : tâche `accounting-justifications` (`module: "accounting"`, `interval` 60 min) dans
`src/app/api/cron/route.ts`, plus l'entrée de son contrat.

## UI / composants

- **Détail d'une demande** (`/accounting/requests/[id]`, `RequestDetail.tsx`) : bloc
  « Justificatifs » sous les paiements (composant `JustificationPanel`, client) :
  - état, échéance, nombre de relances ; factures déposées ;
  - demandeur : dépôt de pièces (même zone de dépôt que la création) + montant dépensé, aperçu du
    reliquat ou du complément ; bouton « Demander le complément » vers
    `/accounting/requests/new?complement=<id>` ;
  - compta : Accepter / Renvoyer (motif), Dispenser (motif + montant retenu), Confirmer la
    restitution (date, « Rendu sur » : comptes de trésorerie actifs, ou « Compte commun ») ;
  - avance récurrente : la justification du mois indique les occurrences couvertes.
- **Tableau de la compta** (`AccountingDashboard`) : compteur « À justifier » (en retard en
  évidence) et filtre « Justificatifs » listant attendus, à vérifier, reliquats ; carte de réglages
  des délais (comptables).
- **Nouvelle demande** : `?complement=` préremplit une note de frais liée (type, département,
  intitulé « Complément — … », montant).
- **Mes demandes / liste** : `StatusChip` « Justificatifs attendus » / « Reliquat à rendre ».
- Trésorerie : aucune UI nouvelle, les restitutions apparaissent dans le registre.

## Décisions & alternatives écartées

- **Choix** : objet `FinancialJustification` séparé — *Pourquoi* : regroupe plusieurs occurrences
  d'une série par mois ; garde la demande et son plan de paiement intacts.
- **Écarté** : nouveaux statuts sur `FinancialRequest` (`JUSTIFYING`, `SETTLED`) — *Raison* : casse
  les filtres, statistiques et écrans existants qui lisent `APPROVED`, et ne sait pas regrouper un
  mois de série.
- **Choix** : ouverture à la confirmation du dernier versement — *Pourquoi* : c'est l'événement
  « fonds remis » de la spec ; aucune reprise des demandes passées (pas de relance rétroactive).
- **Choix** : reliquat lu par la trésorerie (ADR-0027) — *Pourquoi* : même mécanisme que « Payé
  depuis », pas d'écriture dupliquée, modification à l'origine seulement.
- **Écarté** : complément par une tranche ajoutée à l'avance — *Raison* : choix de la compta, la
  note de frais liée garde la validation habituelle.
- **Choix** : statistiques au prorata pour une série — *Pourquoi* : une facture mensuelle couvre
  plusieurs occurrences ; le prorata du remis répartit sans nouvelle saisie.
- **Choix** : responsables et Ministre lus en base dans `accounting` — *Pourquoi* : `accounting`
  dépend déjà de `planning` dans son manifeste, mais l'import d'un service ne sert qu'à deux
  requêtes ; la lecture directe suit le motif de `messages`.

## Risques & points d'attention

- **Transaction du versement** : `openJustificationIfDue` reçoit le `tx` ; la notification
  d'ouverture part après la transaction (motif `dispatchUserEmails`).
- **Tranche résiduelle** (remise partielle) : une tranche non confirmée reste → pas d'ouverture
  tant qu'elle n'est pas remise. Testé.
- **Mois de trésorerie clôturé** : la restitution datée d'un mois clôturé est refusée ; un mois
  clôturé après coup ne change pas la ligne reprise (lecture).
- **Désactivation de la trésorerie** : « Rendu sur » indisponible (400), restitution sur compte
  commun seulement.
- **Double relance** : prise atomique sur `nextReminderAt`.
- **Pièces** : réutiliser `assertAttachmentsAssignable` pour qu'aucune pièce d'une autre église
  ou d'un autre déposant ne soit rattachée.
- **Assistant** : fiche « Mes justificatifs à fournir » à ajouter à la base (KB) ; question de
  données facultative, hors périmètre de ce plan.

## Stratégie de tests

- `justification-rules.test.ts` : transitions (`nextStatus`), reliquat/complément, échéances
  (première relance, intervalle, après refus), regroupement mensuel d'une série, éligibilité
  (avance, note sans pièce, navette, issue de la navette, note liée).
- `justifications.test.ts` (Prisma mocké) : ouverture au dernier versement et pas avant ; dépôt
  par un autre que le demandeur refusé ; acceptation avec et sans reliquat ; refus avec motif ;
  dispense ; restitution avec compte (ligne lue par la trésorerie) et sans ; relances idempotentes
  et escalade à la 3e ; demandeur sans rôle.
- `stats.test.ts` : montant effectif d'une demande soldée, prorata d'une série.
- Routes (`src/app/api/accounting/__tests__`) : 403/404 hors périmètre ou autre église, Zod,
  restitution sur mois clôturé refusée.
- `reprises` de la trésorerie : restitution reprise en entrée.
- Exhaustivité : `route-exhaustiveness`, `openapi.test`, contrat du cron, seuil Prisma des routes.
