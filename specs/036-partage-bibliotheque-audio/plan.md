# Plan technique — Partage de bibliothèque audio entre églises

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-02

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'accède au module que par `@/modules/audio`.
      `src/lib/auth.ts` fait de même en import dynamique — pattern déjà en place pour
      `isCaptureTeamMember` (`auth.ts:690`).
- [x] **Sécurité** : toutes les routes ajoutées passent par `requireCurrentChurchPermission`
      (administration) ou le nouveau `requireAudioListenAccess` (écoute). Le périmètre d'églises
      lisibles est **toujours calculé serveur**, jamais reçu du client.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune nouvelle permission créée,
      on réutilise `audio:manage` et `audio:listen`.
- [x] **Validation** Zod sur `POST /api/audio/shares` et sur les paramètres d'URL de la
      bibliothèque (le schéma existant est étendu).
- [x] **Migration** Prisma pour le nouveau modèle (`npm run db:migrate`, jamais `db push`).
- [x] **Enums** : aucun nouvel enum.
- [x] **UI** : `Input`, `Button`, `Select`, `Modal` de `src/components/ui/` réutilisés ; aucun
      nouveau composant générique.

## Approche générale

Le fil directeur est de **contenir l'élargissement dans le module audio**. On n'élargit pas
`requireChurchPermission` (`src/lib/auth.ts:379`), qui garde tout le multi-tenant : une erreur y
ouvrirait bien plus que l'audio. On ajoute un helper dédié `requireAudioListenAccess`, sur le
modèle exact de `requireAudioAccess` (`auth.ts:679`), dont le rayon d'action est borné à l'écoute.

Le reste découle d'un seul changement de forme : la bibliothèque passe de **une** église à **une
liste d'églises lisibles**, calculée serveur une fois par requête. Les trois fonctions de
`library.ts` et la page de détail prennent une liste au lieu d'un identifiant ; le filtre par
église n'est qu'une restriction *à l'intérieur* de cette liste, jamais un moyen d'en sortir.

Le contexte d'église de l'utilisateur (`getCurrentChurchId`, `ChurchSwitcher`,
`/api/current-church`, lien de navigation) n'est **pas touché** : l'utilisateur reste chez lui et
voit du contenu d'ailleurs, il ne bascule pas d'église.

## Modèle de données

Un octroi dirigé, sans hiérarchie ni réciprocité. L'auteur de l'octroi n'est pas stocké : la spec
demande une trace nommée, et `AuditLog` la fournit déjà (pas de duplication).

```prisma
model AudioLibraryShare {
  id            String   @id @default(cuid())
  ownerChurchId String   // l'église qui ouvre sa bibliothèque
  guestChurchId String   // l'église qui reçoit l'accès en lecture
  createdAt     DateTime @default(now())

  ownerChurch Church @relation("AudioSharesGranted",  fields: [ownerChurchId], references: [id], onDelete: Cascade)
  guestChurch Church @relation("AudioSharesReceived", fields: [guestChurchId], references: [id], onDelete: Cascade)

  @@unique([ownerChurchId, guestChurchId]) // pas de doublon (critère d'acceptation)
  @@index([guestChurchId])                 // lecture chaude : « qui m'a ouvert sa bibliothèque ? »
  @@map("audio_library_shares")
}
```

Sur `Church`, deux champs de relation :

```prisma
  audioSharesGranted  AudioLibraryShare[] @relation("AudioSharesGranted")
  audioSharesReceived AudioLibraryShare[] @relation("AudioSharesReceived")
```

