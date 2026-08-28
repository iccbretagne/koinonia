# Tâches — Bibliothèque d'écoute des cultes

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**, suivant les dépendances naturelles :
> migration → services → API → UI → tests → documentation. Les tâches `[P]` touchent des
> fichiers indépendants et sont parallélisables entre elles.

## Prérequis

- [x] **P1** — Branche `feat/audio-bibliotheque-ecoute` créée depuis `main` à jour (les specs 019
      et 020 y sont mergées, commit `8fe3bb7`). PR finale vers `main`.
- [x] **P2** — `npm install react-h5-audio-player` puis **vérifier avant d'aller plus loin** que
      la version installée déclare React 19 en peer dependency et que le build passe
      (`plan.md` § Risques). Si ce n'est pas le cas, basculer sur un `<audio>` piloté à la main :
      la substitution reste confinée à `AudioPlayer.tsx`. *(fichier : `package.json`)*
      → 3.10.2 installée, peer `react ^19.0.0` confirmé, `npm run typecheck` OK.

## Tâches

### 1. Données & migration

- [x] **T001** — Retirer `captureDepartmentId` et la relation `captureDepartment` du modèle
      `AudioSettings`. *(fichier : `prisma/schema.prisma`)*
- [x] **T002** — Générer la migration (`npm run db:migrate`, nom explicite ex.
      `move_capture_department_to_function`). Elle doit contenir **dans cet ordre** : (1) le
      `UPDATE departments d JOIN audio_settings s ON s.captureDepartmentId = d.id SET
      d.function = 'CAPTATION_AUDIO'`, (2) la suppression de la contrainte de clé étrangère, (3)
      la suppression de la colonne. Vérifier sur une base locale contenant une configuration
      existante que le département est bien reporté. *(fichier : `prisma/migrations/…`)*
      → testée avec une ligne insérée manuellement : le département a bien reçu
      `function = 'CAPTATION_AUDIO'` avant suppression de la colonne, puis nettoyée.

### 2. Logique métier (services)

- [x] **T003** — `getCaptureDepartmentId(churchId)` lit désormais
      `department.findFirst({ where: { function: "CAPTATION_AUDIO", ministry: { churchId } } })`.
      `isCaptureTeamMember` et `isCaptureTeamLead` restent inchangés.
      *(fichier : `src/modules/audio/services/access.ts`)*
- [x] **T004** — Créer `rendition-cache.ts` : `getCachedRenditionPath(s3Key)` (téléchargement
      depuis S3 au premier accès, écriture `<clé>.part` puis `rename` atomique), dédoublonnage
      des accès concurrents par `Map<string, Promise<string>>`, clé `sha1(s3Key)`,
      rafraîchissement du `mtime` à chaque accès autorisé, éviction LRU au-delà de
      `AUDIO_CACHE_MAX_BYTES`, repli sur le flux S3 direct si le disque est indisponible.
      Configuration : `AUDIO_CACHE_DIR`, `AUDIO_CACHE_MAX_BYTES`.
      *(fichier : `src/modules/audio/services/rendition-cache.ts`)*
- [x] **T005** — Créer `stream.ts` : `buildRenditionResponse(s3Key, rangeHeader)` — streaming
      Node par `createReadStream` + `Readable.toWeb` (`200` / `206` + `Content-Range` +
      `Accept-Ranges` / `416`), en-têtes `Cache-Control: private, max-age=31536000, immutable`.
      Inclure le point de sortie `AUDIO_XACCEL_LOCATION` (corps vide + `X-Accel-Redirect`),
      **absent par défaut**. *(fichier : `src/modules/audio/services/stream.ts`)*
- [x] **T006** — Pré-chauffer le cache depuis le worker : écrire la rendition dans
      `AUDIO_CACHE_DIR` au moment où elle est produite, avant l'envoi S3 (le fichier est déjà sur
      le disque du worker). *(fichier : `src/modules/audio/worker/handlers/render.ts`)*
