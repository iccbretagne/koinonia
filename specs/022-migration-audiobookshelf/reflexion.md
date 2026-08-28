# Réflexion — Migration des bibliothèques Audiobookshelf vers le module audio Koinonia

> Document de travail (avant `/specify`). Capture l'analyse du code cible, les
> décisions prises avec le mainteneur, les inconnues restantes et le processus de
> migration envisagé.

## 1. Contexte

ICC Rennes héberge aujourd'hui l'audio des cultes sur **Audiobookshelf** (ABS)
`v2.35.1`, installé dans `/var/lib/audiobookshelf` sur `ssh.iccrennes.fr` (même
serveur que la prod Koinonia). Objectif : rapatrier ce catalogue dans le module
audio de Koinonia (`/audio/ecouter`) pour n'avoir qu'un seul outil, puis
décommissionner ABS.

**Contrainte opérationnelle** : aucune action sur `ssh.iccrennes.fr` sans accord
explicite du mainteneur. Les commandes serveur (phase 0) sont proposées, pas
exécutées.

## 2. Modèle cible (module audio Koinonia)

Un culte publié = ces lignes + 2 objets S3 par séquence.

| Modèle | Rôle | Champs clés |
|---|---|---|
| `AudioService` | le culte | `churchId`, `serviceDate` (DateTime, date+heure), `title`, `speaker`, `type` (`@/lib/event-types` : `CULTE`/`PRIERE`/`REUNION`/`FORMATION`/`AUTRE`), `status`, `publishedAt`, `publishedById`, `coverKey?` |
| `AudioSource` (kind `SEQUENCE`) | fichier déposé (archive) | `s3Key = audio-services/{serviceId}/sources/{sourceId}.{ext}`, `originalFilename`, `etag`, `durationMs`, `sizeBytes`, `uploadStatus="DONE"` |
| `AudioSegment` (kind `SEQUENCE`) | séquence nommée | `order`, `title`, `startMs=0`, `endMs=durationMs`, `sourceId`, `detectedBy="deposit"` |
| `AudioRendition` | MP3 jouable (produit par le worker) | `s3Key = audio-services/{serviceId}/renditions/{segmentId}.mp3`, `format="mp3"`, `lufs=-16`, `truePeakDb`, `sourceHash = sha256(etag)` |

**Visibilité dans `/audio/ecouter`** (`library.ts > listPublishedServices`) :
`status = PUBLISHED` **ET** chaque segment `SEQUENCE` a une `AudioRendition`.
`totalDurationMs` et `segmentCount` ne comptent que les segments *rendus*.

### Chemin de dépôt normal (référence)

`upload.ts` → `signSequenceUpload` (crée `AudioSource`, multipart S3) →
`completeSequenceUpload` (marque `DONE`, crée job `PROBE`) → `sequences.ts` →
`applySequences` (crée les `AudioSegment`, `endMs = source.durationMs ?? 0`) →
`publish.ts` → `publishAudioService` (crée un job `RENDER` par segment dont le
`sourceHash` a changé, passe le culte en `READY`) → worker `render.ts`
(loudnorm 2 passes vers −16 LUFS, encodage MP3 192k + tags ID3, upload S3,
écrit `AudioRendition`, `primeRenditionCache`) → `maybeCompletePublication`
(`READY` → `PUBLISHED` quand toutes les séquences sont rendues).

### Worker (ADR-0007 / ADR-0008)

Process hors Next.js (`npm run worker` / `dist/worker.mjs`), bail sur
`audio_jobs` via `FOR UPDATE SKIP LOCKED`, un job à la fois. Nécessite
`ffmpeg` + `ffprobe` (déjà en prod). Le rendu écrit aussi le cache disque des
renditions (ADR-0008) ; sinon il se remplit au premier lecteur.

## 3. Stockage S3

- `@/modules/storage` réexporte les primitifs S3 de `./services/s3` :
  `uploadFile(key, body, contentType)` (PutObject simple, **ne renvoie pas
  l'ETag**), `downloadFile`, `createMultipartUpload` / `getSignedPartUrl` /
  `completeMultipartUpload` (multipart, orienté navigateur — URLs signées).
- Bucket + client : `s3Media` / `MEDIA_BUCKET` depuis `@/lib/s3`.
- Le script de migration importera `s3Media` / `MEDIA_BUCKET` directement pour
  faire son propre `PutObject` **et lire l'`ETag`** de la réponse (indispensable,
  cf. §6).

