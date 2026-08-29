# Plan technique — Reprise fiable de la migration des cultes Audiobookshelf après un échec partiel

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import cross-module ; le script continue d'utiliser
      les seules fonctions déjà exposées par `@/modules/audio` (`createAudioService`,
      `deleteAudioService`, `unpublishAudioService`, `publishAudioService`, `applySequences`)
- [x] **Sécurité** : sans objet — outil hors application web, exécuté par un opérateur ayant déjà
      un accès direct à la base de données et à l'environnement serveur ; aucune route ajoutée
- [x] **Permissions** via `rolePermissions` : sans objet, pas de route API concernée
- [x] **Validation** Zod : sans objet, pas de mutation exposée à un utilisateur final ; les
      entrées du journal restent un format interne à l'outil (typé TypeScript, pas une frontière
      de confiance)
- [x] **Migration** Prisma : **aucune** — le journal reste un fichier local (`.ledger.jsonl`),
      aucun changement de `schema.prisma`
- [x] **Enums** depuis `@/generated/prisma/client` : sans objet
- [x] **UI** : sans objet, aucun composant

## Approche générale

Le journal (`.ledger.jsonl`) passe d'un format "une ligne = un import réussi" à un format "une
ligne = un événement d'étape", avec un champ `status` (`"started"` | `"done"`). `importCulte()`
écrit une entrée `started` **immédiatement après** la création du service (avant tout effet
externe supplémentaire), puis une entrée `done` à la toute fin, une fois la publication terminée.
Le fichier reste strictement append-only pendant l'import (aucune réécriture en place) — la
dernière entrée connue pour un dossier fait foi, ce qui reste un simple `Array.reduce`/boucle
sur les lignes lues dans l'ordre.

La logique de décision (« ce dossier est déjà importé / doit être nettoyé / peut être importé »)
est extraite dans une fonction pure et testée indépendamment de Prisma/S3, plutôt que codée en
ligne dans `main()` — c'est la seule partie de ce correctif qui a besoin de tests unitaires
directs, le reste (`main()`, `importCulte()`) restant un script d'orchestration non testé comme
aujourd'hui (aucun test existant ne couvre `main()`).

`--purge` retrouve désormais **toute** tentative (aboutie ou non) via la dernière entrée connue du
dossier, et gère le cas où le service a été marqué publié avant l'échec (dépublication préalable
si nécessaire) — cas limite étroit mais réel avec l'ordre `publishAudioService()` → écriture de
l'entrée `done`.

