# Tâches — Publication audio des cultes (P1)

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **Conception** : `./design.md`
- **Statut** : À faire

> Périmètre : **P0** (extraction `modules/storage`) + **P1** (dépôt de séquences déjà
> mixées/découpées, nommage, publication, lecture publique). Le chemin « mix à découper »
> (`WaveformEditor`, `segments.ts`, route `/segments`) est **hors périmètre** — voir
> `plan.md` § « Ce que P1.5 ajoutera ». Ordre : migration → services → API → worker → UI → tests.
> Les tâches `[P]` touchent des fichiers indépendants et sont parallélisables entre elles.

## Prérequis

- [x] Branche `feat/audio-cultes-publication` à jour avec `main`
- [x] `ffmpeg`/`ffprobe` disponibles en local pour tester le worker (`ffmpeg -version`)

## Tâches

### 0. P0 — Extraction `modules/storage` (ADR-0006)

- [x] **T001** — Créer `src/modules/storage/` (manifeste `index.ts` sur le modèle de
      `src/modules/discipleship/index.ts`), déplacer `src/modules/media/services/s3.ts` vers
      `src/modules/storage/services/s3.ts` sans changement de logique.
      *(fichiers : `src/modules/storage/index.ts`, `src/modules/storage/services/s3.ts`)*