- [x] **T007** [P] — Créer `library.ts` : `listPublishedServices({ churchId, q, speaker, type,
      from, to, sort })` avec `status: "PUBLISHED"` **toujours forcé** ; `listSpeakers(churchId)` ;
      `getPublishedServiceForMember(serviceId, churchId)`. Extraire le mapping des segments et la
      résolution de la couverture dans un helper partagé avec `resolvePublicAudioService` pour
      que les deux vues ne puissent pas diverger.
      *(fichiers : `src/modules/audio/services/library.ts`, `services/public.ts`)*
- [x] **T008** [P] — Ajouter `getOrCreateSegmentShareToken(serviceId, segmentId, churchId)`,
      symétrique de `getOrCreatePrimaryShareToken` (réutilise un token non révoqué avant d'en
      créer un). *(fichier : `src/modules/audio/services/tokens.ts`)*
- [x] **T009** — Déclarer la permission `audio:listen` (les 10 rôles), faire pointer l'entrée de
      navigation du manifeste sur `/audio` avec `permission: "audio:listen"`, et exporter les
      nouveaux services. *(fichier : `src/modules/audio/index.ts`)*

### 3. API (route handlers)

- [x] **T010** — `GET /api/audio/services/[id]/stream/[segmentId]` : `requireAuth` +
      `getCurrentChurchId` + `requirePermission("audio:listen", churchId)`, `churchId` du culte
      comparé (**404** si autre église), `status !== "PUBLISHED"` → **410**, puis
      `buildRenditionResponse`. *(fichier : `src/app/api/audio/services/[id]/stream/[segmentId]/route.ts`)*
- [x] **T011** [P] — `POST /api/audio/services/[id]/play` : Zod `{ segmentId }`, mêmes gardes,
      incrémente `AudioSegment.playCount` (**pas** `openCount`).
      *(fichier : `src/app/api/audio/services/[id]/play/route.ts`)*
- [x] **T012** [P] — `POST /api/audio/services/[id]/share` : Zod `{ segmentId? }`, mêmes gardes,
      renvoie `{ url }` via `getOrCreatePrimaryShareToken` / `getOrCreateSegmentShareToken`.
      *(fichier : `src/app/api/audio/services/[id]/share/route.ts`)*
- [x] **T013** — Réécrire la route publique de streaming : remplacer la redirection 302 par
      `buildRenditionResponse`, en conservant à l'identique les cas `404` (token inconnu/révoqué),
      `403` (segment hors périmètre du lien) et `410` (culte dépublié).
      *(fichier : `src/app/api/audio/public/[token]/stream/[segmentId]/route.ts`)*
- [x] **T014** [P] — Retirer `captureDepartmentId` du schéma Zod et de la réponse des paramètres
      audio. *(fichier : `src/app/api/audio/settings/route.ts`)*
- [x] **T015** [P] — **Vérifier** que l'assignation de fonction accepte `"CAPTATION_AUDIO"` sans
      modification : le `PATCH` valide `function: z.string().nullable()` et libère déjà le
      département portant la même fonction dans l'église. Aucun changement attendu — la tâche
      consiste à le confirmer et, le cas échéant, à ne rien toucher.
      *(fichier : `src/app/api/departments/[departmentId]/route.ts`)*
- [x] **T016** [P] — `audioLink` pointe vers `/audio/ecouter/[serviceId]` au lieu de fabriquer un
      token de partage à chaque consultation d'événement.
      *(fichier : `src/app/api/events/[eventId]/star-view/route.ts`)*

### 4. UI

- [x] **T017** — Créer `AudioPlayer.tsx` à partir de `AudioPlayerClient.tsx` : socle
      `react-h5-audio-player` thémé aux tokens ICC par variables CSS, props `service`,
      `streamUrl(segmentId)`, `onPlay`, `onShare`, `backHref` ; mise en page en-tête / chapitres /
      barre persistante (collée en bas sur mobile) ; enchaînement automatique à la fin d'une
      séquence ; états de chargement (squelette sans saut de mise en page) et d'erreur réseau
      (*Réessayer* à la position courante). *(fichier : `src/components/audio/AudioPlayer.tsx`)*
