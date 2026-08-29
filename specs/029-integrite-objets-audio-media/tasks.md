# Tâches — Garanties réellement appliquées sur les dépôts et les publications audio/média

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → tests. Les tâches `[P]` sont parallélisables.
> Les trois volets (M-02 média, M-03 publication, M-04 comptage) sont indépendants entre eux.

## Prérequis

- [x] Branche créée : `feat/integrite-objets-audio-media`
- [x] Migration Prisma générée (T1)

## Tâches

### 1. Données & migration (volet M-03)

- [x] **T1** — Ajouter `segmentId String?` et `sourceHash String?` sur `AudioJob`, plus
      `@@unique([segmentId, sourceHash])`. Commenter dans le modèle que la contrainte porte sur
      tous les jobs (y compris terminés) et qu'un re-rendu d'un couple déjà traité suppose de
      supprimer l'ancienne ligne. Générer la migration avec `npm run db:migrate` (jamais
      `db push`). *(fichiers : `prisma/schema.prisma`, `prisma/migrations/…`)*

### 2. Services / helpers

- [x] **T2** [P] — Ajouter `getMediaObjectSize(key: string): Promise<number | null>` dans
      `src/lib/s3.ts` (`HeadObjectCommand` sur `s3Media`/`MEDIA_BUCKET`) : retourne la taille,
      `null` si l'objet n'existe pas (`NotFound`/404), propage toute autre erreur.
      *(fichier : `src/lib/s3.ts`)*
- [x] **T3** [P] — Extraire `MAX_FILE_SIZE` (500 Mo) de la route de signature vers
      `src/modules/media/`, l'exporter depuis l'index du module, et faire consommer cette
      constante par la route de signature à la place de sa copie locale.
      *(fichiers : `src/modules/media/…`, `src/modules/media/index.ts`,
      `src/app/api/media/files/upload/sign/route.ts`)*
- [x] **T4** — Dans `publishAudioService()`, renseigner `segmentId` et `sourceHash` en colonnes
      sur chaque entrée de `jobsToCreate` (le `payload` reste écrit à l'identique), et passer
      `skipDuplicates: true` à `createMany`. Ne rien changer d'autre (contrôles de dépôt
      incomplet, `nowReady`, transition `READY`/`PUBLISHED`).
      *(fichier : `src/modules/audio/services/publish.ts`)*

### 3. API (route handlers)

- [x] **T5** — Dans le bloc `confirmUpload` de `PATCH /api/media/files/[id]`, avant la création de
      la version : constater la taille réelle via `getMediaObjectSize(derivedKey)` ; `null` →
      `ApiError(404, …)` ; taille > `MAX_FILE_SIZE` → `deleteMediaFiles([derivedKey])` puis
      `ApiError(400, …)` sans créer de version ni changer le statut ; sinon créer la version comme
      aujourd'hui et mettre `MediaFile.size` à la taille **réelle** dans le même `update` que le
      passage en `IN_REVIEW`. Préserver la garde `existingVersions === 0`.
      *(fichier : `src/app/api/media/files/[id]/route.ts`)*
- [x] **T6** — Dans `POST /api/audio/public/[token]/play`, remplacer le couple
      `findUnique` + `update` par un `updateMany` unique dont le `where` inclut `id`,
      `serviceId: shareToken.serviceId` et `service: { status: "PUBLISHED" }` ; `count === 0` →
      `ApiError(410, "Ce culte n'est plus disponible.")` (message et code repris mot pour mot de
      la route de streaming). Conserver les contrôles de jeton révoqué (404) et de segment hors
      périmètre (403) tels quels.
      *(fichier : `src/app/api/audio/public/[token]/play/route.ts`)*

### 4. Tests

- [x] **T7** [P] — Tests de la confirmation de dépôt média (`getMediaObjectSize` mockée) : objet
      hors quota → 400 + `deleteMediaFiles` appelée avec la clé dérivée + aucune version créée +
      statut inchangé ; objet absent → 404, aucune création ni suppression ; objet plus petit que
      déclaré mais dans les clous → version créée + `size` mis à la taille réelle + `IN_REVIEW` ;
      `confirmUpload` sur un fichier ayant déjà une version → aucun appel S3, aucune création.
      *(fichier : `src/app/api/media/files/[id]/__tests__/confirm-upload.test.ts`)*
- [x] **T8** [P] — Étendre `publish.test.ts` : vérifier que les entrées passées à `createMany`
      portent `segmentId` et `sourceHash` en colonnes en plus du `payload`, et que `createMany`
      est appelé avec `skipDuplicates: true`. Confirmer que les cas existants (aucun job si aucun
      hash n'a changé, publication immédiate en `PUBLISHED`, refus si dépôt incomplet) passent
      toujours sans modification.
      *(fichier : `src/modules/audio/services/__tests__/publish.test.ts`)*
- [x] **T9** [P] — Tests du comptage de lecture publique : culte publié + jeton valide →
      `updateMany` appelé avec `service: { status: "PUBLISHED" }` dans le `where`, réponse 200 ;
      `count === 0` (culte dépublié) → 410 avec le message aligné sur le streaming, aucune autre
      écriture ; jeton révoqué → 404 ; segment hors périmètre du jeton → 403.
      *(fichier : `src/app/api/audio/public/[token]/play/__tests__/…test.ts`)*

## Traçabilité critères d'acceptation → tâches

| Critère d'acceptation (spec.md) | Couvert par |
|---|---|
| Fichier réellement déposé hors limite refusé à la confirmation | T2, T5, T7 |
| Fichier refusé ne reste pas stocké | T5, T7 |
| Taille enregistrée/affichée = taille réelle | T5, T7 |
| Confirmation sur fichier absent refusée explicitement | T2, T5, T7 |
| Deux publications simultanées → pas de préparation en double | T1, T4, T8 |
| Republication sans changement ne déclenche toujours rien | T4, T8 (non-régression) |
| Compteur d'un culte dépublié non incrémentable | T6, T9 |
| Compteur redevient incrémentable après republication | T6, T9 (le `where` suit le statut courant) |
| Écoute et comptage d'un culte publié inchangés | T6, T9 (non-régression) |

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`
