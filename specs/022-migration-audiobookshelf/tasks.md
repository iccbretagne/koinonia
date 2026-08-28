# Tâches — Migration des cultes Audiobookshelf

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **Inventaire** : `./reflexion.md`
- **Statut** : Implémentée (code + tests) ; passes recette/prod à dérouler

> Tâches ordonnées et vérifiables. Cette feature **ne modifie ni le schéma, ni
> les routes API, ni l'UI** : l'ordre naturel devient
> *fonctions pures → manifeste → orchestration → tests → passe recette*.
> Les tâches `[P]` sont parallélisables (fichiers indépendants).

## Prérequis

- [x] Branche créée : `feat/migration-audiobookshelf`
- [x] Fichiers Audiobookshelf copiés sur la VM de recette
- [x] **Aucune migration Prisma** — le schéma est inchangé (vérifier qu'aucune
      tâche n'en introduit)
- [ ] `ffprobe` disponible sur la machine d'exécution (`ffprobe -version`)
- [ ] Worker audio actif sur la cible avant l'exécution (`npm run worker`)
- [ ] Exécution depuis un **checkout complet** du dépôt à la version déployée
      (`npm ci` + `npx prisma generate`), `DOTENV_CONFIG_PATH` sur le `.env` de
      la cible — le script n'est **pas** dans l'artefact `standalone` déployé
      (cf. `plan.md` § « Emplacement et exécution » et `README.md` du script)

## Tâches

### 1. Données & migration

*Aucune tâche — le plan n'introduit aucun changement de schéma
(`AudioService` / `AudioSource` / `AudioSegment` / `AudioRendition` /
`AudioJob` existants suffisent).*

- [x] **T1** — Ajouter `prisma/scripts/migrate-audiobookshelf/.ledger.jsonl` au
      `.gitignore` (le ledger est un état local d'exécution, jamais versionné)
      *(fichier : `.gitignore`)*

### 2. Logique métier — fonctions pures (`parse.ts`)

Toutes dans `prisma/scripts/migrate-audiobookshelf/parse.ts`, sans effet de
bord, sans accès disque ni réseau. Elles se développent avant l'orchestration.

- [x] **T2** — `normalizeForMatch(s)` : minuscules, accents retirés (NFD),
      ponctuation → espace, espaces réduits. Socle de `canonicalTitle`.
- [x] **T3** — `parseTrack(filename)` → `{ order: number | null, rawTitle: string }`.
      **Lit le numéro avant de le retirer** (`#N - `, `N - `), remplace `_` par
      des espaces, réduit les espaces multiples, retire l'extension.
- [x] **T4** — `canonicalTitle(rawTitle)` : rabat sur le template standard de 8
      libellés (tableau du plan § *Normalisation des titres*). Renvoie le titre
      nettoyé tel quel si aucune règle ne matche.
- [x] **T5** — `isExcludedTrack(rawTitle, filename)` : `true` pour `MLA*`,
      `Balance MLA`, `Cover.png`, `desktop.ini`, tout non-`.mp3`.
- [x] **T6** — `isPredicationTrack(rawTitle)` : `canonicalTitle(...) === "Prédication"`.
      Pas de règle de détection parallèle.
- [x] **T7** — `orderTracks(tracks)` : tri par `order` croissant, pistes sans
      numéro ensuite dans l'ordre de listing, **renumérotation contiguë `1..n`**,
      déduplication de titre (suffixe ` (2)`) avec signalement.
- [x] **T8** [P] — `parseCulteFolder(name)` → `{ date, slot, label, type }`.
      Gère `Culte du JJ MM AAAA`, `Culte 1|2 du …`, `Cérémonie des baptêmes du …`
      (→ `type: "AUTRE"`). `null` si non reconnu.
- [x] **T9** [P] — `parsePredicationFile(name)` → `{ date, time, rawTitle }`
      depuis `AAAA-MM-JJ_HHhMM_Titre.mp3`.
- [x] **T10** — `defaultServiceTime(slot)` → `"12:00"` si `slot === 2`, sinon
      `"10:00"` ; et `toUtcDate(date, time)` : `Europe/Paris` → UTC **sans
      dépendance nouvelle** si possible (sinon justifier dans le plan).
- [x] **T11** — `matchPredication(culte, predicationsByDate)` : même date ; deux
      cultes + deux prédications → appariement par ordre horaire
      (`10h*` → slot 1, `12h*` → slot 2) ; `null` si aucune.

### 3. Manifeste (`manifest.ts`)

- [x] **T12** — Schéma **Zod** du manifeste + type inféré : culte
      (`folder`, `date`, `slot`, `title`, `speaker`, `type`, `serviceDateUtc`) →
      séquences (`order`, `title`, `filePath`, `sizeBytes`, `isPredication`,
      `fromPredicationsLibrary`). *(fichier : `manifest.ts`)*
- [x] **T13** — `buildManifest(fsTree)` dans `parse.ts` : assemble cultes +
      séquences + substitution prédication + règles de titre du culte
      (titre du message si apparié, sinon `label` du dossier ; `speaker` = ID3
      `artist` si apparié, sinon `null`). Renvoie aussi un **rapport**
      (fichiers ignorés, titres non canoniques, collisions, cultes sans
      prédication).

### 4. Effets de bord (I/O)

- [x] **T14** [P] — `putObjectAvecEtag(key, body, contentType)` : `PutObject` via
      `s3Media`/`MEDIA_BUCKET` (`@/lib/s3`), lit l'`ETag` de la réponse et retire
      les guillemets. Garde-fou : refus explicite au-delà de 512 Mo.
      *(fichier : `s3.ts`)*
- [x] **T15** [P] — `probeDurationMs(filePath)` : `ffprobe -show_entries
      format=duration` → millisecondes arrondies ; erreur explicite si `ffprobe`
      absent. *(fichier : `probe.ts`)*
- [x] **T16** [P] — `readId3(filePath)` : `ffprobe -show_entries format_tags` →
      `{ artist, title }` pour les fichiers de la bibliothèque `predications`.
      *(fichier : `probe.ts`)*
- [x] **T17** [P] — Ledger : `readLedger()` / `appendLedger(entry)` sur
      `.ledger.jsonl` (une ligne JSON par culte traité, clé = nom du dossier
      ABS). Tolère un fichier absent. *(fichier : `ledger.ts`)*
- [x] **T18** — `scanRoot(root)` : lecture de `--root/cultes/*` et
      `--root/predications/**/*.mp3` → arborescence brute passée à
      `buildManifest`. *(fichier : `scan.ts`)*

### 5. Orchestration (`index.ts`)

- [x] **T19** — Amorce : `import "dotenv/config"`, `PrismaClient` local avec
      `PrismaMariaDb(process.env.DATABASE_URL)`, parsing des args
      (`--root` obligatoire, `--dry-run`, `--only`, `--limit`, `--purge`).
- [x] **T20** — Résolution du contexte : `churchId` d'ICC Rennes et
      `publishedById` (`User.email = "ouattara.ismael@gmail.com"`), avec échec
      explicite et message actionnable si l'un des deux est absent.
- [x] **T21** — Mode `--dry-run` : construit le manifeste, le valide (Zod),
      imprime le **rapport** (cultes détectés, séquences par culte,
      substitutions prédication, fichiers ignorés, titres non canoniques,
      collisions, cultes sans prédication) et s'arrête **sans aucune écriture**.
- [x] **T22** — Boucle d'import par culte : `createAudioService` →
      création/renseignement des `AudioSource` (dépôt S3 + `ETag` + `ffprobe`
      **avant** l'étape suivante) → `applySequences` → `publishAudioService` →
      `appendLedger`. Import **via `@/modules/audio` uniquement**.
- [x] **T23** — Reprise et idempotence : sauter les dossiers déjà présents au
      ledger ; en cas d'échec en cours de culte, message indiquant la commande
      `--purge <folder>` à jouer.
- [x] **T24** — `--purge <folder>` : supprime un culte importé non publié via
      `deleteAudioService` du module (nettoyage BDD + S3) et retire sa ligne du
      ledger.
- [x] **T25** — Résumé final : cultes créés, séquences déposées, jobs `RENDER`
      en attente, anomalies ; rappel de vérifier que le worker tourne et de
      suivre `SELECT status, count(*) FROM audio_jobs GROUP BY status`.

### 6. API

*Aucune tâche — aucun endpoint ajouté ou modifié.*

### 7. UI

*Aucune tâche — aucun écran ajouté ou modifié. Les cultes migrés s'affichent
via `/audio/ecouter` et l'onglet Production existants.*

### 8. Tests (Vitest)

Fichier `prisma/scripts/migrate-audiobookshelf/parse.test.ts`, déjà couvert par
`include: ["prisma/**/*.test.ts"]` de `vitest.config.ts`.

- [x] **T26** [P] — Tests `parseCulteFolder` : `"Culte du 12 01 2025"`,
      `"Culte 1 du 23 02 2025"`, `"Culte 2 du 11 05 2025"`,
      `"Cérémonie des baptêmes du 16 02 2025"` (→ `type: "AUTRE"`), dossier non
      reconnu → `null`.
- [x] **T27** [P] — Tests `parsePredicationFile` :
      `"2025-02-09_12h00_La_loi_de_la_semence.mp3"`,
      `"2025-11-02_10h30_Le_rôle_du_Saint-esprit_dans_notre_vie.mp3"`.
- [x] **T28** [P] — Tests `parseTrack` : `"#5 - Prédication.mp3"`,
      `"1 - Prière des  STAR.mp3"`, `"Sainte_cène_et_Offrandes.mp3"`,
      `"Annonces.mp3"`, `"#99 - MLA.mp3"` — vérifient que `order` est bien
      capturé **avant** le strip.
- [x] **T29** [P] — Tests `canonicalTitle` : au moins un cas par ligne du
      template (`"Modération"` → `"Annonces"`, `"Louange"` →
      `"Louanges et adoration"`, `"Sainte cène et Offrandes"` →
      `"Sainte-cène, dîmes et offrandes"`, `"Prière finale"` →
      `"Prière de fin"`, `"Message"` → `"Prédication"`,
      `"Prédication & Offrandes"` → `"Prédication"`) ; titre inconnu
      (`"Actions de grâce et témoignages"`) → rendu tel quel.
- [x] **T30** [P] — Tests `isExcludedTrack` : `"#98 - MLA Balances"`, `"MLA"`,
      `"Balance MLA"`, `"Cover.png"`, `"desktop.ini"` → `true` ;
      `"Modération"` → `false`.
- [x] **T31** [P] — Tests `isPredicationTrack` : `"Prédication"`,
      `"prédication"`, `"Prédications"`, `"Message"`,
      `"Prédication & Offrandes"` → `true` ; `"Louanges"` → `false`.
- [x] **T32** — Tests `orderTracks` : **conservation de l'ordre malgré le
      strip** (`#5` reste après `#3`), mélange numéroté / non numéroté, trous
      (`#2..#6`), valeurs hautes exclues, renumérotation contiguë `1..n`,
      déduplication de titre.
- [x] **T33** [P] — Tests `defaultServiceTime` + `toUtcDate` : slot 1 → 10:00,
      slot 2 → 12:00 ; conversion `Europe/Paris` → UTC correcte **en heure d'été
      comme en heure d'hiver** (juin vs décembre).
- [x] **T34** — Tests `matchPredication` : 1 culte / 1 prédication ;
      2 cultes (slots 1 et 2) / 2 prédications `10h00` + `12h00` → appariement
      correct ; 2 cultes / 0 prédication → `null` ; 1 culte / 0 prédication →
      `null`.
- [x] **T35** — Tests `buildManifest` sur une **fixture** d'arborescence
      (`__fixtures__/`) reproduisant 3–4 dossiers représentatifs : culte
      standard numéroté, culte 2024 à underscores et numérotation trouée, couple
      `Culte 1`/`Culte 2` avec deux prédications, cérémonie de baptêmes.
      Vérifie : manifeste conforme au schéma Zod, substitution prédication,
      titre du culte, `speaker`, `type`, séquences ordonnées, MLA absentes.
- [x] **T36** — Test de **non-collision** : fixture d'un culte contenant à la
      fois `Modération` et `Annonces` → le rapport signale la collision (le
      catalogue réel n'en contient aucune, mais le garde-fou doit exister).

### 9. Documentation & exploitation

- [x] **T37** [P] — `README.md` du script : pré-requis (`ffprobe`, worker actif,
      variables `DATABASE_URL` / `MEDIA_S3_*`), commandes recette puis prod,
      options CLI, lecture du rapport, procédure de reprise (`--purge`),
      surveillance de `audio_jobs`. *(fichier : `prisma/scripts/migrate-audiobookshelf/README.md`)*
- [ ] **T38** — Passe **recette** : `--dry-run` → revue du rapport → exécution
      `--limit 3` → vérification dans `/audio/ecouter` → exécution complète →
      attente de la fin des `RENDER`.
- [ ] **T39** — Vérification des **critères d'acceptation** de `spec.md` en
      recette (cf. checklist ci-dessous), y compris la relance du script pour
      confirmer l'absence de doublon.
- [ ] **T40** — Mettre à jour `reflexion.md` (§10) et le statut de `spec.md` /
      `plan.md` après validation en recette.

### 10. Production (hors PR — après merge)

- [ ] **T41** — Copier les fichiers ABS vers la cible de production (lecture
      seule côté `/var/lib/audiobookshelf`), **sur accord explicite**.
- [ ] **T42** — Exécution en heure creuse, surveillance de `audio_jobs`,
      vérification finale, puis arrêt d'Audiobookshelf.

## Couverture des critères d'acceptation

| Critère (`spec.md`) | Tâches |
|---|---|
| Chaque culte ABS existe comme **un** culte publié | T13, T22, T35, T38 |
| Date + heure cohérentes | T8, T10, T11, T33, T39 |
| Séquences dans le même ordre, titres lisibles | T3, T4, T7, T28, T29, T32 |
| Pistes MLA absentes | T5, T30, T35 |
| Substitution prédication + orateur + titre du message | T6, T11, T13, T31, T34, T35 |
| Journée à 2 cultes : matin/midi bien rattachés | T11, T34 |
| Culte sans prédication : orateur vide, publié quand même | T13, T35, T39 |
| Séquences écoutables (lecture, seek, reprise) | T22, T38, T39 |
| Volume normalisé comme les cultes récents | T22 (via `publishAudioService` + worker), T39 |
| Relance sans doublon | T17, T23, T39 |
| Isolation multi-tenant ICC Rennes | T20, T22, T39 |
| Application utilisable pendant le rendu | T25, T38 |

*Tous les critères d'acceptation sont couverts.*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Aucune modification de `prisma/schema.prisma` ni de migration créée
- [ ] Aucun import interne d'un module (`@/modules/audio/services/...`) — index
      public uniquement
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (T39)
- [ ] PR ouverte vers `main`
