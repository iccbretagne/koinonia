# Spec — Recentrage de l'espace STAR & agenda hebdomadaire

- **Numéro** : 006
- **Statut** : Implémentée
- **Créée le** : 2026-07-05
- **Branche suggérée** : `feat/star-navigation-evenements`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'espace d'un STAR présente aujourd'hui deux éléments qui ne le concernent pas :

- **« Mes demandes »** : le point d'entrée du workflow de demandes (annonces, visuels, réseaux sociaux). Ce parcours est destiné aux profils qui portent l'organisation d'un service — responsables de département, ministres, secrétariat, administration — pas au simple serviteur.
- **« Réservation de salles »** : un outil d'organisateur (réserver un espace pour une réunion/activité), sans usage pour un STAR sans responsabilité.

Leur présence encombre la navigation du STAR et prête à confusion sur ce qu'on attend réellement de lui.

À l'inverse, un STAR n'a aujourd'hui **aucune visibilité** sur les événements de l'église : il ne voit que ses propres services dans « Mon planning ». Il ne sait pas ce qui se passe dans l'église cette semaine (cultes, réunions, activités), ce qui nuit à son engagement et à sa capacité à s'organiser.

On veut donc **recentrer l'espace STAR** : retirer ce qui ne le concerne pas, et lui offrir un **aperçu hebdomadaire des événements de l'église**.

## Utilisateurs concernés

- **STAR (sans rôle de gestion)** — principal concerné :
  - ne voit plus « Mes demandes » ni « Réservation de salles » ;
  - dispose d'une nouvelle entrée « Événements » donnant l'agenda hebdomadaire de l'église.
- **Utilisateur cumulant STAR + un rôle de gestion** (ex. STAR aussi Responsable de département) :
  - conserve « Mes demandes » et « Réservation de salles » au titre de son rôle de gestion ;
  - bénéficie aussi de la nouvelle entrée « Événements ».
- **Admin, Super Admin, Secrétaire, Ministre, Responsable de département** :
  - « Mes demandes » et « Réservation de salles » restent inchangés pour eux.
- **Faiseur de Disciples, Reporter** : non impactés (ils ne voyaient déjà pas « Mes demandes »).

> Règle directrice : la visibilité de « Mes demandes » et « Réservation de salles » dépend de la détention d'un **rôle de gestion** (Admin, Super Admin, Secrétaire, Ministre, Responsable de département), et non du fait d'être STAR. Un STAR « pur » les perd ; un multi-rôles les garde.

## Comportement attendu

### Scénario principal — un STAR consulte l'agenda de la semaine

1. Un STAR se connecte à Koinonia.
2. Sa navigation ne présente **plus** « Mes demandes » ni « Réservation de salles ».
3. Il voit une **nouvelle entrée « Événements »**.
4. En l'ouvrant, il voit la liste des **événements de l'église de la semaine en cours**, triés chronologiquement, que le STAR y serve ou non.
5. Chaque événement affiche au minimum : son **intitulé**, sa **date**, son **horaire** et son **type**.
6. Il peut naviguer vers la **semaine précédente** et la **semaine suivante** ; l'intitulé de la semaine affichée est clairement indiqué.

### Scénarios alternatifs / cas limites

- **Si la semaine affichée ne contient aucun événement**, un état vide explicite est présenté (« Aucun événement cette semaine »).
- **Quand un utilisateur cumule STAR et un rôle de gestion**, « Mes demandes » et « Réservation de salles » restent visibles, et « Événements » s'ajoute.
- **Quand un STAR revient sur la page**, la semaine en cours est affichée par défaut (le point de départ est toujours « aujourd'hui »).
- **Les événements de l'église uniquement** sont listés : la vue est strictement multi-tenant (jamais d'événement d'une autre église).
- **Un STAR n'a aucune action d'écriture** sur ces événements : consultation seule.

## Critères d'acceptation

- [ ] Un STAR sans rôle de gestion ne voit plus l'entrée « Mes demandes ».
- [ ] Un STAR sans rôle de gestion ne voit plus l'entrée « Réservation de salles ».
- [ ] Les rôles Admin, Super Admin, Secrétaire, Ministre et Responsable de département continuent de voir « Mes demandes ».
- [ ] « Réservation de salles » reste visible pour les rôles de gestion (non-STAR).
- [ ] Un utilisateur cumulant STAR + rôle de gestion continue de voir « Mes demandes » et « Réservation de salles ».
- [ ] Un STAR voit une entrée de navigation « Événements ».
- [ ] Par défaut, « Événements » affiche les événements de l'église de la **semaine en cours**.
- [ ] La liste montre **tous** les événements de l'église pour la semaine, indépendamment du service du STAR.
- [ ] Le STAR peut naviguer vers la semaine précédente puis vers la semaine suivante, et l'intitulé de la semaine se met à jour.
- [ ] Une semaine sans événement affiche un état vide explicite.
- [ ] Chaque événement affiche au minimum intitulé, date, horaire et type.
- [ ] Un STAR ne peut ni créer, ni modifier, ni supprimer un événement depuis cette vue.
- [ ] Aucun événement d'une autre église n'apparaît.

## Hors périmètre

- Aucune création/édition/suppression d'événement par les STAR (lecture seule).
- Pas d'indicateur « je suis en service » sur les événements de la semaine (option retenue : tous les événements, sans surlignage du service — « Mon planning » reste la vue des services).
- Pas de modification des permissions des autres rôles sur « Mes demandes » et « Réservation de salles » au-delà du masquage pour le STAR « pur ».
- Pas de refonte de « Mon planning » : les services du STAR restent où ils sont.
- Pas d'accès à la vue calendrier complète, aux annonces, ni au détail éditable d'un événement.
- Pas de suppression globale de « Réservation de salles » (conservée pour les rôles de gestion).

## Questions ouvertes

- **[À CLARIFIER : définition de la semaine]** — semaine du lundi au dimanche (usage FR) supposée par défaut. À confirmer si un autre découpage est attendu.
- **[À CLARIFIER : informations par événement]** — au-delà d'intitulé / date / horaire / type, faut-il afficher le **lieu** et/ou une indication de durée ? Défaut supposé : afficher le lieu s'il est renseigné.
- **[À CLARIFIER : bornes de navigation]** — la navigation entre semaines est-elle illimitée (passé et futur) ou bornée ? Défaut supposé : illimitée.
