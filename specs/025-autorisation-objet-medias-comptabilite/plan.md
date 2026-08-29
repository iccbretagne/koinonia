# Plan technique — Autorisation objet des médias et des pièces comptables

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-29

## Vérification de conformité (constitution)

- [x] **Frontières modules** : les routes continuent d'importer `@/modules/media` via son index ;
      aucune nouvelle dépendance inter-modules n'est introduite
- [x] **Sécurité** : routes session protégées par `requireCurrentChurchPermission` (spec 024) ;
      routes à jeton bornées par le périmètre du jeton ; multi-tenant `churchId` renforcé
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune permission nouvelle
- [x] **Validation** Zod : schémas existants conservés, `attachmentIds` déjà validé en forme
- [x] **Migration** Prisma prévue (`churchId` sur les pièces jointes) — jamais `db push`
- [x] **Enums** importés depuis `@/generated/prisma/client`
- [x] **UI** : aucun changement d'interface (correctifs serveur uniquement)

## Approche générale

Deux corrections indépendantes, réunies parce qu'elles relèvent du même principe : **le périmètre
d'autorisation se déduit de l'objet, jamais d'un champ facultatif du porteur d'accès ni d'un
rattachement que l'appelant peut lui-même provoquer.**

1. **Médias** — remplacer les gardes de périmètre *conditionnelles* par des gardes
   *inconditionnelles*, et faire porter le filtre par la requête elle-même plutôt que par un `if`
   consécutif. Le motif correct existe déjà dans le dépôt (`validate/[token]/file/[fileId]`) : on
   l'aligne.
2. **Comptabilité** — donner aux pièces jointes une **église propre**, écrite au dépôt et jamais
   dérivée du rattachement, puis valider les pièces désignées avant de les rattacher.

### Constat élargi par rapport à l'audit

L'audit ne signale que `validate/[token]/photo/[photoId]`. La lecture du code montre que la même
garde conditionnelle existe dans **deux routes supplémentaires** :

| Route | Garde | Atteignable ? |
|---|---|---|
| `validate/[token]/photo/[photoId]` (GET + PATCH) | `if (shareToken.mediaEventId && …)` | **Oui** — pas de branche projet : un jeton projet tombe directement dans le code photo |
| `gallery/[token]/photo/[photoId]` | `if (shareToken.mediaEventId && …)` | **Oui, mais étroitement** — la branche projet intercepte les jetons projet ; reste le jeton sans aucune cible |
| `download/[token]/photo/[photoId]` | `if (shareToken.mediaEventId && …)` | Idem gallery |

Le type `CreateTokenWithTarget` (`services/tokens.ts`) autorise explicitement une troisième forme
`{ mediaEventId?: never; mediaProjectId?: never }` — un jeton **sans aucune cible** est donc
représentable. Pour ces deux routes, la garde conditionnelle devient alors un accès total. Les
trois sont corrigées, la nuance d'atteignabilité étant consignée ici et non dans la spec.

**Fait structurant** : `MediaPhoto.mediaEventId` est **obligatoire** (schema.prisma:892) et
`MediaProject` n'a **aucune** relation `photos` — un projet ne contient que des fichiers. Un jeton
délégué à un projet n'a donc légitimement **rien** à faire sur une route photo : le refus est la
seule réponse correcte, et non une tentative de résolution alternative.

## Modèle de données

`FinancialAttachment` ne porte **aucun** `churchId` : son église est aujourd'hui déduite de
`request.churchId`. C'est exactement la dérivation que l'attaquant manipule en rattachant la pièce
à sa propre demande. On rend donc l'église **intrinsèque** à la pièce.

```prisma
model FinancialAttachment {
  id           String  @id @default(cuid())
  requestId    String?
  uploadedById String?
  // Église de dépôt — autorité pour toute décision d'accès.
  // Ne dépend jamais du rattachement à une demande, que l'appelant peut provoquer.
  churchId     String
  church       Church  @relation(fields: [churchId], references: [id])
  s3Key        String  @db.VarChar(512)
  // … champs inchangés

  @@index([requestId])
  @@index([churchId])
  @@map("financial_attachments")
}
```

**Migration** (`npm run db:migrate`, nom suggéré `add_church_to_financial_attachments`) :

1. Ajouter la colonne en **nullable**.
2. Remplir l'existant. Deux sources, dans cet ordre :
   - `request.churchId` lorsque la pièce est rattachée ;
   - à défaut (pièces orphelines), l'église est **extractible du chemin de stockage** : les clés
     suivent `accounting/{churchId}/{horodatage}-{aléa}.{ext}` (`attachments/route.ts`). Le
     backfill lit ce segment.
