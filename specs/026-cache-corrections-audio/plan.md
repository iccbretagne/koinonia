# Plan technique — Prise en compte immédiate des corrections audio malgré le cache navigateur

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-08-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : les imports `src/app/` → module passent par l'index (`@/modules/X`)
      — aucun nouvel import interne ; on étend des symboles déjà exportés par `@/modules/audio`
- [x] **Sécurité** : toutes les routes protégées par `requireAuth`/`requirePermission` ;
      multi-tenant `churchId` respecté — **aucune route de streaming n'est touchée côté
      autorisation** (les gardes existantes restent telles quelles)
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — inchangées
- [x] **Validation** Zod sur toutes les mutations — aucune mutation ajoutée
- [x] **Migration** Prisma prévue si le schéma change (pas de `db push`) — **aucun changement de
      schéma** (voir § Modèle de données)
- [x] **Enums** importés depuis `@/generated/prisma/client`
- [x] **UI** : composants `src/components/ui/` réutilisés avant création — aucun composant créé

## Approche générale

Le fil directeur : **restaurer l'invariant que l'ADR-0008 énonce déjà mais que le code ne tient
pas**.

ADR-0008 justifie le cache long et `immutable` par cette affirmation :

> « La clé de cache est celle de la rendition dans le stockage objet, **qui change quand le rendu
> change** — il n'y a donc pas d'invalidation à orchestrer. »

Or `getRenditionKey(serviceId, segmentId)` (`src/modules/audio/worker/handlers/render.ts:31`)
produit `audio-services/{serviceId}/renditions/{segmentId}.mp3` — une clé **indépendante du
contenu**. Un nouveau rendu écrase le même objet à la même clé. La prémisse de l'ADR est fausse
en pratique, et c'est la racine du constat H-07 : puisque la clé ne change pas, rien ne change en
aval — ni le nom du fichier de cache disque (`sha1(s3Key)`), ni l'URL vue par le navigateur.

On corrige donc à deux niveaux, l'un rétablissant la prémisse, l'autre la propageant jusqu'au
navigateur :

1. **Clé de rendition adressée par contenu** — `getRenditionKey` intègre le `sourceHash` du rendu.
   Un nouveau rendu écrit une nouvelle clé, donc un nouveau fichier de cache disque : le cache
   serveur cesse structurellement de pouvoir servir un contenu périmé, sur n'importe quelle
   machine. L'ancien objet S3 est supprimé après bascule.
2. **URL de streaming versionnée** — l'identifiant de version du rendu est exposé jusqu'au
   lecteur, qui l'ajoute à l'URL `<audio src>`. L'URL change quand le contenu change : le
   navigateur, qui n'indexe son cache que par URL, refait une requête. Une piste non retouchée
   garde son URL et reste servie depuis le cache local de l'auditeur.

Aucune modification des en-têtes `Cache-Control` : ils restent longs et `immutable`, ce qui
redevient **correct** une fois l'URL réellement immuable par contenu — c'est exactement le
contrat que `immutable` suppose.

## Modèle de données

`[Aucun changement]` — aucune migration Prisma.

`AudioRendition.sourceHash` existe déjà (idempotence du rendu, D10) et sert de jeton de version.
`AudioRendition.s3Key` est déjà **stocké** en base et lu par les routes de streaming : les
renditions existantes en production conservent leur clé historique sans hash et restent
lisibles — elles adoptent la nouvelle forme au premier re-rendu. Aucune reprise de données, donc
aucun risque de régression sur l'existant.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/audio/services/[id]/stream/[segmentId]` | GET | `audio:listen` (église du culte) | inchangée + paramètre de requête `v` **ignoré** | inchangée |
| `/api/audio/public/[token]/stream/[segmentId]` | GET | jeton de partage | idem | inchangée |

Le paramètre `v` est un pur **casse-cache côté navigateur** : il n'est jamais lu côté serveur et
ne participe à aucune décision. La clé faisant autorité reste `segment.rendition.s3Key`, résolue
en base après les contrôles d'accès existants. Aucun schéma Zod n'est requis pour un paramètre
non lu — l'ajouter donnerait la fausse impression qu'il influence la réponse.

