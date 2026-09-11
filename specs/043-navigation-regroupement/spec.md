# Spec — Regroupement et ergonomie de la navigation (retours de recette 039-042)

- **Numéro** : 043
- **Statut** : En revue
- **Créée le** : 2026-09-11
- **Branche suggérée** : `feat/navigation-regroupement`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La recette des specs 039 à 042 (ergonomie de navigation, feuille d'annonces, ouverture/fermeture,
badge offres) a fait remonter de nouveaux retours :

- le menu s'allonge à chaque fonctionnalité ajoutée, et certains libellés prêtent à confusion ;
- sur la page d'un événement, les actions de préparation du culte (ouverture/fermeture, trame des
  annonces) sont reléguées sous le planning ;
- les demandes qu'un utilisateur peut soumettre sont éparpillées : le hub « Mes demandes » ne
  couvre ni le rendez-vous pastoral ni la demande comptable, qui ont chacun leur page ;
- les actions des équipes Communication et Production média sont mélangées dans une liste plate
  de la section Opérations, sans regroupement par équipe.

Sans cette feature, un demandeur doit connaître plusieurs pages selon le type de demande, et les
équipes médias cherchent leurs outils au milieu des autres.

## Utilisateurs concernés

- **STAR** — son menu Événements est regroupé ; la page d'un événement est réorganisée.
- **Admin, Secrétaire, Ministre, Resp. département** — page d'un événement réorganisée ;
  libellés renommés.
- **Tout utilisateur ayant « Mes demandes »** — le rendez-vous pastoral y devient disponible.
- **Admin, Ministre, Resp. département et profils pastoraux** (ceux qui peuvent déjà soumettre une
  demande comptable) — la demande comptable devient disponible et suivable dans « Mes demandes ».
- **Équipe Production média**, **équipe Communication**, et les rôles qui y accèdent déjà par
  leur fonction (Admin, Secrétaire) — nouvel espace unique « Communication & Production ».
- **Comptable** — aucun changement : il traite les demandes comptables là où il le fait
  aujourd'hui.
- **Reporter** — non concerné par la page d'un événement (il n'y a pas accès aujourd'hui, et
  cela ne change pas).

## Comportement attendu

### Scénario 1 — Menu Événements du STAR et renommage

1. Un STAR (sans accès à la gestion des événements) ouvre le menu.
2. Il voit une seule entrée « Événements », dépliable, contenant « Mes événements » (sa vue
   hebdomadaire) et « Trame des annonces » — au lieu de deux liens séparés au premier niveau.
3. Partout dans l'application (menus de tous les rôles, titre de la page de liste, bloc de
   dépôt/consultation sur la page d'un événement), « Feuilles d'annonces » devient
   « Trame des annonces ».

### Scénario 2 — Page d'un événement réorganisée

1. Un utilisateur ouvre la page d'un événement.
2. Juste avant le bloc planning (l'en-tête de l'événement et les effectifs par département), il
   voit un bandeau compact, replié par défaut, qui regroupe les **actions** de préparation :
   désigner l'ouverture/la fermeture, déposer ou consulter la trame des annonces — avec l'état de
   la trame (déposée ou non).
3. Les noms des personnes désignées pour l'ouverture et la fermeture restent affichés dans
   l'en-tête de l'événement, comme aujourd'hui ; le bandeau ne les répète pas.
4. En dépliant le bandeau, il accède au détail habituel sans quitter la page.
5. Le bloc planning reste visible juste en dessous, avec un espacement net entre les deux, sur
   ordinateur comme sur mobile.
6. L'export PNG/PDF du planning est inchangé : le bandeau n'y figure pas.

### Scénario 3 — Rendez-vous pastoral dans « Mes demandes »

1. Un utilisateur ayant « Mes demandes » ouvre le formulaire de nouvelle demande.
2. Il y trouve « Rendez-vous pastoral » parmi les autres types de demande.
3. Sa demande suit exactement le même parcours qu'aujourd'hui (qualification, planification).
4. Le lien de menu séparé « Demande RDV pastoral » disparaît pour tous ceux qui ont
   « Mes demandes ». Le STAR, qui n'a pas « Mes demandes » mais peut demander un RDV pastoral,
   garde ce lien — sans quoi il perdrait cet accès.

### Scénario 4 — Demande comptable dans « Mes demandes »

1. Un Resp. département ouvre le formulaire de nouvelle demande.
2. Il y trouve « Demande comptable » parmi les autres types et la soumet.
3. Il retrouve ensuite cette demande et son statut dans sa liste « Mes demandes », avec ses autres
   demandes.
4. Le Comptable la traite comme aujourd'hui, sans changement pour lui.
5. La page Comptabilité existante reste accessible : les deux points d'entrée coexistent.

### Scénario 5 — Espace « Communication & Production »

1. Un membre de l'équipe Production média ouvre le menu : une seule entrée
   « Communication & Production » remplace les liens médias dispersés.
2. Il y voit les onglets : Demandes visuels, Projets, Événements médias, Collections.
3. Un membre de l'équipe Communication voit : Demandes réseaux sociaux, Projets, Événements médias,
   Collections — sans l'onglet Demandes visuels.
4. Un utilisateur membre des deux équipes, ou un Admin/Secrétaire, voit tous les onglets, chacun
   une seule fois.
5. Le lien « Audio » reste une entrée distincte, inchangée.

### Composition finale de la section Opérations

Selon les droits de chacun : Mes demandes · Traitement des demandes · Comptabilité ·
Communication & Production · Audio.

### Scénarios alternatifs / cas limites