- [x] **T002** — Ajouter `listUploadedParts(key, uploadId)` dans
      `src/modules/storage/services/s3.ts` (`ListPartsCommand`, absent aujourd'hui — nécessaire à
      la reprise d'upload, cf. plan.md § Risques).
      *(fichier : `src/modules/storage/services/s3.ts`)*
- [x] **T003** — Faire réexporter par `src/modules/media/index.ts` les primitives S3 depuis
      `@/modules/storage`, mettre à jour les imports internes de `media` en conséquence. Aucun
      changement d'API publique du module `media`.
      *(fichier : `src/modules/media/index.ts`)*
- [x] **T004** — Lancer la suite de tests existante de `media` pour valider l'absence de
      régression après l'extraction (`npm run test -- media`).
      *(vérification, aucun fichier modifié)*
- [x] **T005** — `npm run lint:boundaries` pour confirmer que `media` → `storage` respecte les
      frontières (import via `@/modules/storage`, pas de chemin interne).
      *(vérification)*

### 1. Données & migration

- [x] **T006** — Ajouter au `prisma/schema.prisma` les enums `AudioServiceStatus`,
      `AudioSourceKind`, `AudioSegmentKind`, `AudioJobType`, `AudioJobStatus` et les modèles
      `AudioSettings`, `AudioService`, `AudioSource`, `AudioSegment`, `AudioRendition`,
      `AudioServiceTemplate`, `AudioJob`, `AudioShareToken` tels que décrits dans `plan.md` §
      Modèle de données (schéma complet P1+P1.5, `AudioSourceKind.MIX` et `AudioSegment.sourceId`
      inclus mais non utilisés en P1).
      *(fichier : `prisma/schema.prisma`)*
- [x] **T007** — Ajouter les relations inverses sur `Church` (`audioSettings`, `audioServices`,
      `audioServiceTemplates`), `Event` (`audioService`), `Department` (`audioSettings[]`).
      *(fichier : `prisma/schema.prisma`)*
- [x] **T008** — Générer la migration Prisma (`npm run db:migrate` avec un nom explicite, ex.
      `add_audio_module`), vérifier qu'elle s'applique proprement sur une base locale à jour.
      *(fichier : `prisma/migrations/…`)*

### 2. Logique métier (services)

- [x] **T009** [P] — `service.ts` : création/mise à jour d'`AudioService` (résolution du
      `churchId` via `planningEventId` si fourni, sinon église de l'utilisateur — D9), détection
      de doublon sur le même `planningEventId` (spec §1 cas limites).
      *(fichier : `src/modules/audio/services/service.ts`)*
- [x] **T010** [P] — `access.ts` : `isCaptureTeamMember(departmentIds)` et
      `isCaptureTeamLead(session, churchId)` tels que décrits dans `plan.md` § Services, en
      s'appuyant sur `getUserDepartmentScope`/`rolePermissions` (`@/lib/registry`).
      *(fichier : `src/modules/audio/services/access.ts`)*
- [x] **T011** — Dans `src/lib/auth.ts`, ajouter `requireAudioAccess(permission, churchId)` sur
      le modèle de `requireMediaUploadAccess` : permission de rôle globale **ou** appartenance au
      département `AudioSettings.captureDepartmentId` (`isCaptureTeamMember`) ; `unpublish` exige
      en plus `audio:manage` **ou** `isCaptureTeamLead`.
      *(fichier : `src/lib/auth.ts`)*
- [x] **T012** [P] — `upload.ts` : orchestration multipart via `@/modules/storage`
      (`createMultipartUpload`, `getSignedPartUrl`, `completeMultipartUpload`,
      `listUploadedParts`) ; crée une `AudioSource(kind: SEQUENCE)` par fichier et programme son
      job `PROBE`.
      *(fichier : `src/modules/audio/services/upload.ts`)*
- [x] **T013** [P] — `sequences.ts` : fonction pure de validation/transformation — unicité de
      `order`, unicité et non-vacuité du titre — et création/mise à jour des `AudioSegment` à
      partir des `AudioSource(kind: SEQUENCE)` du service (`startMs=0`, `endMs=durationMs`,
      `sourceId` renseigné, `detectedBy: "deposit"`).
      *(fichier : `src/modules/audio/services/sequences.ts`)*
- [x] **T014** — `publish.ts` : transition de statut (`READY` → `PUBLISHED` au dernier rendu),
      génération d'un `AudioJob(type: RENDER)` par segment `SEQUENCE`, `sourceHash` = hash de
      l'ETag S3 de l'`AudioSource` pour idempotence.
      *(fichier : `src/modules/audio/services/publish.ts`)*
- [x] **T015** [P] — `tokens.ts` : génération/validation/révocation des `AudioShareToken`
      (lien culte entier ou lien direct segment), réutilise le primitif cryptographique de
      `@/modules/storage`.
      *(fichier : `src/modules/audio/services/tokens.ts`)*
- [x] **T016** — `src/modules/audio/index.ts` : manifeste du module (permissions `audio:view`,
      `audio:upload`, `audio:review`, `audio:manage`), exports publics des services ci-dessus, sur
      le modèle de `src/modules/discipleship/index.ts`.
      *(fichier : `src/modules/audio/index.ts`)*

### 3. Worker (ADR-0007)

- [x] **T017** — `runner.ts` : boucle `SELECT … FOR UPDATE SKIP LOCKED` sur `audio_jobs`,
      gestion `leasedUntil`/`attempts`, dispatch vers les handlers `PROBE`/`RENDER`.
      *(fichier : `src/modules/audio/worker/runner.ts`)*
- [x] **T018** [P] — `handlers/probe.ts` : lit la source S3 en stream, mesure `durationMs` et le
      niveau LUFS d'entrée via `ffprobe`, met à jour `AudioSource.durationMs`.
      *(fichier : `src/modules/audio/worker/handlers/probe.ts`)*
- [x] **T019** [P] — `handlers/render.ts` : `ffmpeg` sur une `AudioSource(kind: SEQUENCE)` —
      `loudnorm` deux passes vers −16 LUFS, réencodage MP3 au format cible, tags ID3 (titre,
      culte, date, orateur, ordre, couverture), upload S3, écrit `AudioRendition`.
      *(fichier : `src/modules/audio/worker/handlers/render.ts`)*
- [x] **T020** — Ajouter le script `worker` dans `package.json` (process séparé, `tsx` ou
      équivalent déjà utilisé dans le repo) et documenter la dépendance système `ffmpeg`/`ffprobe`
      dans `docs/production.md`.
      *(fichiers : `package.json`, `docs/production.md`)*

### 4. API (route handlers)

- [x] **T021** [P] — `GET/POST /api/audio/services` : liste filtrée par statut (`audio:view`),
      création d'un `AudioService` en `DRAFT` (`audio:upload`).
      *(fichier : `src/app/api/audio/services/route.ts`)*
- [x] **T022** [P] — `GET/PATCH /api/audio/services/[id]` : détail avec sources/segments
      (`audio:view`), mise à jour orateur/événement/couverture (`audio:review`).
      *(fichier : `src/app/api/audio/services/[id]/route.ts`)*
- [x] **T023** — `POST /api/audio/services/[id]/upload/sign` et
      `POST /api/audio/services/[id]/upload/complete` : signature multipart et complétion, sur le
      pattern de `src/app/api/media/files/upload/sign/route.ts` (`kind: "SEQUENCE"` uniquement en
      P1 — `kind: "MIX"` rejeté en 400 avec message explicite).
      *(fichiers : `src/app/api/audio/services/[id]/upload/sign/route.ts`,
      `src/app/api/audio/services/[id]/upload/complete/route.ts`)*
- [x] **T024** — `GET /api/audio/services/[id]/upload/parts` : liste les parts déjà reçues côté
      S3 pour un `sourceId` donné (via `listUploadedParts`, T002), pour la reprise après coupure.
      *(fichier : `src/app/api/audio/services/[id]/upload/parts/route.ts`)*
- [x] **T025** — `PUT /api/audio/services/[id]/sequences` : applique `sequences.ts` (T013),
      renvoie 400 en cas de doublon d'`order` ou de titre, ou de titre vide.
      *(fichier : `src/app/api/audio/services/[id]/sequences/route.ts`)*
- [x] **T026** — `POST /api/audio/services/[id]/publish` et
      `POST /api/audio/services/[id]/unpublish` : appellent `publish.ts` (T014) ;
      `unpublish` protégé par `requireAudioAccess` avec le cas `audio:manage` ou
      `isCaptureTeamLead` (T011) ; les deux tracés via `logAudit`.
      *(fichiers : `src/app/api/audio/services/[id]/publish/route.ts`,
      `src/app/api/audio/services/[id]/unpublish/route.ts`)*
- [x] **T027** [P] — `GET/PUT /api/audio/settings` : configuration `AudioSettings`
      (`audio:manage`) — département de captation, couverture par défaut, template de séquences.
      *(fichier : `src/app/api/audio/settings/route.ts`)*
- [x] **T028** [P] — `GET /api/audio/public/[token]` : métadonnées culte + segments publiés, pas
      d'authentification requise. Si le culte est `UNPUBLISHED` ou le token révoqué, renvoie une
      réponse dédiée (pas un 404 générique) que la page publique (T036) affiche comme un message
      compréhensible plutôt qu'une erreur brute (critère d'acceptation « dépublier… message
      compréhensible »).
      *(fichier : `src/app/api/audio/public/[token]/route.ts`)*
