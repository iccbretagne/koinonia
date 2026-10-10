# Spec — Refonte des écrans de traitement des demandes (secrétariat, réseaux sociaux, visuels)

- **Numéro** : 063
- **Statut** : Implémentée
- **Créée le** : 2026-10-10
- **Branche suggérée** : `feat/traitement-demandes`
- **Issue** : #677 — démo : https://claude.ai/artifact/RWSfBZKma23devUyAaqm7t (onglet « Traitement des demandes »)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Le secrétariat traite chaque jour, sur un seul écran, toutes les demandes qui lui sont adressées.
Il y a d'abord les annonces à diffuser en interne, qui demandent parfois en plus un visuel ou une
publication sur les réseaux sociaux. Viennent ensuite les demandes d'ajout, de modification ou
d'annulation d'événement, les demandes de modification de planning et les demandes d'accès.
L'écran n'a pas suivi la refonte du design system et se lit mal dès qu'une dizaine de demandes
s'accumulent.

1. **Une annonce mise « En cours » sort de la file.** Elle passe dans « Traitées » alors qu'elle
   n'est pas terminée. Le secrétariat la perd de vue, et elle peut n'être jamais diffusée.
2. **Rien n'indique l'urgence.** La liste suit l'ordre d'envoi, la plus récente en haut. La
   demande la plus ancienne, souvent la plus pressée, est tout en bas. L'échéance n'est jamais
   affichée : culte où l'annonce doit passer, date de l'événement concerné ou date limite de
   planification.
3. **La liste est trop chargée.** Chaque demande affiche en permanence son texte, un champ de
   note et trois ou quatre boutons, ce qui rend la liste difficile à parcourir.
4. **Les retours passent par des fenêtres du navigateur.** Les erreurs, les confirmations
   d'actions définitives et le rappel « une note est requise pour refuser » s'affichent dans des
   boîtes système, différentes du reste de l'application. Annuler une annonce ne demande aucun
   motif, alors que le demandeur en est prévenu.
5. **Aucune recherche, et l'historique arrive en entier.** Pour retrouver une demande traitée, il
   faut faire défiler tout l'historique, qui est chargé d'un bloc.
6. **Les demandes de modification d'événement n'ont pas de résumé.** On ne voit pas ce qui doit
   changer avant d'approuver.
7. **L'écran sort du design system.** Les icônes sont des emoji, les étiquettes d'état sont faites
   à la main, les boutons de bascule sont trop petits pour un doigt sur mobile, et l'état vide ne
   suit pas le modèle commun.

La communication traite les publications sur les réseaux sociaux demandées avec une annonce. Son
écran « Réseaux sociaux » a la même structure et les mêmes défauts :
- ordre d'envoi plutôt qu'échéance ;
- champ et boutons sur chaque carte ;
- fenêtres du navigateur ;
- aucune recherche ;
- emoji ;
- annulation sans motif.

La production média traite, dans l'onglet « Demandes » de l'activité Visuels, les visuels
demandés avec une annonce ou de façon autonome. Elle a les mêmes défauts. En plus, le formulaire
« Prendre en charge » (rattacher la demande à un projet média existant ou nouveau) s'ouvre au
milieu de la carte. L'urgence n'est signalée que par un badge « Urgent » à moins de 48 h.

Les deux écrans suivent donc le même modèle, dans le même lot, pour que les trois équipes
retrouvent la même façon de travailler.

## Utilisateurs concernés

### Traitement des demandes (secrétariat)

L'accès à l'écran ne change pas. Il est ouvert aux personnes qui gèrent les événements de l'église
(Super Admin, Admin, Secrétaire) et aux membres d'un département portant la fonction
« Secrétariat », quel que soit leur rôle.

- **Personnes qui traitent les demandes** (rôles ci-dessus) : elles consultent, cherchent,
  filtrent, mettent en cours, diffusent, approuvent, refusent ou annulent une demande. Elles
  ajoutent une note ou un motif.
- **Super Admin, Admin, Secrétaire** : ils gardent en plus la suppression définitive d'une demande
  déjà traitée.
