# Plan technique — Migration des cultes Audiobookshelf

- **Spec associée** : `./spec.md`
- **Inventaire & décisions** : `./reflexion.md` (à lire en premier)
- **Statut** : Brouillon
- **Mis à jour le** : 2026-08-28

> Ce plan traduit la spec en approche technique conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : le script importe la logique métier **via l'index
      public** `@/modules/audio` (`createAudioService`, `applySequences`,
      `publishAudioService`, `getAudioSourceKey`) — jamais de chemin interne. Le
      script vit sous `prisma/scripts/`, hors périmètre `depcruise`
      (`src/core src/modules src/app`), mais respecte quand même la règle.
- [x] **Sécurité / multi-tenant** : aucune route API ajoutée. Le script est un
      outil hors-ligne lancé manuellement par le mainteneur (accès serveur +
      `DATABASE_URL` + `MEDIA_S3_*`). Toutes les écritures portent le `churchId`
      d'ICC Rennes, résolu une fois au démarrage. Aucune donnée cross-tenant.
- [x] **Permissions** : sans objet (pas de route). L'affichage côté membres
      passe par la bibliothèque d'écoute existante (spec 021), déjà protégée par
      `audio:listen` / `rolePermissions`.
- [x] **Validation Zod** : sans objet (pas de mutation HTTP). Le script valide
      son **manifeste** (issu du système de fichiers) avec un schéma Zod avant
      toute écriture BDD/S3.
- [x] **Migration Prisma** : **aucun changement de schéma** — les modèles
      `AudioService` / `AudioSource` / `AudioSegment` / `AudioRendition` /
      `AudioJob` existants suffisent. Pas de `db push`, pas de `migrate`.
- [x] **Enums** : `AudioServiceStatus`, `AudioSourceKind`, etc. importés depuis
      `@/generated/prisma/client` si le script en a besoin (via les services, il
      n'y touche pas directement).
- [x] **UI** : aucune UI. Réutilisation intégrale des écrans existants
      (`/audio/ecouter`, onglet Production).

## Approche générale

**Alimenter le pipeline de dépôt existant, sans le court-circuiter.** Le script
ne fabrique pas les versions encodées lui-même : il crée les mêmes
enregistrements qu'un dépôt manuel (`AudioService` → `AudioSource` → dépôt du
fichier sur S3 → `AudioSegment`), puis appelle `publishAudioService`, qui crée
les jobs `RENDER`. Le **worker audio déjà en place** (ADR-0007) fait la
normalisation `loudnorm` −16 LUFS + l'encodage MP3 + l'écriture des
`AudioRendition`, puis bascule chaque culte `READY → PUBLISHED`
(`maybeCompletePublication`). Aucune logique de rendu n'est réécrite.

Déroulé en deux temps :

1. **Analyse (pure, testable)** — parcourt l'arborescence Audiobookshelf copiée
   sur la VM, produit un **manifeste JSON** (liste de cultes → séquences →
   fichier source + métadonnées), sans rien écrire. Mode `--dry-run` : imprime
   le manifeste + un rapport (cultes détectés, séquences, substitutions
   prédication, fichiers ignorés, anomalies) et s'arrête.
2. **Exécution (effets de bord)** — pour chaque culte du manifeste non déjà
   traité (cf. ledger), crée les enregistrements, dépose le(s) fichier(s) sur
   S3, applique les séquences, publie. Écrit une ligne de **ledger** par culte.

### Emplacement et exécution

```
prisma/scripts/migrate-audiobookshelf/
├── index.ts        # point d'entrée (orchestration, args CLI, ledger)
├── parse.ts        # fonctions pures : parsing noms, appariement, normalisation
├── parse.test.ts   # tests Vitest (déjà couvert par include "prisma/**/*.test.ts")
├── manifest.ts     # schéma Zod du manifeste + type
├── s3.ts           # putObjectAvecEtag() : PutObject + lecture ETag
└── README.md       # mode d'emploi, ordre recette → prod, pré-requis worker
```

Lancement : `tsx prisma/scripts/migrate-audiobookshelf/index.ts --root <dir> [--dry-run] [--only <folder>] [--limit N]`.
Même patron que les scripts one-off existants (`prisma/scripts/import-mediaflow.ts`) :
`import "dotenv/config"` + `PrismaClient` instancié localement avec
`PrismaMariaDb(process.env.DATABASE_URL)`. Pas d'entrée `package.json` (one-off).
`@/…` résout via l'alias `vitest.config.ts` en test et via `tsx` (support natif
des `paths` tsconfig) à l'exécution.

