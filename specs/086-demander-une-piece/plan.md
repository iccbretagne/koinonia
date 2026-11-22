# Plan technique — Compta : « Demander une pièce »

- **Spec associée** : `./spec.md`
- **Statut** : Implémenté
- **Mis à jour le** : 2026-11-22

## Vérification de conformité (constitution)

- [x] **Frontières modules** : services dans `accounting` et `shuttle`, routes via leurs index
- [x] **Sécurité** : église de la **demande** / de la **ligne** (jamais l'église affichée) ; `accounting:manage` / `requireShuttleManager` pour demander ; demandeur / auteur vérifiés objet par objet pour déposer
- [x] **Permissions** via `rolePermissions` ; aucune permission ajoutée
- [x] **Validation** Zod (note ≤ 500) ; fichiers : type et taille comme aujourd'hui
- [x] **Migration** Prisma (colonnes sur deux tables)
- [x] **UI** : `Button`, `Modal`, `Field`, `Alert`, `StatusChip`, `useToast`

## Approche générale

Un état « pièce demandée » porté **par l'objet** (demande financière, ligne de navette), comme le
signalement de la navette (`flagNote`/`flaggedAt`). Il ouvre au demandeur seul un dépôt **par
lot** (un appel, plusieurs fichiers) hors des règles habituelles ; le premier lot referme l'état
et prévient la compta une fois.

## Modèle de données

```prisma
model FinancialRequest {
  // …
  pieceRequestedAt   DateTime?            // non nul = pièce demandée (mention, dépôt ouvert)
  pieceRequestLastAt DateTime?            // dernière demande ou relance
  pieceRequestCount  Int       @default(0) // demandes + relances du cycle en cours
  pieceRequestNote   String?   @db.VarChar(500)
  @@index([churchId, pieceRequestedAt])
}

model ShuttleEntry {
  // …
  receiptRequestedAt   DateTime?
  receiptRequestLastAt DateTime?
  receiptRequestCount  Int       @default(0)
  receiptRequestNote   String?   @db.VarChar(500)
}
```

Dépôt ou annulation : `…RequestedAt`, `…LastAt`, `…Note` à `null`, compteur à 0.

## API

| Endpoint | Méthode | Garde | Entrée |
|---|---|---|---|
| `/api/accounting/requests/[id]` | PATCH `action: "requestPiece"` | `accounting:manage` (église de la demande) ; refus si `CANCELLED`/`REJECTED` ou demandeur plus membre | `{ note?: string ≤ 500 }` |
| `/api/accounting/requests/[id]` | PATCH `action: "cancelPieceRequest"` | `accounting:manage` | — |
| `/api/accounting/requests/[id]/pieces` | POST multipart `files[]` (1 à 10) | `requireAuth` ; demandeur (`submittedById`), membre de l'église de la demande, pièce demandée, demande non annulée/rejetée | fichiers JPEG/PNG/PDF ≤ 5 Mo chacun |
| `/api/accounting/navette/entries/[id]/receipt-request` | PUT / DELETE | `entryAccess(id, true)` (gestion) | `{ note?: string }` |
| `/api/accounting/navette/entries/[id]/receipt` | POST multipart `file` | `entryAccess(id)` + auteur de la ligne + justificatif demandé (hors délai de 48 h, seul le justificatif change) | un fichier, contrôles de `receipts.ts` |

`POST /api/accounting/attachments` reste **inchangé** (dépôt à l'état « Soumise »). Pas de
`accounting:submit` exigé sur `…/pieces` : un STAR auteur d'une note issue de la navette doit
pouvoir répondre (le droit vient de l'objet).

Contrats `contract.ts`, déclaration des routes dans les manifestes, `npm run openapi`.

## Services

`src/modules/accounting/services/piece-requests.ts` (exporté par l'index) :
- `requestPiece(requestId, actor, note?)` : pose/rafraîchit l'état (`requestedAt` gardé au
  premier, `lastAt = now`, `count + 1`), `logAudit` (`FinancialRequest`, `pieceRequest`),
  `createNotification` au demandeur (domaine `accounting`, type `ACCOUNTING_PIECE_REQUESTED`,
  titre « Pièce demandée », message = libellé + note, lien `/accounting/requests/<id>`) — email
  générique selon préférences, push par la cloche.
- `cancelPieceRequest(requestId, actor)`.
- `submitPieces(requestId, userId, files)` : contrôles, `storeFile` par fichier (rollback des
  fichiers déjà stockés en cas d'échec), `financialAttachment.create`, remise à zéro de l'état
  **dans la même transaction** (prise conditionnelle `where: { pieceRequestedAt: { not: null } }`
  : un double envoi ne notifie qu'une fois), `logAudit`, notification aux comptables (mêmes
  destinataires que `ACCOUNTING_NEW_REQUEST` : rôle `ACCOUNTANT` de l'église, plus
  `church.accountingEmails` en email direct), type `ACCOUNTING_PIECE_SUBMITTED`.

`src/modules/shuttle/services/receipt-requests.ts` : `requestReceipt`, `cancelReceiptRequest`
(via `notifyEntryAuthor`, type `SHUTTLE_RECEIPT_REQUESTED`), `submitRequestedReceipt` (réutilise
la validation et `storeReceipt` de `receipts.ts`, remplace `receipt*` de la ligne sans passer par
`assertCanEdit`, notifie la gestion via `notifyManagers`).

## UI

- `RequestDetail.tsx` :
  - gestion : bouton « Demander une pièce » / « Relancer » (modal, note facultative), mention
    « Pièce demandée le … · relancée N fois, le … », lien « Annuler la demande » ;
  - demandeur : `Alert` avec la note et un champ fichiers multiples + « Envoyer » quand une pièce
    est demandée.
- `AccountingDashboard.tsx` : pastille « Pièce demandée » et filtre « Pièce demandée (N) ».
- Registre navette (page `/accounting/navette`, détail d'une ligne) : bouton « Demander le
  justificatif » pour la gestion, encart de dépôt pour l'auteur.

## Décisions & alternatives écartées

- **Choix** : état sur l'objet plutôt qu'une table d'historique — *Pourquoi* : une seule demande
  en cours par objet ; l'historique vit dans `audit_logs`. Même modèle que `flagNote`.
- **Choix** : dépôt par lot dans un appel — *Pourquoi* : « prévenue une fois par lot » sans
  fenêtre de temps ni bouton « J'ai terminé ».
- **Écarté** : rouvrir la demande en « Soumise » — *Raison* : casserait le traitement et les
  paiements en cours.
- **Écarté** : relâcher la garde de `POST /api/accounting/attachments` — *Raison* : route
  générique du formulaire ; un endpoint dédié garde la règle « Soumise » intacte.
- **Pas d'ADR** : pattern local.

## Risques

- Fichiers stockés puis échec en base : suppression des fichiers déjà écrits (comme `stageAsset`).
- Demandeur sans compte actif : refus 400 côté service, bouton masqué côté écran.

## Tests

- `piece-requests.test.ts` : demande (compteur, dates, notification), refus sur annulée/rejetée,
  relance, annulation, dépôt par le demandeur seul, refus sans demande en cours, double envoi
  notifié une fois, rollback des fichiers.
- `receipt-requests.test.ts` : demande, dépôt hors 48 h par l'auteur seulement, autre auteur
  refusé, ligne supprimée.
- Routes : 403/404 (autre église, autre compte), validation Zod, contrats et OpenAPI.
