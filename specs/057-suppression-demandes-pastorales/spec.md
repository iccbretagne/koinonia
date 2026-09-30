# Spec — Suppression des demandes du suivi pastoral et de l'intégration

- **Numéro** : 057
- **Statut** : Implémentée
- **Créée le** : 2026-10-01
- **Branche suggérée** : `feat/suppression-demandes`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Les demandes de rendez-vous pastoral, les suivis de nouveaux convertis et les demandes
d'intégration (formulaire « Rejoindre ») ne peuvent aujourd'hui qu'être rejetées ou clôturées.
Aucune ne peut être supprimée. Conséquences :

- **Doublons, tests et envois abusifs** restent visibles indéfiniment dans les listes et faussent
  les statistiques.
- **Demande d'effacement d'une personne** : ces demandes contiennent des données personnelles et
  pastorales sensibles (coordonnées, motif, message). L'église n'a aujourd'hui aucun moyen de les
  effacer quand une personne le demande.

## Utilisateurs concernés

- **Admin, Super Admin** : peuvent supprimer définitivement une demande de rendez-vous pastoral, un
  suivi de nouveau converti ou une demande d'intégration de leur église.
- **Référent soins pastoraux, Secrétaire, équipes Intégration/MSDP, accompagnants** : ne peuvent
  pas supprimer ; ils rejettent ou clôturent comme aujourd'hui.
- **La personne concernée** (sans compte) : n'est pas prévenue de la suppression.

## Comportement attendu

### Scénario principal

1. Un Admin ouvre une demande (rendez-vous pastoral, suivi, ou demande d'intégration).
2. Il voit une action « Supprimer », absente pour les autres rôles.
3. Une confirmation explique que la suppression est définitive et efface les données personnelles
   de la demande et son historique.
4. Après confirmation, la demande disparaît de toutes les listes, tableaux de bord, relances et
   statistiques.
5. L'historique des modifications garde une trace : qui a supprimé, quand, quel type de demande —
   sans le contenu (ni nom, ni coordonnées, ni message).

### Scénarios alternatifs / cas limites

- **Une demande d'intégration a donné naissance à un suivi de nouveau converti ou à une demande
  de rendez-vous pastoral** : la suppression est refusée. Le message indique qu'il faut d'abord
  supprimer le suivi ou le rendez-vous lié.
- **Un rendez-vous pastoral a été orienté vers un suivi** : même règle, suppression refusée tant
  que le suivi existe.
- **Un suivi** peut toujours être supprimé (rien n'en dépend) ; la demande d'origine, elle, reste.
- **La demande est confiée à un accompagnant** : la suppression reste possible ; l'accompagnant
  n'y a simplement plus accès. Il n'est pas notifié.
- **Notifications déjà envoyées** à propos de la demande : elles sont supprimées avec elle (leur
  texte cite la personne). Un lien encore ouvert ailleurs (onglet, favori) mène à un message
  « Cette demande n'existe plus », sans erreur.
- **Rendez-vous déjà planifié** : son entrée dans l'agenda est supprimée avec la demande ; la
  confirmation le signale.
- **Deux Admins suppriment en même temps** : le second reçoit « demande introuvable », sans erreur.
- **Multi-église** : un Admin d'une église ne peut jamais supprimer une demande d'une autre église.

## Critères d'acceptation

- [x] Admin et Super Admin peuvent supprimer chacun des trois types de demande de leur église.
- [x] Aucun autre rôle ne voit l'action, et une tentative directe est refusée.
- [x] La suppression est précédée d'une confirmation explicite.
- [x] Une demande supprimée n'apparaît plus nulle part (listes, relances, statistiques, exports).
- [x] La suppression d'une demande d'intégration ayant un suivi ou un rendez-vous lié, ou d'un
      rendez-vous ayant un suivi lié, est refusée avec un message indiquant la marche à suivre.
- [x] L'historique des modifications trace la suppression sans aucune donnée personnelle.
- [x] Les notifications à propos d'une demande supprimée disparaissent ; un lien vers une
      demande supprimée affiche un message clair.
- [x] Un Admin ne peut pas supprimer une demande d'une autre église.
- [x] L'action est utilisable sur mobile.

## Hors périmètre

- Une corbeille ou une restauration après suppression.
- La suppression en masse.
- La suppression des dossiers « parcours » de l'intégration (déjà possible aujourd'hui).
- L'effacement complet d'une personne dans toute l'application (fiches, planning, discipolat…).
- Une suppression automatique après une durée de conservation.

## Questions ouvertes

- Aucune bloquante. Décisions prises avec le porteur (2026-10-01) : suppression refusée tant qu'un
  suivi lié existe (option B) ; droit porté par des permissions dédiées, réservées à Admin et Super
  Admin. Complément (plan, 2026-10-01) : même refus pour une demande d'intégration ayant créé un
  rendez-vous ; l'entrée d'agenda et les notifications de la demande sont supprimées avec elle.
