# Plan technique — Ergonomie des espaces à onglets et rangement Photos / Visuels

- **Spec associée** : `./spec.md`
- **Statut** : Implémenté
- **Mis à jour le** : 2026-09-13

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveaux services dans `src/modules/media/services/`, consommés via `@/modules/media`
- [x] **Sécurité** : chaque page et route garde son contrôle serveur ; les gardes médias reçoivent en plus l'activité visée ; `churchId` toujours résolu depuis l'objet (`resolveChurchId`)
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — matrice de rôles inchangée
- [x] **Validation** Zod sur les mutations (création de partage, révocation)
- [x] **Migration** Prisma : ajout de `churchId` sur `MediaShareToken` + backfill
- [x] **Enums** depuis `@/generated/prisma/client`
- [x] **UI** : `Modal`, `Button`, `CheckboxGroup`, `SpaceTabs` réutilisés ; un seul composant nouveau générique (`SpaceHome`)

## Approche générale

Trois chantiers, dans cet ordre de dépendance :

1. **Droits par activité.** Introduire la notion d'activité média `PHOTOS` / `VISUELS` dans les
   gardes existantes de `src/lib/auth.ts`. L'appartenance « équipe » n'est plus « membre
   Production Média » mais « membre de l'équipe de l'activité » : `VISUELS` → fonction
   `PRODUCTION_MEDIA` ; `PHOTOS` → nouvelle fonction `PHOTOS`, **ou `PRODUCTION_MEDIA` si aucun
   département de l'église ne porte `PHOTOS`** (repli garantissant l'absence de régression). La
   branche Communication et les permissions de rôle (`media:*`) restent identiques dans les deux
   activités.
2. **Partages.** Rattacher les liens de partage à une église (colonne + backfill) pour pouvoir les
   lister et les compter ; exposer une liste/révocation filtrée par le périmètre de la personne ;
   transformer le constructeur de collection en action « Partager une sélection » dans Photos et
   Visuels.
3. **Accueil d'espace.** `/media` et `/audio` cessent de rediriger vers le premier onglet et
   affichent une page d'accueil à cartes (composant générique `SpaceHome`), filtrées par droits,
   avec redirection directe s'il n'y a qu'une carte. Les onglets deviennent internes à une
   activité (ex. Visuels : Projets / Demandes).

Le menu ne change pas de structure : « Communication & Production » et « Audio » restent deux
entrées de la section **Opérations** (`Sidebar.tsx` / `MobileNavSheet.tsx`, via `mediaLinks`).
Offres (section Ressources) n'est pas touché.

## Modèle de données

Fonction de département : `Department.function` est une chaîne libre — **pas de migration** pour
la nouvelle valeur `PHOTOS`, seulement les constantes applicatives.

```prisma
model MediaShareToken {
  // ...
  churchId String?
  church   Church? @relation(fields: [churchId], references: [id], onDelete: Cascade)

  @@index([churchId])
}
```