- [x] **T029** [P] — `GET /api/audio/public/[token]/stream/[segmentId]` : sert le flux audio
      d'une `AudioRendition` (302 vers URL signée S3 si Range HTTP supporté nativement, sinon
      proxy Range) — vérifier le support Range d'OVH S3 avant d'implémenter (plan.md § Risques).
      *(fichier : `src/app/api/audio/public/[token]/stream/[segmentId]/route.ts`)*
- [x] **T030** [P] — `POST /api/audio/public/[token]/play` : incrémente `playCount`, rate-limité
      par IP (`requireRateLimit`).
      *(fichier : `src/app/api/audio/public/[token]/play/route.ts`)*

### 5. UI / composants

- [x] **T031** — `src/app/(auth)/audio/page.tsx` : file d'attente du département (`DataTable`),
      filtrable par statut, compteurs d'ouverture/lecture en colonne.
      *(fichier : `src/app/(auth)/audio/page.tsx`)*
- [x] **T032** — `src/app/(auth)/audio/[id]/page.tsx` : écran de dépôt multi-fichiers (état
      DRAFT) — sélection de plusieurs fichiers, upload multipart avec reprise par fichier
      (`localStorage` indexé par `sourceId`, cf. plan.md § Risques), progression fichier par
      fichier.
      *(fichier : `src/app/(auth)/audio/[id]/page.tsx`)*