Conséquence voulue : un appelant qui forge un `v` arbitraire n'obtient rien d'autre que le
contenu courant auquel il a déjà droit.

## Services / logique métier

**`src/modules/audio/worker/handlers/render.ts`**
- `getRenditionKey(serviceId, segmentId, sourceHash)` → `audio-services/{serviceId}/renditions/{segmentId}-{sourceHash tronqué}.mp3`.
- Avant l'`upsert` de `AudioRendition`, mémoriser la clé du rendu précédent (`findUnique` sur
  `segmentId`, déjà unique). Après un `upsert` réussi et si l'ancienne clé diffère de la nouvelle,
  supprimer l'ancien objet (`deleteMediaFile`, déjà utilisé par le module audio) en
  **best-effort non bloquant** : un objet orphelin n'empêche aucune écoute, alors qu'un échec de
  nettoyage qui ferait échouer le rendu, si.
- Le pré-chauffage `primeRenditionCache(key, outputPath)` suit naturellement la nouvelle clé.
  Les fichiers de cache disque périmés portent une autre empreinte et partiront par éviction LRU,
  déjà en place — pas de nettoyage à écrire.

**`src/modules/audio/services/public.ts`**
- `PublicAudioSegment` gagne un champ `version: string` (le `sourceHash` du rendu, tronqué de la
  même façon que dans la clé).
- `mapPublishedSegments` le renseigne. C'est **le seul point de mapping** — il alimente déjà à la
  fois `resolvePublicAudioService` (lien public) et `getPublishedServiceForMember`
  (`services/library.ts`, bibliothèque membre), donc les deux chemins d'écoute reçoivent la
  version sans duplication de logique, conformément à la contrainte de la spec.

Aucun événement du bus concerné.

## UI / composants

**`src/components/audio/AudioPlayer.tsx`**
- `AudioPlayerSegment` gagne `version: string`.
- La prop `streamUrl` passe de `(segmentId: string) => string` à
  `(segment: AudioPlayerSegment) => string`. Passer le segment entier plutôt qu'un couple
  `(id, version)` évite d'avoir à retoucher cette signature au prochain besoin, et le seul appel
  (`<audio src={streamUrl(current)}>`) devient trivialement correct.

**`src/app/(auth)/audio/ecouter/[id]/MemberAudioPlayer.tsx`** et
**`src/app/ecouter/[token]/PublicAudioPlayer.tsx`**
- Chacun construit son URL en y ajoutant `?v=${segment.version}`. Les deux pages serveur qui les
  alimentent transmettent déjà les segments issus de `mapPublishedSegments` : le champ arrive
  sans autre changement de plomberie.

Aucun composant `src/components/ui/` créé ni modifié.

## Décisions & alternatives écartées

- **Choix : adresser la clé S3 par le contenu, en plus de versionner l'URL** — *Pourquoi* : le
  seul versionnement d'URL corrigerait le navigateur mais laisserait un défaut plus grave en
  place. Le cache disque est nommé `sha1(s3Key)` ; à clé constante, un fichier périmé y reste
  valide. Il n'est rafraîchi que par `primeRenditionCache`, appelé par le **worker**, qui est un
  process distinct (ADR-0007) : s'il ne partage pas le disque du process web, le cache web sert
  l'ancien contenu **même à un auditeur qui n'a jamais rien mis en cache** — un cas que la spec
  exige explicitement de servir correctement. Adresser la clé par le contenu supprime la
  question au lieu d'ajouter une invalidation à orchestrer.
- **Écarté : ne changer que le `Cache-Control` (raccourcir `max-age`, retirer `immutable`)** —
  *Raison* : on paierait une revalidation sur chaque écoute de chaque auditeur pour un événement
  rare (une correction), c'est-à-dire annuler l'essentiel du bénéfice d'ADR-0008 (l'egress et la
  latence) pour ne traiter que le symptôme. Et cela ne corrigerait pas le cache disque serveur.