Migration `add_church_to_media_share_tokens` :
- ajout colonne nullable + index + FK ;
- backfill SQL : depuis `media_events.churchId` (liens d'événement), `media_projects.churchId`
  (liens de projet), et pour `COLLECTION` depuis la première source de `config`
  (`JSON_EXTRACT(config, '$.eventIds[0]')`, sinon `$.projectIds[0]`) ;
- nullable conservé : une collection dont toutes les sources ont été supprimées reste sans église
  (elle n'expose déjà plus rien et n'apparaît pas dans la liste).

`createMediaShareToken` (`src/modules/media/services/tokens.ts`) reçoit désormais `churchId`
obligatoire pour tous les appelants.

## API

| Endpoint | Méthode | Contrôle | Entrée | Sortie |
|---|---|---|---|---|
| `/api/media-events/**` (existants) | * | gardes médias avec activité `PHOTOS` | inchangée | inchangée |
| `/api/media-projects/**` (existants) | * | gardes médias avec activité `VISUELS` | inchangée | inchangée |
| `/api/media/files/[id]/**` (existants) | * | activité déduite du fichier (`mediaEventId` → `PHOTOS`, sinon `VISUELS`) | inchangée | inchangée |
| `/api/media/files/upload/sign` (existant) | POST | activité déduite de la cible (événement ou projet) | inchangée | inchangée |
| `/api/admin/media/collections` (existant) | POST | `requireMediaCollectionAccess` + `eventIds` exigent le périmètre photos, `projectIds` le périmètre visuels (403 sinon) | inchangée | inchangée |
| `/api/media/shares` (nouveau) | GET | église courante (`getCurrentChurchId`) + `requireMediaCollectionAccess(churchId)` | — | `{ id, type, label, url, sources[], expiresAt, usageCount, canRevoke }[]` actifs |
| `/api/media/shares/[id]` (nouveau) | DELETE | église résolue depuis le lien ; mêmes règles que les DELETE existants (upload de l'activité, manage pour `VALIDATOR`/`PREVALIDATOR`) ; collection : périmètre couvrant toutes ses sources | — | `{ deleted }` |

Les nouvelles routes sont couvertes par le préfixe `/api/media` déjà déclaré dans
`src/modules/media/manifest.ts` (ADR-0012) — pas de changement de manifeste. Elles n'importent
pas `@/lib/prisma` (cliquet `check-prisma-boundary.sh`) : logique dans le module media.

## Services / logique métier

`src/lib/department-functions.ts`
- `DEPT_FN.PHOTOS = "PHOTOS"`, `DEPT_FN_LABEL.PHOTOS = "Photos"`.

`src/lib/auth.ts`
- `type MediaDomain = "PHOTOS" | "VISUELS"`.
- `isMediaTeamMember(session, churchId, domain)` — via `getFunctionDepartmentIds` : `VISUELS` →
  `PRODUCTION_MEDIA` ; `PHOTOS` → `PHOTOS` si au moins un département la porte, sinon
  `PRODUCTION_MEDIA`.
- `requireMediaAccess`, `requireMediaUploadAccess`, `requireMediaReviewAccess`,
  `requireMediaManageAccess` : second paramètre **obligatoire** `domain` (le compilateur liste
  ainsi tous les appelants à revoir) ; `isProductionMediaMember` remplacé par
  `isMediaTeamMember(…, domain)`. Branche Communication inchangée.
- `getMediaShareScope(session, churchId)` → `{ photos: boolean; visuels: boolean }` : `media:manage`
  ou Communication → les deux ; sinon selon `isMediaTeamMember` de chaque activité.
- `requireMediaCollectionAccess(churchId)` : passe si l'un des deux périmètres est vrai.
- `isProductionMediaMember` supprimée une fois tous les appelants migrés.

`src/modules/media/services/shares.ts` (nouveau, exporté par `@/modules/media`, import Prisma
dynamique comme `audio/services/service.ts`)
- `listActiveShares(churchId, scope)` — liens `expiresAt` nul ou futur, filtrés : lien
  d'événement ⇒ `scope.photos`, de projet ⇒ `scope.visuels`, collection ⇒ toutes ses sources
  dans le périmètre ; libellés des sources résolus en une requête par type.
- `countActiveShares(churchId, scope)` — même filtre, pour le bouton de l'accueil.
- `revokeShare(id, session)` — résolution église + contrôles décrits ci-dessus, puis suppression
  + `logAudit`.

`src/lib/media-space.ts` (réécrit)
- `MediaSpaceAccess = { photos; visuels; visualRequests; social; share }`.
- `buildMediaSpaceCards(access)` — ordre fixe **Photos · Visuels · Réseaux sociaux** ; la carte
  Visuels existe si `visuels || visualRequests`.
- `buildVisualsTabs(access)` — onglets internes Visuels : Projets (`/media/projects`) · Demandes
  (`/media/requests`), filtrés.
- `resolveMediaSpaceAccess(session, churchId)` mis à jour ; `(auth)/layout.tsx` construit le même
  objet à partir de `serviceDepts` (ajout de `PHOTOS` à la requête) sans requête supplémentaire.
- `getMediaSpaceCounters(churchId, access)` — photos `PENDING`/`PREVALIDATED`, fichiers de projet
  `PENDING`, demandes `VISUEL` et `RESEAUX_SOCIAUX` en attente ; seules les cartes visibles sont
  calculées.

`src/app/(auth)/audio/tabs.ts`
- `getAudioSpaceCards(churchId)` réutilisant `getAccessibleAudioTabs` + compteurs : (re)Écouter =
  cultes publiés sur 30 jours, Production = cultes en attente de dépôt/nommage, Paramètres = aucun.

## UI / composants

**Générique**
- `src/components/SpaceHome.tsx` (nouveau, server-friendly) — titre d'espace, action d'en-tête
  optionnelle, grille de cartes `{ href, title, team?, stats[] }` (2 colonnes desktop, 1 mobile),
  style `border-2 rounded-lg`, compteurs en pastille `icc-jaune`.
- `SpaceTabs` réutilisé tel quel pour les onglets internes à une activité.

**Communication & Production**
- `media/page.tsx` : accueil `SpaceHome` ; si une seule carte → `redirect` vers elle ; bouton
  « Partages (N liens actifs) » si `access.share`.
- `media/SharesDrawer.tsx` (client, nouveau) — `Modal` listant `GET /api/media/shares` : type,
  sources, expiration, copier, révoquer (`DELETE`, si `canRevoke`).
- `media/layout.tsx` et `communication/layout.tsx` : suppression de la barre d'onglets globale ;
  fil d'Ariane « Communication & Production › {activité} » avec retour à l'accueil.
- `media/(visuels)/layout` : onglets internes Projets / Demandes via `buildVisualsTabs` pour
  `/media/projects/**` et `/media/requests` (layout partagé par groupe de routes, URLs inchangées).
- Titres de pages : « Photos » (`/media/events`), « Visuels » (`/media/projects`), bouton
  « + Nouvel événement photo » / « + Nouveau projet visuel ».
- `MediaEventsList.tsx`, `MediaProjectsList.tsx` : cases de sélection + action « Partager une
  sélection » ouvrant `CollectionBuilder` dans un `Modal`, présélectionné, sources limitées au
  périmètre (`getMediaShareScope`) — la Communication peut compléter avec l'autre activité.
- `collections/CollectionBuilder.tsx` : props `initialEventIds`, `initialProjectIds`, `scope`,
  `onCreated` ; la page `media/collections/page.tsx` devient `redirect("/media")`.
- Pages `events/[id]`, `projects/[id]`, `events`, `projects` : calcul de `canUpload`/`canManage`
  via `isMediaTeamMember` de l'activité.

**Audio**
- `audio/page.tsx` : accueil `SpaceHome` (cartes filtrées, redirection si une seule — cas STAR).
- `audio/layout.tsx` : suppression de la barre d'onglets globale, fil d'Ariane vers l'accueil.

**Configuration**
- `DeptFunctionsClient.tsx` : entrée « Photos — Dépose, valide et partage les photos
  d'événements. Sans département, Production Média s'en charge. » ; description de Production
  Média ajustée (« visuels et demandes de visuels »).

**Menu** : libellés et section Opérations inchangés ; `matchPrefixes` inchangés.

Mobile : grille 1 colonne, boutons ≥ 44 px, `Modal` plein écran existant ; cases de sélection
utilisables au doigt.

## Décisions & alternatives écartées

- **Choix** : activité passée en paramètre obligatoire des gardes existantes — *Pourquoi* : le
  typecheck force la revue de chaque appelant ; pas de garde « par défaut » qui oublierait le
  cloisonnement.
- **Choix** : repli `PHOTOS` → `PRODUCTION_MEDIA` quand la fonction n'est pas attribuée —
  *Pourquoi* : zéro régression au déploiement, et couvre l'église où une seule équipe fait tout
  (un département ne porte qu'une fonction).
- **Choix** : URLs conservées (`/media/events`, `/media/projects`) — *Pourquoi* : les anciens
  liens, favoris et liens internes continuent de fonctionner sans redirection ; seuls les
  libellés changent. Seule `/media/collections` redirige.
- **Choix** : `churchId` sur `MediaShareToken` — *Pourquoi* : les collections ne sont liées à
  aucune église aujourd'hui (sources dans `config` JSON) ; lister/compter par église sans lui
  obligerait à parser tout le JSON à chaque ouverture de l'accueil.
- **Choix** : ADR courte « Droits médias par activité et fonction de département » — *Pourquoi* :
  pattern durable (garde paramétrée par activité + repli de fonction) réutilisable au-delà de
  cette feature.
- **Écarté** : fonction multiple par département (table de liaison) — *Raison* : refonte de la
  spec 046, hors besoin ; le repli couvre le cas « une équipe pour tout ».
- **Écarté** : renommer les URLs en `/media/photos`, `/media/visuels` — *Raison* : redirections à
  maintenir sans bénéfice visible.
- **Écarté** : garder `/media/collections` comme page — *Raison* : décision spec (action dans
  Photos/Visuels + bouton Partages).
- **Écarté** : gardes médias déplacées dans `src/modules/media/auth.ts` — *Raison* : utile mais
  hors périmètre ; noté pour un chantier ultérieur.

## Risques & points d'attention

- **Cloisonnement** : une route oubliée garderait l'ancienne logique — atténué par le paramètre
  obligatoire (erreur de compilation) et la suppression de `isProductionMediaMember`.
- **Déploiement** : une église qui attribue `PHOTOS` retire immédiatement la gestion des photos
  à Production Média — à signaler dans le CHANGELOG et la description de la fonction.
- **Backfill** : collections anciennes à `config` inattendu → `churchId` nul, invisibles dans la
  liste mais toujours fonctionnelles pour le destinataire. Vérifié par le job CI `migrations`.
- **Liens publics** (`/media/collection|gallery|download|validate/[token]`) : non modifiés ; la
  colonne ajoutée est ignorée par leur lecture.
- **Performance de l'accueil** : compteurs limités aux cartes visibles, requêtes `count`/`groupBy`
  indexées (`status`, `churchId`).
- **Guide et tour guidé** (`tour-steps`, `/guide`) : textes mentionnant Projets / Événements
  médias / Collections à mettre à jour.
- **Docs** : `CLAUDE.md` (section Communication & Production, Audio), `docs/auth.md`.

## Stratégie de tests

Vitest :
- `src/lib/__tests__/auth-media-domain.test.ts` (nouveau) — `isMediaTeamMember` : membre `PHOTOS`
  (photos oui / visuels non), membre `PRODUCTION_MEDIA` avec et sans département `PHOTOS` dans
  l'église, Communication (deux activités), `media:manage`, église tierce.
- Mise à jour des tests des gardes et routes existants (`auth-media-collections`, `files/[id]`,
  `confirm-upload`, `upload/sign`, `media-events/[id]/share/security`) à la nouvelle signature,
  + cas « membre PHOTOS refusé sur un fichier de projet ».
- `src/lib/__tests__/media-space.test.ts` — ordre et filtrage des cartes, carte Visuels via
  demandes seules, onglets internes Visuels.
- `src/modules/media/__tests__/shares.test.ts` (nouveau) — filtre actif (expiration), filtre
  église, filtre périmètre (collection mixte masquée pour l'équipe Photos), `revokeShare` refusé
  hors périmètre et pour lien sensible sans manage.
- `api/admin/media/collections` — 403 si `eventIds` sans périmètre photos.
- `route-exhaustiveness.test.ts` inchangé et vert.

Manuel (dev-login + département de fixture portant `PHOTOS`) : accueil Admin (3 cartes + bouton
Partages), membre Photos (arrivée directe sur Photos, partage photos seules), Communication,
STAR sur `/audio` (redirection directe vers (re)Écouter), anciens liens `/media/collections`,
`/media/events/[id]`, version mobile.
