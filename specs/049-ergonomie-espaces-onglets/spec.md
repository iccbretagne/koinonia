# Spec — Ergonomie des espaces à onglets et rangement Photos / Visuels

- **Numéro** : 049
- **Statut** : Implémentée
- **Créée le** : 2026-09-13
- **Branche suggérée** : `feat/ergonomie-espaces-onglets`
- **Issues** : #555, #556

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Remonté après la release v1.23.0 : plusieurs espaces regroupent leur contenu derrière des
onglets, chacun avec sa propre mécanique.

- **Audio** : un lien « Audio », onglets (re)Écouter / Production / Paramètres selon le rôle.
- **Communication & Production** : un lien unique, jusqu'à cinq onglets selon le rôle — Demandes
  visuels, Demandes réseaux sociaux, Projets, Événements médias, Collections.
- **Offres** : un écran unique depuis la spec 048.

Le retour utilisateur : ce système n'est pas *user friendly*.

1. **Position instable** : les onglets visibles varient selon les droits et chaque espace les
   présente à sa manière ; un contenu n'est pas « au même endroit » d'un utilisateur ou d'un
   espace à l'autre.
2. **Point d'entrée opaque** : un lien de menu unique ne dit rien de ce qu'il y a derrière.
3. **Libellés qui ne disent pas le métier**. Derrière les onglets médias, il y a en réalité deux
   activités distinctes et un outil :
   - **« Événements médias »** = la gestion des **photos** d'événements : dépôt des photos d'un
     culte ou d'un événement, validation, partage ;
   - **« Projets »** = la gestion des **visuels** : dépôt des visuels, validation, partage ;
   - **« Collections »** = un lien de partage regroupant des photos et/ou des visuels existants.

   Aucun de ces libellés ne dit « photos » ou « visuels » : l'utilisateur ne sait pas où aller.
4. **Une seule équipe pour deux métiers** : aujourd'hui, seul le département Production Média
   gère à la fois photos et visuels. Or dans une église, ces deux activités peuvent être portées
   par **deux départements différents** (une équipe photo, une équipe graphisme). Il n'existe
   aucun moyen de confier les photos à une équipe et les visuels à une autre, comme on le fait
   déjà pour d'autres activités via les fonctions de département.

Les trois espaces sont traités d'un bloc, sinon leurs mécaniques continueront de diverger.

## Utilisateurs concernés

- **Admin d'église** (configuration des fonctions de département) : désigne le ou les
  départements qui gèrent les photos, et celui ou ceux qui gèrent les visuels.
- **Équipe Photos** (département portant la fonction de gestion des photos) : dépose, valide et
  partage les photos d'événements.
- **Équipe Visuels / Production Média** (département portant la fonction Production Média) :
  traite les demandes de visuels, dépose, valide et partage les visuels.
- **Équipe Communication** : consulte photos et visuels, traite les demandes réseaux sociaux,
  crée des liens de partage — sans changement de ses droits.
- **Super Admin / Admin / Secrétaire** : accès inchangés sur les deux activités.
- **Tous les rôles ayant accès à Audio** : bénéficient de l'alignement de la navigation.

## Comportement attendu

### Scénario principal — configuration des équipes

1. Un admin d'église ouvre la configuration des fonctions de département.
2. Il y trouve une fonction dédiée à la **gestion des photos**, distincte de **Production Média**
   (qui garde les visuels et les demandes de visuels).
3. Il l'attribue au département « Photo » de son église. Production Média reste attribuée au
   département « Graphisme ».
4. Dès lors, les membres du département Photo gèrent les photos (dépôt, validation, partage) sans
   accès à la gestion des visuels ; les membres de Graphisme gèrent les visuels sans accès à la
   gestion des photos.

### Scénario principal — accueil de l'espace

1. Dans le menu (desktop et mobile), l'utilisateur clique sur **Communication & Production**.
2. Il arrive sur une **page d'accueil de l'espace** : une carte par activité à laquelle il a
   droit — **Photos**, **Visuels**, **Réseaux sociaux** — chacune indiquant l'équipe qui la porte
   et ce qui attend (photos à valider, visuels à valider, demandes en attente).
3. Les cartes sont **filtrées selon ses droits** : une activité à laquelle il n'a pas accès
   n'apparaît pas du tout (ni grisée, ni verrouillée). L'ordre des cartes restantes est fixe.
4. Il ouvre une carte et entre dans l'activité, qui garde une navigation simple.
5. L'espace Audio suit la même mécanique (page d'accueil à cartes filtrées).
6. Offres, qui n'expose qu'une vue, reste un écran simple sans page d'accueil.

### Scénario principal — retrouver et partager

1. Un membre de l'équipe Photos cherche les photos du culte de dimanche dernier : depuis l'accueil
   il ouvre **Photos**, retrouve l'événement par sa date, valide les photos.
2. Il sélectionne un ou plusieurs événements et utilise l'action **Partager une sélection**,
   directement dans Photos, avec les mêmes options qu'aujourd'hui.