- [x] **T018** — Ajouter au lecteur le **menu de vitesse** (0,75× → 2× via `playbackRate`, en
      `customControlsSection`) et la **Media Session API** (titre, orateur, pochette, play/pause,
      piste précédente/suivante, recul/avance) branchée sur l'élément `<audio>` exposé.
      *(fichier : `src/components/audio/AudioPlayer.tsx`)*
- [x] **T019** — Reprise d'écoute : store `audio-progress:v1` en `localStorage`
      (`segmentId → { position, duration, updatedAt }`), écriture throttlée à 5 s, tout accès en
      `try/catch` ; bandeau « Reprendre à 12:34 » / « Depuis le début » — **jamais de seek
      automatique** ; suppression de l'entrée quand la séquence est lue à moins de 15 s de sa fin.
      *(fichiers : `src/components/audio/AudioPlayer.tsx`, `src/lib/audio-progress.ts`)*
- [x] **T020** — Créer `src/app/(auth)/audio/layout.tsx` : calcul des droits une fois, onglets
      **(re)Écouter** / **Production** / **Paramètres** — seuls les onglets accessibles sont
      rendus, et `/audio/page.tsx` redirige vers le premier d'entre eux.
      *(fichiers : `src/app/(auth)/audio/layout.tsx`, `src/app/(auth)/audio/page.tsx`)*
- [x] **T021** — Déplacer la file d'attente et l'écran de dépôt vers `/audio/production` et
      `/audio/production/[id]` (garde `requireAudioAccess` inchangée), et mettre à jour les liens
      internes. *(fichiers : `src/app/(auth)/audio/production/**`)*
- [x] **T022** — Déplacer les paramètres audio vers `/audio/parametres` en retirant le sélecteur
      de département (remplacé par un lien vers les fonctions départementales), puis **supprimer
      `src/app/(auth)/admin/audio/`** et son entrée dans la liste des liens d'administration —
      aucune redirection, la page n'a jamais été mise en production.
      *(fichiers : `src/app/(auth)/audio/parametres/**`, `src/app/(auth)/layout.tsx`)*
- [x] **T023** — Onglet **(re)Écouter** : Server Component `/audio/ecouter` — `requireAuth` +
      `requirePermission("audio:listen")`, `searchParams` validés en Zod `safeParse` (une URL
      bricolée retombe sur la liste complète), liste en cartes (date, titre, orateur, badge type,
      durée totale, nombre de séquences), **deux vides distincts** : bibliothèque vide vs aucun
      résultat + bouton *Voir tous les enregistrements*.
      *(fichier : `src/app/(auth)/audio/ecouter/page.tsx`)*
- [x] **T024** [P] — `LibraryFiltersClient.tsx` : recherche libre débouncée (300 ms), `Select`
      orateur / type (`EVENT_TYPE_OPTIONS`) / tri, deux dates ; état poussé dans l'URL via
      `router.replace` ; sur mobile, filtres repliés derrière un bouton *Filtrer* portant le
      nombre de critères actifs. *(fichier : `src/app/(auth)/audio/ecouter/LibraryFiltersClient.tsx`)*
- [x] **T025** — Bandeau « Reprendre l'écoute » en tête de la bibliothèque, filtré sur les cultes
      effectivement présents dans la liste (jamais de reprise vers un culte dépublié).
      *(fichier : `src/app/(auth)/audio/ecouter/ResumeBanner.tsx`)*
- [x] **T026** — Fiche d'écoute `/audio/ecouter/[id]` : `getPublishedServiceForMember` puis
      `<AudioPlayer>` ; *Partager* sur le culte entier et par séquence (`navigator.share` si
      disponible, copie du lien sinon, avec confirmation visible).
      *(fichier : `src/app/(auth)/audio/ecouter/[id]/page.tsx`)*