## Modèle de données

**[Aucun changement de schéma.]** Correspondance ABS → Koinonia :

| Concept ABS | Enregistrement Koinonia | Champs renseignés par le script |
|---|---|---|
| Dossier `Culte … du JJ MM AAAA` | `AudioService` | `churchId` (ICC Rennes), `serviceDate` (date + heure calculée, `Europe/Paris` → UTC), `title` (cf. règles), `speaker` (ID3 `artist` de la prédication appariée, sinon `null`), `type` (`CULTE`, ou `AUTRE` pour la cérémonie de baptêmes), `status` piloté par les services |
| Piste `#N - Titre.mp3` retenue | `AudioSource` (`kind = SEQUENCE`) | `serviceId`, `s3Key = getAudioSourceKey(serviceId, sourceId, ext)`, `originalFilename`, `sizeBytes`, `durationMs` (**ffprobe local**), `etag` (**ETag réel du PutObject**), `uploadStatus = "DONE"`, `uploadId = null` |
| — | `AudioSegment` (`kind = SEQUENCE`) | via `applySequences` : `order`, `title` (nettoyé), `startMs = 0`, `endMs = source.durationMs`, `detectedBy = "deposit"` |
| Rendu | `AudioRendition` | **écrit par le worker** (`RENDER`), pas par le script |
| — | `AudioJob` (`type = RENDER`) | créés par `publishAudioService` |

Points de vigilance modèle (issus de `reflexion.md` §6) :

- **`durationMs` avant `applySequences`** : `applySequences` fige
  `endMs = source.durationMs ?? 0`. Le script sonde chaque fichier avec
  `ffprobe` (binaire système, ou celui d'ABS) et écrit `durationMs` sur
  l'`AudioSource` **juste après création**, avant d'appeler `applySequences`.
  ⇒ **aucun job `PROBE` créé** (le chemin `completeSequenceUpload` n'est pas
  emprunté).
- **`etag` réel** : `publishAudioService` calcule
  `sourceHash = sha256(etag)` ; un ETag incohérent ⇒ re-rendu à chaque
  republication. `s3.ts > putObjectAvecEtag` lit `ETag` de la réponse
  `PutObjectCommand` et retire les guillemets.
- **`AudioSettings` d'ICC Rennes** : non requis. `coverKey` reste `null` ⇒
  `resolveEffectiveCoverUrl` retombe sur `defaultCoverKey` (ou `null`, géré).

## API

**Aucun endpoint ajouté ou modifié.** La consultation des cultes migrés utilise
les routes existantes de la bibliothèque d'écoute (spec 021) et de l'onglet
Production, inchangées.

## Services / logique métier

### Réutilisation (aucune réécriture)

Depuis `@/modules/audio` :

- `createAudioService({ churchId, serviceDate, title, speaker, type })` — crée le
  culte en `DRAFT`. Le script **ne passe pas** `planningEventId` (hors périmètre).
  Un `db` (PrismaClient du script) est passé en second argument pour éviter le
  singleton.
- `applySequences(serviceId, churchId, [{ sourceId, order, title }, …], db)` —
  crée les `AudioSegment`. Le script crée d'abord les `AudioSource` (insert
  Prisma direct via `db.audioSource.create`, `kind: "SEQUENCE"`), les renseigne
  (`s3Key`, `etag`, `durationMs`, `sizeBytes`, `uploadStatus: "DONE"`), puis
  appelle `applySequences`.
- `publishAudioService(serviceId, churchId, publishedById, db)` — crée les jobs
  `RENDER`, passe le culte en `READY`. `publishedById` = `id` du `User` dont
  `email = "ouattara.ismael@gmail.com"` (résolu au démarrage ; échec explicite
  si absent).
- `getAudioSourceKey(serviceId, sourceId, ext)` — clé S3 canonique.

> `applySequences` et `publishAudioService` ouvrent leurs propres
> `db.$transaction`. Le script les appelle **séquentiellement par culte** ; il
> n'enveloppe pas plusieurs cultes dans une transaction (un culte = une unité de
> reprise, cf. ledger).

### Fonctions pures nouvelles — `parse.ts` (100 % testables)

