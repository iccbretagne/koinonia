# Plan technique — Bibliothèque d'écoute des cultes

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-08-28

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe que via `@/modules/audio` et `@/modules/storage`
- [x] **Sécurité** : chaque route et chaque page vérifie `requireAuth` + permission + appartenance de l'église ; un culte d'une autre église répond `403` (cf. écart documenté ci-dessous, cohérent avec le reste du module)
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — nouvelle permission déclarée dans le manifeste `audioModule`
- [x] **Validation** Zod sur les mutations (`play`, `share`) et sur les `searchParams` de la liste (`safeParse` + valeurs par défaut)
- [x] **Migration** Prisma prévue : déplacement du département captation audio vers `Department.function` (voir §Modèle de données)
- [x] **Enums** importés depuis `@/generated/prisma/client` (`AudioServiceStatus`)
- [x] **UI** : `Button`, `Input`, `Select` réutilisés ; le lecteur existant est **factorisé et enrichi**, pas dupliqué

## Approche générale

Quatre chantiers, dans cet ordre :

1. **Un seul point d'entrée « Audio », trois onglets à droits distincts.** `/audio` devient un
   espace à onglets : **(re)Écouter** (tout membre), **Production** (équipe captation audio et
   rôles audio), **Paramètres** (équipe média). Le lien « Audio » de la section Administration
   disparaît, et le **département captation audio** rejoint les fonctions par département, là où se
   configurent déjà Secrétariat, Production Média, Protocole…
2. **Ouvrir l'écoute à tout le monde.** Une permission `audio:listen` accordée à tous les rôles
   (précédent : module `jobs`) sépare *écouter* de *produire*. Les permissions existantes
   (`audio:view/upload/review/manage`) sont inchangées.
3. **Servir l'audio depuis un cache disque** (ADR-0008, « Proposé » → « Accepté », amendé le
   2026-08-28) : une rendition est écrite dans le cache dès sa production par le worker, puis
   servie en flux par l'application en honorant le `Range` HTTP. Une délégation à nginx
   (`X-Accel-Redirect`) est prévue dans le code mais **désactivée par défaut** : Traefik sert
   Koinonia directement, l'activer supposerait d'insérer un nginx dans la chaîne. Les deux
   chemins d'écoute — lien public par token et onglet (re)Écouter — passent par la même couche,
   et le contrôle d'accès reste **avant** le cache, dans l'application, à chaque requête.
4. **La bibliothèque et son lecteur** : une liste filtrable rendue côté serveur, et un lecteur
   retravaillé en profondeur (§UI) — c'est là que se joue la valeur perçue de la feature.

Fil directeur : **ne rien dupliquer**. Le lecteur, la résolution d'un culte publié et le
streaming sont extraits une fois et consommés par les deux entrées. C'est ce qui garantit
mécaniquement « même expérience que la page partagée » et « aucune régression sur les liens
déjà diffusés ».

## Arborescence des routes

| Route | Onglet | Accès | Origine |
|---|---|---|---|
| `/audio` | — | `audio:listen` | redirige vers le premier onglet accessible |
| `/audio/ecouter` | **(re)Écouter** | `audio:listen` (tous les rôles) | **nouveau** |
| `/audio/ecouter/[id]` | — | `audio:listen` | **nouveau** — fiche d'écoute |
| `/audio/production` | **Production** | `requireAudioAccess("audio:view")` | déplacé depuis `/audio` |
| `/audio/production/[id]` | — | `requireAudioAccess("audio:upload")` | déplacé depuis `/audio/[id]` |
| `/audio/parametres` | **Paramètres** | `requireAudioAccess("audio:manage")` | déplacé depuis `/admin/audio/settings`, **supprimée** |
| `/ecouter/[token]` | — | token de partage, sans authentification | **inchangé** |

`src/app/(auth)/audio/layout.tsx` calcule les droits une fois et n'affiche que les onglets
accessibles — un membre sans rôle audio voit un espace à un seul onglet, sans onglet grisé ni
mention d'un espace qui ne le concerne pas. Chaque page reste garde-fou de son propre accès :
l'onglet masqué ne dispense pas du contrôle serveur.

Aucune redirection de compatibilité n'est nécessaire. `/audio` et `/audio/[id]` n'existent que
dans l'interface de production authentifiée (aucun lien externe, aucun lien partagé), et
`/admin/audio/settings` **n'a jamais été mis en production** : les trois anciennes routes sont
purement supprimées et leurs liens internes mis à jour.