- **Demandeurs** (tout rôle qui soumet une annonce ou une demande) : l'écran ne change rien pour
  eux. Ils reçoivent comme aujourd'hui la notification d'approbation ou de refus. Ils reçoivent en
  plus une notification « Demande annulée », avec le motif, quand l'équipe qui traite annule leur
  annonce, leur publication ou leur visuel. Aujourd'hui, aucune notification n'est envoyée dans ce
  cas.

### Réseaux sociaux (communication)

L'accès ne change pas. Il est ouvert aux personnes qui gèrent les événements de l'église (Super
Admin, Admin, Secrétaire) et aux membres d'un département portant la fonction « Communication ».
Ils prennent en charge, marquent publiée (avec le lien du post s'ils l'ont) ou annulent une
demande de publication. Le demandeur reçoit le motif d'une annulation dans sa notification.

### Visuels (production média)

L'accès ne change pas. Il est ouvert aux personnes qui gèrent les événements de l'église (Super
Admin, Admin, Secrétaire) et aux membres d'un département portant la fonction « Production
Média ».
- Ils prennent en charge une demande en la rattachant à un projet média, existant ou créé à
  l'occasion.
- Ils la marquent livrée, avec le projet ou un lien de livraison.
- Ils peuvent aussi l'annuler.

Le demandeur reçoit le motif d'une annulation dans sa notification.

## Comportement attendu

### Scénario principal — traiter la file du jour

1. La Secrétaire ouvre « Traitement des demandes ». Trois onglets s'affichent, chacun avec son
   nombre de demandes : **À traiter**, **En cours** et **Traitées**. « À traiter » est
   sélectionné.
2. La file « À traiter » est triée par échéance, la plus proche en premier. Elle est découpée en
   groupes : **En retard** (échéance passée), **Cette semaine** (échéance dans les 7 prochains
   jours), **Plus tard**, puis **Sans échéance**. Les groupes vides ne s'affichent pas.
3. Chaque ligne tient sur une ou deux lignes de texte. On y voit l'icône et le libellé du type, le
   titre, le demandeur, le département ou le ministère d'origine, l'échéance et son délai
   (« dimanche 12 oct. · dans 2 j », « en retard de 3 j »). Les marqueurs « Urgent » et « Save the
   Date » s'ajoutent quand ils s'appliquent. La ligne ne contient aucun champ ni bouton d'action.
4. La Secrétaire touche une annonce. Un panneau de détail s'ouvre : à droite de la liste sur grand
   écran, en feuille montant du bas sur mobile. Il montre :
   - le texte complet ;
   - les cultes ou la date ciblés ;
   - les suites demandées (visuel, réseaux sociaux), chacune avec son propre état ;
   - un champ de note facultatif ;
   - les actions.
5. L'action principale du type est mise en avant : « Marquer diffusée » pour une annonce. Les
   actions secondaires sont « Mettre en cours » et « Annuler l'annonce ».
6. Elle choisit « Mettre en cours ». Un message bref confirme le changement. L'annonce quitte
   « À traiter », apparaît dans l'onglet « En cours », et les compteurs se mettent à jour.
7. Elle ouvre ensuite une demande d'ajout d'événement. Le panneau résume les données demandées :
   type d'événement, date, départements concernés et récurrence. L'action principale est
   « Approuver », la secondaire « Refuser ». Elle approuve. Un message confirme la décision et la
   demande passe dans « Traitées ».
8. Le lendemain, elle ouvre l'onglet « En cours », retrouve l'annonce et la marque diffusée.

### Scénario — publications réseaux sociaux (communication)

1. Un membre de l'équipe Communication ouvre « Réseaux sociaux ». Il y retrouve les mêmes trois
   onglets avec compteurs (À traiter, En cours, Traitées), la même file triée par échéance et
   regroupée, la même liste compacte et le même panneau de détail.
2. L'échéance d'une publication est le premier culte ciblé encore à venir par l'annonce, sinon sa
   date d'événement.
3. Le panneau montre le texte complet de l'annonce, la date ciblée et l'état du visuel associé
   s'il y en a un, avec un lien vers le visuel livré.
4. Dans « À traiter », l'action principale est « Prendre en charge ». Elle propose « Annuler »
   pendant quelques secondes, comme « Mettre en cours ».