| Fonction | Rôle |
|---|---|
| `parseCulteFolder(name)` | `"Culte 2 du 11 05 2025"` → `{ kind: "culte", date: "2025-05-11", slot: 2, label: "Culte 2" }` ; gère `Culte`, `Culte 1/2`, `Cérémonie des baptêmes` ; `null` si non reconnu |
| `parsePredicationFile(name)` | `"2025-02-09_12h00_La_loi_de_la_semence.mp3"` → `{ date: "2025-02-09", time: "12:00", rawTitle: "La loi de la semence" }` |
| `parseTrack(filename)` | `"#5 - Prédication.mp3"` / `"1 - Prière des  STAR.mp3"` / `"Annonces.mp3"` → `{ order: number \| null, title: string }` ; titre nettoyé (`_`→espace, espaces multiples réduits, préfixe d'ordre retiré, `.mp3` retiré) |
| `isExcludedTrack(title)` | `true` pour `MLA`, `MLA Balances` (regex `/\bMLA\b/i`), `Cover.png`, `desktop.ini`, `.ini` |
| `isPredicationTrack(title)` | `true` si `/pr[ée]dications?/i` ou `/^message$/i`. **`false` si le titre contient un `&` ou `et Offrandes`** (piste fusionnée — pas de substitution, cf. risques) |
| `orderTracks(tracks)` | ordonne : pistes numérotées par `order` croissant, puis pistes sans numéro dans l'ordre de listing ; renumérote `1..n` en sortie |
| `defaultServiceTime(slot)` | `slot === 2` → `"12:00"`, sinon `"10:00"` |
| `matchPredication(culte, predicationsByDate)` | associe une prédication : même date ; si `slot` défini et 2 prédications ce jour → tri horaire (`10h*` → slot 1, `12h*` → slot 2) ; sinon la seule ; `null` si aucune |
| `buildManifest(fsTree)` | assemble le manifeste complet à partir de l'arborescence lue |

### `index.ts` — orchestration

1. Args CLI + `--root` obligatoire (racine `podcasts/` copiée sur la VM).
2. Résout `churchId` (`church.findFirstOrThrow` sur `slug: "icc-rennes"` ou
   `name`) et `publishedById` (`user.findUniqueOrThrow` sur l'email).
3. Lit `--root/cultes/*` et `--root/predications/**/*.mp3`, construit le
   manifeste, le **valide avec Zod** (`manifest.ts`).
4. `--dry-run` → imprime manifeste + rapport, `return`.
5. Charge le **ledger** `prisma/scripts/migrate-audiobookshelf/.ledger.jsonl`
   (git-ignoré) → `Set` des dossiers déjà traités avec succès.
6. Pour chaque culte non traité (option `--only` / `--limit` pour les tests) :
   a. `createAudioService(...)`
   b. pour chaque séquence retenue (dans l'ordre) :
      - `db.audioSource.create({ kind: "SEQUENCE", serviceId, s3Key: "", uploadStatus: "PENDING" })`
      - `key = getAudioSourceKey(serviceId, source.id, ext)`
      - `putObjectAvecEtag(key, fileBuffer, "audio/mpeg")` → `etag`
      - `ffprobe(file)` → `durationMs`
      - `db.audioSource.update({ s3Key: key, etag, durationMs, sizeBytes, uploadStatus: "DONE" })`
   c. `applySequences(serviceId, churchId, sequences, db)`
   d. `publishAudioService(serviceId, churchId, publishedById, db)`
   e. append ledger `{ folder, serviceId, date, sequences: n, predicationMatched: bool, at: ISO }`
   f. log `culte X → serviceId (n séquences, RENDER en file)`
7. Résumé final : cultes créés, séquences, jobs `RENDER` en attente, anomalies.
   Rappel : suivre `SELECT status, count(*) FROM audio_jobs GROUP BY status` et
   vérifier que le **worker tourne** sur la cible.

### Règles de titre (`AudioService.title`) — décision spec §5.2

- Prédication appariée → `title` = `rawTitle` de la prédication (nettoyé,
  casse d'origine).
- Sinon → `label` du dossier (`"Culte"`, `"Culte 1"`, `"Culte 2"`,
  `"Cérémonie des baptêmes"`).

### Substitution de la séquence prédication — spec §« version riche »

Dans une séquence identifiée `isPredicationTrack` :

- si `matchPredication` renvoie un fichier → l'`AudioSource` de cette séquence
  est **déposée à partir du fichier de `predications/`** (pas de celui de
  `cultes/`) ; `speaker` du culte = ID3 `artist` de ce fichier ; `title` de la
  séquence conservé (« Prédication »).
- sinon → fichier de `cultes/` tel quel ; `speaker` = `null`.

## UI / composants

Aucun ajout. Vérifications visuelles en recette sur les écrans existants :

- `/audio/ecouter` : présence, tri par date, filtres orateur/type/période,
  lecteur, reprise d'écoute (localStorage par `segmentId`).
- `/audio/ecouter/[id]` : ordre des séquences, durées, orateur.
- `/audio/production` : les cultes migrés apparaissent `PUBLISHED`, dépubliables.

## Décisions & alternatives écartées

- **Choix : réutiliser `createAudioService` / `applySequences` /
  `publishAudioService` via l'index du module.** *Pourquoi* : garantit les
  invariants (transitions de statut, unicité `@@unique([serviceId, order])`,
  `sourceHash` idempotent, création des jobs `RENDER`) sans les redéfinir ;
  conforme à la constitution (import via `@/modules/audio`).
- **Écarté : inserts Prisma bruts de bout en bout dans le script.** *Raison* :
  dupliquerait la logique de `publishAudioService` (calcul `sourceHash`,
  génération des jobs) — fragile, dérive assurée à la prochaine évolution du
  module.
- **Écarté : fabriquer les `AudioRendition` directement (sans worker).** *Raison*
  : réécrit `render.ts` (loudnorm 2 passes, tags ID3, `primeRenditionCache`),
  produirait des volumes non normalisés vs cultes récents (critère
  d'acceptation « pas d'écart de niveau perceptible »).
- **Choix : source de vérité = système de fichiers Audiobookshelf.** *Pourquoi*
  : `absdatabase.sqlite` v2.35.1 est illisible par le CLI `sqlite3` (extension
  propriétaire `libnusqlite3.so`, schéma rejeté). Le FS porte tout le nécessaire
  (arborescence, noms, ID3 via ffprobe).
- **Choix : ledger JSONL local + clé = nom du dossier ABS.** *Pourquoi* :
  idempotence simple sans champ de schéma dédié ; une relance saute les dossiers
  déjà traités. *Alternative écartée* : détecter les doublons par
  `(churchId, serviceDate, title)` — fragile (deux cultes le même jour, titres
  re-dérivés).
- **Choix : `PutObject` simple (pas multipart).** *Pourquoi* : plus gros fichier
  culte ~170 Mo, prédication ~55 Mo — sous le seuil où le multipart s'impose.
  Le script refuse (garde-fou) tout fichier > 512 Mo avec un message clair.
- **Choix : heure du culte = celle de la prédication appariée, sinon 10:00 /
  12:00 selon le slot.** *Pourquoi* : `serviceDate` est un `DateTime` non nul ;
  l'heure réelle n'est disponible que via le nom de fichier `predications/`.
- **Choix : script sous `prisma/scripts/`, non ajouté à `package.json`.**
  *Pourquoi* : cohérent avec les one-off existants (`import-mediaflow.ts`,
  `import-mrbs-reservations.ts`) ; ce n'est pas une commande de cycle de vie.
- **Pas d'ADR.** *Pourquoi* : opération ponctuelle, réversible (dépublier /
  supprimer les cultes migrés), n'introduit aucun pattern durable ni dépendance.
  L'ADR structurant du domaine (worker hors Next.js) est déjà ADR-0007.

## Risques & points d'attention

- **Worker requis sur la cible** : sans `npm run worker` actif (recette) /
  service systemd (prod), les cultes restent `READY` sans jamais passer
  `PUBLISHED`. À vérifier avant de lancer. Le rendu de ~350–450 séquences =
  ~12–24 h cumulées (1 job à la fois) → lancer en heure creuse, laisser tourner.
- **Charge S3 / disque** : ~8,2 Go de sources + ~8 Go de renditions +
  pré-chauffage du cache disque des renditions (ADR-0008). Vérifier l'espace du
  bucket de prod et du volume de cache avant la passe prod.
- **Pistes prédication fusionnées** (`"Prédication & Offrandes"`,
  `"Prédication & Offrandes.mp3"`) : `isPredicationTrack` renvoie `false` → pas
  de substitution, la piste est importée telle quelle sous son nom d'origine.
  Le rapport `--dry-run` **liste ces cas** pour arbitrage manuel éventuel.
- **Cultes sans piste prédication identifiable** alors qu'on en attendrait une
  (titre trop ambigu) : comportement retenu = culte publié sans séquence
  prédication ; le rapport `--dry-run` les signale (spec, question ouverte —
  défaut assumé).
- **Numérotation irrégulière / pistes sans préfixe** (dossiers 2024,
  `Culte du 30 11 2025` sans `#`) : `orderTracks` retombe sur l'ordre de listing
  — vérifier ces dossiers dans le rapport avant exécution.
- **Fuseau horaire** : conversion `Europe/Paris` → UTC explicite (une
  dépendance légère type `date-fns-tz` **ou** calcul manuel de l'offset ;
  trancher en implémentation — pas de dépendance nouvelle si évitable).
- **Idempotence partielle** : si le script tombe **après** `createAudioService`
  mais **avant** l'écriture du ledger, un culte incomplet subsiste. Reprise :
  le rapport `--dry-run` recompte, et une commande `--purge <folder>` (supprime
  le culte non publié via `deleteAudioService` du module) permet de repartir
  propre. Sinon suppression manuelle via l'onglet Production.
- **Titres en double dans un même culte** (`applySequences` refuse deux séquences
  de même titre normalisé) : `orderTracks` déduplique en suffixant ` (2)` si
  collision après nettoyage. Cas rare (`Prédications` vs `Prédication`).
- **Accès serveur** : le script lit une copie locale des fichiers sur la VM de
  recette — aucune connexion à Audiobookshelf, aucune action sur
  `ssh.iccrennes.fr` au-delà des copies déjà faites.

## Stratégie de tests

**Tests unitaires Vitest** (`prisma/scripts/migrate-audiobookshelf/parse.test.ts`,
déjà pris par `include: ["prisma/**/*.test.ts"]`) — couverture des fonctions
pures, à partir d'échantillons réels relevés en phase 0 :

- `parseCulteFolder` : `"Culte du 12 01 2025"`, `"Culte 1 du 23 02 2025"`,
  `"Culte 2 du 11 05 2025"`, `"Cérémonie des baptêmes du 16 02 2025"`, dossier
  non reconnu → `null`.
- `parsePredicationFile` : `"2025-02-09_12h00_La_loi_de_la_semence.mp3"`,
  `"2025-11-02_10h30_Le_rôle_du_Saint-esprit_dans_notre_vie.mp3"`.
- `parseTrack` : `"#5 - Prédication.mp3"`, `"1 - Prière des  STAR.mp3"`,
  `"Sainte_cène_et_Offrandes.mp3"`, `"Annonces.mp3"`, `"#99 - MLA.mp3"`.
- `isExcludedTrack` : `"#98 - MLA Balances"`, `"MLA"`, `"Cover.png"`,
  `"desktop.ini"` → `true` ; `"Modération"` → `false`.
- `isPredicationTrack` : `"Prédication"`, `"prédication"`, `"Prédications"`,
  `"Message"` → `true` ; `"Prédication & Offrandes"`, `"Louanges"` → `false`.
- `orderTracks` : mélange numéroté / non numéroté, trous (`#2..#6`),
  renumérotation `1..n`, déduplication de titre.
- `defaultServiceTime`, `matchPredication` : 1 culte / 1 prédication ;
  2 cultes (`slot` 1/2) / 2 prédications `10h00`+`12h00` → appariement correct ;
  2 cultes / 0 prédication → `null` ; 1 culte / 0 prédication → `null`.
- `buildManifest` : sur une arborescence fixture (`prisma/scripts/
  migrate-audiobookshelf/__fixtures__/`) reproduisant 3–4 dossiers
  représentatifs → manifeste attendu + validation Zod OK.

**Non couvert par des tests automatisés** (orchestration à effets de bord) —
vérifié par la **passe recette** :

- création effective des enregistrements, dépôt S3, ETag, `durationMs`.
- enchaînement worker → `AudioRendition` → `PUBLISHED`.
- rendu visuel et écoute dans `/audio/ecouter` (critères d'acceptation spec).
- relance du script (ledger) → aucun doublon.
- `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`
  verts avant PR.

## Séquence opérationnelle (rappel, détaillée dans le README du script)

1. **Recette** : fichiers déjà copiés sur la VM. Worker actif. `--dry-run` →
   revue du rapport. Puis exécution (éventuellement `--limit 3` d'abord).
   Attendre la fin des `RENDER`. Vérifier `/audio/ecouter`.
2. **Corrections** éventuelles des règles de parsing / arbitrages, nouveau
   `--dry-run`.
3. **Prod** : vérifier l'espace bucket + cache, copier les fichiers ABS
   (lecture seule côté `/var/lib/audiobookshelf`), lancer en heure creuse,
   surveiller `audio_jobs`, vérifier, puis arrêter Audiobookshelf.