- **Écarté : versionner par un `updatedAt` ajouté à `AudioRendition`** — *Raison* : imposerait
  une migration, et un horodatage change même quand le contenu est identique (re-rendu à
  l'identique) — le cache serait invalidé pour rien. `sourceHash` est déjà là, déjà tenu à jour
  par le rendu, et ne change **que** si le contenu source change : c'est la sémantique voulue.
- **Écarté : segment de chemin (`/stream/{segmentId}/{version}`) plutôt qu'un paramètre `v`** —
  *Raison* : imposerait un nouveau segment de route et un `await params` supplémentaire pour une
  valeur que le serveur n'utilise pas. Un paramètre de requête exprime mieux ce qu'il est : une
  donnée de cache, pas une donnée d'adressage.
- **Écarté : conserver les anciens objets S3 après re-rendu** — *Raison* : ils ne sont plus
  jamais référencés (la base ne porte qu'une clé par segment) et s'accumuleraient sans limite,
  facturés. La suppression best-effort les élimine sans jamais mettre un rendu en échec.
- **Choix : mettre à jour ADR-0008 plutôt que d'ouvrir un nouvel ADR** — *Pourquoi* : la décision
  d'architecture (servir depuis un cache disque local, avec en-têtes longs) n'est pas remise en
  cause — c'est une de ses prémisses énoncées qui n'était pas tenue par le code. Un ADR
  supplémentaire laisserait l'affirmation fausse en place dans le document de référence.

## Risques & points d'attention

- **Renditions historiques sans hash** : elles gardent leur clé (stockée en base) et restent
  servies. Leur URL portera un `v` valant leur `sourceHash` existant — le champ est déjà
  renseigné pour tout rendu, y compris ancien. Aucun cas de `version` absente pour une rendition
  existante ; à vérifier tout de même sur les données de production avant déploiement.
- **Le premier re-rendu d'un culte ancien** crée une clé neuve et supprime l'ancienne : les
  auditeurs en cours d'écoute au moment exact de la bascule verront leur requête de plage
  suivante échouer et le lecteur rechargera. Impact jugé négligeable (fenêtre de quelques
  secondes, sur une action manuelle rare).
- **Signature de `streamUrl` modifiée** : changement rompant pour tout futur appelant du lecteur.
  Il n'y en a que deux aujourd'hui, tous deux dans ce dépôt et mis à jour ici ; `typecheck` le
  garantit.
- **Limite assumée** : un appareil ayant déjà mis un fichier en cache continuera de le lire après
  dépublication ou révocation d'un lien. Hors périmètre par décision de la spec, avec suivi dédié
  à ouvrir.

## Stratégie de tests

Vitest, ciblant le comportement observable plutôt que l'implémentation :

- **`getRenditionKey` / handler de rendu** : deux `sourceHash` différents produisent deux clés
  différentes pour le même segment ; un même `sourceHash` produit la même clé (idempotence
  préservée, D10). Un re-rendu supprime l'ancien objet S3 ; un rendu identique n'en supprime
  aucun. Un échec de suppression ne fait pas échouer le rendu.
- **`mapPublishedSegments`** : le segment exposé porte une `version` dérivée du `sourceHash` du
  rendu ; deux renditions de `sourceHash` différents donnent deux `version` différentes ; un
  segment sans rendition reste exclu (non-régression).
- **Chaîne membre et publique** : `getPublishedServiceForMember` et `resolvePublicAudioService`
  exposent tous deux la `version` — la garantie « les deux vues ne divergent pas » est ce que la
  spec exige des deux chemins d'écoute.
- **Construction d'URL** : l'URL produite pour un segment change quand sa `version` change, et
  reste identique à version constante (critère « pas de retéléchargement inutile »).

Les routes de streaming ne sont pas retestées : elles ne changent pas, et leurs contrôles
d'accès sont déjà couverts.