5. Dans « En cours », l'action principale est « Marquer publiée », avec un champ facultatif pour le
   lien du post. Elle propose aussi « Annuler » pendant quelques secondes.
6. « Annuler la publication » exige un motif, comme l'annulation d'une annonce.
7. Une publication marquée publiée avec un lien affiche « Voir le post publié » dans son panneau,
   dans l'onglet « Traitées ».
8. La recherche porte sur le titre, le demandeur et l'origine. Il n'y a pas de pastilles de type,
   puisqu'un seul type arrive sur cet écran.

### Scénario — demandes de visuels (production média)

1. Un membre de l'équipe Production Média ouvre l'onglet « Demandes » de Visuels. Il y retrouve
   le même modèle : trois onglets avec compteurs, file triée par échéance et regroupée, liste
   compacte, panneau de détail, recherche.
2. L'échéance d'un visuel est la date limite indiquée par le demandeur. À défaut, c'est le premier
   culte ciblé encore à venir par l'annonce associée, sinon sa date d'événement. Le badge
   automatique « Urgent » à moins de 48 h disparaît : le groupe « En retard » et le délai relatif
   (« dans 1 j ») le remplacent.
3. La ligne indique le format demandé. Elle signale aussi « Sans annonce » pour une demande de
   visuel autonome.
4. Le panneau montre :
   - le brief complet ;
   - le format ;
   - la date limite ;
   - l'annonce associée, avec le canal pour lequel le visuel est demandé (diffusion interne ou
     réseaux sociaux) ;
   - une fois la demande prise en charge, le projet média rattaché, avec un lien pour l'ouvrir et,
     s'il existe, un lien de téléchargement.
5. Dans « À traiter », l'action principale est « Prendre en charge ». Elle déplie dans le panneau
   le choix du projet : un projet existant, ou un nouveau projet à nommer. Le nom est obligatoire
   et le bouton de confirmation reste inactif tant qu'il manque.
6. Dans « En cours », l'action principale est « Marquer livré ». Si aucun projet n'est rattaché,
   le panneau propose un champ facultatif pour le lien de livraison (Canva, Drive…).
7. « Annuler la demande » exige un motif.
8. La recherche porte sur le titre, le demandeur et l'origine. Il n'y a pas de pastilles de type,
   puisqu'un seul type arrive sur cet écran.
9. Les onglets internes de Visuels (« Projets » et « Demandes ») restent en place. Seul le
   contenu de l'onglet « Demandes » change.

### Scénarios alternatifs / cas limites

Sauf mention contraire, ces cas valent pour les trois écrans.

- **Refus ou annulation avec motif obligatoire.** « Refuser » une demande ou « Annuler l'annonce »
  ne s'exécute pas tout de suite. Une zone de motif apparaît dans le panneau, et le bouton de
  confirmation reste inactif tant que le motif est vide. Le demandeur reçoit ce motif dans sa
  notification. Aucune fenêtre du navigateur ne s'ouvre.
- **Annulation d'une annonce qui a des suites.** Annuler une annonce annule aussi ses suites
  (visuel, réseaux sociaux), comme aujourd'hui. La confirmation l'indique explicitement avant de
  valider, par exemple « Le visuel et la publication réseaux sociaux demandés seront aussi
  annulés ».
- **Revenir sur une décision.** Après « Mettre en cours », « Prendre en charge » ou un marquage
  « diffusée », « publiée » ou « livré », le message de
  confirmation propose « Annuler » pendant quelques secondes. Ces gestes ne déclenchent rien
  d'autre qu'un changement d'état. « Annuler » ramène la demande à son état précédent et dans son
  onglet d'origine. Une approbation, un refus ou une annulation d'annonce produisent leurs effets
  tout de suite et ne proposent pas « Annuler » : le refus et l'annulation passent par le motif
  obligatoire, et l'approbation par un bouton explicite dans le panneau. Le message ne propose
  « Annuler » que si personne n'a modifié la demande entre-temps. Si quelqu'un l'a fait, le retour
  arrière est refusé avec un message explicite.
  Sur Visuels, « Annuler » est proposé après une prise en charge rattachée à un projet existant :
  la demande revient « À traiter » et perd son rattachement. Il n'est pas proposé quand la prise
  en charge a créé un nouveau projet, car ce projet a été créé dans la bibliothèque et n'est pas
  supprimé automatiquement.
