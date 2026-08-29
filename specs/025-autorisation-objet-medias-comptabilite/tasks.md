# Tâches — Autorisation objet des médias et des pièces comptables

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Deux chantiers indépendants : **médias** (T4–T6, gardes de périmètre des jetons) et
> **comptabilité** (T1–T3, T7–T9, église intrinsèque des pièces). Ils ne partagent aucun fichier
> et peuvent être menés en parallèle jusqu'aux tests.

## Prérequis

- [x] Branche créée : `fix/autorisation-objet-medias-comptabilite`
- [x] Migration Prisma générée (schéma modifié : `churchId` sur les pièces jointes)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter `churchId` (obligatoire) et sa relation `church` au modèle
      `FinancialAttachment`, avec `@@index([churchId])`. Documenter en commentaire que ce champ
      fait autorité et ne dépend jamais du rattachement à une demande.
      *(fichier : `prisma/schema.prisma`)*

- [x] **T2** — Générer la migration (`npm run db:migrate`, nom `add_church_to_financial_attachments`)
      puis **éditer le SQL** pour que l'ajout et la reprise soient atomiques, dans cet ordre :
      colonne nullable → remplissage depuis `request.churchId` → remplissage du reliquat depuis le
      2ᵉ segment de `s3Key` (`accounting/{churchId}/…`) → passage en `NOT NULL`.
      La migration doit **échouer** s'il reste des lignes sans église, jamais en inventer une.
      *(fichier : `prisma/migrations/…/migration.sql`)*

### 2. Logique métier (services)

- [x] **T3** — Créer le service d'autorisation des pièces jointes, seul porteur de la règle :
      - `assertAttachmentsAssignable(attachmentIds, { userId, churchId })` — vérifie en **une**
        requête que chaque identifiant désigne une pièce du déposant, **sans** `requestId`, et de
        l'église donnée ; toute divergence de cardinalité lève un `ApiError` **unique et
        indifférencié** (ne jamais révéler laquelle des conditions a échoué) ;
      - `canReadAttachment(attachment, session, churchId)` — vrai si déposant, ou si
        `accounting:manage` dans l'église **de la pièce**.
      Exporter les deux depuis l'index du module (les routes importent via `@/modules/accounting`,
      jamais un chemin interne).
      *(fichiers : `src/modules/accounting/services/attachments.ts`, `src/modules/accounting/index.ts`)*

### 3. API (route handlers)

- [x] **T4** — **Médias / validation** : refuser inconditionnellement un jeton sans événement
      (`if (!shareToken.mediaEventId) throw new ApiError(403, …)`), puis charger la photo avec un
      `findFirst` filtré par `{ id, mediaEventId: shareToken.mediaEventId }` et répondre **404**
      si absente. Le PATCH poursuit avec un `updateMany` filtré sur le même périmètre, afin que
      l'écriture ne puisse viser un objet que la lecture n'a pas autorisé. Vérifier que la
      transition d'état de l'événement n'est pas déclenchée sur un refus.
      *(fichier : `src/app/api/media/validate/[token]/photo/[photoId]/route.ts`)*

- [x] **T5** [P] — **Médias / galerie** : même traitement sur la branche photo (la branche projet
      existante, correctement scopée, reste inchangée).
      *(fichier : `src/app/api/media/gallery/[token]/photo/[photoId]/route.ts`)*

- [x] **T6** [P] — **Médias / téléchargement** : même traitement sur la branche photo.
      *(fichier : `src/app/api/media/download/[token]/photo/[photoId]/route.ts`)*

- [x] **T7** — **Comptabilité / dépôt** : écrire `churchId` à la création de la pièce (l'église
      vient de `requireCurrentChurchPermission`, déjà en place).
      *(fichier : `src/app/api/accounting/attachments/route.ts`)*

- [x] **T8** — **Comptabilité / création de demande** : appeler `assertAttachmentsAssignable`
      avant de rattacher, et envelopper vérification **et** création dans une même
      `prisma.$transaction`, pour qu'aucun rattachement partiel ne survive à une suppression
      concurrente. Un lot contenant une seule pièce invalide ne crée **aucune** demande.
      *(fichier : `src/app/api/accounting/requests/route.ts`)*