L'identifiant public est `Church.slug`, déjà `@unique` (`schema.prisma:57`) — aucun champ ajouté.
Le partage référence l'**église**, pas son slug : un renommage ne rompt donc rien (critère
d'acceptation « survit à un changement d'identifiant »), propriété obtenue par construction.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/audio/shares` | GET | `audio:manage` (église courante) | — | `{ ownSlug, shares: [{ id, churchName, churchSlug, createdAt }] }` |
| `/api/audio/shares` | POST | `audio:manage` + rate-limit | `{ slug: string, confirm: boolean }` | `confirm:false` → `{ churchName }` ; `confirm:true` → `{ id, churchName, … }` |
| `/api/audio/shares/[id]` | DELETE | `audio:manage` + `ownerChurchId` == église courante | — | `{ ok: true }` |

**Le POST en deux temps est délibéré.** La spec impose d'afficher le nom de l'église avant
confirmation, ce qui suppose de résoudre un slug en nom. Exposer ça comme un `GET .../resolve`
créerait une surface d'énumération distincte, non mutante, facile à marteler. En le repliant dans
le POST (`confirm: false` résout sans créer, `confirm: true` crée), il n'y a **qu'une seule
surface**, `audio:manage`, sous une seule clé de rate-limit.

- Rate-limit : `rateLimit` sur une clé dérivée de l'identifiant utilisateur, preset `RATE_LIMIT_SENSITIVE` (10/min,
  `src/lib/rate-limit.ts`) sur les deux temps du POST.
- Refus métier via `ApiError` : slug inconnu → 404 « Identifiant inconnu, vérifiez-le auprès de
  l'église concernée » ; slug de sa propre église → 400 ; partage déjà existant → 409.
- `logAudit` sur création et révocation : `entityType: "AudioLibraryShare"`, `churchId` =
  église **propriétaire**, `details` = `{ guestChurchId, guestChurchName }`.

**Routes modifiées** (le `churchId` y est déjà résolu depuis le culte, jamais depuis le client) :

- `api/audio/services/[id]/play/route.ts:24` → `requireAudioListenAccess(service.churchId)`
- `api/audio/services/[id]/stream/[segmentId]/route.ts:21` → idem

**Route volontairement inchangée** : `api/audio/services/[id]/share/route.ts:25` garde
`requireChurchPermission("audio:listen", service.churchId)`. Un membre invité n'ayant aucun rôle
dans l'église propriétaire, il échoue naturellement — le refus de générer un lien public sur le
contenu d'autrui est obtenu **sans code dédié**. À verrouiller par un test, la propriété étant
implicite.

## Services / logique métier

Nouveau `src/modules/audio/services/sharing.ts`, exporté via `@/modules/audio` :

- `listAccessibleLibraryChurchIds(churchId)` → `string[]` : `[churchId, ...owners qui ont ouvert
  leur bibliothèque à churchId]`. **Fonction pivot** : tout le reste en dépend.
- `listAccessibleLibraryChurches(churchId)` → `[{ id, name, primaryColor }]` : même chose enrichie,
  pour le filtre et les badges d'origine.
- `listOutgoingShares(ownerChurchId)` — écran d'administration.
- `grantLibraryShare(ownerChurchId, slug, { confirmOnly })` — résolution du slug, refus
  auto-partage / doublon, création.
- `revokeLibraryShare(ownerChurchId, shareId)` — vérifie l'appartenance avant suppression.

**Modifications de `library.ts`** — `churchId: string` devient `churchIds: string[]` sur
`listPublishedServices`, `listSpeakers`, `listSeries`, et `getPublishedServiceForMember`
(`service.churchId !== churchId` devient un test d'appartenance). `listPublishedServices` inclut
`church: { select: { id, name, primaryColor } }` et remonte ces champs dans
`LibraryServiceSummary`. Le `status: "PUBLISHED"` forcé reste inchangé : la révocation et la
dépublication sont instantanées par construction, sans invalidation de cache.

**Cascade orateurs/séries** : `listSpeakers`/`listSeries` reçoivent la liste **déjà restreinte**
par le filtre église quand il est actif — la cascade demandée par la spec est donc obtenue sans
logique supplémentaire.

**Nouveau helper `src/lib/auth.ts`**, à côté de `requireAudioAccess` :

```
requireAudioListenAccess(churchId)
  1. requireAuth ; Super Admin → OK
  2. rôle dans churchId portant audio:listen → OK
  3. sinon : églises de l'utilisateur portant audio:listen ; si churchId a ouvert sa
     bibliothèque à l'une d'elles → OK
  4. sinon FORBIDDEN
