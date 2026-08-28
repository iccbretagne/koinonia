# Migration des cultes Audiobookshelf → module audio Koinonia

Script **ponctuel** : rapatrie la bibliothèque « cultes » d'Audiobookshelf de
ICC Rennes dans le module audio de Koinonia comme `AudioService` publiés,
découpés en séquences, écoutables depuis `/audio/ecouter`.

Voir `specs/022-migration-audiobookshelf/` (spec, plan, reflexion) pour le
contexte et les décisions.

## Ce que fait le script

Pour chaque dossier `cultes/<Culte du JJ MM AAAA>/` :

1. lit les pistes `.mp3` (hors musique de fin « MLA / Balance MLA », hors
   fichiers non-audio) ;
2. normalise les titres sur un template standard de 8 libellés, en **conservant
   l'ordre d'origine** malgré le retrait du préfixe numérique ;
3. si une prédication de même date existe dans `predications/`
   (`AAAA-MM-JJ_HHhMM_Titre.mp3`), la séquence « Prédication » utilise **ce**
   fichier (ID3 plus riche) et le culte en tire son `speaker` (ID3 `artist`) et
   son titre (ID3 `title`). Journée à deux cultes → appariement par heure ;
4. crée le `AudioService` via `@/modules/audio` (`createAudioService` →
   dépôt S3 des sources + `ffprobe` → `applySequences` → `publishAudioService`) ;
5. inscrit le dossier au **ledger** local (`.ledger.jsonl`) pour l'idempotence.

La publication crée un job `RENDER` par séquence. **Le worker audio
(`npm run worker`) doit tourner sur la cible** pour produire les rendus ; sans
lui, les cultes restent en `READY` sans audio jouable.

Aucun changement de schéma, aucune route API, aucun écran : le script alimente
le pipeline existant.

## Pré-requis

| Élément | Vérification |
|---|---|
| `ffprobe` accessible | `ffprobe -version` (ou variable `FFPROBE_PATH`) |
| `DATABASE_URL` | pointant sur la base cible (recette puis prod) |
| `MEDIA_S3_*` | bucket média configuré (`s3Media` / `MEDIA_BUCKET` de `@/lib/s3`) |
| Fichiers ABS copiés | `<root>/cultes/*` et `<root>/predications/**` présents sur la machine d'exécution |
| Worker audio actif | `npm run worker` sur la cible, avant ou pendant l'import |
| Église + publieur | `Church` ICC Rennes et `User.email = ouattara.ismael@gmail.com` existent dans la base cible |

## Utilisation

```bash
# 1. Revue à blanc — construit le manifeste, imprime le rapport, n'écrit rien
tsx prisma/scripts/migrate-audiobookshelf/index.ts --root /chemin/vers/abs --dry-run

# 2. Import prudent — 3 premiers cultes non traités, puis vérifier /audio/ecouter
tsx prisma/scripts/migrate-audiobookshelf/index.ts --root /chemin/vers/abs --limit 3

# 3. Import complet (relançable : les dossiers déjà au ledger sont sautés)
tsx prisma/scripts/migrate-audiobookshelf/index.ts --root /chemin/vers/abs

# 4. Reprise après échec sur un culte — supprime l'import partiel puis relancer
tsx prisma/scripts/migrate-audiobookshelf/index.ts --root /chemin/vers/abs --purge "Culte du 29 12 2024"
```

### Options

| Option | Effet |
|---|---|
| `--root <dir>` | racine contenant `cultes/` et `predications/` (**obligatoire**) |
| `--dry-run` | manifeste + rapport uniquement, aucune écriture BDD/S3 |
| `--only <dossier>` | limite l'import à ce dossier de culte (répétable) |
| `--limit <n>` | limite aux `n` premiers cultes non encore traités |
| `--purge <dossier>` | supprime le culte importé (BDD + S3) et retire sa ligne du ledger |

## Lecture du rapport (`--dry-run`)

- **Cultes détectés / séquences totales** — volume attendu.
- **Dossiers non reconnus** — nom hors format `… du JJ MM AAAA` : à traiter à la
  main ou à renommer.
- **Fichiers exclus (MLA…)** — musique de fin volontairement écartée.
- **Titres non canoniques** — piste gardée avec son libellé d'origine (aucune
  règle du template n'a matché) : vérifier que c'est acceptable.
- **Collisions de titre** — deux séquences au même titre dans un culte : la
  seconde est suffixée ` (2)`. Le catalogue réel n'en produit pas ; toute
  occurrence mérite un coup d'œil.
- **Cultes sans séquence prédication** — normal pour les cultes 2024 sans
  prédication en bibliothèque ; `speaker` restera vide.
- **Prédication appariée mais inutilisée** — une prédication existe pour la date
  mais aucune séquence du culte n'a été identifiée comme « Prédication ».

## Idempotence & reprise

- Le **ledger** `.ledger.jsonl` (git-ignoré, à côté du script) contient une
  ligne JSON par culte importé avec succès, clé = nom du dossier ABS.
- Une relance saute ces dossiers : sûr de relancer autant de fois que
  nécessaire.
- Un échec en cours de culte laisse un `AudioService` partiel **non inscrit** au
  ledger. Le nettoyer avec `--purge "<dossier>"` avant de relancer.

## Surveillance du rendu

```sql
SELECT status, count(*) FROM audio_jobs GROUP BY status;
```

Attendre que plus aucun job `PENDING` / `RUNNING` de type `RENDER` ne subsiste.
Les cultes passent alors de `READY` à `PUBLISHED` et deviennent audibles dans
`/audio/ecouter`.

## Recette puis production

1. **Recette** : dérouler les étapes 1→3 ci-dessus sur la VM de recette,
   worker actif, vérifier les critères d'acceptation de `spec.md`, relancer le
   script pour confirmer l'absence de doublon.
2. **Production** (après merge, **sur accord explicite**) : copier les fichiers
   ABS sur la cible de prod (lecture seule côté `/var/lib/audiobookshelf`),
   exécuter en heure creuse, surveiller `audio_jobs`, puis décommissionner
   Audiobookshelf.
