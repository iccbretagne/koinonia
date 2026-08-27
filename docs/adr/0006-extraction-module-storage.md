# ADR-0006 — Extraction de `modules/storage` hors de `media`

- **Statut** : Proposé
- **Date** : 2026-08-23

## Contexte

`src/modules/media/services/s3.ts` exporte déjà tout ce dont le futur module
`audio` (ADR-0005) a besoin : `createMultipartUpload`, `getSignedPartUrl`,
`getS3ObjectStream`, `getSignedPutUrl`, ainsi que le primitif de jeton utilisé
pour le partage public. Faire dépendre `audio` de `media` uniquement pour
accéder à ces fonctions créerait une dépendance de domaine à domaine sans
justification métier — l'audio n'a aucun besoin des galeries photos, des
visuels ou de leur workflow de révision. Voir
`specs/019-audio-cultes-publication/design.md` §4 (D2).

## Décision

Déplacer `s3.ts` et le primitif de génération/vérification de jeton vers un
nouveau module `src/modules/storage`, sans logique métier propre — uniquement
l'accès S3 (OVH, compatible S3) et les primitifs cryptographiques partagés.
`media` réexporte depuis `storage` pour ne rien casser côté appelants
existants. `audio` importe directement `storage`.

Cette extraction est la phase **P0** du découpage de la feature 019 (design.md
§6) : elle doit être livrée avant tout code du module `audio` proprement dit.

## Alternatives considérées

- **Dupliquer le client S3 dans `audio`** — *Écarté* : deux implémentations du
  même accès S3 à maintenir en parallèle (credentials, multipart, URLs
  signées), avec le risque de divergence au premier correctif de sécurité ou
  de configuration OVH.
- **Faire dépendre `audio` de `media`** — *Écarté* : viole la frontière de
  domaine enforced par `lint:boundaries` sans raison métier ; `audio` n'a pas
  besoin du reste du module `media` (versions, révision, galeries).

## Conséquences

- **Positif** : `media` et `audio` partagent un seul point d'accès au stockage
  S3 et au primitif de jeton, sans dépendance de domaine à domaine.
  L'extraction est mécanique (déplacement de fichier) et ne change pas le
  comportement pour `media`.
- **Négatif / contrainte** : un module `storage` de plus dans
  `src/modules/`, sans manifeste métier propre (pas de permissions, pas
  d'entité) — à documenter comme cas particulier dans `docs/architecture.md`
  si la confusion apparaît avec les autres modules.
- **Point de vigilance** : toute évolution future du client S3 (nouvelle
  méthode, changement de provider) passe par `storage`, jamais par une
  réimplémentation locale dans `media` ou `audio`.

## Références

- `specs/019-audio-cultes-publication/design.md` §4 D2, §6 (phase P0)
- `src/modules/media/services/s3.ts` (code déplacé)
