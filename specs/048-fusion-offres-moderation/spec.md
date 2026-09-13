# Spec — Fusion de la modération des offres dans l'écran « Offres »

- **Numéro** : 048
- **Statut** : Implémentée
- **Créée le** : 2026-09-13
- **Branche suggérée** : `feat/fusion-offres-moderation`
- **Issue** : #553

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La section Ressources propose aujourd'hui deux liens distincts pour le module Emploi : « Offres »,
ouvert à tous, et « Modération offres », réservé aux profils habilités à modérer. Les deux écrans
présentent les mêmes quatre catégories de contenu (offres d'emploi, profils de recherche, missions
freelance, profils freelance) — le second ajoute simplement la visibilité sur les éléments retirés
de la vue publique et la possibilité de les publier/retirer.

Pour une personne habilitée à modérer, cette séparation en deux écrans oblige à naviguer entre
deux endroits pour une même activité : consulter une offre en tant qu'utilisateur, puis basculer
sur l'autre écran pour la retirer si besoin. Elle duplique aussi la maintenance : toute évolution
de l'affichage d'une catégorie doit être répercutée aux deux endroits.

## Utilisateurs concernés

- **Super Admin / Admin / Secrétaire** (habilités à modérer) : voient et utilisent un seul écran
  « Offres », qui expose en plus les actions de modération (publier/retirer, voir les éléments
  retirés) directement au fil de la consultation normale.
- **Tous les autres rôles** (consultation/dépôt d'offres, de recherches d'emploi ou de missions
  freelance) : ne voient aucun changement — l'écran « Offres » se comporte exactement comme
  aujourd'hui, sans les actions de modération.

## Comportement attendu

### Scénario principal

1. Une personne habilitée à modérer ouvre l'écran « Offres ».
2. Elle y retrouve le même contenu que n'importe quel autre utilisateur — les offres, recherches
   et missions actuellement visibles publiquement — mais chaque élément affiche en plus une action
   de modération (retirer / republier) directement accessible.
3. Elle peut aussi consulter les éléments qui ne sont plus visibles publiquement (retirés), ce que
   la vue standard ne montre pas.
4. Elle effectue une action de modération (par exemple retirer une offre) sans quitter l'écran
   « Offres » : l'effet est immédiat et visible sur place.

### Scénarios alternatifs / cas limites

- **Personne non habilitée à modérer** : ouvre « Offres » et voit exactement le contenu publié
  actif, sans aucune action de modération ni accès aux éléments retirés — comportement identique
  à aujourd'hui.
- **Lien direct vers l'ancien écran de modération** : une personne qui accède par un ancien lien
  ou favori vers l'écran de modération retrouve son activité de modération dans l'écran « Offres »
  (redirection), plutôt qu'une page introuvable.
- **Bascule de rôle en cours de session** : si le droit de modération est retiré à une personne
  pendant qu'elle consulte « Offres », les actions de modération cessent d'être proposées à son
  prochain chargement de l'écran (pas nécessairement en temps réel dans l'onglet déjà ouvert).

## Critères d'acceptation

- [x] Le lien « Modération offres » n'existe plus dans la navigation ; un seul lien « Offres »
      subsiste pour l'ensemble des rôles.
- [x] Une personne habilitée à modérer voit, dans l'écran « Offres », les actions de modération
      (retirer/republier) sur chacune des quatre catégories (offres, recherches d'emploi,
      missions freelance, profils freelance).
- [x] Une personne habilitée à modérer peut, depuis l'écran « Offres », consulter les éléments
      retirés de la vue publique pour chaque catégorie.
- [x] Une personne non habilitée à modérer ne voit aucune action de modération ni aucun élément
      retiré dans l'écran « Offres » — l'écran se comporte à l'identique d'avant cette fonctionnalité.
- [x] Un ancien lien vers l'écran de modération redirige vers l'écran « Offres » plutôt que
      d'afficher une erreur.

## Hors périmètre

- Introduire un nouveau statut ou workflow d'approbation (par ex. validation avant publication) —
  la fusion ne change pas les statuts existants ni qui peut les changer.
- Étendre le droit de modération à un rôle qui ne l'a pas aujourd'hui.
- Revoir l'ergonomie générale de l'écran « Offres » au-delà de l'intégration des actions de
  modération (mise en page, filtres, tri…).

## Questions ouvertes

Tranchées le 2026-09-13 :

- **Ancien lien** : redirection silencieuse de l'ancien écran de modération vers « Offres »,
  sans message intermédiaire.
- **Éléments retirés** : un filtre dédié dans l'écran « Offres » (à côté des filtres de statut
  déjà présents pour la personne habilitée), pas mélangés à la liste active.