- **Si** un STAR reçoit l'accès complet aux événements, **alors** son menu passe au comportement
  standard (accordéon Événements avec toutes les sous-entrées).
- **Si** ni ouverture/fermeture ni trame ne concernent l'utilisateur (aucune action possible, trame
  non consultable), **alors** le bandeau n'affiche que ce qui le concerne, ou rien du tout.
- **Si** aucune trame n'est déposée, **alors** le bandeau l'indique clairement (« non déposée »).
- **Si** un utilisateur n'a pas le droit de soumettre une demande comptable (Secrétaire,
  par exemple), **alors** le type « Demande comptable » ne lui est pas proposé.
- **Si** le module comptabilité ou agenda pastoral est désactivé sur l'instance, **alors** le type
  de demande correspondant n'est pas proposé.
- **Quand** une demande (comptable ou RDV pastoral) est soumise depuis « Mes demandes », elle suit
  exactement le même traitement (circuit de validation, droits, notifications) que depuis son
  point d'entrée actuel.
- **Si** un utilisateur n'a accès à aucun onglet de « Communication & Production », **alors** il ne
  voit pas l'entrée de menu.
- **Si** un membre de l'équipe Communication ouvre l'onglet Collections, **alors** il dispose des
  mêmes droits que l'équipe Production média **sur les collections uniquement** (création,
  modification, suppression). Ses droits sur les projets, les événements médias, les fichiers et
  les liens de partage restent ceux d'aujourd'hui.
- **Quand** un utilisateur suit un ancien lien (notification, favori) vers une page médias ou
  communication, **alors** il arrive sur l'onglet correspondant du nouvel espace, sans erreur.

## Critères d'acceptation

- [ ] « Feuilles d'annonces » n'apparaît plus nulle part ; remplacé par « Trame des annonces »
      (menus desktop et mobile, titre de page, bloc de la page d'un événement).
- [ ] Un STAR sans accès complet aux événements voit une seule entrée « Événements » contenant
      « Mes événements » et « Trame des annonces ».
- [ ] Sur la page d'un événement, un bandeau compact replié par défaut, placé avant le bloc
      planning, regroupe les actions d'ouverture/fermeture et de trame des annonces.
- [ ] Les noms d'ouverture/fermeture restent dans l'en-tête de l'événement, sans doublon dans le
      bandeau.
- [ ] Le bloc planning reste immédiatement visible sous le bandeau, avec un espacement net, sur
      desktop et sur mobile.
- [ ] L'export PNG/PDF du planning est identique à aujourd'hui (le bandeau n'y figure pas).
- [ ] Le formulaire de nouvelle demande propose « Rendez-vous pastoral » ; le lien de menu séparé
      « Demande RDV pastoral » n'existe plus pour les utilisateurs qui ont « Mes demandes », et
      reste présent pour le STAR.
- [ ] Le formulaire de nouvelle demande propose « Demande comptable » uniquement aux utilisateurs
      qui ont le droit d'en soumettre.
- [ ] Une demande comptable soumise apparaît avec son statut dans la liste « Mes demandes » de son
      auteur.
- [ ] Une demande comptable ou de RDV pastoral soumise depuis « Mes demandes » suit exactement le
      même traitement que depuis son point d'entrée actuel.
- [ ] La page Comptabilité existante reste accessible et inchangée pour le Comptable.
- [ ] La demande d'intégration familles n'est ni modifiée ni proposée dans « Mes demandes ».
- [ ] Les liens « Visuels », « Communication », « Événements » (médias), « Projets » et
      « Collections » sont remplacés par une seule entrée « Communication & Production ».
- [ ] Chaque utilisateur n'y voit que les onglets auxquels il a droit (Demandes visuels, Demandes
      réseaux sociaux, Projets, Événements médias, Collections), sans doublon.
- [ ] Un membre de l'équipe Communication a les mêmes droits que la Production média sur les
      collections, et aucun droit supplémentaire sur les projets, événements médias, fichiers ou
      liens de partage.
- [ ] Un onglet masqué reste interdit côté serveur : accéder directement à son adresse sans le
      droit correspondant est refusé.
- [ ] Les anciens liens (notifications, favoris) vers les pages médias et communication mènent au
      bon onglet du nouvel espace.
- [ ] Le lien « Audio » reste inchangé et séparé.
- [ ] La section Opérations contient, selon les droits : Mes demandes, Traitement des demandes,
      Comptabilité, Communication & Production, Audio.
- [ ] Le parcours guidé du menu et le guide utilisateur reflètent les nouveaux libellés et le
      nouveau regroupement.
- [ ] Menus desktop et mobile restent strictement cohérents pour chaque changement.

## Hors périmètre

- La demande d'intégration familles : formulaire destiné à un public externe, non touché.
- La réservation de salles : réservation directe en calendrier, pas un circuit de demande.
- L'espace Audio : cité seulement pour justifier qu'il reste séparé ; aucun changement.
- Le traitement des demandes (tableaux de bord Secrétariat, Comptable, Qualification RDV) : seuls
  les points d'entrée côté demandeur changent.
- Toute nouvelle capacité métier, hormis l'élargissement des droits sur les collections à l'équipe
  Communication.
- Le mode pastoral (menu simplifié des profils pastoraux) : inchangé.

## Questions ouvertes

- Ordre des deux parties du bandeau (ouverture/fermeture puis trame, ou l'inverse) : à trancher
  dans `plan.md`, sans impact sur les critères d'acceptation.
- Découpage en livraisons : les 4 volets sont indépendants ; `plan.md` dira s'ils partent en une
  PR ou en plusieurs sous-PR.