3. Un membre de l'équipe Communication veut envoyer à un partenaire les photos d'un événement et
   le visuel de l'annonce associée : l'action de partage lui permet de regrouper les deux.
4. Sur la page d'accueil, un bouton **Partages** indique le nombre de liens de partage actifs et
   ouvre la liste de ces liens (consulter, copier, révoquer selon les droits actuels).

### Scénarios alternatifs / cas limites

- **Église où la gestion des photos n'est attribuée à aucun département** : le département
  Production Média continue de gérer les photos comme aujourd'hui. Aucune église ne perd la
  gestion de ses photos du seul fait de la mise en production.
- **Une seule équipe pour les photos et les visuels** : un département ne porte qu'une fonction.
  L'église laisse la fonction photos non attribuée, et son département Production Média continue
  de gérer les deux, exactement comme aujourd'hui.
- **Plusieurs départements pour une même fonction** : tous gèrent l'activité correspondante, comme
  pour les autres fonctions (spec 046).
- **Membre de l'équipe Photos qui crée un partage** : il ne peut y inclure que des photos ; il ne
  voit pas les visuels qu'il ne gère pas. Symétriquement pour l'équipe Visuels.
- **Rôle avec une seule activité accessible** : pas de page d'accueil à une seule carte, il
  arrive directement sur son contenu.
- **Liste des partages** : ne montre que les liens portant sur des photos et/ou visuels que la
  personne peut consulter ; le nombre affiché compte uniquement ces liens actifs (non expirés,
  non révoqués).
- **Anciens liens ou favoris** vers Projets, Événements médias, Collections, un événement ou un
  projet précis : ils mènent au bon contenu, jamais à une erreur.
- **Liens de partage déjà envoyés** à des destinataires externes : fonctionnent à l'identique.
- **Changement de droits ou de fonction en cours de session** : pris en compte au prochain
  chargement de l'espace.

## Critères d'acceptation

- [ ] Une fonction de département « gestion des photos » existe, attribuable depuis la
      configuration des fonctions, distincte de Production Média.
- [ ] Un membre d'un département portant uniquement la fonction photos peut déposer, valider et
      partager des photos d'événements, et n'a pas accès à la gestion des visuels.
- [ ] Un membre d'un département portant uniquement Production Média peut déposer, valider et
      partager des visuels et traiter les demandes de visuels, et n'a pas accès à la gestion des
      photos.
- [ ] Dans une église où la fonction photos n'est attribuée à aucun département, Production Média
      gère les photos comme avant.
- [ ] Les sections médias portent des libellés métier : « Photos » (ex-Événements médias) et
      « Visuels » (ex-Projets) ; « Collections » est présenté comme du partage.
- [ ] Communication & Production et Audio s'ouvrent sur une page d'accueil à cartes, une par
      activité accessible, avec ce qui attend ; les activités non autorisées n'apparaissent pas.
- [ ] Une personne n'ayant accès qu'à une activité arrive directement sur celle-ci.
- [ ] Le partage multi-sources est une action disponible dans Photos et dans Visuels ; il n'existe
      plus d'onglet « Collections ».
- [ ] La page d'accueil affiche un bouton Partages avec le nombre de liens actifs visibles par la
      personne, ouvrant la liste de ces liens.
- [ ] Offres reste un écran simple, sans onglets ni page d'accueil.
- [ ] Un partage ne propose que les photos et/ou visuels que la personne est habilitée à gérer ou
      consulter.
- [ ] Hors ajout de la fonction photos, aucun rôle ne perd ni ne gagne d'accès (Communication,
      Super Admin, Admin, Secrétaire inchangés).
- [ ] Les anciens liens internes et les liens de partage externes déjà émis continuent de
      fonctionner.

## Hors périmètre

- Fusionner photos et visuels, ou autoriser des photos dans un projet de visuels (et inversement).
- Modifier le circuit de validation des photos et visuels, ou les options d'un lien de partage.
- Router une partie des demandes de visuels vers l'équipe Photos (les demandes de visuels restent
  à Production Média).
- Modifier les permissions de rôle (matrice) : la séparation passe uniquement par les fonctions
  de département.
- La fusion Offres / Modération offres, livrée par la spec 048.

## Questions ouvertes

Tranchées le 2026-09-13 :

- **Périmètre** : #555 et #556 traitées ensemble.
- **Médias** : refonte, pas un simple renommage — deux activités (Photos, Visuels) pouvant être
  portées par deux départements distincts via les fonctions de département.
- **Mécanisme** : une mécanique de navigation commune aux espaces à onglets.
- **Offres** : écran simple, sans onglets.
- **Présentation** : piste C — page d'accueil de l'espace à cartes, filtrées selon les droits.
- **Partage** : action dans Photos et Visuels, plus un bouton Partages sur l'accueil avec le
  nombre de liens actifs.

À trancher pendant le plan :

- Libellés définitifs (« Photos », « Visuels », « Partages » proposés).
- Contenu exact des compteurs de chaque carte Audio.