3. Passer la colonne en **NOT NULL**.

L'étape 2 est écrite dans le fichier de migration SQL, pas dans un script à part : la reprise doit
être atomique avec l'ajout de contrainte.

> Si des lignes résiduelles ne sont récupérables par aucune des deux sources, la migration doit
> échouer bruyamment plutôt que d'inventer une église. Le cas sera traité manuellement.

## API

Aucun endpoint créé ni supprimé. Modifications de comportement :

| Endpoint | Méthode | Contrôle ajouté |
|---|---|---|
| `/api/media/validate/[token]/photo/[photoId]` | GET, PATCH | Refus si le jeton ne porte pas d'événement ; filtre par événement porté dans la requête |
| `/api/media/gallery/[token]/photo/[photoId]` | GET | Idem |
| `/api/media/download/[token]/photo/[photoId]` | GET | Idem |
| `/api/accounting/requests` | POST | Les `attachmentIds` sont validés (déposant, orphelines, même église) avant rattachement, dans la transaction de création |
| `/api/accounting/attachments/[id]` | GET | L'église fait autorité via `churchId` propre ; lire la pièce d'un tiers exige `accounting:manage` |
| `/api/accounting/attachments/[id]` | DELETE | L'église fait autorité via `churchId` propre |
| `/api/accounting/attachments` | POST | Écrit `churchId` au dépôt |

**Permission retenue pour lire la pièce d'un tiers** : `accounting:manage`
(`SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`) — c'est la compétence de **traitement** des demandes,
conformément à la décision de la spec. `accounting:submit` (qui inclut `MINISTER` et
`DEPARTMENT_HEAD`) ne suffit pas. Le déposant garde l'accès à ses propres pièces sans condition
de permission.

Aucun schéma Zod ne change : `attachmentIds` est déjà validé en forme (tableau de chaînes). Ce qui
manquait n'est pas de la validation de forme mais de l'autorisation — elle ne peut se faire qu'en
base et ne relève donc pas de Zod.

## Services / logique métier

**Média** — pas de nouveau service. Les routes appliquent le motif déjà présent dans
`validate/[token]/file/[fileId]` :

```
1. refuser si le jeton ne porte pas le type de périmètre attendu ;
2. charger l'objet avec un `findFirst` filtré par l'identifiant ET le périmètre du jeton ;
3. absence de résultat → 404 unique.
```

L'étape 2 supprime la fenêtre entre lecture et vérification, et l'étape 3 satisfait le critère de
non-divulgation : hors périmètre et inexistant rendent la **même** réponse. Le PATCH poursuit avec
un `updateMany` filtré sur le même périmètre, pour que la mise à jour ne puisse pas viser un objet
que la lecture n'a pas autorisé.

**Comptabilité** — un service unique dans `src/modules/accounting/services/attachments.ts` porte la
règle, afin que les trois appelants ne la réimplémentent pas :