## 4. Source : Audiobookshelf `v2.35.1` — inventaire phase 0 (relevé 2026-08-28, lecture seule)

### Disposition disque

- Médias : `/var/lib/audiobookshelf/podcasts/` — 2 sous-dossiers `cultes/` et
  `predications/` (+ `Cover.png` global). Le dossier `books/` est vide.
- Config + base : `/usr/share/audiobookshelf/config/absdatabase.sqlite`.
  ⚠️ **Le CLI `sqlite3` standard ne peut PAS lire cette base** : ABS charge une
  extension propriétaire (`libnusqlite3.so`) et le schéma contient des triggers
  que le parseur stock rejette (« malformed database schema … near "ORDER" »).
  ⇒ **La migration s'appuie sur le système de fichiers + `ffprobe`, pas sur la
  base ABS.** (La base n'apporterait que la progression d'écoute ABS, inutile.)
- `ffmpeg`/`ffprobe` fournis par ABS dans `/usr/share/audiobookshelf/`.
- **Volumes** : `cultes/` = **6,5 Go**, `predications/` = **1,7 Go** (~8,2 Go de
  sources). Prévoir ~**16–18 Go** sur le bucket (sources + renditions MP3 192k).

### Bibliothèque « cultes » — `/var/lib/audiobookshelf/podcasts/cultes/`

~79 dossiers, un par culte, 2024-06 → 2026-06. Nommage du dossier :

- `Culte du JJ MM AAAA`
- `Culte 1 du JJ MM AAAA` / `Culte 2 du JJ MM AAAA` — deux cultes le même jour
  (1 = matin, 2 = après-midi)
- `Cérémonie des baptêmes du JJ MM AAAA` — 1 cas, fichier unique
- Date = `JJ MM AAAA`, séparé par des espaces, zéro-paddé. **Pas d'heure.**

Épisodes dans chaque dossier — **nommage hétérogène, parseur robuste requis** :

- Cas courant : `#N - Titre.mp3` (`N` = ordre, titre après `" - "`)
- Variantes observées :
  - sans `#` : `1 - Prière des STAR.mp3`
  - sans préfixe d'ordre : `Annonces.mp3`, `Prédication.mp3`,
    `Temps_de_prière_spécial.mp3`, `Balance_MLA.mp3`, `MLA.mp3`
  - underscores au lieu d'espaces (dossiers 2024) :
    `Sainte_cène_et_Offrandes.mp3`
  - `#98` / `#99` = « MLA » / « MLA Balances » = musique/jam de fin
    (**pas du contenu de culte** — cf. décision §5.7)
  - trous dans la numérotation (dossiers démarrant à `#2`)
  - fusions : `Prédication & Offrandes.mp3`
  - `Cérémonie des baptêmes` : `2025-02-16 Baptêmes - Cérémonie.mp3` (1 fichier)
- Séquence « prédication » = titre qui matche `/pr[ée]dications?/i`.
  **Pas toujours présente** : certains cultes n'ont ni « Prédication » ni
  « Message » (ex. `Culte du 12 10 2025`, `Culte du 28 09 2025`,
  `Culte du 04 01 2026`). En 2024 elle s'appelle parfois `Message`.
- ID3 côté cultes ≈ vide (`title` = nom de fichier, `track`) — d'où l'intérêt de
  substituer par le fichier de la bibliothèque « predications ».
- 2–8 séquences utiles par culte (moyenne ~4–6).

### Bibliothèque « predications » — `/var/lib/audiobookshelf/podcasts/predications/`

4 dossiers = 4 « podcasts » ABS : `Prédications indépendantes` +
3 `Série - <titre>`. **Nommage propre et régulier** :

