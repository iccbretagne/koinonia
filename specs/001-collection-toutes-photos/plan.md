# Plan technique — Téléchargement de toutes les photos (même non validées) dans une collection

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-07-03

> Ce plan traduit la spec en approche technique conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : les 3 routes `src/app/api/media/collection/**` importent déjà le module via `@/modules/media` (dont le type `CollectionConfig`). Le nouveau helper sera exporté par l'index du module — aucun chemin interne.
- [x] **Sécurité** : la création reste protégée par `requireMediaManageAccess` ; les routes publiques restent régies par la validité du token (`validateMediaShareToken`). Aucune route nouvellement exposée.
- [x] **Permissions** : inchangées (`media:manage` pour créer) — pas de nouvelle permission.
- [x] **Validation Zod** : le body de création (`POST /api/admin/media/collections`) sera étendu d'un champ booléen optionnel validé par Zod.
- [x] **Migration Prisma** : **AUCUNE**. Le périmètre est porté par un champ ajouté à l'objet JSON `CollectionConfig`, stocké dans la colonne `config Json?` existante de `MediaShareToken`. Pas de changement de `schema.prisma`.
- [x] **Enums** : aucun nouvel enum ; on réutilise `MediaPhotoStatus` déjà importé du client généré.
- [x] **UI** : réutilisation des composants existants de `CollectionBuilder.tsx` (mêmes primitives que le reste du formulaire) — pas de nouveau composant UI.

## Approche générale