## Modèle de données

**Un seul changement, lié au déplacement du département captation audio.**

Aujourd'hui le département captation audio est stocké dans `AudioSettings.captureDepartmentId`,
alors que toutes les autres fonctions de département (`SECRETARIAT`, `COMMUNICATION`,
`PRODUCTION_MEDIA`, `PROTOCOLE`, `INTEGRATION`, `MSDP`) vivent dans `Department.function`.
Deux mécanismes pour la même notion : on ramène le cas particulier dans le cas général.

```prisma
model AudioSettings {
  id                  String  @id @default(cuid())
  churchId            String  @unique
  // captureDepartmentId supprimé — remplacé par Department.function = "CAPTATION_AUDIO"
  defaultCoverKey     String? @db.VarChar(512)
  sequenceTemplate    Json?
  // …
}
```

Migration Prisma en deux temps, dans le même fichier :

1. `UPDATE departments d JOIN audio_settings s ON s.captureDepartmentId = d.id SET d.function = 'CAPTATION_AUDIO'`
   — aucune configuration existante n'est perdue ;
2. suppression de la colonne `captureDepartmentId` et de la relation `captureDepartment`.

`getCaptureDepartmentId(churchId)` (`services/access.ts`) lit désormais
`department.findFirst({ where: { function: "CAPTATION_AUDIO", ministry: { churchId } } })`. Ses
appelants — `isCaptureTeamMember`, `isCaptureTeamLead`, `requireAudioAccess`,
`requireAudioUnpublishAccess` — sont inchangés : la substitution est confinée à cette fonction.

**Rien d'autre ne change.** `AudioService` (churchId, serviceDate, title, speaker, `type` selon
`EVENT_TYPES`, status), `AudioSegment` (order, title, playCount), `AudioRendition` (s3Key,
durationMs) et `AudioShareToken` (serviceId, segmentId nullable) couvrent déjà le besoin.

Deux points explicitement tranchés :

- **La position d'écoute ne va pas en base.** La spec n'exige la reprise que sur le même
  appareil : `localStorage` suffit et évite une table, une migration, une route d'écriture
  appelée toutes les quelques secondes, et une question de rétention de données d'usage.
- **Pas d'index supplémentaire pour l'instant.** `@@index([churchId, status])` couvre le filtre
  principal ; le volume attendu est de quelques centaines de cultes par église. Un index
  `[churchId, status, serviceDate]` sera ajouté si le plan de requête le justifie (noté en
  risque, pas en dette silencieuse).

