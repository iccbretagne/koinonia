# ADR-0005 — Module `audio` distinct de `media`

- **Statut** : Proposé
- **Date** : 2026-08-23

## Contexte

Le module `media` modélise *un fichier, des versions, un statut* : adapté à un
visuel qu'on téléverse, révise, republie. La publication d'un culte enregistré
suit un modèle différent — **une source unique découpée en N intervalles
ordonnés** (louanges, prédication, offrandes...), dont aucun n'existe avant
traitement (probe, alignement, rendu). Voir `specs/019-audio-cultes-publication/design.md`
§3–4 (D1) pour les mesures et le raisonnement complets.

Loger l'audio dans `MediaFile` imposerait des champs nullables spécifiques au
découpage (bornes temporelles, ordre, statut de segment, confiance de
détection) et deux workflows de validation dans le même écran — un pour la
révision d'un visuel, un pour la validation de frontières audio.

## Décision

Créer un module `audio` distinct dans `src/modules/audio`, avec son propre
manifeste (`audio:view`, `audio:upload`, `audio:review`, `audio:manage`) et
son propre jeu de modèles Prisma (`AudioService`, `AudioSource`,
`AudioSegment`, `AudioRendition`, `AudioServiceTemplate`, `AudioJob` — voir
design.md §5). Le module dépend de `modules/storage` (ADR-0006) pour le
stockage S3, pas de `media`.

## Alternatives considérées

- **Étendre `media`** (ajouter un `MediaFileType` audio) — *Écarté* : économise
  une migration aujourd'hui, coûte un modèle ambigu pour toujours (champs
  nullables croisés, deux workflows dans un seul écran).

## Conséquences

- **Positif** : le modèle de données reste fidèle au domaine — une séquence
  est un intervalle sur une source, pas un fichier versionné. Les deux
  workflows (révision de visuel vs. validation de frontières) restent séparés
  dans le code et dans l'UI.
- **Négatif / contrainte** : duplique certains concepts déjà présents dans
  `media` (partage public, jetons) — atténué en partie par le partage du
  primitif cryptographique via `modules/storage` (ADR-0006), mais la table de
  jetons reste propre au module audio plutôt qu'une relation partagée avec
  `MediaShareToken`.

## Références

- `specs/019-audio-cultes-publication/design.md` §3 (mesures), §4 D1, §5
  (modèle de données)
- `specs/019-audio-cultes-publication/spec.md`
