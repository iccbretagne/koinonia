# Tâches — Reprise fiable de la migration des cultes Audiobookshelf après un échec partiel

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : journal → logique de décision → orchestration script → tests. Les tâches `[P]`
> sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/journal-migration-audiobookshelf`
- [ ] Migration Prisma : **sans objet** (aucun changement de schéma)

## Tâches

### 1. Journal (`ledger.ts`)

- [x] **T1** — Ajouter `status?: "started" | "done"` à `LedgerEntry`.
      *(fichier : `prisma/scripts/migrate-audiobookshelf/ledger.ts`)*
- [x] **T2** — Ajouter `latestEntryByFolder(entries, folder)` : retourne la dernière entrée du
      tableau correspondant au dossier, `undefined` si aucune. *(même fichier)*
- [x] **T3** — Ajouter `isFolderDone(entry)` : `true` si `entry?.status === "done"` ou
      `entry !== undefined && entry.status === undefined` (compat entrées historiques) ; `false`
      sinon. *(même fichier)*

### 2. Logique de décision (nouveau fichier, pur)

- [x] **T4** — Créer `resolution.ts` exportant `classifyFolders(folders, allEntries)` qui, pour
      chaque dossier, calcule sa dernière entrée via `latestEntryByFolder` et le classe dans
      `toImport` / `alreadyDone` (via `isFolderDone`) / `pendingCleanup` (dernière entrée
      `status: "started"`). *(fichier : `prisma/scripts/migrate-audiobookshelf/resolution.ts`)*

### 3. Orchestration du script (`index.ts`)

- [x] **T5** — Dans `importCulte()`, ajouter l'écriture de l'entrée `status: "started"` juste
      après `createAudioService(...)`, avant la boucle d'upload des séquences.
      *(fichier : `prisma/scripts/migrate-audiobookshelf/index.ts`)*
- [x] **T6** — Faire passer l'entrée finale (déjà écrite en fin de `importCulte()`, après
      `publishAudioService`) à `status: "done"`, avec un nouvel horodatage `at`. *(même fichier)*
- [x] **T7** — Dans `main()` (import normal), remplacer le calcul `done`/`candidates` actuel par
      un appel à `classifyFolders(...)` : les dossiers `alreadyDone` sont ignorés (comme
      aujourd'hui), les dossiers `pendingCleanup` sont exclus des candidats à importer et affichés
      clairement en console avec l'instruction `--purge "<dossier>"` à exécuter avant reprise ;
      seuls les dossiers `toImport` sont proposés à l'import. *(même fichier)*
- [x] **T8** — Dans la branche `--purge` de `main()`, remplacer la recherche `.find()` sur la
      liste brute par `latestEntryByFolder(await readLedger(), args.purge)`. Si l'entrée trouvée
      correspond à un culte publié (`deleteAudioService` échoue avec `ApiError` `statusCode ===
      400`), appeler `unpublishAudioService(entry.serviceId, church.id, prisma)` puis retenter
      `deleteAudioService` avant de propager toute autre erreur. Import de `unpublishAudioService`
      depuis `@/modules/audio` à ajouter. *(même fichier)*
- [x] **T9** — Vérifier/adapter le texte du `README.md` du script si son contenu décrit encore
      l'ancien comportement de `--purge` en cas d'échec (ex. mentionner explicitement que
      `--purge` retrouve désormais toute tentative inaboutie, pas seulement un import réussi).
      *(fichier : `prisma/scripts/migrate-audiobookshelf/README.md`)*

### 4. Tests

- [x] **T10** [P] — `ledger.test.ts` : `latestEntryByFolder` (plusieurs entrées pour un même
      dossier → la dernière ; dossier absent → `undefined`) ; `isFolderDone` (`"done"` → `true`,
      `"started"` → `false`, `status` absent avec entrée présente → `true`, entrée absente →
      `false`) ; round-trip `appendLedger`/`readLedger` ; `removeFromLedger` retire bien toutes
      les lignes d'un dossier (y compris `started` + `done` combinées).
      *(fichier : `prisma/scripts/migrate-audiobookshelf/ledger.test.ts`)*
- [x] **T11** [P] — `resolution.test.ts` : dossier sans entrée → `toImport` ; dossier avec entrée
      `done` → `alreadyDone` ; dossier avec entrée historique sans `status` → `alreadyDone` ;
      dossier avec entrée `started` seule → `pendingCleanup` (jamais `toImport`) ; dossier avec
      `started` puis `done` → `alreadyDone` ; plusieurs dossiers mélangés dans un seul appel →
      classement indépendant correct de chacun.
      *(fichier : `prisma/scripts/migrate-audiobookshelf/resolution.test.ts`)*

## Traçabilité critères d'acceptation → tâches

| Critère d'acceptation (spec.md) | Couvert par |
|---|---|
| Pas de doublon après échec post-création, avant nettoyage | T5, T7, T11 |
| `--purge` retrouve et supprime une tentative inaboutie | T2, T4, T8, T10, T11 |
| Culte nettoyé réimportable normalement, import unique | T7, T8, T11 |
| Entrées historiques (avant cette évolution) reconnues comme déjà importées | T3, T10, T11 |
| Aucune trace bloquante si l'échec précède toute création de donnée | T5 (l'entrée n'existe que si `createAudioService` a réussi — aucun changement requis en amont) |
| Message d'échec cohérent avec la procédure de reprise réelle | T7 (aucun changement de texte nécessaire — devient vrai grâce à T5/T8) |

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`