Le point de vigilance de la spec sur le **type de rassemblement** est levé : `AudioService.type`
est déjà normalisé sur `EVENT_TYPES` (`src/lib/event-types.ts`), recopié depuis `Event.type` au
rattachement. Le filtre s'appuie dessus, avec `EVENT_TYPE_OPTIONS` pour l'interface.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/audio/services/[id]/stream/[segmentId]` | GET | `audio:listen` (+ église du culte) | en-tête `Range` optionnel | flux audio `200` / `206`, `Content-Range`, `Cache-Control: private, max-age=31536000, immutable` |
| `/api/audio/services/[id]/play` | POST | `audio:listen` | `{ segmentId: string }` | `{ ok: true }` |
| `/api/audio/services/[id]/share` | POST | `audio:listen` | `{ segmentId?: string }` | `{ url: string }` |
| `/api/audio/public/[token]/stream/[segmentId]` | GET | token de partage (inchangé) | en-tête `Range` optionnel | **modifié** : sert le flux depuis le cache au lieu de rediriger en 302 |
| `/api/audio/settings` | GET/PATCH | inchangée | **modifié** : `captureDepartmentId` retiré du schéma Zod | — |
| `/api/departments/[id]` (assignation de fonction) | PATCH | `events:manage` | **modifié** : accepte `"CAPTATION_AUDIO"` | — |

Règles communes aux trois routes ajoutées :

- `requireAuth()` puis `requirePermission("audio:listen", service.churchId)` ; le culte est
  chargé d'abord (404 s'il n'existe pas), puis `requirePermission` vérifie l'appartenance à
  l'église. **Écart au tracé initial de ce plan** (qui prévoyait un `404` uniforme) : la
  vérification renvoie **`403`** pour un culte d'une autre église, comme le fait déjà chaque
  route existante du module via `requireAudioAccess`/`requireAudioUnpublishAccess` (voir
  `multi-tenant.test.ts`). Retenu par cohérence avec la convention déjà en place dans ce
  module plutôt que d'introduire un deuxième comportement pour la même situation ; le critère
  d'acceptation (« un culte d'une autre église n'apparaît jamais ») est satisfait dans les deux
  cas, aucun contenu n'étant exposé.
- `status !== "PUBLISHED"` → `410` (« Ce culte n'est plus disponible »), même sémantique que la
  route publique : un culte dépublié pendant une écoute donne le même message des deux côtés.
- `share` réutilise un token existant non révoqué avant d'en créer un — un membre qui repartage
  la même séquence ne multiplie pas les liens.

**Pas de route API pour la liste.** L'onglet (re)Écouter est un Server Component qui lit les
`searchParams` et interroge Prisma. Une route JSON n'apporterait qu'un aller-retour de plus, et
l'URL filtrée devient partageable telle quelle.

## Services / logique métier

Tout dans `src/modules/audio/services/`, exporté par `src/modules/audio/index.ts`.

**`rendition-cache.ts`** (nouveau) — cœur de l'ADR-0008 :

- `getCachedRenditionPath(s3Key): Promise<string>` — chemin local, téléchargé depuis S3
  (`getS3ObjectStream`) au premier accès. Écriture dans `<clé>.part` puis `rename` atomique :
  un lecteur ne voit jamais un fichier incomplet.
- Une `Map<string, Promise<string>>` en mémoire dédoublonne les téléchargements concurrents :
  dix auditeurs qui démarrent la même séquence en même temps déclenchent **un** transfert.
- Clé de fichier : `sha1(s3Key)` — la clé S3 change quand le rendu change (`sourceHash`), donc
  aucune invalidation à orchestrer.
- **Pré-chauffage au rendu** : le worker écrit la rendition dans le cache au moment où il la
  produit, juste avant de l'envoyer sur S3 — il l'a déjà sur son disque
  (`worker/handlers/render.ts`). Le premier auditeur d'un culte fraîchement publié ne paie donc
  aucune attente, et le téléchargement à la demande ne sert plus qu'au rattrapage de l'historique
  et à la reconstruction après éviction.
- Éviction LRU après écriture : au-delà de `AUDIO_CACHE_MAX_BYTES`, les fichiers les moins
  récemment servis sont supprimés. Le `mtime` fait office d'horodatage d'accès et est rafraîchi
  (`utimes`) par l'application à chaque requête autorisée — y compris quand les octets sont
  servis par nginx, qui ne passe pas par notre code.
- Configuration : `AUDIO_CACHE_DIR` (défaut `<tmpdir>/koinonia-audio-cache`) et
  `AUDIO_CACHE_MAX_BYTES` (défaut 5 Go), ajoutés à `.env.example` et à `docs/production.md`.
- Dégradation : si le cache est indisponible (disque plein, droits), on **retombe sur le flux S3
  direct** plutôt que d'échouer — le cache accélère, il ne conditionne pas l'écoute.

**`stream.ts`** (nouveau) — livraison des octets, partagée par les deux routes de streaming.

`buildRenditionResponse(s3Key, rangeHeader)` ouvre un `createReadStream(path, { start, end })`,
parse le `Range` et renvoie `206` + `Content-Range` + `Accept-Ranges: bytes` (ou `200` sans
en-tête `Range`, `416` si la plage est invalide). Le flux Node est converti par `Readable.toWeb` :
**jamais** de `readFile` complet en mémoire, contrainte explicite de l'ADR.

**C'est ce mode qui est livré.** Sur l'infrastructure actuelle, Traefik sert Koinonia en
attaquant directement le process Node sur le port 3001 ; nginx n'est présent sur la machine que
pour un autre site (`star-recrute.iccrennes.fr`) et n'est pas sur le chemin de Koinonia.

**Point de sortie prévu, non activé** : la fonction lit `AUDIO_XACCEL_LOCATION`. Si la variable
est définie, elle répond un corps vide portant `X-Accel-Redirect: <location>/<sha1(s3Key)>.mp3`
au lieu du flux, et laisse un nginx frontal servir le fichier en `sendfile` avec sa gestion
native du `Range` — le handler Node est alors libéré en quelques millisecondes. Côté serveur,
cela tient en quatre lignes :

```nginx
location /_audio_cache/ {
    internal;                                   # inatteignable depuis l'extérieur
    alias /var/lib/koinonia/audio-cache/;
    add_header Cache-Control "private, max-age=31536000, immutable";
}
```

Mais l'activer suppose d'**insérer un nginx entre Traefik et Node pour Koinonia** : un vhost de
plus, une chaîne de proxy à trois étages, et des en-têtes transmis (`X-Forwarded-*`,
`AUTH_TRUST_HOST`) à revalider — NextAuth est sensible à ce point. Ce coût n'est pas justifié
pour l'audience d'une église : quelques dizaines d'écoutes simultanées au pic, que Node encaisse
sans difficulté en streaming avec contre-pression. La variable reste donc **absente par
défaut** ; le jour où la charge le demande, l'activer est un changement de configuration, sans
une ligne de code à écrire. Les deux modes sont documentés dans `docs/production.md`, celui-ci
comme optionnel.

Ce que ce découpage préserve dans les deux cas, et qui est non négociable : **le contrôle d'accès
reste intégral et par requête, dans l'application**. Token de partage, appartenance à l'église et
statut `PUBLISHED` sont vérifiés avant que la moindre référence de fichier soit émise, et
`internal` interdirait d'atteindre le dossier autrement que par un `X-Accel-Redirect` que nous
avons produit. Une dépublication coupe l'accès à la requête suivante, sans purge de cache.

**`library.ts`** (nouveau) — lecture métier de la bibliothèque :

- `listPublishedServices({ churchId, q, speaker, type, from, to, sort })` — `status: "PUBLISHED"`
  systématiquement forcé (un culte dépublié disparaît à l'instant de la consultation, sans cache
  applicatif), `title: { contains: q }` cumulé aux autres critères, tri `serviceDate desc`
  (défaut), `serviceDate asc` ou `speaker asc`.
- `listSpeakers(churchId)` — valeurs distinctes non nulles, pour proposer un choix plutôt qu'une
  saisie libre sur l'orateur.
- `getPublishedServiceForMember(serviceId, churchId)` — mêmes champs que
  `resolvePublicAudioService` (titre, date, orateur, couverture signée, segments + durées). Les
  deux fonctions partagent le mapping des segments et la résolution de la couverture, extraits
  dans un helper interne : la fiche bibliothèque et la page publique ne peuvent pas diverger.

**`tokens.ts`** (modifié) — ajout de `getOrCreateSegmentShareToken(serviceId, segmentId, churchId)`,
symétrique de `getOrCreatePrimaryShareToken`, pour le partage d'une séquence.

**`access.ts`** (modifié) — `getCaptureDepartmentId` lit `Department.function = "CAPTATION_AUDIO"`.

**`index.ts`** (modifié) — permission et navigation :

```ts
"audio:listen": ["SUPER_ADMIN","ADMIN","SECRETARY","MINISTER","DEPARTMENT_HEAD",
                 "DISCIPLE_MAKER","REPORTER","STAR","AGENDA_QUALIFIER","ACCOUNTANT"],
