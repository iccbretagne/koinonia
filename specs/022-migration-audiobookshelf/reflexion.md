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

## 4. Source : Audiobookshelf `v2.35.1`

- Répertoire : `/var/lib/audiobookshelf` (config + `absdatabase.sqlite` + éventuel
  `/metadata`). Racines des bibliothèques à confirmer en phase 0.
- Base **SQLite** `absdatabase.sqlite` : tables `libraries`, `libraryItems`,
  `podcasts`, `podcastEpisodes`, `mediaProgresses`… Les fichiers audio sont
  décrits en JSON (`audioFile` / `audioFiles`, avec `metadata.path`, `duration`,
  `bitRate`, chapitres) ; chemins disque sous les racines de bibliothèque.
- **2 bibliothèques** (type *podcast*) :
  - **« Cultes complets »** — ~80 podcasts, **1 podcast = 1 culte**. Les épisodes
    d'un podcast = les moments/fichiers de ce culte.
  - **« Prédications »** — 4 podcasts (séries de messages / compilations de
    prédications indépendantes), chaque épisode = 1 prédication. Fichiers avec
    métadonnées MP3 (ID3) plus riches (orateur, titre…).
- **Période à 2 cultes/jour** : l'heure discrimine les deux cultes d'une même
  date.
- **Date + heure du culte** : dans le **nom du dossier** côté « Cultes complets ».
- **Date + heure** : également dans le **nom de fichier** côté « Prédications » →
  sert de clé de corrélation.

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
   prédication est corrélée par date+heure à un culte des ~80 ; aucune ne devient
   un `AudioService` `type=AUTRE` autonome.

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

### Phase 3 — Recette puis prod

1. Passe complète sur l'environnement de **recette** (base + bucket recette) :
   vérifier écoute, découpage, métadonnées, corrélation prédications.
2. Passe **prod** : même script, base + bucket prod, fichiers stagés. Laisser le
   worker traiter la file (de nuit si besoin).
3. Vérif des comptes (`audio_services` publiés, `audio_renditions`), écoute de
   contrôle dans `/audio/ecouter`.
4. Décommission d'Audiobookshelf.

## 8. Estimation de volume (à affiner en phase 0)

- **Cultes complets** : ~80 podcasts. Si ~1h30 par culte à ~128–192 kbps ⇒
  ~80–170 Mo/culte ⇒ **~6–14 Go** côté sources.
- **Prédications** : 4 podcasts, nombre d'épisodes inconnu (compilations) ⇒ à
  mesurer ; ~40 min/prédication ⇒ ~40–55 Mo pièce.
- **Séquences à rendre** : ~4–6 séquences/culte × ~80 cultes ⇒ **~320–480
  séquences** ⇒ **~10–24 h de CPU worker** (loudnorm 2 passes), étalées
  (1 job à la fois). Prévoir une fenêtre de nuit ou plusieurs jours.
- **Renditions produites** : ~même volume que les sources (MP3 192k) ⇒ prévoir
  **~15–35 Go** supplémentaires sur le bucket (sources + renditions).

## 9. Inconnues restantes

**Bloquant pour écrire le parseur :**

1. Format **exact** du nom de dossier (bibliothèque « Cultes complets ») et du
   nom de fichier (bibliothèque « Prédications ») portant la **date + heure** —
   à relever par un `ls` lecture seule du dossier de la bibliothèque « cultes »
   sur `ssh.iccrennes.fr` (phase 0). Commande proposée, non encore exécutée :
   `find /var/lib/audiobookshelf -maxdepth 2 -type d | grep -iE "culte|predic"`
   puis `ls` du dossier trouvé.
2. Schéma réel des tables `absdatabase.sqlite` en `v2.35.1` (noms de
   colonnes/tables — varient selon version).

**À confirmer, non bloquant :**

3. Quand un culte n'a **pas** de prédication corrélée : garder l'épisode
   « prédication » de la bibliothèque « Cultes complets » tel quel (défaut
   retenu).
4. Présence de couvertures ABS à reprendre (option — sinon couverture par défaut
   de l'église).
5. Capacité disque restante du bucket S3 de prod (~15–35 Go nécessaires).

**Résolues :** contenu = culte complet découpé · ~4–6 séquences/culte ·
corrélation par date+heure (dossier côté cultes, nom de fichier côté
prédications) · 4 podcasts prédications tous rattachés à un culte · église =
ICC Rennes · `publishedById` = `ouattara.ismael@gmail.com`.

## 10. Prochaines étapes

- [ ] Phase 0 : `ls` lecture seule du dossier bibliothèque « Cultes complets »
      sur `ssh.iccrennes.fr` → relever le pattern date+heure (inconnue §9.1).
- [ ] Phase 0 : inspection du schéma `absdatabase.sqlite` `v2.35.1` (§9.2).
- [ ] `/specify` sur la base de ce document une fois le pattern relevé.
- [ ] Écriture de `scripts/migrate-audiobookshelf.ts` + passe recette.
