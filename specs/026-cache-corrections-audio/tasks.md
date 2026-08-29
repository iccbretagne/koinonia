# Tâches — Prise en compte immédiate des corrections audio malgré le cache navigateur

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `fix/cache-corrections-audio`
- [ ] Migration Prisma générée (si schéma modifié) — **sans objet** : aucun changement de schéma
      (`sourceHash` et `s3Key` existent déjà sur `AudioRendition`)

## Tâches

### 1. Données & migration

*Aucune tâche — voir Prérequis.*

### 2. Logique métier (services)

- [x] **T1** — Adresser la clé de rendition par le contenu : `getRenditionKey(serviceId,
      segmentId, sourceHash)` produit `audio-services/{serviceId}/renditions/{segmentId}-{hash
      tronqué}.mp3`. Extraire la troncature dans une fonction unique réutilisable (même valeur
      pour la clé et pour la version exposée en T3), afin que les deux ne puissent pas diverger.
      *(fichier : `src/modules/audio/worker/handlers/render.ts`)*

- [x] **T2** — Nettoyer l'ancien objet S3 après re-rendu : lire la rendition existante du segment
      avant l'`upsert`, puis, après un `upsert` réussi et **uniquement si la clé a changé**,
      supprimer l'ancienne via `deleteMediaFile`, en best-effort non bloquant (un échec de
      nettoyage ne doit jamais faire échouer le rendu).
      *(fichier : `src/modules/audio/worker/handlers/render.ts`)*

- [x] **T3** — Exposer la version du rendu aux vues d'écoute : ajouter `version: string` à
      `PublicAudioSegment` et le renseigner dans `mapPublishedSegments` à partir du `sourceHash`
      de la rendition, en réutilisant la troncature de T1. Point de mapping unique : alimente à
      la fois `resolvePublicAudioService` et `getPublishedServiceForMember`.
      *(fichier : `src/modules/audio/services/public.ts`)*

### 3. API (route handlers)

*Aucune tâche — les deux routes de streaming sont inchangées. Le paramètre `v` est un casse-cache
navigateur, jamais lu côté serveur (plan § API).*

### 4. UI

- [x] **T4** — Faire porter la version au lecteur : ajouter `version: string` à
      `AudioPlayerSegment` et changer la prop `streamUrl` de `(segmentId: string) => string` en
      `(segment: AudioPlayerSegment) => string` ; adapter l'unique usage `<audio src={…}>`.
      *(fichier : `src/components/audio/AudioPlayer.tsx`)*

- [x] **T5** [P] — Construire l'URL versionnée côté membre : `?v=${segment.version}`.
      *(fichier : `src/app/(auth)/audio/ecouter/[id]/MemberAudioPlayer.tsx`)*

- [x] **T6** [P] — Construire l'URL versionnée côté lien public : `?v=${segment.version}`.
      *(fichier : `src/app/ecouter/[token]/PublicAudioPlayer.tsx`)*

### 5. Tests

- [x] **T7** — Clé de rendition et nettoyage : deux `sourceHash` différents donnent deux clés
      différentes pour le même segment ; un `sourceHash` identique donne la même clé (idempotence
      D10 préservée) ; un re-rendu supprime l'ancien objet S3 ; un rendu à clé inchangée n'en
      supprime aucun ; un échec de `deleteMediaFile` ne fait pas échouer le rendu.
      **Attention** : le mock de `@/modules/storage` de ce fichier n'expose aujourd'hui que
      `downloadFile`/`uploadFile` — y ajouter `deleteMediaFile`.
      *(fichier : `src/modules/audio/worker/handlers/__tests__/render.test.ts`)*

- [x] **T8** [P] — Mapping des segments : `mapPublishedSegments` expose une `version` dérivée du
      `sourceHash` ; deux renditions de `sourceHash` différents donnent deux `version`
      différentes ; un segment sans rendition reste exclu (non-régression).
      *(fichier : `src/modules/audio/services/__tests__/public.test.ts` — à créer)*

- [x] **T9** [P] — Parité des deux chemins d'écoute : `getPublishedServiceForMember` (bibliothèque
      membre) et `resolvePublicAudioService` (lien public) exposent tous deux la `version` pour un
      même culte — les deux vues ne divergent pas.
      *(fichiers : `src/modules/audio/services/__tests__/library.test.ts`,
      `src/modules/audio/services/__tests__/public.test.ts`)*

- [x] **T10** — Construction d'URL côté lecteur : l'URL produite pour un segment change quand sa
      `version` change, et reste identique à version constante (critère « pas de retéléchargement
      inutile »). Couvre les deux constructeurs (membre et public).
      *(fichier : `src/components/audio/__tests__/stream-url.test.ts` — à créer, ou tests
      colocalisés aux deux lecteurs selon ce que permet leur découpage)*

### 6. Documentation

- [x] **T11** — Amender ADR-0008 : sa section « Décision » affirme que la clé de rendition change
      quand le rendu change, ce qui n'était pas tenu par le code. Ajouter une mise à jour datée
      qui constate l'écart, le corrige (clé adressée par contenu) et renvoie à cette spec.
      *(fichier : `docs/adr/0008-cache-disque-renditions-audio.md`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` — **suite complète**, pas seulement les fichiers ajoutés (919/919)
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] Vérifier sur les données de production qu'aucune rendition existante n'a de `sourceHash`
      vide (risque noté au plan § Risques)
- [ ] Ouvrir le **suivi dédié** sur la révocation malgré cache appareil (décision de la spec,
      § Questions ouvertes)
- [ ] PR ouverte vers `main`

## Traçabilité — critères d'acceptation → tâches

| Critère d'acceptation (`spec.md`) | Tâches |
|---|---|
| Correction entendue par un auditeur au cache chaud — espace Audio authentifié | T1, T3, T4, T5, T7, T8, T10 |
| Idem via un lien de partage public | T1, T3, T4, T6, T7, T8, T10 |
| Piste non retouchée toujours servie depuis le cache (pas de retéléchargement) | T1, T10 |
| Première écoute : dernière version servie directement | T1, T2, T7 |
| Corrections successives toutes prises en compte, dans l'ordre | T1, T3, T7, T8 |