// navigation : { label: "Audio", href: "/audio", permission: "audio:listen" }
```

Aucun nouvel `dependsOn` : le module utilise déjà `storage` et `planning`.
`npm run lint:boundaries` reste vert.

## UI / composants

### Le lecteur — `src/components/audio/AudioPlayer.tsx`

Déplacement de `src/app/ecouter/[token]/AudioPlayerClient.tsx`, paramétré par
`streamUrl(segmentId)`, `onPlay(segmentId)`, `onShare(segmentId | null)` et `backHref`, puis
instancié par la page publique **et** par la fiche bibliothèque. Le lecteur actuel est un
`<audio controls>` nu : c'est lui que cette feature transforme.

**Socle : `react-h5-audio-player`** (3.10.x, React 19 déclaré en peer, ~40 ko). La librairie
prend en charge tout ce qui est fastidieux et déjà résolu ailleurs : barre de progression avec
portion mise en tampon, glissement au doigt comme à la souris, timecodes écoulé/restant, boutons
de saut, piste précédente/suivante, raccourcis clavier, rôles ARIA. Le thème se fait par
**surcharge des classes `.rhap_*`** qu'elle expose (pas de variables CSS `--rhap-*` dans cette
version — vérifié dans le paquet installé), dans une feuille dédiée qui référence les tokens
`--color-icc-*` déjà définis en `@theme` (`globals.css`) ; elle expose aussi l'élément `<audio>`
sous-jacent (`player.audio.current`) — ce qui laisse la porte ouverte aux trois ajouts ci-dessous.

**Ce qu'on ajoute par-dessus** (aucune librairie ne le couvre, c'est de l'interface métier) :

- **Vitesse de lecture** — menu 0,75× / 1× / 1,25× / 1,5× / 2× branché sur `audio.playbackRate`,
  injecté via `customControlsSection`. Écouter une prédication en 1,25× est un usage réel.
- **Media Session API** — titre, orateur et pochette sur l'écran verrouillé, avec play/pause,
  saut de séquence et recul/avance depuis les commandes système ou un casque Bluetooth. Une
  vingtaine de lignes sur l'élément exposé, pour le gain d'usage le plus net : l'écoute a lieu
  en déplacement, téléphone en poche.
- **Chapitres et reprise** — la liste des séquences, le bandeau de reprise et le partage par
  séquence sont notre domaine, pas celui d'un lecteur générique.

**Mise en page.** En-tête (pochette, titre, orateur, date, bouton *Partager*) — liste des
séquences en chapitres — lecteur en **barre persistante**, collée en bas sur mobile et ancrée
sous l'en-tête sur desktop, de sorte qu'on garde le contrôle en faisant défiler les séquences.

**Enchaînement.** À la fin d'une séquence, la suivante démarre automatiquement (`onEnded`) ; la
dernière s'arrête et propose de revenir au début du culte.

**Reprise d'écoute** (remplace la restauration automatique actuelle, qui *impose* la position) :

- une entrée `audio-progress:v1` en `localStorage` : `segmentId → { position, duration, updatedAt }` ;
- à l'ouverture, si une position > 30 s existe et que la séquence n'est pas terminée, une bande
  propose « Reprendre à 12:34 » **et** « Depuis le début » — aucun `seek` automatique ;
- une séquence lue à moins de 15 s de sa fin est considérée terminée : son entrée est supprimée
  et n'est plus proposée ;
- écriture throttlée à 5 s (pas à chaque `listen`), tous les accès en `try/catch` (navigation
  privée), comme aujourd'hui ;
- un culte dépublié n'apparaissant plus dans la liste, la reprise proposée en tête de
  bibliothèque est filtrée sur les cultes effectivement chargés — jamais de reprise fantôme.

**États.** Chargement en squelette de la hauteur finale (aucun saut de mise en page) ; erreur
réseau explicite (`onError`) avec bouton *Réessayer* qui relance la lecture à la position
courante plutôt que de repartir du début.

### L'onglet (re)Écouter — `/(auth)/audio/ecouter/page.tsx`

Server Component : `requireAuth()` + `getCurrentChurchId` + `requirePermission("audio:listen",
churchId)`, `searchParams` validés par Zod en `safeParse` — une URL bricolée retombe sur les
valeurs par défaut et affiche la liste complète, elle ne casse pas la page.

- **Deux vides distincts** : « aucun enregistrement publié pour l'instant » (bibliothèque vide)
  vs « aucun résultat pour cette recherche » + bouton *Voir tous les enregistrements* qui efface
  tous les filtres d'un coup (critère explicite de la spec).
- `LibraryFiltersClient.tsx` : recherche libre (débouncée à 300 ms), `Select` orateur, `Select`
  type (`EVENT_TYPE_OPTIONS`), deux dates, `Select` tri. Les changements sont poussés dans l'URL
  (`router.replace`). Sur mobile, les filtres sont repliés derrière un bouton *Filtrer* portant
  le nombre de critères actifs — la liste reste la première chose visible.
- **Bandeau « Reprendre l'écoute »** en tête quand une écoute en cours porte sur un culte de la
  liste : pochette, séquence, position, un bouton.
- Liste en cartes (date, titre, orateur, badge type, durée totale, nombre de séquences) — pas de
  `DataTable` : le support majoritaire est le téléphone et la lecture doit tenir sans défilement
  horizontal.

### La fiche d'écoute — `/(auth)/audio/ecouter/[id]/page.tsx`

`getPublishedServiceForMember` puis `<AudioPlayer>`, avec *Partager* sur le culte entier et une
action de partage par séquence dans la liste des chapitres (`navigator.share` quand il est
disponible, copie du lien sinon, avec confirmation visible).

### Navigation et déplacements

- `src/app/(auth)/layout.tsx` : `mediaLinks` reçoit une entrée unique **« Audio » → `/audio`**
  conditionnée par `audio:listen` (donc tout le monde) ; l'entrée « Audio évènements » et la
  ligne « Audio » de la section Administration disparaissent.
- `src/app/(auth)/admin/departments/functions/` : ajout de la fonction **`CAPTATION_AUDIO`** («
  Captation audio — enregistre et publie les cultes ; ses membres accèdent à l'espace de
  production audio ») dans la liste `FUNCTIONS`.
- `/audio/parametres` reprend le contenu de `AudioSettingsClient` (couverture par défaut, modèle
  de séquences) ; le sélecteur de département en est retiré, remplacé par un lien vers les
  fonctions départementales. `src/app/(auth)/admin/audio/` est **supprimé** — la fonctionnalité
  n'a jamais été mise en production, aucune redirection à prévoir.
- `src/app/api/events/[eventId]/star-view/route.ts` : `audioLink` pointe vers
  `/audio/ecouter/[serviceId]` au lieu de créer à la volée un token de partage pour une écoute
  interne. Les tokens déjà émis restent valides ; consulter un événement cesse d'en fabriquer un.
- `BottomNav` inchangé (accès par « Menu »).

## Décisions & alternatives écartées

- **Choix** : un seul lien « Audio », trois onglets à droits distincts — *Pourquoi* : demande
  explicite ; évite trois entrées de menu pour un même domaine et rend l'espace lisible quel que
  soit le rôle.
- **Choix** : le département captation audio rejoint `Department.function` — *Pourquoi* : c'est
  exactement la notion « quel département assure cette fonction », déjà outillée pour six autres
  fonctions. Deux mécanismes concurrents pour la même chose sont un piège de maintenance.
- **Écarté** : garder `AudioSettings.captureDepartmentId` en doublon — *Raison* : deux sources
  de vérité divergeraient au premier changement d'organisation.
- **Choix** : une permission `audio:listen` accordée à tous les rôles — *Pourquoi* : la
  constitution impose `rolePermissions` et les onglets se conditionnent sur une permission ; le
  module `jobs` a déjà ce pattern. Cela laisse la porte ouverte à une église qui voudrait
  restreindre l'écoute, sans rien rouvrir.
- **Écarté** : `requireAuth()` seul, sans permission — *Raison* : contourne `rolePermissions` et
  rend la restriction future impossible sans migration de code.
- **Choix** : liste rendue côté serveur depuis les `searchParams` — *Pourquoi* : moins de code
  qu'une route API + fetch client, URL filtrée partageable, pas de spinner sur mobile.
- **Écarté** : `GET /api/audio/library` + état client — *Raison* : aucune consommation externe
  prévue ; ce serait une couche pour elle-même.
- **Choix** : position d'écoute en `localStorage` — *Pourquoi* : la spec ne demande la reprise
  que sur le même appareil ; zéro table, zéro écriture serveur en boucle.
- **Écarté** : table `AudioPlayback(userId, segmentId, position)` — *Raison* : sur-ingénierie
  pour un besoin borné à l'appareil. À reconsidérer le jour où la reprise multi-appareils est
  demandée.
- **Choix** : `react-h5-audio-player` comme socle, étendu par nos soins — *Pourquoi* : le
  scrubber tactile, la portion en tampon, les timecodes, les sauts et les raccourcis clavier
  sont un travail ingrat et déjà résolu ; la librairie se thème par variables CSS (donc tokens
  ICC sans lutte), déclare React 19 en peer, et expose l'élément `<audio>` pour ce qu'elle ne
  couvre pas. On écrit ce qui est spécifique au domaine, pas ce qui est générique.
- **Écarté** : tout écrire à la main sur `<audio>` — *Raison* : plusieurs centaines de lignes
  d'interface à maintenir, dont le glissement tactile et l'accessibilité, pour un résultat au
  mieux équivalent.
- **Écarté** : Vidstack (`@vidstack/react`) — meilleur sur le papier (Media Session, chapitres et
  vitesse intégrés) — *Raison* : son tag npm `latest` est figé sur `0.6.15` (peer React 18) alors
  que la version réelle est la `1.15.6`, publiée sous le tag `next` ; un `npm install` naïf
  installe la mauvaise, et Dependabot ne suit pas une branche `next`. S'ajoute 3,3 Mo de paquet
  très orienté vidéo pour un besoin purement audio.
- **Écarté** : `plyr-react` — *Raison* : wrapper d'un lecteur impératif via `react-aptor`,
  intégration plus indirecte, et pas de support React 19 déclaré.
- **Écarté** : forme d'onde (waveform, `wavesurfer.js`) — *Raison* : suppose un décodage client
  coûteux ou des données pré-calculées au rendu ; joli, pas demandé, et hors budget de cette
  version.
- **Choix** : le lecteur est déplacé et paramétré, pas copié — *Pourquoi* : seule garantie
  structurelle du critère « même expérience que la page partagée ».
- **Choix** : cache disque servi par l'application (ADR-0008), y compris pour la route publique —
  *Pourquoi* : deux chemins de streaming divergents seraient deux comportements de `Range` à
  maintenir ; et l'egress du lien public compte autant que celui de la bibliothèque.
- **Écarté** : garder la redirection 302 pour la route publique — *Raison* : divergence de
  comportement et bénéfice de cache réduit de moitié, pour aucune économie de code.
- **Choix** : livrer le streaming Node, et laisser la délégation nginx (`X-Accel-Redirect`) en
  point de sortie désactivé par défaut — *Pourquoi* : sur l'infrastructure actuelle, Traefik
  attaque directement Node:3001 ; nginx n'existe sur la machine que pour un autre site. Activer
  la délégation imposerait un nginx supplémentaire dans la chaîne de Koinonia — un vhost, trois
  étages de proxy, et les en-têtes transmis à revalider pour NextAuth — alors que Node encaisse
  sans peine les quelques dizaines d'écoutes simultanées d'une église. Le crochet coûte dix
  lignes et rend l'arbitrage réversible sans réécriture.
- **Écarté** : insérer nginx devant Koinonia dès maintenant pour bénéficier du `sendfile` —
  *Raison* : c'est une modification d'infrastructure et un risque d'authentification pour un
  gain qui ne se manifeste qu'à une charge que le projet n'a pas. À reconsidérer sur mesure, pas
  sur intuition.
- **Écarté** : `proxy_cache` nginx en frontal du stockage objet (nginx télécharge et cache
  lui-même) — *Raison* : c'est la solution la plus « déléguée », mais nginx doit alors
  s'authentifier auprès de S3. Faire transiter une URL signée dans un `proxy_pass` impose une
  clé de cache dissociée de la signature, un `resolver`, et une configuration non testable en
  CI — de la logique critique déplacée dans un fichier que le dépôt ne voit pas. Le gain (ne pas
  écrire ~80 lignes de remplissage de cache, déjà couvertes par des tests) ne vaut pas la
  dépendance à une configuration serveur non versionnée.
- **Écarté** : copier les renditions dans un dossier public servi directement par nginx, avec des
  noms de fichiers imprévisibles — *Raison* : le contrôle d'accès disparaîtrait du chemin de
  lecture. Une dépublication ou une révocation ne serait plus effective tant que le fichier n'est
  pas supprimé, et le lien resterait valide indéfiniment s'il fuitait. `internal` +
  `X-Accel-Redirect` donne le même gain de performance sans céder sur ce point.
- **Écarté** : un CDN devant le stockage — *Raison* : déjà arbitré dans l'ADR-0008 (une copie
  hors de notre contrôle survit à une révocation). Reste la porte de sortie si l'audience change
  d'ordre de grandeur.
- **Choix** : pré-chauffer le cache depuis le worker de rendu — *Pourquoi* : il a déjà le fichier
  sur son disque au moment où il l'envoie sur S3 ; quelques lignes, et le premier auditeur d'un
  culte publié n'attend plus le rapatriement.
- **Choix** : la bibliothèque n'incrémente pas `openCount` — *Pourquoi* : ce compteur mesure la
  diffusion d'un **lien de partage** ; le gonfler avec les consultations internes rendrait la
  seule statistique existante ininterprétable. `playCount` (lectures) est incrémenté des deux
  côtés, ce qui est sa sémantique.

## Risques & points d'attention

- **Migration du département captation audio** : si la migration de données échoue ou est oubliée,
  l'équipe captation audio perd son accès à l'espace de production. Le `UPDATE` précède la
  suppression de colonne dans la même migration, et un test couvre `getCaptureDepartmentId` sur
  la nouvelle source.
- **Le processus Node devient le chemin des octets** (conséquence assumée de l'ADR-0008). Une
  écoute mobilise une connexion applicative pendant sa durée. Dimensionnement attendu : quelques
  dizaines de lectures simultanées au pic, que le streaming avec contre-pression encaisse. À
  **mesurer** après mise en service (connexions simultanées, mémoire du process) plutôt qu'à
  supposer ; deux issues déjà instruites si la mesure déçoit — activer `AUDIO_XACCEL_LOCATION`
  derrière un nginx, ou le CDN décrit dans l'ADR.
- **Un `X-Accel-Redirect` sans nginx devant produirait une réponse vide.** La variable
  `AUDIO_XACCEL_LOCATION` est absente par défaut et documentée comme strictement liée à la
  présence d'un nginx frontal ; le comportement livré et testé est le streaming Node.
- **Remplissage du disque de la VM** : plafond + éviction LRU, `AUDIO_CACHE_DIR` documenté dans
  `docs/production.md` pour être placé sur un volume dimensionné.
- **Course au premier accès** : sans dédoublonnage, N auditeurs simultanés = N téléchargements.
  Traité par la `Map` de promesses ; couvert par un test.
- **Volume de la liste** : pas d'index dédié ni de pagination en V1. Si une église dépasse le
  millier de cultes publiés, ajouter l'index et une pagination — à mesurer, pas à supposer.
- **Fuite cross-tenant** : le point sensible est `[id]` dans l'URL. Le `churchId` est vérifié
  dans les trois routes **et** dans les pages ; couvert par un test dédié, sur le modèle de
  `api/audio/services/__tests__/multi-tenant.test.ts`.
- **`localStorage` indisponible** (navigation privée, quotas) : la reprise disparaît, l'écoute
  fonctionne. Aucun chemin ne dépend d'une lecture réussie.
- **Media Session API** : support inégal selon les navigateurs. Enrichissement pur — son absence
  ne dégrade rien, le lecteur reste complet dans la page.
- **Dépendance `react-h5-audio-player`** : elle tire `@iconify/react` pour ses icônes. Vérifier
  au moment de l'installation que la version courante déclare toujours React 19, et que le poids
  ajouté au bundle reste de l'ordre annoncé — sinon, replier sur un `<audio>` piloté à la main,
  la frontière du composant (`AudioPlayer.tsx`) rendant la substitution locale.

## Stratégie de tests

Vitest, à côté des tests existants du module.

- `services/__tests__/rendition-cache.test.ts` — téléchargement au premier accès puis service
  local sans nouvel appel S3 ; rendition pré-chauffée par le worker jamais retéléchargée ; dédoublonnage de deux accès concurrents (un seul appel S3) ;
  éviction du fichier le moins récemment servi au dépassement du plafond ; repli sur S3 quand
  l'écriture disque échoue. S3 mocké, cache dans un répertoire temporaire.
- `services/__tests__/stream.test.ts` — **mode autonome** : `200` sans `Range` ; `206` +
  `Content-Range` correct sur une plage ; `416` sur une plage invalide ; en-têtes de cache
  présents. **Mode délégué** (`AUDIO_XACCEL_LOCATION` défini) : corps vide, en-tête
  `X-Accel-Redirect` pointant sur le bon nom de fichier, et `mtime` du fichier rafraîchi.
- `services/__tests__/library.test.ts` — `status: PUBLISHED` toujours forcé (un culte
  `UNPUBLISHED` n'est jamais renvoyé) ; cumul des critères ; les trois tris ; un culte sans titre
  ni orateur reste renvoyé et identifiable par sa date.
- `services/__tests__/access.test.ts` (existant, étendu) — `getCaptureDepartmentId` lit bien
  `Department.function = "CAPTATION_AUDIO"` ; `isCaptureTeamMember` / `isCaptureTeamLead` inchangés.
- `app/api/audio/services/[id]/__tests__/listen.test.ts` — `audio:listen` exigé ; culte d'une
  autre église → `403` (écart documenté §Modèle de données/API) ; culte dépublié → `410` ;
  `share` réutilise le token existant plutôt que d'en créer un second.
- **Non-régression** : les tests existants de `tokens`, `publish` et `public` doivent passer
  inchangés — c'est la preuve que les liens déjà diffusés continuent de fonctionner. La route
  publique de streaming, réécrite, garde ses cas `404` / `403 hors périmètre` / `410`.
- Vérification manuelle (non automatisable) : lecture, seek et vitesse sur téléphone ; commandes
  sur écran verrouillé ; reprise proposée après réouverture ; absence de défilement horizontal ;
  onglets affichés conformément au rôle (membre simple, équipe captation audio, admin).