- [x] **T027** — Faire consommer le lecteur factorisé par la page publique et supprimer
      `AudioPlayerClient.tsx` — la page publique doit rester **strictement inchangée du point de
      vue de l'auditeur**. *(fichier : `src/app/ecouter/[token]/page.tsx`)*
- [x] **T028** — Navigation : une entrée unique **« Audio » → `/audio`** dans `mediaLinks`,
      conditionnée par `audio:listen` ; supprimer « Audio évènements » et la ligne « Audio » de
      la section Administration. *(fichier : `src/app/(auth)/layout.tsx`)*
- [x] **T029** [P] — Ajouter la fonction **`CAPTATION_AUDIO`** (« Captation Audio — enregistre et
      publie les cultes ; ses membres accèdent à l'espace de production audio ») à la liste
      `FUNCTIONS`. *(fichier : `src/app/(auth)/admin/departments/functions/DeptFunctionsClient.tsx`)*

### 5. Tests

- [x] **T030** [P] — `rendition-cache` : téléchargement au premier accès puis service local sans
      nouvel appel S3 ; deux accès concurrents ⇒ **un seul** appel S3 ; rendition pré-chauffée
      jamais retéléchargée ; éviction du fichier le moins récemment servi au dépassement du
      plafond ; repli sur S3 quand l'écriture disque échoue.
      *(fichier : `src/modules/audio/services/__tests__/rendition-cache.test.ts`)*
- [x] **T031** [P] — `stream` : `200` sans `Range` ; `206` + `Content-Range` correct ; `416` sur
      plage invalide ; en-têtes de cache ; avec `AUDIO_XACCEL_LOCATION` défini, corps vide +
      `X-Accel-Redirect` sur le bon nom de fichier et `mtime` rafraîchi.
      *(fichier : `src/modules/audio/services/__tests__/stream.test.ts`)*
- [x] **T032** [P] — `library` : un culte `UNPUBLISHED` n'est **jamais** renvoyé ; cumul des
      critères (orateur + type + période + recherche libre) ; les trois tris ; un culte sans
      titre ni orateur reste renvoyé et identifiable par sa date.
      *(fichier : `src/modules/audio/services/__tests__/library.test.ts`)*
- [x] **T033** [P] — Étendre les tests d'accès : `getCaptureDepartmentId` lit bien
      `Department.function = "CAPTATION_AUDIO"` ; `isCaptureTeamMember` / `isCaptureTeamLead`
      inchangés. *(fichier : `src/modules/audio/services/__tests__/access.test.ts`)*
- [x] **T034** — Tests des routes d'écoute : `audio:listen` exigé ; culte d'une **autre église**
      → `403` (écart documenté au plan.md, cohérent avec le reste du module) ; culte dépublié →
      `410` ; `share` réutilise un token existant plutôt que d'en créer un second ; `play`
      incrémente `playCount` et **pas** `openCount`.
      *(fichier : `src/app/api/audio/services/[id]/__tests__/listen.test.ts`)*
- [x] **T035** — Non-régression : les tests existants de `tokens`, `publish`, `public` et
      `multi-tenant` passent **inchangés** ; la route publique de streaming réécrite conserve ses
      cas `404` / `403` / `410`. *(fichiers : tests existants du module audio)*

### 6. Documentation & données de démonstration

- [x] **T036** [P] — `.env.example` : `AUDIO_CACHE_DIR`, `AUDIO_CACHE_MAX_BYTES`, et
      `AUDIO_XACCEL_LOCATION` documentée comme **optionnelle et strictement liée à la présence
      d'un nginx frontal** (absente sur l'infra actuelle, où Traefik sert Node directement).
      `docs/production.md` : dimensionnement du cache disque, et la configuration nginx en
      annexe optionnelle. *(fichiers : `.env.example`, `docs/production.md`)*
- [x] **T037** [P] — Passer l'ADR-0008 en statut **Accepté** (son contenu est déjà amendé).
      *(fichier : `docs/adr/0008-cache-disque-renditions-audio.md`)*