- [x] **T9** — **Comptabilité / consultation et suppression** : faire porter l'autorité à
      `attachment.churchId` (et non plus à `request.churchId`), et soumettre la lecture d'une
      pièce d'un tiers à `canReadAttachment` — `accounting:submit` seul ne suffit plus.
      *(fichier : `src/app/api/accounting/attachments/[id]/route.ts`)*

### 4. UI

*Aucune tâche : les corrections sont exclusivement serveur et les parcours légitimes conservent un
comportement identique.*

### 5. Tests

- [x] **T10** — **Périmètre des jetons média** : jeton **projet** sur une route photo refusé en
      GET **et** PATCH sans écriture émise ; jeton **sans cible** refusé sur les trois routes ;
      jeton événement visant la photo d'un **autre** événement refusé ; jeton événement visant
      **sa** photo autorisé (non-régression) ; refus hors périmètre et photo inexistante rendant
      le **même** statut et le **même** message ; aucune transition d'état d'événement sur refus.
      *(fichier : `src/app/api/media/__tests__/validate-photo-scope.test.ts`)*

- [x] **T11** [P] — **Service d'autorisation comptable** : pièce d'autrui, pièce déjà rattachée,
      pièce d'une autre église, identifiant inexistant → chacun rejeté avec le **même** message ;
      pièces propres et orphelines → acceptées ; `canReadAttachment` vrai pour le déposant et pour
      `accounting:manage`, faux pour `accounting:submit` seul.
      *(fichier : `src/modules/accounting/services/__tests__/attachments.test.ts`)*

- [x] **T12** — **Bout en bout comptable** : création de demande refusée pour une pièce d'autrui,
      déjà rattachée, ou d'une autre église ; lot **mixte** → refus global et **aucun**
      rattachement (critère d'atomicité) ; création avec ses propres pièces orphelines → succès ;
      lecture d'une pièce d'un tiers refusée avec `accounting:submit`, autorisée avec
      `accounting:manage`, autorisée pour le déposant ; lecture inter-églises refusée **même en
      manipulant le contexte d'église** (l'autorité est `attachment.churchId`).
      *(fichier : `src/app/api/accounting/__tests__/attachments-scope.test.ts`)*

## Traçabilité des critères d'acceptation

| Critère (spec) | Couvert par |
|---|---|
| Jeton projet ne peut ni lire ni modifier hors projet | T4, T10 |
| Jeton événement ne peut ni lire ni modifier hors événement | T4–T6, T10 |
| Jeton sans périmètre exploitable n'accorde aucune action | T4–T6, T10 |
| Aucun accès à un média d'une autre église par lien partagé | T4–T6, T10 |
| Refus hors périmètre indiscernable du refus « inexistant » | T4–T6, T10 |
| Demande avec pièce déposée par autrui refusée | T3, T8, T11, T12 |
| Demande avec pièce déjà rattachée refusée | T3, T8, T11, T12 |
| Demande avec pièce d'une autre église refusée | T3, T8, T11, T12 |
| Pièce invalide → aucun rattachement, demande non créée | T8, T12 |
| Lecture de la pièce d'un tiers exige `accounting:manage` | T3, T9, T11, T12 |
| L'église d'une pièce n'est pas modifiable par l'appelant | T1, T2, T7, T9, T12 |
| Dépôt/lecture de ses propres pièces et travail comptable inchangés | T9, T11, T12 |
| Tests couvrant jeton projet/événement, pièce d'autrui, inter-églises | T10, T11, T12 |

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] **Avant déploiement** : la migration T2 est irréversible en pratique (colonne `NOT NULL`
      remplie par reprise) — vérifier sur une copie des données de production qu'aucune pièce ne
      résiste au double backfill avant de l'appliquer
- [ ] **Après déploiement** : signaler que la lecture des pièces justificatives d'autrui est
      désormais réservée au traitement comptable (`ACCOUNTANT`, `ADMIN`, `SUPER_ADMIN`) — les rôles
      `MINISTER` et `DEPARTMENT_HEAD` perdent cet accès
- [ ] PR ouverte vers `main`
