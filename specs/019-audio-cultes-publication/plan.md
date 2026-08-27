# Plan technique — Publication audio des cultes (P1)

- **Spec associée** : `./spec.md`
- **Conception associée** : `./design.md` (raisonnement, mesures, D1–D12)
- **ADR associés** : [ADR-0005](../../docs/adr/0005-module-audio-distinct.md) (module distinct),
  [ADR-0006](../../docs/adr/0006-extraction-module-storage.md) (extraction `storage`),
  [ADR-0007](../../docs/adr/0007-worker-hors-nextjs-table-jobs.md) (worker + table de jobs)
- **Statut** : Brouillon
- **Mis à jour le** : 2026-08-23

> Ce plan couvre **P0** (extraction `modules/storage`) et **P1** (culte publié de bout en
> bout, sans détection automatique, sans agent de dépôt, sans bibliothèque — voir `spec.md`
> § Hors périmètre). Le modèle de données inclut les champs prévus par `design.md` §5 pour
> tout le module, afin d'éviter une seconde migration à P2 ; seuls **PROBE** et **RENDER**
> sont câblés à un handler en P1 (`ALIGN`/`TRANSCRIBE` restent des valeurs d'enum réservées,
> non exécutées).
>
> **P1 ne livre qu'un seul chemin de dépôt** : le **dépôt direct de séquences déjà mixées et
> découpées** (un fichier MP3 par séquence), qui est la pratique courante de la régie (voir
> `design.md` révision 8). Le dépôt d'un **mix stéréo à découper** et l'écran de découpage
> (`WaveformEditor`) sont reportés en **P1.5** : c'est le poste le plus coûteux du module et il
> ne sert que le cas minoritaire. Le modèle de données prévoit les deux chemins dès P1 pour
> éviter une migration à P1.5, mais seul le chemin « séquences » est câblé.

## Terminologie « mix » (rappel de conception)

Le mix stéréo déposé sur le premier chemin est déjà, en pratique, un mixage des pistes de
chantres additionné des micros dédiés (modérateur, pasteur, prière des STAR optionnelle) — ce
travail de mixage est réalisé **en amont, hors Koinonia**, par la régie ou un outil externe, en
P1 comme en P2. Koinonia ne fabrique pas le mix lui-même en P1 (D8) ; le `mixingProfile` de
`AudioServiceTemplate` (P2, D10) ne fait que documenter cette recette (groupement de canaux) le
jour où un agent de dépôt fabriquera le mix automatiquement depuis les pistes multipistes.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `audio` dépend de `core` et `storage` (ADR-0006) ; `src/app/`
      importe uniquement `@/modules/audio` et `@/modules/storage`, jamais de chemin interne.
- [x] **Sécurité** : chaque route protégée par `requireAuth`/`requireAudioAccess` (nouveau
      helper, voir § Décisions) ; `churchId` porté par `AudioService` dès sa création (D9).
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) pour le socle rôle ; complété par
      un contrôle d'appartenance au département de captation configurable (D7), sur le modèle de
      `isControlTeamMember` (`src/modules/rooms/services/checklist.service.ts`).
- [x] **Validation** Zod sur toutes les mutations (dépôt, nommage/ordonnancement des séquences,
      publication, paramètres).
- [x] **Migration** Prisma prévue (nouveaux modèles + extraction `storage`) — pas de `db push`.
- [x] **Enums** (`AudioSourceKind`, `AudioSegmentKind`, `AudioJobType`, `AudioJobStatus`,
      `AudioServiceStatus`) importés depuis `@/generated/prisma/client`.
- [x] **UI** : réutilisation de `Button`, `Modal`, `DataTable`, `CheckboxGroup`,
      `BulkActionBar` (`src/components/ui/`) ; en P1 **aucun composant réellement nouveau** n'est
      requis (l'éditeur de forme d'onde est reporté en P1.5).

## Approche générale

Trois chantiers séquentiels :

1. **P0 — Extraction `modules/storage`** (ADR-0006) : déplacer `s3.ts` et le primitif de
   jeton hors de `media`, `media` réexporte. Aucune régression fonctionnelle attendue ;
   validé par la suite de tests existante de `media`.
2. **P1 — Module `audio`** (ADR-0005) : modèles Prisma, endpoints de dépôt multi-fichiers /
   nommage / publication, worker de normalisation (ADR-0007), écran de nommage-réordonnancement,
   page publique de lecture, lien croisé avec l'événement.