```

## UI / composants

**`/audio/parametres`** — nouvelle section sous les paramètres existants, dans un
`LibrarySharingClient` (`"use client"`) :
- l'identifiant de l'église, affiché avec sa raison d'être (« communiquez-le à une église qui
  souhaite vous ouvrir sa bibliothèque ») — sans lui, l'étape 1 du scénario est impossible ;
- un `Input` + `Button` pour saisir un identifiant, puis une `Modal` de confirmation portant le
  nom résolu (`open`, pas `isOpen` — piège n°3 de CLAUDE.md) ;
- la liste des destinataires, chacun avec une révocation confirmée par `Modal`.

**`/audio/ecouter`** — `church` rejoint `searchParamsSchema` (`.catch(undefined)`, comme les
autres). `LibraryFiltersClient` reçoit `churchOptions` et ne rend le `Select` « Église » que si
`churchOptions.length > 1` ; la grille passe alors de `lg:grid-cols-6` à `lg:grid-cols-7`.
Sur chaque carte, un badge d'origine **uniquement si `s.churchId !== currentChurchId`**, teinté
avec `primaryColor` en style inline (Tailwind ne génère pas de classe depuis une valeur runtime).
Le mobile suit la même règle : le badge s'insère dans l'en-tête `flex justify-between` existante,
sans ligne supplémentaire.

**`/audio/ecouter/[id]`** — `requireChurchPermission` → `requireAudioListenAccess(churchId du
culte)`, et `getPublishedServiceForMember` reçoit la liste d'églises. Le nom de l'église d'origine
s'affiche dans l'en-tête du lecteur quand le culte vient d'ailleurs.

`ResumeBanner` n'est pas modifié : il indexe par `segmentIds` sur des cultes déjà présents dans la
liste, qui contient désormais aussi ceux des bibliothèques partagées.

## Décisions & alternatives écartées

- **Choix** : helper dédié `requireAudioListenAccess` — *Pourquoi* : borne le rayon d'explosion à
  l'audio, là où toucher `requireChurchPermission` exposerait tout le multi-tenant.
- **Écarté** : élargir `requireChurchPermission` via une liste blanche, comme le fait
  `PASTORAL_READ_PERMISSIONS` (`auth.ts:371`) — *Raison* : ce précédent existe pour un accès
  transverse **par personne** (profil pastoral) ; ici l'accès est **par église**, et le garde
  générique n'a pas à connaître cette notion.
- **Choix** : nouer le lien par saisie d'identifiant — *Pourquoi* : `GET /api/churches`
  (`route.ts:7-13`), `/admin/churches` et `church:manage` (`modules/core/index.ts:20`) réservent
  l'annuaire des églises au Super Admin. Une sélection dans une liste imposerait d'ouvrir cet
  annuaire à tout Admin d'église.
- **Écarté** : administration des partages par le Super Admin dans `/admin/churches` —
  *Raison* : réutiliserait un écran et un garde existants, mais retirerait au propriétaire la
  décision, qui est le cœur de la spec.
- **Écarté** : jumelage plateforme puis partage par l'église (deux niveaux) — *Raison* : plus
  propre si d'autres modules réutilisent le lien, mais deux modèles et deux écrans pour un besoin
  qui n'existe aujourd'hui que sur l'audio (constitution V, pas de sur-ingénierie). Le modèle
  actuel n'interdit pas de généraliser plus tard.
- **Choix** : POST en deux temps (`confirm`) plutôt qu'un endpoint de résolution — *Pourquoi* :
  une seule surface d'énumération, gardée et limitée en débit.
- **Choix** : pas d'`AudioSettings` étendu — *Raison* : le partage est une relation entre deux
  églises, pas un réglage d'une église ; le mettre dans `AudioSettings` (`schema.prisma:1844`)
  interdirait l'index sur le destinataire.

## Risques & points d'attention

- **Suppression d'église** — `PATCH /api/churches` (action `delete`) nettoie ses dépendances
  **à la main** (`route.ts:56-90`) et ne connaît aucun modèle audio. Les relations posées ici sont
  en `onDelete: Cascade` pour ne pas aggraver la situation, mais la suppression d'une église
  ayant des données audio est **déjà** bloquée aujourd'hui par `AudioSettings`/`AudioService` :
  constat préexistant, hors périmètre de cette feature, à signaler et non à corriger ici.
- **Changement de signature** de quatre fonctions publiques de `library.ts` : tous les appelants
  doivent suivre. `npm run typecheck` couvre exhaustivement ce risque.
- **Rate-limit en mémoire, mono-instance** (documenté en tête de `src/lib/rate-limit.ts`) : il
  borne le sondage identifiant → nom sans l'éliminer. Compte tenu du garde `audio:manage` et de
  la faible valeur de l'information, c'est le compromis assumé par la spec.
- **Fuite par filtre** : le paramètre `church` ne doit jamais construire la requête ; il ne fait
  qu'intersecter la liste calculée serveur. C'est le point unique où une régression ouvrirait une
  fuite cross-tenant — à couvrir par un test dédié.
- **Cohérence liste ↔ détail** : si la page de détail et la liste divergent sur le périmètre
  d'églises, on obtient soit un 404 sur un culte affiché, soit l'inverse. Les deux passent par
  `listAccessibleLibraryChurchIds`, seule source de vérité.

## Stratégie de tests

**Unitaires — `src/modules/audio/services/__tests__/sharing.test.ts`**
- `listAccessibleLibraryChurchIds` : sans partage → `[churchId]` seul ; avec partage entrant →
  contient l'église propriétaire ; un partage **sortant** ne donne rien en retour (non-réciprocité).
- `grantLibraryShare` : slug inconnu, slug de sa propre église, doublon → refus typés.
- Un renommage de slug ne rompt pas un partage existant.

**Autorisation — `src/lib/__tests__/auth-audio-sharing.test.ts`**
- `requireAudioListenAccess` : rôle direct OK ; invité d'un partage OK ; ni l'un ni l'autre →
  `FORBIDDEN` ; partage révoqué → `FORBIDDEN`.
- Non-contamination : le partage ne donne **pas** `events:view`, `members:view`, ni aucune autre
  permission dans l'église propriétaire — `requireChurchPermission` reste inchangé pour elles.

**Routes — extension de `src/app/api/audio/services/__tests__/multi-tenant.test.ts`**
- Le corpus existant (403 sans partage) reste **inchangé** : c'est la garantie de non-régression.
- Nouveaux cas avec partage actif : `play` et `stream` → 200 ; `share`, `publish`, `unpublish`,
  `sequences`, `upload/*` → 403 ; culte non publié de l'église propriétaire → refusé.

**Bibliothèque — `library.test.ts`**
- Une liste d'églises ne remonte que des cultes `PUBLISHED` de ces églises.
- Le filtre `church` sur une église hors périmètre est ignoré et ne fuit rien.
- Orateurs/séries homonymes entre deux églises : la cascade restreint bien à l'église filtrée.