Le concept « tout télécharger » existe déjà pour un événement unique via le type de token
`MEDIA_ALL` (filtre de statut conditionnel dans `src/app/api/media/download/[token]/zip/route.ts:30-34`).
On applique le **même patron** aux collections, mais **sans nouveau type de token** : on ajoute un
**drapeau booléen** à `CollectionConfig` (le contenu JSON d'un token `COLLECTION`), et on remplace le
filtre `status: "APPROVED"` codé en dur par un **helper unique** partagé entre les trois points de
lecture. Par défaut (drapeau absent/faux), le comportement est strictement identique à aujourd'hui.

## Modèle de données

**Aucune migration.** Extension du type applicatif `CollectionConfig` uniquement.

```ts
// src/modules/media/services/tokens.ts (interface CollectionConfig, ~L23)
export interface CollectionConfig {
  scope: "photos" | "files" | "both";
  eventIds: string[];
  projectIds: string[];
  includeAllPhotos?: boolean; // NOUVEAU — défaut absent = faux = photos validées uniquement
}
```

- Champ **optionnel** → les collections déjà créées (config sans le champ) sont traitées comme
  `false` = « validées uniquement ». **Rétrocompatibilité garantie, zéro régression.**
- Le champ est stocké tel quel dans la colonne JSON `config` existante (`MediaShareToken.config`).

## Services / logique métier

Ajouter dans le module média un helper **pur** qui centralise le filtre de statut photo d'une
collection, pour éviter la triple duplication et garantir la cohérence entre listing, ZIP et
téléchargement unitaire :

```ts
// src/modules/media/services/tokens.ts (ou un petit fichier dédié du module)
import type { Prisma } from "@/generated/prisma/client";

/** Filtre Prisma des photos d'une collection selon son périmètre. */
export function collectionPhotoWhere(config: CollectionConfig): Prisma.MediaPhotoWhereInput {
  return config.includeAllPhotos ? {} : { status: "APPROVED" };
}
```

- Exporté via `src/modules/media/index.ts`.
- **Ne concerne que les photos.** Le filtre des visuels/fichiers (`status in ["APPROVED","FINAL_APPROVED"]`)
  reste inchangé (hors périmètre de la spec).

## API

| Endpoint | Méthode | Permission | Changement |
|---|---|---|---|
| `/api/admin/media/collections` | POST | `media:manage` | Schéma Zod + `includeAllPhotos` dans la config ; journalisation |
| `/api/media/collection/[token]` | GET | token COLLECTION | Filtre photos via `collectionPhotoWhere(config)` |
| `/api/media/collection/[token]/zip` | POST | token COLLECTION | idem (remplace `status: "APPROVED"` L49) |
| `/api/media/collection/[token]/photo/[photoId]` | GET | token COLLECTION | Autorise la photo si elle satisfait `collectionPhotoWhere(config)` (remplace le rejet `status !== "APPROVED"` L27) |

Détails :

1. **Création** — `src/app/api/admin/media/collections/route.ts`
   - Étendre le schéma Zod du body d'un `includeAllPhotos: z.boolean().optional()` (défaut `false`).
   - Le passer dans `collectionConfig` transmis à `createMediaShareToken`.
   - Inclure `includeAllPhotos` dans les métadonnées de `logAudit` (traçabilité — critère d'acceptation).

2. **Listing** — `src/app/api/media/collection/[token]/route.ts:38`
   - Remplacer `where: { status: "APPROVED" }` par `where: collectionPhotoWhere(config)` (fusionné avec un éventuel filtre d'ids déjà présent).

3. **ZIP** — `src/app/api/media/collection/[token]/zip/route.ts:49`
   - Remplacer `status: "APPROVED"` par l'étalement de `collectionPhotoWhere(config)` dans le `where` des photos (en conservant le filtre optionnel `id: { in: body.photoIds }`).

4. **Téléchargement unitaire** — `src/app/api/media/collection/[token]/photo/[photoId]/route.ts:27`
   - Remplacer le garde-fou `if (photo.status !== "APPROVED")` par une vérification équivalente au périmètre : si `!config.includeAllPhotos && photo.status !== "APPROVED"` → refus (404/403 comme aujourd'hui).

## UI / composants

- **`src/app/(auth)/media/collections/CollectionBuilder.tsx`**
  - Ajouter un **interrupteur binaire** « Photos validées uniquement » / « Toutes les photos »
    (défaut : validées uniquement), visible uniquement quand le scope inclut les photos
    (`scope === "photos" | "both"`).
  - Inclure `includeAllPhotos` dans le payload POST vers `/api/admin/media/collections` (L108).
  - Libellé explicite prévenant que « toutes les photos » diffuse aussi les photos non validées.
- **`src/app/(auth)/media/collections/page.tsx`**
  - Le comptage affiché par événement compte aujourd'hui les photos `APPROVED` (L20). Optionnel :
    afficher aussi le **total** (ex. « 12 validées / 30 au total ») pour informer le créateur de ce
    qu'implique « toutes les photos ». Purement informatif — n'affecte pas le périmètre réel.
- **Vue publique** (`src/app/media/c/[token]/CollectionView.tsx`) : **aucune modification** — les
  photos non validées apparaissent sans distinction (décision de la spec).

## Décisions & alternatives écartées

- **Choix** : drapeau `includeAllPhotos` dans `CollectionConfig` (JSON).
  *Pourquoi* : les collections sont pilotées par leur config, pas par leur type ; pas de migration ;
  rétrocompatible.
- **Écarté** : créer un nouveau type de token `COLLECTION_ALL` (sur le modèle `MEDIA/MEDIA_ALL`).
  *Raison* : dupliquerait toute la logique de collection et introduirait un enum + une migration
  pour un simple booléen de périmètre.
- **Choix** : un helper unique `collectionPhotoWhere` partagé par les 3 routes.
  *Raison* : garantit que listing, ZIP et téléchargement unitaire appliquent exactement le même
  périmètre (cohérence = critère d'acceptation) ; logique dans le module (constitution).
- **Écarté** : réutiliser le champ `onlyApproved` (déjà utilisé par les tokens `GALLERY`).
  *Raison* : sémantique et valeur par défaut différentes selon le type → source de confusion ; un
  nom explicite propre aux collections est plus sûr.

## Risques & points d'attention

- **Rétrocompatibilité** : bien traiter `includeAllPhotos` absent comme `false` (collections
  existantes = validées uniquement). Couvert par le champ optionnel + le helper.
- **Cohérence des 3 routes** : le téléchargement unitaire doit refuser une photo hors périmètre même
  si son `photoId` est fourni explicitement — utiliser le même prédicat que le listing/ZIP.
- **Photos sans fichier S3** : certaines photos non validées peuvent avoir un `originalKey` vide
  (cf. incident SharedArrayBuffer passé). Le ZIP les ignore déjà (try/catch autour de
  `getS3ObjectStream`) ; le téléchargement unitaire renverra une erreur S3 gérée par `errorResponse`.
  Comportement acceptable.
- **Exposition externe des photos rejetées** : assumé par la spec (choix explicite du créateur,
  journalisé). Pas de garde-fou supplémentaire demandé.

## Stratégie de tests

- **Unitaire (Vitest)** sur `collectionPhotoWhere` : retourne `{ status: "APPROVED" }` quand
  `includeAllPhotos` est absent/`false`, et `{}` quand `true`. C'est le cœur du comportement.
- **Schéma de création** : vérifier que le body accepte `includeAllPhotos` optionnel et le propage
  dans la config du token créé.
- Vérifier la non-régression du filtre visuels/fichiers (inchangé) via une assertion sur le helper
  photos qui ne touche pas aux fichiers.