- **Échéance selon le type.** Une demande sans date applicable va dans « Sans échéance ».
  - Annonce : le premier culte ciblé encore à venir, sinon sa date d'événement.
  - Ajout, modification ou annulation d'événement : la date de l'événement concerné.
  - Modification de planning : la date limite de planification de l'événement, sinon sa date.
  - Demande d'accès : pas d'échéance.
- **Plusieurs demandes à la même échéance.** Elles sont départagées par ancienneté, la plus
  ancienne en premier.
- **Demande en erreur.** Une demande approuvée mais dont l'exécution a échoué est rangée dans
  « Traitées ». Elle y porte un état « Erreur » bien visible, et son panneau montre le message
  d'erreur.
- **Onglet « Traitées ».** Il affiche par défaut les 30 derniers jours, les plus récentes en
  premier. Un bouton « Voir plus » charge les 30 demandes traitées suivantes, plus anciennes. Le compteur de l'onglet compte
  les demandes de ces 30 jours.
- **Recherche.** Un champ cherche dans le titre, le nom du demandeur et le département ou le
  ministère d'origine. Il agit sur l'onglet affiché. Dans « Traitées », il cherche aussi au-delà
  des 30 jours.
- **Filtres par type.** Une rangée de pastilles filtre l'onglet affiché : Tout, Annonces,
  Événements (ajout, modification, annulation), Planning, Accès. Recherche et filtre se
  combinent.
- **Aucun résultat.** Un onglet vide affiche un état vide adapté : « Rien à traiter », « Aucune
  demande en cours », ou « Aucun résultat » avec un lien pour effacer la recherche et les filtres.
- **Erreur d'enregistrement.** Si une action échoue, un message d'erreur s'affiche et la demande
  garde son état ; rien n'est perdu.
- **Demande modifiée ou traitée par quelqu'un d'autre entre-temps.** L'action est refusée avec un
  message explicite et la liste se rafraîchit.
- **Suppression définitive** (Super Admin, Admin, Secrétaire, demande déjà traitée). Elle se fait
  depuis le panneau, après une confirmation dans l'application qui nomme la demande.
- **Mobile.** Les onglets, les pastilles, les lignes et les actions offrent une cible d'au moins
  44 px. La feuille du bas se ferme par glissement ou par un bouton « Fermer ». Le motif et la note
  restent visibles au-dessus du clavier.
- **Le compteur du titre** (les trois écrans). Le badge à côté du titre de la page compte les demandes « À traiter »,
  qu'elles soient en attente ou non encore prises en charge. Il ne compte plus seulement les
  demandes en attente.

## Critères d'acceptation

- [x] Une annonce mise « En cours » apparaît dans l'onglet « En cours » et plus dans « À
      traiter » ni « Traitées ».
- [x] Les trois onglets affichent chacun leur compteur, et les compteurs se mettent à jour après
      chaque action sans recharger la page.
- [x] La file « À traiter » est triée par échéance croissante, puis par ancienneté. Elle est
      regroupée en « En retard », « Cette semaine », « Plus tard » et « Sans échéance », et les
      groupes vides sont masqués.
- [x] L'échéance et son délai relatif s'affichent sur chaque ligne qui en a une, avec la règle par
      type décrite plus haut.
- [x] Les lignes de la liste ne contiennent ni champ de saisie ni bouton d'action. Les actions ne
      sont accessibles que dans le panneau de détail.
- [x] Le panneau s'affiche à côté de la liste sur grand écran et en feuille du bas sur mobile.
- [x] Le panneau montre le texte complet, le résumé des données, les suites demandées avec leur
      état, la note ou le motif déjà saisis et, le cas échéant, l'erreur d'exécution.
- [x] Une demande de modification d'événement affiche un résumé de ce qui change.
- [x] Chaque type a une seule action principale (« Marquer diffusée » ou « Approuver ») ; les
      autres actions sont secondaires.
