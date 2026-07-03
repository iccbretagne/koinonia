# Tâches — Téléchargement de toutes les photos (même non validées) dans une collection

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches ordonnées et vérifiables. Dépendances : type/helper (module) → API création → API lecture
> → UI → tests. Les tâches `[P]` sont parallélisables (fichiers indépendants).
> **Aucune tâche de migration** : le périmètre est porté par le JSON `CollectionConfig` existant.

## Prérequis

- [x] Branche créée : `feat/collection-toutes-photos`
- [x] ~~Migration Prisma~~ — **sans objet** (pas de changement de `schema.prisma`)

## Tâches

### 1. Type & logique métier (module média)

- [x] **T1** — Ajouter le champ optionnel `includeAllPhotos?: boolean` à l'interface
      `CollectionConfig` *(fichier : `src/modules/media/services/tokens.ts`, ~L23)*
- [x] **T2** — Ajouter le helper pur `collectionPhotoWhere(config): Prisma.MediaPhotoWhereInput`
      retournant `{}` si `includeAllPhotos`, sinon `{ status: "APPROVED" }`
      *(fichier : `src/modules/media/services/tokens.ts`)*
- [x] **T3** — Exporter `collectionPhotoWhere` depuis l'index du module
      *(fichier : `src/modules/media/index.ts`)*

### 2. API — création de collection

- [x] **T4** — Étendre le schéma Zod du body avec `includeAllPhotos: z.boolean().optional()`,
      le propager dans `collectionConfig` transmis à `createMediaShareToken`, et l'inclure dans les
      métadonnées `logAudit` *(fichier : `src/app/api/admin/media/collections/route.ts`)*

### 3. API — lecture / téléchargement (périmètre appliqué)

- [x] **T5** [P] — Listing : remplacer `where: { status: "APPROVED" }` par
      `collectionPhotoWhere(config)` *(fichier : `src/app/api/media/collection/[token]/route.ts`, ~L38)*
- [x] **T6** [P] — ZIP : remplacer `status: "APPROVED"` par l'étalement de
      `collectionPhotoWhere(config)` (en conservant le filtre optionnel `id: { in: body.photoIds }`)
      *(fichier : `src/app/api/media/collection/[token]/zip/route.ts`, ~L49)*
- [x] **T7** [P] — Téléchargement unitaire : remplacer le garde-fou `photo.status !== "APPROVED"`
      par `!config.includeAllPhotos && photo.status !== "APPROVED"` → refus (même code d'erreur
      qu'aujourd'hui) *(fichier : `src/app/api/media/collection/[token]/photo/[photoId]/route.ts`, ~L27)*

### 4. UI

- [x] **T8** [P] — Ajouter l'interrupteur binaire « Photos validées uniquement / Toutes les photos »
      (défaut : validées ; visible si `scope` inclut les photos), inclure `includeAllPhotos` dans le
      payload POST, libellé prévenant que « toutes » diffuse aussi les photos non validées
      *(fichier : `src/app/(auth)/media/collections/CollectionBuilder.tsx`)*
- [x] **T9** [P] — (Optionnel) Afficher le total de photos à côté du nombre de validées par événement
      (ex. « 12 validées / 30 au total ») *(fichier : `src/app/(auth)/media/collections/page.tsx`, ~L20)*
      — Implémentée via `prisma.mediaPhoto.groupBy` (un `_count` Prisma ne peut pas porter deux
      filtres différents sur la même relation).

### 5. Tests

- [x] **T10** — Test unitaire de `collectionPhotoWhere` : `{ status: "APPROVED" }` quand
      `includeAllPhotos` absent/`false` ; `{}` quand `true`
      *(fichier : `src/modules/media/services/__tests__/tokens.test.ts`, alignée sur la convention
      `__tests__/` du dépôt — aucun `*.test.ts` colocalisé n'existe ailleurs dans le repo)*
- [x] **T11** — Test : le schéma/route de création accepte `includeAllPhotos` optionnel et le propage
      dans la config du token, et journalise la valeur (`false` par défaut)
      *(fichier : `src/app/api/admin/media/collections/__tests__/route.test.ts`)*

## Couverture des critères d'acceptation

| Critère (spec) | Tâche(s) |
|---|---|
| Choix « validées / toutes » à la création | T1, T4, T8 |
| Défaut = validées uniquement (pas de régression) | T2, T7, T10 |
| Mode « toutes » = intégralité des statuts | T2, T5, T6 |
| Aucune mention de statut côté destinataire | (aucune modif — vérif visuelle) |
| ZIP = exactement les photos affichées | T5 + T6 (même helper) |
| Téléchargement unitaire d'une non-validée ssi mode « toutes » | T7 |
| Mode « validées » refuse toujours les non-validées | T2, T5, T6, T7 |
| Photos uniquement — visuels/fichiers inchangés | T2 (helper photos seul), vérif T6 |
| Choix journalisé à la création | T4 |

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (voir table ci-dessus)
- [ ] Test manuel : créer une collection « toutes les photos », vérifier vue publique + ZIP +
      téléchargement unitaire d'une photo non validée ; puis une collection « validées » (refus)
      *(non exécuté — pas d'environnement de recette à disposition dans cette session ; couvert par
      les tests unitaires/route)*
- [ ] PR ouverte vers la branche cible *(volontairement pas ouverte — revue demandée avant PR)*