Les entrées historiques du journal (écrites par la version actuelle du script, sans champ
`status`) restent lisibles : leur absence de `status` est interprétée comme `"done"` (elles ne
pouvaient être écrites que par un import déjà terminé avec succès, dans l'ancien code).

## Modèle de données

`[Aucun changement]` — le journal reste un fichier local, pas une table Prisma.

## API

`[Aucun changement]` — aucun endpoint HTTP concerné.

## Services / logique métier

Fichiers du script `prisma/scripts/migrate-audiobookshelf/` (hors module `@/modules/audio`,
lui-même inchangé) :

- **`ledger.ts`** :
  - `LedgerEntry` gagne un champ `status?: "started" | "done"` (optionnel pour rester compatible
    avec les lignes historiques déjà écrites sur des postes d'opérateurs).
  - `readLedger()` : inchangé dans sa forme (lit toutes les lignes, dans l'ordre du fichier).
  - `appendLedger(entry)` : inchangé, réutilisé pour écrire aussi bien une entrée `started` qu'une
    entrée `done` (deux appels au lieu d'un par culte importé).
  - `removeFromLedger(folder)` : inchangé dans sa forme, mais retire désormais **toutes** les
    lignes du dossier (`started` et `done` confondues) — déjà son comportement actuel (`filter`
    par `folder`), rien à changer ici.
  - **Nouveau** : `latestEntryByFolder(entries: LedgerEntry[], folder: string): LedgerEntry |
    undefined` — parcourt les entrées dans l'ordre du fichier et retient la dernière rencontrée
    pour ce dossier (une entrée `done` postérieure à une entrée `started` la remplace comme état
    courant). Fonction pure, testée isolément.
  - **Nouveau** : `isFolderDone(entry: LedgerEntry | undefined): boolean` — `true` si `entry`
    existe et que `entry.status === "done"` **ou** `entry.status === undefined` (compatibilité
    entrées historiques). `false` sinon (absent, ou `"started"`).

- **Nouveau fichier `resolution.ts`** (logique de reprise, pure, sans I/O) :
  - `classifyFolders(folders: string[], allEntries: LedgerEntry[]): { toImport: string[];
    alreadyDone: string[]; pendingCleanup: string[] }` — pour chaque dossier candidat, calcule sa
    dernière entrée (`latestEntryByFolder`) et le classe :
    - aucune entrée → `toImport`
    - dernière entrée `done`/legacy → `alreadyDone`
    - dernière entrée `started` (jamais complétée) → `pendingCleanup`
  - Utilisée à la fois par `main()` (import normal) pour ne **jamais** tenter de réimporter un
    dossier en tentative inaboutie, et testée directement avec des jeux d'entrées construits à la
    main (pas besoin de fichier réel ni de Prisma).

- **`index.ts`** :
  - `importCulte()` : ajoute `await appendLedger({ folder, serviceId: service.id, status:
    "started", date, sequences: culte.sequences.length, predicationMatched, at })` juste après
    `createAudioService(...)` (avant la boucle d'upload des séquences). L'entrée finale, en fin de
    fonction (après `publishAudioService`), passe à `status: "done"` avec un nouvel horodatage —
    même contenu que l'entrée actuelle aujourd'hui, avec `status: "done"` en plus.
  - `main()` :
    - Construit `candidates` à partir de `manifest.cultes.filter(...)`, puis appelle
      `classifyFolders(candidates.map(c => c.folder), await readLedger())`.
    - Les dossiers `alreadyDone` sont retirés des candidats (comportement actuel, inchangé dans
      son intention).
    - Les dossiers `pendingCleanup` sont **retirés des candidats à importer** (jamais réimportés
      automatiquement — conforme au scénario alternatif de la spec) et affichés clairement en
      console avant le lancement de l'import, avec la commande de nettoyage à exécuter
      (`--purge "<dossier>"`) avant toute reprise.
    - Le message d'échec affiché dans le `catch` de la boucle d'import (`reprise : … --purge
      "${culte.folder}" puis relancer`) reste tel quel dans sa forme — il devient **vrai** avec ce
      correctif (l'entrée `started` existe désormais forcément dès que `createAudioService` a
      réussi), alors qu'il était trompeur avant.
  - Branche `--purge <dossier>` :
    - Recherche désormais via `latestEntryByFolder(await readLedger(), args.purge)` (au lieu du
      premier `.find` sur la liste brute — nécessaire puisqu'un dossier peut désormais avoir
      jusqu'à deux lignes).
    - Si aucune entrée → message inchangé ("Aucune entrée de ledger… rien à purger.").
    - Sinon, tente `deleteAudioService(entry.serviceId, church.id, prisma)` ; si l'erreur est une
      `ApiError` avec `statusCode === 400` (culte déjà publié — la fenêtre étroite où l'échec
      serait survenu entre `publishAudioService` et l'écriture de l'entrée `done`), appelle
      d'abord `unpublishAudioService(entry.serviceId, church.id, prisma)` puis retente
      `deleteAudioService`. Toute autre erreur remonte telle quelle (comportement actuel).
    - `removeFromLedger(args.purge)` en fin de purge, comme aujourd'hui (retire toutes les lignes
      du dossier, `started` et `done`).

## UI / composants

`[Aucun changement]`.

## Décisions & alternatives écartées

- **Choix : deux lignes append-only (`started` puis `done`) plutôt qu'une réécriture en place du
  fichier à chaque étape** — *Pourquoi* : conserve la propriété actuelle du journal (append-only,
  robuste à une interruption brutale du process pendant l'écriture — un `writeFile` complet
  serait, lui, à risque de corrompre le fichier entier en cas de coupure en cours d'écriture,
  contrairement à un `appendFile` d'une ligne).
- **Choix : extraire `classifyFolders`/`latestEntryByFolder` en fonctions pures testables plutôt
  que de coder la logique inline dans `main()`** — *Pourquoi* : `main()` orchestre des appels
  Prisma/S3/ffprobe réels et n'est pas testable unitairement sans lourds mocks (déjà le cas
  aujourd'hui, aucun test ne le couvre) ; isoler la décision "importer / nettoyer / ignorer" dans
  une fonction pure permet de la tester précisément sans dépendance externe, conformément à la
  contrainte de la spec ("tests attendus… sur la logique de reprise/purge").
- **Écarté : stocker le journal en base de données (table Prisma) plutôt qu'en fichier local** —
  *Raison* : sur-ingénierie pour un script one-off exécuté par un seul opérateur à la fois, hors
  artefact de déploiement ; introduirait une migration Prisma et un modèle permanents pour un
  besoin strictement transitoire (le journal n'a plus de raison d'exister une fois la migration
  terminée). Écarté aussi par la spec elle-même ("pas de sur-ingénierie type état distribué").
- **Écarté : verrou de fichier / protection contre deux exécutions concurrentes** — *Raison*
  explicitement hors périmètre de la spec ; l'usage reste un opérateur unique, séquentiel.
- **Écarté : migration automatique des lignes historiques du journal vers le nouveau format lors
  de la première lecture** — *Raison* : inutile, l'absence de `status` est interprétée comme
  `"done"` de façon permanente et sans ambiguïté (une ligne historique ne peut représenter qu'un
  import déjà réussi, l'ancien code n'écrivant jamais rien d'autre) — pas besoin de réécrire le
  fichier pour le rendre compatible, `isFolderDone` gère la rétrocompatibilité directement.
- **Écarté : rendre `--purge` d'une entrée `done` explicitement plus strict (confirmation
  supplémentaire)** — *Raison* : hors du problème rapporté par H-06 (purge d'un import réussi
  volontaire, pas un cas d'échec) ; `deleteAudioService` refuse déjà de supprimer un culte publié
  sans dépublication explicite, ce garde-fou existant est conservé tel quel pour ce cas, seule la
  fenêtre étroite "publié mais jamais marqué `done`" (un vrai résidu de l'échec ciblé par cette
  spec) reçoit la dépublication automatique.

## Risques & points d'attention

- **Fenêtre étroite entre `publishAudioService()` et l'écriture de l'entrée `done`** : un crash
  exactement à ce moment laisse un service **publié** avec une entrée `started` — géré par la
  dépublication automatique dans la branche `--purge` (voir ci-dessus) ; à mentionner dans le
  `README.md` du script si un opérateur constate ce cas précis (contenu déjà publiquement
  accessible via un lien de partage entre le crash et la purge — improbable en pratique, aucune
  publication de lien n'a lieu automatiquement lors d'une migration, mais signalé pour
  transparence).
- **Compatibilité ascendante du fichier `.ledger.jsonl`** : un poste d'opérateur ayant déjà un
  journal de l'ancien format doit continuer à fonctionner sans étape manuelle — couvert par
  `isFolderDone` traitant `status` absent comme `"done"` (voir Services / logique métier et tests).
- **`README.md`** du script mentionne la commande `--purge` en cas d'échec — à vérifier après
  implémentation que le texte reste cohérent avec le nouveau comportement (pas de contenu
  contradictoire laissé après ce correctif).

## Stratégie de tests

- **`ledger.test.ts`** (nouveau, `prisma/scripts/migrate-audiobookshelf/`) :
  - `latestEntryByFolder` : plusieurs entrées pour un même dossier → retourne la dernière dans
    l'ordre du tableau ; dossier absent → `undefined`.
  - `isFolderDone` : `status: "done"` → `true` ; `status: "started"` → `false` ; `status`
    absent (entrée historique) → `true` ; `undefined` (aucune entrée) → `false`.
  - `readLedger`/`appendLedger`/`removeFromLedger` : comportement déjà correct aujourd'hui, non
    testé jusqu'ici — ajout de tests de base (round-trip append/read, suppression par dossier)
    tant qu'on touche ce fichier, sans étendre au-delà de ce que cette spec requiert.
- **`resolution.test.ts`** (nouveau) :
  - Dossier sans aucune entrée → `toImport`.
  - Dossier avec une entrée `done` → `alreadyDone`.
  - Dossier avec une entrée historique sans `status` → `alreadyDone`.
  - Dossier avec une entrée `started` seule (pas de `done` associée) → `pendingCleanup`, jamais
    `toImport` — le test qui couvre directement le critère d'acceptation central de cette spec.
  - Dossier avec `started` **puis** `done` (import complété normalement) → `alreadyDone` (la
    dernière entrée fait foi).
  - Plusieurs dossiers mélangés dans un seul appel → classement correct de chacun indépendamment.
- `main()` et `importCulte()` restent non testés unitairement (inchangé par rapport à
  aujourd'hui) — ils orchestrent Prisma/S3/ffprobe réels ; la fiabilité de la reprise est
  entièrement couverte par les fonctions pures ci-dessus, qui portent la totalité de la décision.