- [x] **T033** — Composant client de nommage/réordonnancement : liste glisser-déposer des
      fichiers déposés avec durée, renommage par ligne (`Select` de noms usuels +
      saisie libre depuis `AudioServiceTemplate.sequenceNames`), marquage « non diffusé ».
      *(fichier : `src/app/(auth)/audio/[id]/SequenceListEditor.tsx`)*
      *Complété après retour terrain : nom de fichier d'origine + taille affichés en
      permanence par ligne (perdus auparavant dès la saisie du titre), suppression d'une
      séquence déposée par erreur (`DELETE /api/audio/services/[id]/sources/[sourceId]`,
      nouveau — `src/modules/audio/services/upload.ts` `deleteAudioSource`), et disparition
      d'un fichier de la liste de progression du dépôt une fois terminé (il n'apparaissait
      plus qu'une fois, dans la liste de nommage, au lieu de compter double à l'écran).*

      *Deux correctifs supplémentaires (retour terrain, nom affiché erroné + doublons réels) :*
      - *Le nom affiché était dérivé de `s3Key` (nommé par `sourceId`, ex. `ckx…9.mp3`), pas le
        nom du fichier déposé — nouveau champ `AudioSource.originalFilename` (migration
        `20260826163521_audio_source_original_filename`), renseigné dans `signSequenceUpload`
        depuis `input.filename`, avec repli sur l'ancien dérivé de `s3Key` pour les lignes
        antérieures à la migration.*
      - *Les 12 fichiers pour 6 déposés (doublons réels signalés) s'expliquent par le bug
        BigInt corrigé précédemment : `signSequenceUpload` créait déjà l'`AudioSource` et
        initiait le multipart S3 avant que la réponse échoue à se sérialiser — l'utilisateur
        voyait une erreur et redéposait, laissant l'ancienne source orpheline en base (jamais
        nettoyée, aucune suppression n'existait alors). `signSequenceUpload` supprime
        maintenant la source créée en best-effort si une étape suivante échoue, pour qu'aucun
        échec ne laisse d'orpheline à l'avenir ; les doublons déjà en base se nettoient avec le
        nouveau bouton de suppression.*

      *Troisième correctif (retour terrain) : l'écran ne se rafraîchissait pas après un dépôt,
      surtout en cas d'erreur.*
      - *`AudioServiceClient` n'appelait `router.refresh()` qu'en cas de succès — ajouté aussi
        dans le `catch` : même en échec, l'état serveur a pu changer (source créée avant
        l'échec d'une étape suivante, dépôt passé en `PENDING_REVIEW`…) et l'écran doit le
        refléter.*
      - *Root cause plus profonde : `SequenceListEditor` initialisait sa liste de lignes via
        `useState(() => …)`, qui ne se réexécute qu'au montage — un `router.refresh()` renvoie
        de nouvelles props `sources`/`segments`, mais elles n'étaient jamais reprises. Ajout
        d'un effet de resynchronisation qui ajoute les sources nouvellement apparues et met à
        jour leur durée (renseignée après coup par le job `PROBE`), sans toucher au titre ni à
        l'ordre déjà saisis par l'utilisateur pour les lignes existantes.*

      *Quatrième correctif (retour terrain) : cliquer « Publier » ne semblait rien faire — pas
      de requête, aucun log serveur. Le bouton est désactivé tant qu'aucune séquence n'est
      enregistrée (`service.segments.length === 0`, alimenté uniquement par le bouton
      « Enregistrer l'ordre et les noms » de `SequenceListEditor`, une action distincte du
      dépôt) sans qu'aucun message ne l'indique — un utilisateur ayant nommé les fichiers sans
      cliquer « Enregistrer » voit un bouton « Publier » qui ne réagit à rien au clic. Ajout
      d'un message visible sous le bouton quand il est désactivé, et d'un `title` (infobulle)
      sur le bouton lui-même, expliquant qu'il faut d'abord cliquer « Enregistrer l'ordre et
      les noms ».*

      *Cinquième correctif (retour terrain) : après un premier clic sur « Publier » réussi, le
      culte passe en `READY` (jobs `RENDER` créés, cf. `publishAudioService` — passage direct à
      `PUBLISHED` seulement si tous les segments avaient déjà un rendu à jour) et le worker
      (hors Next.js, ADR-0007) traite les jobs de façon asynchrone. Rien à l'écran ne
      distinguait cet état : la section « Nommer et ordonner » restait affichée sans condition
      de statut et le bouton « Publier » restait actif, donnant l'impression de « retomber sur
      la page de dépôt/renommage sans aucune information d'avancement » en reclique. Ajout
      d'un bandeau « Rendu en cours : X/Y séquences prêtes » visible tant que `status ===
      "READY"`, d'un polling (`router.refresh()` toutes les 5 s) qui s'arrête dès la sortie de
      cet état, et désactivation du bouton « Publier » (avec `title` explicite) pendant le
      rendu pour éviter de requeue inutilement les mêmes jobs.*
- [x] **T034** — `Modal` de confirmation à la publication : récapitulatif du niveau sonore par
      segment, alerte si signalement (crête > −1 dB ou écart > 1 dB).
      *(fichier : `src/app/(auth)/audio/[id]/PublishModal.tsx`)*
- [x] **T035** [P] — `src/app/(auth)/admin/audio/settings/page.tsx` : formulaire `AudioSettings`
      (département de captation, couverture par défaut, template de séquences), réutilise
      `Select`/`Input`/`Button`.
      *(fichier : `src/app/(auth)/admin/audio/settings/page.tsx`)*
- [x] **T036** [P] — `src/app/ecouter/[token]/page.tsx` (page publique, hors `(auth)`) : lecteur —
      liste de segments, lecture Range HTTP native (`<audio>`), bouton téléchargement, position de
      lecture persistée en `localStorage` par `segmentId`, `generateMetadata` pour les balises
      Open Graph (titre, date, orateur, image). *Corrigé en implémentation : `src/app/audio/[token]/`
      initialement prévu entrait en collision de route Next.js avec
      `src/app/(auth)/audio/[id]/` (les groupes de routes `(auth)` n'apparaissent pas dans
      l'URL, donc les deux résolvaient à `/audio/:x`) — déplacé vers `/ecouter/[token]`.*
      *(fichier : `src/app/ecouter/[token]/page.tsx`)*
- [x] **T037** — Lien croisé événement → audio : section dans `StarViewClient.tsx` affichée
      quand `AudioService.publishedAt` existe pour l'événement, lien vers `/ecouter/[token]` ; lien
      retour événement depuis la page publique uniquement pour un membre connecté.
      *(fichier : composant `StarViewClient.tsx`)*

### 6. Tests (Vitest)

- [x] **T038** [P] — `sequences.ts` : unicité de `order`, unicité et non-vacuité du titre,
      réordonnancement, ajout d'un fichier après coup (spec §2 cas limites).
      *(fichier : `src/modules/audio/services/__tests__/sequences.test.ts`)*
- [x] **T039** [P] — `access.ts`/`requireAudioAccess` : rôle global vs. département configuré vs.
      aucun accès vs. cross-tenant ; cas `unpublish` — STAR du département refusé,
      DEPARTMENT_HEAD/MINISTER du même département accepté (sur le modèle de
      `src/app/api/room-reservations/__tests__/security.test.ts`).
      *(fichier : `src/modules/audio/services/__tests__/access.test.ts`)*
- [x] **T040** [P] — `tokens.ts` : génération, validation, révocation, lien segment vs. culte
      entier. *(`AudioShareToken` n'a pas de champ d'expiration — seule la révocation existe ;
      testé en conséquence.)*
      *(fichier : `src/modules/audio/services/__tests__/tokens.test.ts`)*
- [x] **T041** [P] — `publish.ts` : idempotence du `sourceHash` — republier sans redéposer ne
      recrée pas de job ; redéposer une seule séquence ne recrée qu'un job pour cette séquence.
      *(fichier : `src/modules/audio/services/__tests__/publish.test.ts`)*
- [x] **T042** — Intégration route handlers : dépôt multi-fichiers → probe → nommage → publish,
      y compris un cas de reprise (une source sur trois incomplète), sur le modèle de
      `src/app/api/media/files/upload/__tests__/sign.test.ts`.
      *(fichier : `src/app/api/audio/services/__tests__/upload-flow.test.ts`)*
- [x] **T043** — Worker `handlers/render.ts` : fixture audio de 2 secondes générée à la volée
      (`ffmpeg -f lavfi`) — vérifie réencodage MP3, LUFS cible (−16), tags ID3, avec un vrai
      `ffmpeg` (disponible dans cet environnement), pas de mock du binaire. *A révélé un bug
      réel : `measureLoudness` ne capturait le stderr de `ffmpeg` que dans le bloc `catch`, alors
      que `ffmpeg -f null` sort en code 0 sur cette version — la mesure loudnorm était donc
      systématiquement perdue et tout rendu aurait échoué. Corrigé dans
      `src/modules/audio/worker/handlers/render.ts`.*
      *(fichier : `src/modules/audio/worker/handlers/__tests__/render.test.ts`)*
- [x] **T044** — Multi-tenant : un utilisateur d'une autre église n'atteint aucune route `audio`
      de l'église visée (cf. constitution règle II).
      *(fichier : `src/app/api/audio/services/__tests__/multi-tenant.test.ts`)*
- [x] **T045** — Traçabilité et dépublication : chaque publication/dépublication est journalisée
      via `logAudit` (qui, quand, quoi) ; après `unpublish`, `GET /api/audio/public/[token]`
      renvoie la réponse dédiée « inopérant » de T028 plutôt que les métadonnées du culte.
      *(fichier : `src/app/api/audio/services/[id]/__tests__/publish-unpublish.test.ts`)*

*Sixième correctif (retour terrain, qualif) : trois séquences sur six restaient bloquées sur
« rendu en cours » indéfiniment. Le journal du worker montrait `The specified key does not
exist` — l'objet S3 attendu par le job `RENDER` n'existait pas. Root cause : le multipart de
ces sources n'avait jamais abouti (`uploadStatus` resté à `PENDING`), sans qu'aucun garde-fou
n'existe au nommage ni à la publication pour l'empêcher — `applySequences` et
`publishAudioService` ne vérifiaient pas `uploadStatus`. Pire : le culte, passé en `READY`, se
retrouvait sans issue par l'interface — ni correction (`DRAFT`/`PENDING_REVIEW` requis), ni
suppression (idem), ni dépublication (`PUBLISHED` requis) n'étaient possibles.*

*Trois volets :*
- *`publishAudioService` refuse désormais de publier si une source a `uploadStatus !== "DONE"`,
  en listant les séquences concernées, sans créer aucun job.*
- *Notion centralisée `EDITABLE_SERVICE_STATUSES` (`DRAFT`, `PENDING_REVIEW`, `READY`,
  `UNPUBLISHED` — tout sauf `PUBLISHED`) et `assertServiceEditable()`, appliquées à
  `signSequenceUpload`, `deleteAudioSource` et `applySequences` : la régie peut corriger un
  dépôt tant que le culte n'est pas publié, y compris depuis `READY` après un rendu en échec.
  `deleteAudioSource` purge aussi les jobs `RENDER` `PENDING`/`FAILED` du segment supprimé, pour
  qu'ils ne continuent pas d'échouer en boucle.*
- *Écran : un job `RENDER` en `FAILED` est remonté dans `page.tsx` et affiché en bandeau rouge
  (au lieu de laisser le polling « rendu en cours » tourner indéfiniment), avec le titre de la
  séquence concernée et une explication actionnable. `SequenceListEditor` signale la séquence
  au dépôt incomplet directement dans sa légende (« dépôt non terminé — à supprimer et
  redéposer »). `canDeposit` suit désormais `EDITABLE_SERVICE_STATUSES` au lieu de se limiter à
  `DRAFT`/`PENDING_REVIEW`.*

*Septième correctif (retour terrain immédiat) : après suppression d'une source en échec puis
redépôt, le bouton « Publier » restait bloqué sur « rendu déjà en cours » — impossible de
republier. Cause : le sixième correctif gate le bouton sur `service.status === "READY"`, en
assimilant ce statut à « un rendu tourne réellement ». Or supprimer la source en échec purge
aussi ses jobs `RENDER`, et le redépôt ne crée aucun nouveau job tant que « Publier » n'a pas
été recliqué — le statut reste `READY` sans qu'aucun job ne soit `PENDING`/`RUNNING`. Le signal
utilisé est maintenant le compte réel de jobs `RENDER` `PENDING`/`RUNNING` (`page.tsx` les
charge à côté des `FAILED`, exposés en `pendingRenderCount`), pas le statut brut du culte.*

*(fichiers : `src/modules/audio/services/{publish,service,upload,sequences}.ts`,
`src/modules/audio/index.ts`,
`src/app/(auth)/audio/[id]/{page.tsx,AudioServiceClient.tsx,SequenceListEditor.tsx}`)*

*Huitième correctif (retour terrain) : deux manques signalés — « possible de rajouter la
suppression d'un dépôt non terminé ? » et « je ne vois pas d'options pour préciser l'orateur,
la date de l'évènement ou en lier un existant et le titre du message ». Le second est un écart
direct avec le scénario principal de spec.md §1 (« il rattache le dépôt à un culte précis — la
liste des événements de la journée lui est proposée […] et renseigne l'orateur ») : ce
formulaire n'avait jamais été construit — « Déposer un culte » créait un `DRAFT` avec seulement
`serviceDate: now`, malgré `createAudioService`/`updateAudioService` supportant déjà
`planningEventId`/`title`/`speaker` côté service.*

*Quatre volets :*
- *Nouvel endpoint `GET /api/audio/services/events?date=` (gated `audio:upload`, donc
  accessible à l'équipe de captation via `isCaptureTeamMember`, pas seulement aux rôles avec
  `events:view`) : événements de l'église ce jour-là, avec `hasAudioService` pour prévenir un
  doublon avant la tentative de création.*
- *`AudioQueueClient` : « Déposer un culte » ouvre une modale (date, événement du jour ou saisie
  libre, titre, orateur) au lieu de créer un brouillon vide.*
- *`ServiceInfoEditor` (nouveau, affiché en tête de `/audio/[id]`) : édite après coup titre,
  orateur, date et rattachement — `updateAudioService`/`PATCH` ne persistaient jusqu'ici que
  orateur/rattachement/couverture ; titre et date ont été ajoutés à `UpdateAudioServiceInput`
  et au schéma de la route. Le rattachement reste possible même après publication (spec §1 cas
  limites), sans redéposer ni republier.*
- *Suppression d'un dépôt non terminé : elle existait déjà via le ✕ de `SequenceListEditor`
  (toute source, y compris incomplète, y est listée), mais le bandeau « upload interrompu » de
  `AudioServiceClient` n'offrait qu'« Ignorer », qui n'oubliait que le suivi localStorage sans
  toucher à la source en base — perçu comme une absence d'option. Le bouton (renommé
  « Supprimer ce dépôt ») appelle maintenant `DELETE .../sources/[sourceId]`.*

*(fichiers : `src/app/api/audio/services/events/route.ts` (nouveau),
`src/app/api/audio/services/[id]/route.ts`, `src/modules/audio/services/service.ts`,
`src/app/(auth)/audio/AudioQueueClient.tsx`,
`src/app/(auth)/audio/[id]/{page.tsx,AudioServiceClient.tsx,ServiceInfoEditor.tsx}` (nouveau),
tests : `src/modules/audio/services/__tests__/service.test.ts` (nouveau))*

*Neuvième correctif (retour terrain) : « il manque une option pour supprimer un culte
lorsque celui-ci n'est pas publié » et « j'ai toujours le souci de reprise du rendu audio sur
un culte pour lequel j'ai remplacé une séquence — le bouton publier reste grisé ».*

*Volet 1 — suppression d'un culte non publié :*
- *`deleteAudioService` (nouveau, `service.ts`) : supprime en transaction
  `audioShareToken`/`audioRendition`/`audioJob`/`audioSegment`/`audioSource` puis
  `audioService`, refuse si `status === PUBLISHED` (dépublier d'abord), et nettoie S3
  best-effort (sources + rendus) après le commit — même logique non bloquante que
  `deleteAudioSource`.*
- *`DELETE /api/audio/services/[id]`, gated `requireAudioUnpublishAccess` (même niveau que la
  dépublication — supprimer est au moins aussi engageant).*
- *Bouton « Supprimer ce culte » sur `/audio/[id]` (visible tant que non publié) avec une
  modale de confirmation dédiée listant ce qui sera perdu. La dépublication avait déjà sa
  modale de confirmation (`PublishModal`) — non modifiée.*

*Volet 2 — le rendu ne repart pas après remplacement d'une séquence : en auditant
`deleteAudioSource` pour comprendre une régression persistante malgré le septième correctif,
la purge des jobs `RENDER` `PENDING`/`FAILED` s'est révélée scopée à `serviceId` seul, pas au
segment supprimé — supprimer une séquence en échec purgeait silencieusement le job `RENDER`
`PENDING` d'une AUTRE séquence du même culte en cours de rendu légitime, sans qu'aucun nouveau
job ne soit recréé avant le prochain clic sur « Publier ». Corrigé : les jobs candidats sont
maintenant filtrés par `segmentId` (lu dans leur `payload` JSON) avant suppression. Non
confirmé comme la cause unique du blocage rapporté — à surveiller si le souci persiste après ce
correctif (vérifier alors si `koinonia-audio-worker` tourne réellement sur l'hôte : un job
`PENDING` jamais consommé produirait exactement le même symptôme).*

*(fichiers : `src/modules/audio/services/service.ts`, `src/modules/audio/services/upload.ts`,
`src/modules/audio/index.ts`, `src/app/api/audio/services/[id]/route.ts`,
`src/app/(auth)/audio/[id]/AudioServiceClient.tsx`,
tests : `src/modules/audio/services/__tests__/{service,upload}.test.ts`)*

*Dixième correctif (retour terrain — cause racine du blocage) : « reste toujours bloqué / Rendu
en cours : 5/6 séquences prêtes / le service est UP ». Les septième et neuvième correctifs
traitaient des symptômes ; la cause était dans le worker. `leaseNextJob` ne sélectionnait que
`status = 'PENDING'` : un job laissé en `RUNNING` par un worker tué en plein rendu — ce qui
arrive **à chaque redéploiement**, et que les logs fournis montrent (`Stopped` → `Started` à
20:23:00) — n'était jamais repris, quel que soit son `leasedUntil`. D'où un worker vivant et
oisif, un job éternellement `RUNNING`, `pendingRenderCount > 0`, et le bouton « Publier »
grisé pour toujours. C'est exactement la propriété que l'ADR-0007 promettait sans la tenir
(voir son amendement du 2026-08-26).*

*Trois changements dans `worker/runner.ts` :*
- *`leaseNextJob` reprend les jobs `RUNNING` au bail expiré, pas seulement les `PENDING`.*
- *Bail ramené de 30 min à 5 min, renouvelé chaque minute pendant le traitement (heartbeat via
  `updateMany` filtré sur `RUNNING`, pour ne jamais reposer un bail sur un job déjà terminal).
  Un bail expiré signifie désormais « worker mort », plus « rendu long » — c'est ce qui rend la
  reprise sûre si plusieurs instances tournent.*
- *`SIGTERM`/`SIGINT` remettent le job courant en `PENDING` (`attempts` décrémenté), pour que
  le redéploiement reprenne aussitôt au lieu d'attendre l'expiration du bail.*

*Le culte actuellement bloqué se débloque de lui-même au déploiement : son `leasedUntil` est
largement dépassé, la nouvelle requête le reprendra au premier tour de boucle.*

*Non couvert par un test : `runner.ts` lance sa boucle à l'import et repose sur
`FOR UPDATE SKIP LOCKED`, sa vérification demande une vraie MariaDB et non le mock Prisma —
limite documentée dans l'amendement de l'ADR-0007 plutôt que masquée par un test en trompe-l'œil.*

*(fichiers : `src/modules/audio/worker/runner.ts`, `docs/adr/0007-worker-hors-nextjs-table-jobs.md`)*

*Onzième correctif (retour terrain : « il faut aussi des logs côté worker je pense »). Constat
juste et directement lié au dixième : le worker ne journalisait **rien** sur le chemin nominal
— un job réussi ne produisait aucune ligne. « Worker actif, aucun log » était donc
indiscernable de « worker bloqué », ce qui a masqué le job figé en `RUNNING` pendant plusieurs
correctifs successifs.*

- *`worker/log.ts` (nouveau) : préfixe commun, durées (`since`) et tailles (`formatBytes`)
  lisibles. Pas de bibliothèque de log — journald horodate et filtre déjà.*
- *`runner.ts` : prise de job (avec numéro de tentative), reprise après expiration du bail
  signalée en erreur (c'est le symptôme d'un worker mort), fin de job avec durée, échec
  distinguant « sera réessayé » de « DÉFINITIF », preuve de vie par minute sur les rendus
  longs, paramètres de configuration au démarrage (pour vérifier quelle version tourne).*
- *`handlers/render.ts` : chaque étape chronométrée séparément (téléchargement S3, mesure
  `loudnorm`, encodage, envoi) — quand un rendu « n'avance pas », la question utile est
  laquelle des quatre est lente.*
- *`handlers/probe.ts` : nombre de sources à mesurer, durée mesurée par source, et mention
  explicite du cas « aucune source à mesurer » (auparavant un `return` muet).*
- *`maybeCompletePublication` renvoie désormais `{ published, remaining }` au lieu de `void`,
  pour que le worker journalise « passé à PUBLISHED » ou « N séquences encore à rendre ». La
  fonction reste muette elle-même : elle s'exécute aussi dans le process Next.js.*
- *`docs/production.md` : trace type d'un culte publié, tableau des lignes à surveiller, et
  précision que le silence signifie « aucun job en attente » (le sondage n'est pas journalisé).*

*Le format de sortie a été vérifié sur le test T043, qui exécute un vrai ffmpeg.*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` (705/705)
- [x] Tous les critères d'acceptation P1 de `spec.md` satisfaits (le bloc « Critères propres à
      P1.5 » reste non satisfait, c'est attendu)
- [ ] PR ouverte vers `main`
