# Spec — Harmonisation et ergonomie du module Absences

- **Numéro** : 012
- **Statut** : Implémentée
- **Créée le** : 2026-07-29
- **Branche suggérée** : `feat/harmonisation-ergonomie-absences`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Le module de gestion des absences des STAR a été livré (spec 007) avec un périmètre volontairement
restreint. Depuis, la fonctionnalité de réservation des salles a fait l'objet de plusieurs passes
d'harmonisation (couleurs de boutons cohérentes, filtres/tri sur chaque vue, ergonomie mobile
vérifiée). Le module Absences n'a pas bénéficié du même traitement et présente aujourd'hui des
écarts :

- Les couleurs/styles des actions ne sont pas garanties cohérentes avec le reste de l'application
  ni entre les différentes vues du module lui-même.
- La vue d'ensemble des absences ne permet pas de trier les résultats, de rechercher un membre par
  nom, de filtrer par statut (impossible de retrouver une absence annulée, donc pas d'historique
  consultable) ni de filtrer sur une période précise — alors que le volume de données peut devenir
  important pour une église avec beaucoup de STAR et d'absences déclarées dans la durée.
- Un même indicateur (le signal de conflit entre une absence et une affectation planifiée) est
  présenté différemment selon l'endroit où on le consulte, ce qui peut créer de la confusion.
- Rien ne garantit que les contrôles de filtrage s'affichent correctement sur mobile (empilement,
  lisibilité, zones de clic).

Cette spec vise à aligner le module Absences sur le niveau d'ergonomie et de cohérence déjà atteint
sur le module Salles, sans changer les règles métier de gestion des absences elles-mêmes.

## Utilisateurs concernés

- **STAR** : déclare et consulte ses propres absences.
- **Resp. département** : consulte et déclare des absences pour les STAR de son département,
  consulte la vue d'ensemble de son périmètre.
- **Ministre** : consulte la vue d'ensemble de son ministère.
- **Admin / Secrétaire / Super Admin** : consultent et gèrent les absences sur l'ensemble de
  l'église.

Ces rôles ne changent pas par rapport à l'existant ; seule l'ergonomie des écrans qu'ils utilisent
déjà est concernée.

## Comportement attendu

### Scénario principal

1. Un responsable ouvre la vue d'ensemble des absences de son périmètre.
2. Il recherche une absence par le nom du membre concerné.
3. Il filtre pour ne voir que les absences en cours (ou, au contraire, inclut les absences
   annulées pour consulter l'historique).
4. Il restreint l'affichage à une période donnée (par exemple les absences à venir sur le mois).
5. Il trie les résultats (par exemple par date de début, la plus proche en premier).
6. Sur chaque écran du module, les actions proposées (déclarer, annuler, fermer une fenêtre) sont
   présentées avec une couleur/un style cohérent avec leur nature (action de création, action
   destructive, action neutre), et cette cohérence est la même que celle du reste de l'application.
7. Le même signal de conflit entre une absence et une affectation planifiée est présenté de façon
   identique partout où il apparaît.
8. Sur mobile, tous les contrôles de recherche/filtre/tri restent utilisables : lisibles, bien
   empilés, sans chevauchement ni débordement horizontal.

### Scénarios alternatifs / cas limites

- **Si** aucune absence ne correspond aux filtres choisis **alors** un message clair l'indique
  (pas de tableau vide sans explication).
- **Si** un utilisateur n'a pas la permission de gérer les absences des autres **alors** il ne voit
  ni les filtres ni les actions de gestion réservés à ce périmètre (comportement déjà existant, à
  préserver).
- **Si** une absence a été annulée **alors** toute personne ayant accès à la vue d'ensemble doit
  pouvoir la retrouver via le filtre statut, sans que cela alourdisse la vue par défaut (qui reste
  centrée sur les absences actives).
- **Quand** un responsable consulte le planning d'un événement/département et voit un signal
  d'absence sur un membre, il doit pouvoir cliquer dessus pour accéder directement au détail de
  cette absence (plutôt que de devoir la rechercher manuellement dans la vue d'ensemble).

## Critères d'acceptation

- [ ] Sur la vue d'ensemble des absences, un utilisateur peut rechercher par nom de membre.
- [ ] Sur la vue d'ensemble des absences, un utilisateur peut filtrer par statut (actives
      uniquement par défaut ; option pour inclure/afficher les absences annulées).
- [ ] Sur la vue d'ensemble des absences, un utilisateur peut filtrer sur une période (date de
      début et/ou de fin).
- [ ] Sur la vue d'ensemble des absences, un utilisateur peut trier les résultats selon au moins
      un critère pertinent (ex. date).
- [ ] Toutes les actions du module (déclarer, annuler une absence, fermer une fenêtre de saisie)
      utilisent un style/couleur cohérent avec leur nature et avec les conventions déjà en place
      ailleurs dans l'application.
- [ ] Le signal de conflit entre une absence et une affectation planifiée est présenté de la même
      façon dans toutes les vues où il apparaît.
- [ ] Sur un écran de taille mobile, les contrôles de recherche/filtre/tri de chaque vue concernée
      s'affichent correctement (pas de chevauchement, pas de débordement horizontal, contrôles
      empilés lisiblement).
- [ ] Le filtre statut de la vue d'ensemble permet à toute personne y ayant accès de faire
      apparaître les absences annulées (historique), sans que celles-ci soient affichées par
      défaut.
- [ ] Depuis le planning d'un événement/département, cliquer sur le signal d'absence d'un membre
      amène au détail de l'absence correspondante.
- [ ] La vue « Mes absences » n'est pas modifiée dans son fonctionnement (pas de nouveaux
      contrôles de recherche/filtre/tri) au-delà de l'harmonisation visuelle des actions déjà
      couverte par les critères ci-dessus.
- [ ] Aucune règle métier existante (permissions, périmètre de visibilité, workflow de
      déclaration/annulation) n'est modifiée par cette feature.

## Hors périmètre

- Ajout d'un workflow d'approbation des absences (toujours hors périmètre, comme en spec 007).
- Ajout de la récurrence des absences.
- Édition d'une absence existante après sa création (seule l'annulation existe).
- Pagination ou choix technique de rendu — seul le comportement observable (pouvoir filtrer/trier/
  rechercher, voir des contrôles utilisables sur mobile) est spécifié ici.
- Toute nouvelle permission ou tout nouveau rôle.

## Questions ouvertes

Aucune question bloquante restante — décisions validées avec l'utilisateur :
- La vue « Mes absences » n'est pas étendue avec de nouveaux contrôles de filtre/tri.
- L'historique des absences annulées est accessible à toute personne ayant accès à la vue
  d'ensemble (via le filtre statut), pas seulement aux gestionnaires.
- Le signal de conflit sur le planning devient cliquable et mène au détail de l'absence.