- `AAAA-MM-JJ_HHhMM_Titre_avec_underscores.mp3`
- Heures rencontrées : `10h00`, `10h30`, `12h00`
- Quand 2 cultes le même jour : 2 fichiers même date, `10h00` **et** `12h00`
  ⇒ `10h00` → « Culte 1 », `12h00` → « Culte 2 » (donne aussi l'heure du culte)
- ID3 riches : `artist` = prédicateur (ex. « Pasteure Armelle Essoualla »),
  `title` = titre propre du message, `album` = série, `comment` = « ICC Rennes »,
  `date` = année
- **Couverture partielle** : uniquement à partir de 2025-01, et pas tous les
  dimanches (~31 fichiers). Tous les cultes 2024 et une partie de 2025-2026
  n'ont **aucun** fichier « predications » correspondant.

### Logique de corrélation (par date, puis heure si ambiguïté)

1. Dossier culte → date `AAAA-MM-JJ` (+ indice 1/2 éventuel).
2. Fichiers predications → `AAAA-MM-JJ` + `HHhMM` + titre + ID3 `artist`.
3. Appariement :
   - 1 culte / 1 prédication ce jour → la séquence « Prédication » du culte
     prend pour **source** le fichier de la bibliothèque « predications » ;
     `speaker` ← ID3 `artist` ; titre de séquence ← ID3 `title` (nettoyé).
   - `Culte 1`/`Culte 2` + 2 prédications (`10h00`/`12h00`) → appariement par
     ordre horaire.
   - culte sans prédication correspondante → on garde le
     `#N - Prédication.mp3` du culte tel quel ; s'il n'y en a pas, le culte n'a
     pas de séquence prédication.
4. `serviceDate` (heure) : de la prédication appariée si dispo ; sinon défaut
   `Culte` / `Culte 1` → 10:00, `Culte 2` → 12:00 (`Europe/Paris`).

## 5. Décisions du mainteneur

1. **Contenu de chaque culte Koinonia = « culte complet découpé »** : plusieurs
   `AudioSegment` par culte (louange, prédication, communion…) quand le podcast
   côté « Cultes complets » a plusieurs épisodes/fichiers. Un seul fichier ⇒ une
   seule séquence.
2. **Corrélation culte ↔ prédication = par date+heure**, extraites du nom de
   dossier (côté cultes) et du nom de fichier (côté prédications). Quand une
   prédication correspond, la séquence « Prédication » du culte utilise le
   **fichier de la bibliothèque « Prédications »** (métadonnées MP3 plus riches)
   plutôt que l'épisode équivalent côté « Cultes complets ».
3. **Une seule église** concernée : ICC Rennes (`churchId` à lire dans `Church`).
4. **`publishedById`** = compte dont `User.email = "ouattara.ismael@gmail.com"`
   (le script le résout).
5. **Découpage** : ~4 à 6 séquences par culte en moyenne (épisodes du podcast côté
   « Cultes complets »), ordre = ordre des épisodes ABS.
6. **Les 4 podcasts « Prédications » sont tous rattachés à un culte** : chaque
   prédication est corrélée par date à un culte ; aucune ne devient un
   `AudioService` autonome. (Rappel : seuls ~31 cultes sur ~79 ont un fichier
   predications ; pour les autres on reste sur le fichier prédication du culte.)
7. **`#98`/`#99` « MLA » (musique de fin) : exclus** de l'import — ce n'est pas
   du contenu de culte. *(à confirmer §9)*
8. **`Cérémonie des baptêmes` → `type = AUTRE`**, séquence unique. *(à confirmer)*
9. **Titres de séquences normalisés** : retirer le préfixe `#N - `, remplacer
   les `_` par des espaces, casse d'origine conservée sinon. *(à confirmer)*

## 6. Approche retenue — alimenter le pipeline existant

Le script **crée les lignes + dépose les fichiers ABS comme `AudioSource`**, puis
laisse le worker produire les renditions (loudnorm, encodage, `PUBLISHED`).
Écarté : fabriquer les renditions à la main (réimplémente `render.ts`, volumes
non normalisés vs cultes récents, `sourceHash` fragile).

### Points durs

- **`durationMs`** : le script lance `ffprobe` **en local** sur chaque fichier et
  écrit `durationMs` sur l'`AudioSource` **avant** `applySequences` — sinon
  `endMs` et la durée affichée restent à 0 (le job `PROBE` ne rattrape pas après
  création du segment). ⇒ pas de job `PROBE` créé par le script.
- **`etag`** : doit être l'ETag S3 **réel** de l'objet source. `publishAudioService`
  calcule `sourceHash = sha256(etag)` ; un ETag faux ⇒ re-rendu à chaque
  republication. Le script lit l'ETag de la réponse `PutObject`.
- **Fichiers volumineux** : `PutObject` simple charge tout en mémoire. Au-delà de
  ~500 Mo, basculer en multipart. Cultes complets ~1h30 ⇒ ~80–170 Mo à
  ~128–192 kbps : OK en simple, à vérifier sur les plus longs.
- **Idempotence / reprise** : aucun champ dédié en base. Le script tient un
  **ledger local** `scripts/.abs-migration-ledger.jsonl`
  (`{absItemId, absEpisodeId, audioServiceId, segmentId, status}`) ; une relance
  saute ce qui est déjà fait.
- **`type`** : `CULTE` par défaut (valeur de `EVENT_TYPES`).
- **`planningEventId`** : `null` (pas d'`Event` correspondant + contrainte
  unique). Rattachement a posteriori possible plus tard.
- **`coverKey`** : `null` ⇒ retombe sur `AudioSettings.defaultCoverKey`.
- **`speaker`** : depuis les tags ID3 (`artist`/`albumArtist`) du fichier de
  prédication quand dispo ; sinon métadonnée ABS ; sinon vide.
- **`serviceDate`** : date **+ heure** parsées du nom de dossier (fuseau
  `Europe/Paris` → UTC en base).
- **Charge worker** : loudnorm 2 passes par séquence, ~1–3 min/séquence sur le
  serveur de prod. Voir estimation §8. Si trop lourd : lancer de nuit, monter
  temporairement la concurrence du worker, ou pré-rendre hors-ligne (repli).
- **Bucket** : mêmes préfixes `audio-services/…` que les cultes récents —
  vérifier la capacité avant la passe prod.
- **Multi-tenant** : `churchId` ICC Rennes sur **chaque** ligne.

## 7. Processus envisagé

### Phase 0 — Inventaire (SSH, lecture seule, sur accord explicite)

1. Copie **read-only** de `/var/lib/audiobookshelf/absdatabase.sqlite` vers un
   dossier scratch.
2. `sqlite3` : dump ciblé → manifeste JSON. Par bibliothèque → par podcast → par
   épisode : `title`, `pubDate`, chemins des fichiers audio (absolus), `duration`,
   `bitRate`, chapitres, tags ID3 lisibles. + nom de dossier / nom de fichier
   bruts (porteurs de la date+heure).
3. Inspection du schéma réel de `absdatabase.sqlite` `v2.35.1` (les noms de
   colonnes/tables varient selon la version) pour figer les requêtes.
4. Rapatriement manifeste + fichiers audio (`rsync`) vers la machine du
   mainteneur **ou** vers l'environnement de recette.

### Phase 1 — Curation (local, manuel)

Le script génère un **CSV de correspondance** pré-rempli à partir du manifeste :

- 1 ligne par culte : `abs_culte_podcast_id`, `serviceDate` (date+heure
  extraites + proposées), `title`, `type=CULTE`
- 1 ligne par séquence : `order`, `title` (nom d'épisode / chapitre ABS),
  `source = cultes|predications`, chemin fichier, `abs_predication_match`
  (id épisode prédication corrélé par date+heure, ou vide), ou `skip`

Le mainteneur revoit : titres de séquences, dates ambiguës (2 cultes/jour),
appariements prédication douteux, épisodes à exclure.

### Phase 2 — Script `scripts/migrate-audiobookshelf.ts` (tsx)

Pour chaque culte du CSV, `--dry-run` d'abord :

1. `ffprobe` local sur chaque fichier retenu → `durationMs`.
2. `createAudioService({ churchId, serviceDate, title, speaker, type })`.
3. Par séquence : créer l'`AudioSource`, `PutObject` S3 (lecture ETag), puis
   renseigner `s3Key`, `etag`, `sizeBytes`, `durationMs`, `uploadStatus="DONE"`.
4. `applySequences(serviceId, churchId, [{ sourceId, order, title }, …])`.
5. `publishAudioService(serviceId, churchId, publishedById)` → jobs `RENDER`,
   culte en `READY`.
6. Écriture du ledger.

Le worker en prod consomme la file `RENDER`, écrit les `AudioRendition`,
`maybeCompletePublication` bascule chaque culte en `PUBLISHED`.
Suivi : `SELECT status, count(*) FROM audio_jobs GROUP BY status`.

> **Exécution — depuis un checkout, pas depuis l'artefact déployé.** Le build est
> `output: "standalone"` et le tar de `deploy*.yml` exclut `prisma/scripts`,
> `tsx` et `src/`. `/opt/koinonia/current` ne peut pas lancer le script. On le
> lance depuis un `git clone` complet à la version déployée (`npm ci` +
> `npx prisma generate`), env de la cible via
> `DOTENV_CONFIG_PATH=/opt/koinonia/shared/.env`. Écarté : bundler via esbuild
> comme le worker — inutile pour une opération one-shot. Cf. `plan.md` et le
> `README.md` du script.

### Phase 3 — Recette puis prod

1. Passe complète sur l'environnement de **recette** (base + bucket recette) :
   vérifier écoute, découpage, métadonnées, corrélation prédications.
2. Passe **prod** : même script, base + bucket prod, fichiers stagés. Laisser le
   worker traiter la file (de nuit si besoin).
3. Vérif des comptes (`audio_services` publiés, `audio_renditions`), écoute de
   contrôle dans `/audio/ecouter`.
4. Décommission d'Audiobookshelf.

## 8. Volume (mesuré en phase 0)

- **Sources** : `cultes/` 6,5 Go + `predications/` 1,7 Go = **~8,2 Go**. Le
  script ne re-dépose pas deux fois une prédication substituée : la source
  « predications » remplace le fichier culte correspondant.
- **Cultes** : ~79. **Séquences** : ~2–8 par culte, moyenne ~4–6 ⇒ **~350–450
  séquences** à rendre ⇒ **~12–24 h de CPU worker** cumulées (loudnorm 2 passes,
  1 job à la fois). Fenêtre de nuit ou étalement sur plusieurs jours.
- **Renditions** (MP3 192k) : ordre de grandeur des sources ⇒ prévoir **~16–18
  Go** au total sur le bucket (sources archivées + renditions).

## 9. Décisions arrêtées

1. **`#98`/`#99` « MLA »** (musique de fin) : **exclus** de l'import.
2. **`AudioService.title`** : titre du message (ID3 `title` de la prédication
   « predications », nettoyé) quand il y a un match ; sinon le libellé du dossier
   ABS hors date (`Culte`, `Culte 1`, `Culte 2`, `Cérémonie des baptêmes`).
3. **`speaker`** : ID3 `artist` de la prédication « predications » quand match ;
   **vide sinon** (les ~48 cultes sans fichier predications, surtout 2024).
4. **Exécution** : **recette d'abord** — rsync des 8,2 Go vers la VM de recette,
   passe complète + vérification d'écoute, puis rejeu en prod.
5. **`Cérémonie des baptêmes`** : importée, `type = AUTRE`, séquence unique.
6. **Titres de séquences** : retirer le préfixe d'ordre (`#N - `, `N - `),
   remplacer `_` par des espaces, conserver la casse d'origine sinon.
7. **`Cover.png`** des dossiers ABS : ignorés (souvent le logo générique) → on
   garde `AudioSettings.defaultCoverKey`.
8. **Nom de série** (`album` ID3) : ignoré — Koinonia n'a pas de notion de série.

**Rappels des décisions antérieures :** culte complet découpé · ~4–6
séquences/culte · corrélation par date (heure `HHhMM` du fichier predications en
secours pour l'ambiguïté Culte 1/2) · substitution de la séquence prédication
par le fichier « predications » quand il existe · église = ICC Rennes ·
`publishedById` = `User.email = ouattara.ismael@gmail.com` · pipeline via le
worker (jobs `RENDER`) · source de vérité = système de fichiers ABS (base
`absdatabase.sqlite` illisible au CLI).

### Restent à vérifier (non bloquant)

- Capacité disque libre du bucket S3 de prod (~16–18 Go).
- [x] Fichiers Audiobookshelf récupérés sur la VM de recette (2026-08-28).

## 10. Prochaines étapes

- [x] Phase 0 — inventaire lecture seule de `ssh.iccrennes.fr` (2026-08-28, §4).
- [x] Décisions produit arrêtées (§9).
- [x] `/specify` puis `/plan` / `/tasks` sur la base de ce document.
- [x] `prisma/scripts/migrate-audiobookshelf/` : parseur FS → manifeste (Zod) →
      `AudioService`/`Source`/`Segment` + `PutObject` (lecture ETag) + `ffprobe`
      local (`durationMs`) + `publishAudioService` + ledger `.jsonl` (PR #471).
- [x] Fichiers Audiobookshelf sur la VM de recette (2026-08-28).
- [ ] Passe recette (checkout + `npm ci` + `DOTENV_CONFIG_PATH`), vérif écoute.
- [ ] Passe prod + surveillance de la file `audio_jobs`.