3. **Worker** : process `npm run worker` distinct, une seule table `audio_jobs`
   (`SELECT … FOR UPDATE SKIP LOCKED`), deux handlers en P1 (`PROBE` = mesure durée + niveau de
   chaque séquence déposée ; `RENDER` = `loudnorm` ffmpeg + réencodage + métadonnées).

Le dépôt est **manuel** en P1 (D8/l'agent de dépôt est hors périmètre) : upload direct
navigateur → S3 via multipart, sur le même pattern que
`src/app/api/media/files/upload/sign/route.ts`, mais avec reprise (l'agent n'existe pas
encore, donc c'est le navigateur qui doit survivre à une coupure réseau — voir § Risques).
Les deux chemins partagent ce mécanisme d'upload et divergent seulement après :

| | **Chemin A — séquences déjà mixées (P1)** | Chemin B — mix à découper (P1.5) |
|---|---|---|
| Ce qui est déposé | x fichiers MP3, un par séquence | 1 fichier (mix stéréo du culte entier) |
| `AudioSource.kind` | `SEQUENCE` (une source par fichier) | `MIX` |
| Job `PROBE` | durée + niveau seulement | pics de forme d'onde |
| Écran de validation | liste réordonnable + renommage | `WaveformEditor` (poser les frontières) |
| Job `RENDER` | `loudnorm` + réencodage + tags (pas de découpe) | découpe + `loudnorm` + tags |
| Suite | identique : publication, lien public, lecteur | identique |

**Ce que P1.5 ajoutera** (rien à défaire, uniquement de l'ajout) : la valeur `MIX` devient
utilisable au dépôt, `handlers/probe.ts` gagne sa branche « pics de forme d'onde »,
`handlers/render.ts` sa branche « découpe », plus le service `segments.ts`, la route
`/segments` PUT et le composant `WaveformEditor`. Ces éléments sont décrits ci-dessous et
**marqués P1.5** — ils ne font pas partie du périmètre à découper en `/tasks`.

## Modèle de données

```prisma
// ─── Module storage (P0 — pas de nouveau modèle, déplacement de code) ─────

// ─── Module audio (P1) ─────────────────────────────────────────────────

enum AudioServiceStatus {
  DRAFT              // dépôt incomplet ou en cours
  PENDING_REVIEW      // sources déposées, en attente de nommage (P1) ou de découpage (P1.5)
  READY               // découpage validé, rendu en cours ou terminé
  PUBLISHED
  UNPUBLISHED
}

enum AudioSourceKind {
  SEQUENCE   // séquence déjà mixée et découpée, déposée telle quelle (P1 — seul kind émis)
  MIX        // mix stéréo à découper (P1.5 — valeur réservée, non émise en P1)
  ENVELOPES  // enveloppes d'énergie par canal (P2, agent de dépôt)
  SOURCE     // multipiste FLAC archivé (P2)
}

enum AudioSegmentKind {
  SEQUENCE   // publiée
  DISCARDED  // marquée non diffusée (répétition, temps mort)
}

enum AudioJobType {
  PROBE       // P1 — pics de forme d'onde depuis le mix
  RENDER      // P1 — découpe + loudnorm + métadonnées par segment
  ALIGN       // P2 — détection automatique des frontières (réservé, non exécuté)
  TRANSCRIBE  // P3 — transcription (réservé, non exécuté)
}

enum AudioJobStatus {
  PENDING
  RUNNING
  DONE
  FAILED
}

model AudioSettings {
  id                   String   @id @default(cuid())
  churchId             String   @unique
  captureDepartmentId  String?  // département autonome sur le module (D7) — pas codé en dur
  defaultCoverKey      String?  @db.VarChar(512)
  sequenceTemplate     Json?    // noms de séquences usuels proposés à la validation

  church               Church     @relation(fields: [churchId], references: [id])
  captureDepartment    Department? @relation(fields: [captureDepartmentId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("audio_settings")
}

model AudioService {
  id               String              @id @default(cuid())
  churchId         String
  planningEventId  String?             // rattachement facultatif (spec §1, cas limite)
  serviceDate      DateTime            // saisie si pas de planningEventId
  title            String?
  speaker          String?
  coverKey         String?             @db.VarChar(512) // override, sinon AudioSettings.defaultCoverKey
  status           AudioServiceStatus  @default(DRAFT)
  publishedAt      DateTime?
  publishedById    String?
  openCount        Int                 @default(0) // compteur d'ouverture du lien (spec §6)

  church           Church              @relation(fields: [churchId], references: [id])
  planningEvent    Event?              @relation(fields: [planningEventId], references: [id])
  sources          AudioSource[]
  segments         AudioSegment[]
  jobs             AudioJob[]
  shareTokens      AudioShareToken[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([churchId, status])
  @@index([churchId, planningEventId])
  @@map("audio_services")
}

model AudioSource {
  id           String          @id @default(cuid())
  serviceId    String
  kind         AudioSourceKind
  channelKey   String?         // null pour MIX/SEQUENCE ; nom du canal pour ENVELOPES/SOURCE (P2)
  s3Key        String          @db.VarChar(512)  // nommé par sourceId, PAS le nom d'origine (cf. originalFilename)
  originalFilename String?     @db.VarChar(255)  // nom du fichier tel que déposé — affiché au nommage (spec §2)
  durationMs   Int?
  sizeBytes    BigInt?         // converti en Number avant toute réponse JSON (toJsonSafeAudioSource) —
                                // NextResponse.json ne sait pas sérialiser un BigInt
  uploadStatus String          @default("PENDING") // multipart en cours / terminé
  purgeableAt  DateTime?       // archive FLAC, purge manuelle (P2)

  service      AudioService    @relation(fields: [serviceId], references: [id])
  segment      AudioSegment?   // relation inverse, uniquement peuplée pour kind SEQUENCE

  createdAt DateTime @default(now())

  @@map("audio_sources")
}

model AudioSegment {
  id          String            @id @default(cuid())
  serviceId   String
  sourceId    String?           @unique // kind SEQUENCE uniquement (chemin 2) — null si découpé du MIX (chemin 1)
  order       Int
  kind        AudioSegmentKind  @default(SEQUENCE)
  title       String
  startMs     Int               // 0 pour un segment né d'une AudioSource kind SEQUENCE
  endMs       Int               // durationMs de la source pour un segment kind SEQUENCE
  confidence  Float?            // rempli en P2 par la détection ; null en P1 (placement manuel)
  detectedBy  String?           // "manual" en P1 (chemin 1) ; "deposit" en P1 (chemin 2) ; nom de l'algo en P2

  service     AudioService      @relation(fields: [serviceId], references: [id])
  source      AudioSource?      @relation(fields: [sourceId], references: [id])
  rendition   AudioRendition?
  playCount   Int               @default(0) // spec §6

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([serviceId, order])
  @@index([serviceId, kind])
  @@map("audio_segments")
}

model AudioRendition {
  id          String   @id @default(cuid())
  segmentId   String   @unique
  s3Key       String   @db.VarChar(512)
  format      String   @default("mp3")
  durationMs  Int
  lufs        Float
  truePeakDb  Float
  sourceHash  String   // idempotence du rendu (D10)

  segment     AudioSegment @relation(fields: [segmentId], references: [id])

  createdAt DateTime @default(now())

  @@map("audio_renditions")
}

model AudioServiceTemplate {
  id                String   @id @default(cuid())
  churchId          String
  eventType         String?  // null = déroulé par défaut de l'église
  sequenceNames     Json     // liste ordonnée de noms usuels proposés (D5)
  mixingProfile     Json?    // groupement de canaux, gains (P2, D10) — vide en P1

  church            Church   @relation(fields: [churchId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([churchId, eventType])
  @@map("audio_service_templates")
}

model AudioJob {
  id           String         @id @default(cuid())
  serviceId    String
  type         AudioJobType
  status       AudioJobStatus @default(PENDING)
  progress     Int            @default(0)
  attempts     Int            @default(0)
  leasedUntil  DateTime?
  payload      Json?
  error        String?        @db.Text

  service      AudioService   @relation(fields: [serviceId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, leasedUntil])
  @@map("audio_jobs")
}

model AudioShareToken {
  id          String    @id @default(cuid())
  serviceId   String
  segmentId   String?   // null = lien vers le culte entier ; sinon lien direct vers une séquence
  token       String    @unique
  revokedAt   DateTime?

  service     AudioService @relation(fields: [serviceId], references: [id])
  segment     AudioSegment? @relation(fields: [segmentId], references: [id])

  createdAt DateTime @default(now())

  @@index([serviceId])
  @@map("audio_share_tokens")
}
```

Ajouts sur `Church` : `audioSettings AudioSettings?`, `audioServices AudioService[]`,
`audioServiceTemplates AudioServiceTemplate[]`.
Ajout sur `Event` : `audioService AudioService?` (relation inverse, facultative).
Ajout sur `Department` : `audioSettings AudioSettings[]` (relation inverse de
`captureDepartmentId`).

**Position de lecture par appareil** (« reprendre plus tard là où il s'était arrêté ») : pas de
modèle serveur — stockée côté client (`localStorage`, clé par `segmentId`), cohérent avec un
auditeur sans compte. Pas de champ Prisma dédié.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/audio/services` | GET | `audio:view` (dept. captation ou rôle) | query `?status=` | `AudioService[]` (file d'attente) |
| `/api/audio/services` | POST | `audio:upload` | `{ planningEventId? , serviceDate?, title?, speaker? }` | `AudioService` (DRAFT) |
| `/api/audio/services/[id]` | GET | `audio:view` | — | `AudioService` + sources + segments |
| `/api/audio/services/[id]` | PATCH | `audio:review` | `{ speaker?, planningEventId?, coverKey? }` | `AudioService` |
| `/api/audio/services/[id]/upload/sign` | POST | `audio:upload` | `{ filename, contentType, size, kind: "SEQUENCE" }` | `{ sourceId, uploadUrl, key, expiresIn }` (multipart, cf. `media/files/upload/sign` ; appelé une fois par fichier de séquence déposé. `kind: "MIX"` accepté seulement en P1.5) |
| `/api/audio/services/[id]/upload/complete` | POST | `audio:upload` | `{ sourceId, parts[] }` | `AudioSource` (déclenche job `PROBE` — durée + mesure de niveau) |
| `/api/audio/services/[id]/sources/[sourceId]` | DELETE | `audio:upload` | — | `{ deleted }` — retire une séquence déposée par erreur, tant que le culte est DRAFT/PENDING_REVIEW (fichier + segment nommé éventuel + nettoyage S3 best-effort). *Ajouté après retour terrain : le dépôt n'avait aucun moyen de corriger un doublon ou un mauvais fichier avant publication.* |
| `/api/audio/services/[id]/sequences` | PUT | `audio:review` | `{ sequences: [{sourceId,order,title,kind}] }` | `AudioSegment[]` (un `AudioSegment` par `AudioSource` kind `SEQUENCE`, `startMs=0`/`endMs=durationMs`) |
| `/api/audio/services/[id]/segments` | PUT | `audio:review` | `{ segments: [{order,title,startMs,endMs,kind}] }` | **P1.5** — découpage d'un `MIX` : remplace le brouillon, valide le non-chevauchement |
| `/api/audio/services/[id]/publish` | POST | `audio:review` | `{}` | `AudioService` (déclenche jobs `RENDER`, statut → READY puis PUBLISHED au dernier rendu) |
| `/api/audio/services/[id]/unpublish` | POST | `audio:manage` ou resp./ministre du département de captation | `{}` | `AudioService` |
| `/api/audio/settings` | GET/PUT | `audio:manage` | `{ captureDepartmentId, defaultCoverKey?, sequenceTemplate? }` | `AudioSettings` |
| `/api/audio/public/[token]` | GET | public | — | métadonnées culte + segments (OG tags via `generateMetadata`) |
| `/api/audio/public/[token]/stream/[segmentId]` | GET | public | Range HTTP | flux audio (302 vers URL signée ou proxy Range) |
| `/api/audio/public/[token]/play` | POST | public | `{ segmentId }` | `{}` (incrémente `playCount`, rate-limité par IP) |

Toutes les routes authentifiées utilisent `requireAudioAccess(permission, churchId)` (nouveau
helper, § Décisions). Les mutations valident avec Zod ; `/sequences` refuse en 400 si deux
séquences partagent le même `order` ou le même titre, ou si un titre est vide (§ critères
d'acceptation spec). `/segments` (P1.5) refusera en 400 les frontières qui se chevauchent.

## Services / logique métier

`src/modules/audio/services/`

- `service.ts` — création/mise à jour d'`AudioService`, résolution du `churchId` (via
  `planningEventId` si fourni, sinon église de l'utilisateur — D9).
- `upload.ts` — orchestration multipart en s'appuyant sur `@/modules/storage`
  (`createMultipartUpload`, `getSignedPartUrl`, `completeMultipartUpload`) ; enregistre une
  `AudioSource` par fichier déposé et programme son job `PROBE`.
- `sequences.ts` — crée/réordonne un `AudioSegment` par `AudioSource` kind `SEQUENCE`
  (`sourceId` renseigné, `startMs=0`, `endMs=durationMs`) ; **validation pure et testable en
  CI** : unicité de `order`, unicité et non-vacuité du titre. Pas de logique de frontières.
- `publish.ts` — transition de statut, génération des `AudioJob(type: RENDER)` (un par segment
  `SEQUENCE`), idempotent via `sourceHash` = hash de l'ETag S3 de l'`AudioSource` : republier
  sans redéposer ne re-rend rien ; redéposer un fichier de séquence corrigé change l'ETag et
  déclenche le rendu de cette seule séquence.
  *P1.5* : pour un segment né d'un découpage de `MIX` (`sourceId` null), `sourceHash` sera le
  hash de `(sourceKey du MIX, startMs, endMs)` — corriger une frontière ne re-rend que les
  segments touchés (cf. design.md D10).
- `segments.ts` — **P1.5** : validation pure des frontières (chevauchement, séquence vide,
  ordre), réutilisable telle quelle par la détection en P2 (D5).
- `tokens.ts` — génération/validation des `AudioShareToken`, réutilise le primitif
  cryptographique de `@/modules/storage` (ADR-0006).
- `access.ts` — deux vérifications distinctes, toutes deux lisant `AudioSettings.captureDepartmentId` :
  - `isCaptureTeamMember(departmentIds)` — vrai si un des départements de l'utilisateur est le
    département de captation, **quel que soit son rôle** (STAR compris) — utilisé pour
    `audio:upload`/`audio:review` (D7 : autonomie complète du dépôt à la publication).
  - `isCaptureTeamLead(session, churchId)` — vrai si l'utilisateur a un `UserChurchRole` de rôle
    `DEPARTMENT_HEAD` ou `MINISTER` **et** que le département de captation fait partie de ses
    départements (pour `MINISTER`, `getUserDepartmentScope`/le chargement de session résout déjà
    tous les départements du ministère assigné — voir `src/lib/auth.ts` autour de la ligne 177) —
    utilisé en plus de `audio:manage` pour `unpublish`, qui n'est pas ouvert au STAR simple.
  - Les deux sont utilisées par `requireAudioAccess` dans `src/lib/auth.ts`.

`src/modules/audio/worker/` (exécuté par le process `npm run worker`, hors Next.js — ADR-0007) :

- `runner.ts` — boucle `SELECT … FOR UPDATE SKIP LOCKED` sur `audio_jobs`, bail `leasedUntil`.
- `handlers/probe.ts` — lit la source depuis S3 (stream) et mesure `durationMs` + le niveau LUFS
  d'entrée (`ffprobe`). Pas de pics de forme d'onde : l'écran de nommage n'en affiche pas.
  *P1.5* : branche `MIX` qui calcule les pics (résolution fixe, ex. 1 pic / seconde) et les
  stocke en JSON léger à côté du mix.
- `handlers/render.ts` — `ffmpeg` sur un segment né d'une `AudioSource` kind `SEQUENCE` : pas de
  découpe (le fichier est déjà une séquence complète) — `loudnorm` deux passes vers −16 LUFS +
  réencodage MP3 au format cible (le fichier déposé n'est pas nécessairement déjà au bon
  format/bitrate) + tags ID3 (titre, culte, date, orateur, ordre, couverture), upload S3, écrit
  `AudioRendition`.
  *P1.5* : branche « découpe de la plage `[startMs, endMs]` du `MIX` » avant le `loudnorm`.

Pas d'émission sur `planningBus` en P1 : le lien événement ↔ audio se lit en requête directe
(`AudioService.planningEventId`), pas de réaction cross-module nécessaire pour l'instant. À
revoir si un futur module doit réagir à une publication audio (notifications, par exemple).

## UI / composants

- `src/app/(auth)/audio/` — file d'attente du département (`DataTable`), filtrable par statut ;
  compteurs d'ouverture/lecture visibles en colonne (spec §6).
- `src/app/(auth)/audio/[id]/` — écran de dépôt multi-fichiers (si DRAFT) puis écran de nommage :
  - Liste réordonnable (glisser-déposer, sur le modèle des listes existantes de
    `BulkActionBar`/`DataTable`) des fichiers déposés, un renommage par ligne, avec durée
    affichée. **Aucun composant Canvas**, aucune lecture d'aperçu nécessaire : chaque fichier
    est déjà une séquence complète.
  - Nom de fichier d'origine et taille affichés en permanence par ligne (pas seulement en
    `placeholder` du champ de saisie libre, qui disparaît dès que l'utilisateur tape) — retour
    terrain : sans ça, faire correspondre une ligne à « le bon » fichier pendant le renommage est
    difficile. Bouton de suppression par ligne (`DELETE .../sources/[sourceId]`, tant que
    DRAFT/PENDING_REVIEW) pour retirer un fichier déposé par erreur — distinct de la case
    « non diffusé », qui garde le fichier.
  - Une fois un fichier entièrement envoyé, il disparaît de la liste de progression du dépôt (il
    est désormais représenté par sa ligne dans la liste de nommage ci-dessous) — évite qu'un même
    fichier apparaisse deux fois à l'écran.
  - La liste de nommage se resynchronise sur les props `sources`/`segments` (nouvelle source
    apparue, durée renseignée après le job `PROBE`) sans perdre les titres/l'ordre déjà saisis
    par l'utilisateur pour les lignes existantes — l'état initial `useState` ne se
    réinitialisant qu'au montage, un simple `router.refresh()` (succès **et** échec d'un dépôt)
    ne suffisait pas à faire apparaître un nouveau fichier ni la durée calculée après coup.
  - Liste déroulante des noms usuels (`Select`) + saisie libre, alimentée par
    `AudioServiceTemplate.sequenceNames`.
  - `Modal` de confirmation à la publication (récap niveau sonore par segment, alerte si
    signalement).
  - **P1.5** — nouveau composant `WaveformEditor` (client) pour le découpage d'un `MIX` : rendu
    Canvas des pics `PROBE`, poignées de frontières drag + clavier, lecture de quelques secondes
    autour d'une frontière (`<audio>` + `currentTime`/`fastSeek`, pas de librairie tierce — le
    besoin est un sous-ensemble étroit de ce qu'apporterait wavesurfer.js). C'est le poste le
    plus lourd du module, d'où son report.
- `src/app/(auth)/admin/audio/settings/` — formulaire `AudioSettings` (département de
  captation, couverture par défaut, template de séquences), réutilise `Select`/`Input`/`Button`.
- `src/app/ecouter/[token]/` (hors `(auth)`, page publique) — lecteur : liste de segments,
  lecture avec Range HTTP nativement supportée par `<audio>`, bouton téléchargement,
  position de lecture persistée en `localStorage`. `generateMetadata` pour les balises Open
  Graph (D6). *Corrigé en implémentation : `/audio/[token]` initialement prévu ici entre en
  collision de route Next.js avec `src/app/(auth)/audio/[id]/` (les groupes de routes
  `(auth)` n'apparaissent pas dans l'URL, donc les deux résolvaient à `/audio/:x`) — déplacé
  vers `/ecouter/[token]` pour lever le conflit.*
- Lien croisé événement → audio : ajout d'une section dans `StarViewClient.tsx` (seul écran
  actuel de détail d'un événement pour un membre connecté) quand `AudioService.publishedAt`
  existe pour cet événement.

## Décisions & alternatives écartées

- **Choix** : nouveau helper `requireAudioAccess(permission, churchId)` dans `src/lib/auth.ts`,
  calqué sur `requireMediaUploadAccess`/`isControlTeamMember` — permission de rôle (ADMIN,
  SECRETARY pour la lecture globale) **ou** appartenance au département désigné par
  `AudioSettings.captureDepartmentId` (tout rôle, y compris STAR simple, D7). — *Pourquoi* : le
  système de permissions actuel (`rolePermissions`) est global par rôle, insuffisant seul pour
  « tout membre d'un département configurable » sans coder un rôle `AUDIO_EDITOR` (explicitement
  écarté par design.md D7).
- **Choix** : `unpublish` déroge à la règle « tout membre du département » — ouvert à
  `audio:manage` **et** aux `DEPARTMENT_HEAD`/`MINISTER` du département de captation, mais pas au
  STAR simple. — *Pourquoi* : retirer un lien déjà partagé publiquement (spec §3 cas limites) est
  un geste d'intervention plus lourd que publier ; la spec réserve explicitement cette capacité à
  Admin/Secrétaire/Super Admin pour l'intervention a posteriori, et l'utilisateur a confirmé
  vouloir l'étendre à l'encadrement du département (responsables, ministres) sans l'ouvrir à tout
  le département. C'est la seule action du module P1 qui distingue le rôle au sein du
  département — à documenter clairement dans `access.ts` pour ne pas être confondue avec le
  reste du module.
- **Choix** : upload multipart direct navigateur → S3, sans agent de dépôt (hors périmètre P1) —
  *Pourquoi* : même en séquences séparées, un culte représente plusieurs centaines de Mo au total
  (D4 : mix stéréo ≈ 200 Mo pour 2h53) et une prédication seule dépasse facilement les dizaines de
  Mo ; le multipart apporte surtout la **reprise après coupure**, exigée par la spec. Le même
  mécanisme sert tel quel au mix entier en P1.5, sans réécriture.
  *Écarté* : plafonner à `PutObjectCommand` simple comme `media/files/upload/sign` (limite
  actuelle 500 Mo) — pas de reprise en cas de coupure (critère d'acceptation spec explicite), et
  insuffisant pour le mix de P1.5.
- **Choix** : `sourceHash` par segment (pas par culte) pour l'idempotence du rendu — *Pourquoi*
  : redéposer une seule séquence corrigée ne doit re-rendre que celle-là (critère d'acceptation
  « seules les séquences concernées sont refaites ») ; même propriété en P1.5 pour la correction
  d'une frontière.
- **Choix** : P1 ne livre que le dépôt de séquences déjà mixées (`AudioSourceKind.SEQUENCE`) ;
  le mix à découper et le `WaveformEditor` passent en P1.5. — *Pourquoi* : c'est la pratique
  courante de la régie (un MP3 par séquence, mixage et découpe faits en amont), donc le chemin
  qui débloque réellement la diffusion — arrêtée depuis le 14 juin 2026. L'écran de découpage
  est à l'inverse le poste le plus coûteux du module (Canvas, poignées, écoute autour d'une
  frontière) et il ne sert que le cas minoritaire : le mettre dans P1 aurait retardé le premier
  jalon utile sans rien débloquer de plus.
  *Écarté* : livrer les deux chemins ensemble en P1 — allonge le premier jalon d'un composant
  entier pour un usage minoritaire.
  *Écarté* : forcer tout dépôt à passer par le chemin mix-à-découper (un segment = toute la
  durée) — fonctionnellement correct mais impose l'écran `WaveformEditor` sur un fichier qui n'a
  qu'une frontière triviale (0 → durée), une gêne UX injustifiée pour le cas le plus fréquent.
- **Choix** : modéliser les deux chemins dans le schéma Prisma dès P1 (`AudioSourceKind.MIX`
  présent mais non émis, `AudioSegment.sourceId` optionnel), même si seul le chemin séquences
  est câblé. — *Pourquoi* : évite une migration à P1.5 et garde le pipeline unique
  (`AudioService` → `AudioSegment` → `AudioRendition` → publication) ; le coût est nul,
  l'alternative (ajouter la colonne plus tard) impose une migration sur des données existantes.
- **Écarté** : émettre un événement sur `planningBus` à la publication — reporté faute de
  consommateur identifié en P1 ; requête directe suffit pour le lien événement ↔ audio.
- **Écarté** (P1.5, à re-trancher le moment venu) : librairie de forme d'onde tierce
  (wavesurfer.js) — le besoin (pics + poignées de frontières + écoute courte) est étroit ; une
  dépendance de plus pour un composant qu'on contrôle entièrement en Canvas natif n'apporte rien
  ici (cohérent avec « pas de sur-ingénierie », CLAUDE.md règle 6).

## Risques & points d'attention

- **Upload multipart + reprise sans agent** : la reprise après coupure réseau (critère
  d'acceptation) repose sur le navigateur qui retrouve les parts déjà envoyées au retour sur la
  page — nécessite de persister `uploadId` + `key` côté client (`localStorage`) et une route qui
  liste les parts déjà reçues côté S3. **Vérifié** : `s3.ts` actuel n'a que
  `createMultipartUpload`/`getSignedPartUrl`/`completeMultipartUpload`/`abortMultipartUpload` —
  pas de `ListPartsCommand`. À ajouter dans `modules/storage` en P0 :
  `listUploadedParts(key, uploadId)`, exposée via une route
  `/api/audio/services/[id]/upload/parts?sourceId=` pour que le client reprenne au bon
  `partNumber` sans tout renvoyer.
- **Worker et déploiement** : `ffmpeg` doit être disponible sur le serveur de production — à
  documenter dans `docs/production.md` (dépendance système, hors code applicatif).
- **Volumétrie S3** : les fichiers déposés sont conservés en base de calcul du rendu (chaque
  séquence existe donc en deux exemplaires : source déposée + rendition normalisée) ; leur
  rétention après publication n'est pas tranchée par la spec (§ Questions ouvertes) — proposer
  une purge manuelle par défaut, alignée sur `MediaSettings.retentionDays`.
- **Range HTTP sur le flux public** : si le stockage OVH S3 supporte nativement les requêtes
  Range sur URL signée (à vérifier), la route `stream` peut rediriger (302) plutôt que proxifier
  — évite de faire transiter l'audio par le serveur Next.js. À valider en `/tasks`.
- **Multi-upload sans agent** : le dépôt de x fichiers (un par séquence) répète le cycle
  `sign`/`complete` x fois côté navigateur ; la reprise après coupure doit être gérée **par
  fichier**, pas par `AudioService` — le `localStorage` côté client indexe par `sourceId`, pas
  par service, pour reprendre un dépôt partiel (3 fichiers envoyés sur 6, coupure, reprise des 3
  restants). C'est le point le plus délicat du P1 côté client.
- **Format d'entrée variable** : les fichiers déjà mixés/découpés déposés par une régie ne sont
  pas forcément uniformes (bitrate, format conteneur) — `render.ts` doit toujours réencoder en
  MP3 au format cible, jamais copier tel quel, pour garantir une lecture homogène côté lecteur
  public et l'écart de volume < 1 dB exigé par la spec.
- **Statuts prévus pour un chemin non livré** : `AudioServiceStatus.PENDING_REVIEW` est nommé
  « mix déposé, en attente de découpage » dans l'esquisse ; en P1 il porte « séquences déposées,
  en attente de nommage ». Garder un libellé neutre côté UI pour ne pas avoir à migrer l'enum en
  P1.5.

## Stratégie de tests

- **Unitaires (Vitest)** :
  - `sequences.ts` : unicité de `order`, unicité et non-vacuité du titre, réordonnancement —
    cas de la spec §2 cas limites, exhaustif car fonction pure.
  - *(P1.5)* `segments.ts` : validation pure des frontières (chevauchement, séquence vide,
    ordre, bornes) — hors périmètre des tests P1.
  - `access.ts` / `requireAudioAccess` : rôle global vs. département configuré vs. aucun accès
    vs. cross-tenant (comme `src/app/api/room-reservations/__tests__/security.test.ts`) ; cas
    spécifique `unpublish` : STAR du département de captation refusé, DEPARTMENT_HEAD/MINISTER
    du même département accepté.
  - `tokens.ts` : génération, validation, expiration/révocation, lien segment vs. culte entier.
  - `publish.ts` : idempotence du `sourceHash` — republier sans redéposer ne recrée pas de job ;
    redéposer une seule séquence ne recrée qu'un job.
- **Intégration route handlers** : dépôt multi-fichiers → probe → nommage → publish, sur le
  modèle de `src/app/api/media/files/upload/__tests__/sign.test.ts` ; inclut un cas de reprise
  (une source sur trois incomplète).
- **Worker** : `handlers/render.ts` testé avec un fixture audio court (quelques secondes) plutôt
  qu'un fichier de session réel — vérifie le réencodage, le LUFS cible et les tags ID3, sans
  dépendre de `ffmpeg` en CI si possible (mock du binaire) ou job CI dédié avec `ffmpeg` installé.
- **Multi-tenant** : test explicite qu'un utilisateur d'une autre église n'atteint aucune route
  `audio` de l'église visée (cf. règle constitution II).