- `assertAttachmentsAssignable(attachmentIds, { userId, churchId })` — vérifie en **une** requête
  que chaque identifiant désigne une pièce du déposant, sans `requestId`, et de l'église donnée.
  Toute divergence de cardinalité (pièce absente, d'autrui, déjà rattachée, autre église) lève un
  `ApiError` unique et indifférencié.
- `canReadAttachment(attachment, session, churchId)` — déposant, ou `accounting:manage` dans
  l'église de la pièce.

L'appel à `assertAttachmentsAssignable` et la création de la demande sont enveloppés dans une
**transaction** (`prisma.$transaction`), afin que le critère « aucun rattachement partiel » tienne
aussi face à une suppression concurrente de la pièce entre la vérification et le `connect`.

## UI / composants

Aucun changement. Les corrections sont exclusivement serveur ; les parcours légitimes (déposer une
pièce, la joindre à sa demande, valider des photos depuis un lien correctement délégué) conservent
un comportement identique.

## Décisions & alternatives écartées

- **Choix** : refuser un jeton sans événement sur les routes photo, plutôt que de tenter de
  résoudre les photos « du projet ». — *Pourquoi* : une photo appartient toujours à un événement
  et jamais à un projet ; il n'existe aucune interprétation valide de cette combinaison. La
  refuser est à la fois correct et non-ambigu.
- **Choix** : filtrer dans la requête (`findFirst` / `updateMany` avec le périmètre) plutôt que de
  charger puis comparer. — *Pourquoi* : rend le défaut non-représentable — on ne peut pas oublier
  la comparaison si elle n'est plus une étape distincte — et supprime la divulgation d'existence.
- **Choix** : ajouter `churchId` aux pièces jointes. — *Pourquoi* : sans lui, toute vérification
  d'église reste dérivée d'un rattachement que l'appelant contrôle. C'est le seul correctif qui
  ferme l'enchaînement plutôt que d'en masquer une étape.
- **Écarté** : se contenter de vérifier la propriété des pièces au rattachement, sans `churchId`.
  — *Raison* : corrige le chemin connu mais laisse l'église dérivée d'une relation mutable ; tout
  futur chemin d'écriture rouvrirait le défaut.
- **Écarté** : exiger `accounting:view` pour lire la pièce d'un tiers. — *Raison* : cette
  permission inclut `MINISTER` et `DEPARTMENT_HEAD`, soit précisément les rôles soumetteurs que la
  spec veut exclure de la lecture croisée.
- **Écarté** : un `churchId` sur les pièces alimenté depuis le contexte d'église affiché à la
  lecture. — *Raison* : réintroduirait une valeur d'origine cliente dans une décision
  d'autorisation, ce que la spec 024 vient d'éliminer.
- **Écarté** : corriger uniquement la route signalée par l'audit. — *Raison* : deux autres routes
  portent la même garde conditionnelle ; les laisser reviendrait à corriger un symptôme.

## Risques & points d'attention

- **Migration sur données existantes** : le backfill dépend du format des clés de stockage pour les
  pièces orphelines. Le format est stable et vérifié dans le code actuel, mais des pièces déposées
  avant ce format seraient irrécupérables. La migration doit échouer plutôt que de deviner.
- **Rattachements incorrects déjà en base** : la spec les place hors périmètre. Après migration,
  l'église d'une pièce redevient celle du dépôt, donc un rattachement abusif antérieur cesse
  d'accorder l'accès — le correctif neutralise le passé sans le nettoyer.
- **Restriction de lecture** : des personnes qui consultaient les pièces d'autrui avec un rôle
  `MINISTER`/`DEPARTMENT_HEAD` perdront cet accès. Ce n'était pas un usage prévu, mais il faut
  s'attendre à un signalement.
- **Jetons sans cible** : leur existence est autorisée par le type mais leur usage légitime n'est
  pas clair. Le plan les traite en refus sur les routes photo ; il ne cherche pas à les supprimer.
- **Non-régression média** : les liens correctement délégués (événement pour les photos, projet
  pour les fichiers) doivent continuer à fonctionner à l'identique — c'est le principal risque de
  régression fonctionnelle visible.

## Stratégie de tests

Tests unitaires Vitest, en miroir de ceux ajoutés par la spec 024 (mocks `prismaMock`, sessions de
`@/__mocks__/auth`).

**Médias** — `src/app/api/media/__tests__/validate-photo-scope.test.ts` :
- jeton **projet** sur une route photo → refusé (GET et PATCH), aucune écriture émise ;
- jeton **sans cible** → refusé sur les trois routes ;
- jeton **événement** visant une photo d'un **autre** événement → refusé ;
- jeton **événement** visant une photo de **son** événement → autorisé (non-régression) ;
- refus hors périmètre et refus pour photo inexistante → **même** statut et **même** message ;
- le PATCH refusé ne déclenche aucune transition d'état de l'événement.

**Comptabilité** — `src/modules/accounting/services/__tests__/attachments.test.ts` et
`src/app/api/accounting/__tests__/attachments-scope.test.ts` :
- création de demande avec une pièce **d'autrui** → refus, demande non créée ;
- avec une pièce **déjà rattachée** → refus ;
- avec une pièce d'une **autre église** → refus ;
- lot **mixte** (une valide, une invalide) → refus global, **aucun** rattachement (le critère
  d'atomicité) ;
- avec ses propres pièces orphelines → succès (non-régression) ;
- lecture d'une pièce d'un tiers avec `accounting:submit` seul → refusée ; avec
  `accounting:manage` → autorisée ; par le déposant → autorisée ;
- lecture d'une pièce d'une autre église, y compris en manipulant le contexte d'église → refusée.

La couverture cible les chemins d'autorisation, conformément au constat Q-01 de l'audit sur
l'absence de tests d'autorisation objet.