- [x] **T038** — `CLAUDE.md` : ajouter `audio:listen` au tableau des permissions, décrire
      l'arborescence `/audio` à onglets, retirer `/admin/audio/settings`, et mentionner la
      fonction de département `CAPTATION_AUDIO` à la place de `AudioSettings.captureDepartmentId`
      dans la section « Spécificités du module audio ». *(fichier : `CLAUDE.md`)*
- [x] **T039** [P] — `docs/api.md` (trois routes ajoutées, route publique de streaming modifiée),
      `docs/auth.md` (permission `audio:listen`), `docs/database.md` (suppression du champ).
      *(fichiers : `docs/api.md`, `docs/auth.md`, `docs/database.md`)*
- [x] **T040** [P] — Guide utilisateur : ajouter la bibliothèque d'écoute pour **tous les rôles**
      (c'est la première fonctionnalité audio visible par un membre simple).
      *(fichier : `src/components/GuideContent.tsx`)*
- [x] **T041** [P] — `seed-dev` : un département `CAPTATION_AUDIO`, deux ou trois cultes publiés
      avec séquences et renditions, orateurs et types différents — sans quoi la bibliothèque est
      vide en développement et rien n'est testable à la main.
      *(fichier : `prisma/seed-dev.ts`)*

## Couverture des critères d'acceptation

| Critère (`spec.md`) | Tâches |
|---|---|
| Membre sans rôle particulier atteint la bibliothèque, cultes du plus récent au plus ancien | T009, T020, T023, T028 |
| Identification par date, titre, orateur — date seule si non renseignés | T007, T023, T032 |
| Même expérience d'écoute que la page partagée | T017, T026, T027 |
| Un culte dépublié n'apparaît plus | T007, T032 |
| Un culte d'une autre église n'apparaît jamais | T007, T010, T034 |
| Critères combinés + recherche libre sur le titre | T007, T024, T032 |
| Choix de l'ordre d'affichage | T007, T024, T032 |
| Recherche sans résultat signalée + retour à la liste complète | T023 |
| Séquences listées (nom, durée), écoutables et partageables individuellement | T008, T012, T017, T026 |
| Reprise proposée jamais imposée ; séquence terminée non proposée | T019, T025 |
| Obtenir un lien à partager depuis la bibliothèque | T012, T026 |
| Fiche d'un événement passé permet d'écouter | T016 |
| Sur téléphone : liste et écoute sans zoom ni défilement horizontal | T017, T023, T024 |
| Aucune régression sur les liens de partage déjà diffusés | T013, T027, T035 |

Tous les critères sont couverts. Deux critères restent **partiellement non automatisables** et
sont validés en recette manuelle : le confort mobile (T017/T023/T024) et l'équivalence d'expérience
entre page publique et bibliothèque (T027) — inscrits à ce titre dans la vérification finale.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` (757 tests, dont 42 nouveaux pour cette feature)
- [x] Migration appliquée sur une base contenant une configuration de captation existante :
      le département est bien reporté sur `Department.function` (validé en local avec une ligne
      de test insérée dans `audio_settings`, migration appliquée, département vérifié puis
      nettoyé — voir aussi le seed-dev qui crée directement `CAPTATION_AUDIO`)
- [ ] Recette manuelle mobile : lecture, seek, vitesse, commandes sur écran verrouillé, reprise
      proposée après réouverture, aucun défilement horizontal
- [ ] Recette manuelle des onglets selon le rôle : membre simple (un seul onglet), membre de
      l'équipe captation audio (deux), admin (trois)
- [x] Un lien de partage émis avant la feature fonctionne à l'identique (tests non-régression
      `tokens`/`publish`/`public`/`multi-tenant` inchangés + nouveau test de la route publique de
      streaming couvrant `404`/`403`/`410`/`200`)
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (voir tableau de couverture
      ci-dessus ; les deux points restants ci-dessous sont une recette manuelle, non automatisable)
- [ ] PR ouverte vers `main`