- [x] Refuser une demande ou annuler une annonce exige un motif saisi dans l'interface, et ce
      motif figure dans la notification du demandeur.
- [x] L'écran n'utilise plus aucune fenêtre du navigateur (alerte ou confirmation système) : les
      retours passent par des messages de l'application.
- [x] La recherche filtre l'onglet affiché sur le titre, le demandeur et l'origine. Dans
      « Traitées », elle trouve aussi une demande de plus de 30 jours.
- [x] Les pastilles de type filtrent l'onglet affiché et se combinent avec la recherche.
- [x] « Traitées » n'affiche par défaut que les 30 derniers jours, et « Voir plus » charge les
      30 demandes traitées suivantes.
- [x] Quand l'équipe qui traite annule une demande, le demandeur reçoit une notification
      « Demande annulée » avec le motif.
- [x] L'écran utilise les icônes, étiquettes d'état, onglets, états vides et couleurs du design
      system, sans emoji ni couleur codée en dur.
- [x] Sur un écran de 360 px de large, il n'y a pas de défilement horizontal, et chaque cible
      interactive mesure au moins 44 px.
- [x] Après « Mettre en cours », « Prendre en charge », « Marquer diffusée », « Marquer
      publiée » ou « Marquer livré », le message de confirmation propose « Annuler », qui ramène la demande à son état
      précédent. Il ne le propose jamais après une approbation, un refus ou une annulation.
- [x] L'écran « Réseaux sociaux » suit le même modèle : onglets et compteurs, file par échéance
      regroupée, liste compacte, panneau, recherche, motif d'annulation obligatoire, plus aucune
      fenêtre du navigateur, cibles de 44 px. Il n'a pas de pastilles de type.
- [x] Sur « Réseaux sociaux », le lien facultatif du post se saisit dans le panneau au moment de
      « Marquer publiée » et reste consultable ensuite.
- [x] L'onglet « Demandes » de Visuels suit le même modèle. L'échéance est la date limite du
      brief, sinon celle de l'annonce. La prise en charge choisit un projet existant ou nomme un
      nouveau projet dans le panneau. « Marquer livré » accepte un lien de livraison facultatif
      quand aucun projet n'est rattaché, et l'annulation exige un motif. Il n'y a pas de pastilles
      de type.
- [x] Sur Visuels, « Annuler » après une prise en charge n'est proposé que si elle a rattaché un
      projet existant.
- [x] Les règles d'accès, les transitions d'état permises et les effets d'une approbation sont
      inchangés, à deux exceptions près : le motif est désormais obligatoire pour annuler une annonce,
      une publication ou un visuel, et un changement d'état sans effet peut être annulé pour revenir à l'état précédent.

## Hors périmètre

- L'onglet « Projets » de Visuels (bibliothèque des projets média) et l'écran de détail d'un
  projet.
- L'écran « Mes demandes » côté demandeur, ainsi que le formulaire de soumission.
- Toute nouvelle règle d'accès, tout nouvel état de demande, et toute notification autre que
  « Demande annulée ». Celle-ci reste dans la catégorie « Demandes » existante, sans nouvelle
  préférence.
- L'attribution d'une demande à une personne précise du secrétariat (« pris en charge par »).
- Le traitement groupé de plusieurs demandes à la fois.
- La refonte de l'écran « Offres » (#678).

## Questions tranchées

- **Q1 — Revenir sur une décision** : « Annuler » est proposé seulement pour les changements
  d'état sans effet (mise en cours, prise en charge, marquage diffusée, publiée ou livrée). Approuver,
  refuser et annuler restent définitifs ; refuser et annuler exigent un motif.
- **Q2 — Écrans « Réseaux sociaux » et « Visuels »** : ils sont traités dans le même lot, à la
  demande de l'utilisateur. Pour Visuels, seul l'onglet « Demandes » est concerné.
- **Q3 — Notification d'annulation** : ajoutée (« Demande annulée », avec le motif), validée par
  l'utilisateur.
- **Q4 — « Voir plus »** : charge les 30 demandes traitées suivantes, plutôt qu'une période de
  30 jours, validé par l'utilisateur.
