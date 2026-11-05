# Base de connaissances de l'assistant — premier jet

- **Spec** : `./spec.md` (075)
- **Statut** : Générée, à relire
- **Générée le** : 2026-11-05, à partir du guide intégré, de la navigation et des droits par rôle
  de la version en service (v1.33.0 + navette, billetterie, trésorerie)

> Contenu rédigé, pas encore technique : chaque fiche deviendra une entrée de la base
> (`plan.md` décidera du format). À relire par quelqu'un qui connaît l'usage réel de l'église,
> surtout le vocabulaire des questions. Les fiches ne citent aucune donnée de personne.

**Rôles** — Tous = tous les comptes connectés · SA Super Admin · Ad Admin · Sec Secrétaire ·
Min Ministre · RD Resp. département · FD Faiseur de Disciples · Rep Reporter · STAR · RSP
Référent soins pastoraux · Compt Comptable.

**Forme d'une fiche** : *Questions* (la formulation principale puis les façons courantes de la
dire, fautes et mots familiers compris) · *Pour* (rôles qui reçoivent la réponse) · *Réponse*
(étapes) · *Lien* · *Sinon* (réponse aux autres rôles : qui peut le faire, sans aucune donnée).

---

## 1. Prise en main

### KB-001 — Trouver une page ou une personne
- **Questions** : Comment je trouve une page ? · je trouve pas le menu · où est … ? · chercher
  un STAR · rechercher un événement · c'est où ?
- **Pour** : Tous
- **Réponse** : Utilisez la recherche en haut de l'écran (⌘K sur Mac, Ctrl K sur PC, ou la
  loupe sur téléphone). Tapez le nom d'une page, d'un STAR ou d'un événement, puis choisissez
  un résultat. Sur téléphone, le bouton « Plus » de la barre du bas liste tous vos espaces.
- **Lien** : Accueil → `/accueil`

### KB-002 — La page d'accueil
- **Questions** : À quoi sert l'accueil ? · c'est quoi « Aujourd'hui » · page d'accueil ·
  résumé de ma semaine
- **Pour** : Tous
- **Réponse** : « Aujourd'hui » rassemble vos prochains services, les événements à venir, vos
  demandes en attente et des raccourcis vers vos espaces. Elle s'adapte à votre rôle.
- **Lien** : Accueil → `/accueil`

### KB-003 — Lier son compte à sa fiche STAR
- **Questions** : Je vois pas mon planning · « Mon planning » est vide · lier mon compte · ma
  fiche STAR · je suis pas reconnu comme STAR · associer mon compte
- **Pour** : Tous
- **Réponse** : Ouvrez « Mon profil » et demandez la liaison à votre fiche STAR. Une fois la
  liaison validée par l'administration de l'église, « Mon planning », les disponibilités et le
  filtre « Mes disciples » se débloquent.
- **Lien** : Mon profil → `/profile`
- **Sinon** : La validation d'une liaison revient à l'Admin, au Secrétaire ou au Ministre de
  votre ministère.

### KB-004 — Changer le thème (clair, sombre)
- **Questions** : Mode sombre · thème noir · l'écran est trop clair · changer les couleurs
- **Pour** : Tous
- **Réponse** : Dans « Mon profil », choisissez Clair, Sombre ou Système (suit le réglage de
  votre téléphone ou ordinateur).
- **Lien** : Mon profil → `/profile`

### KB-005 — Installer l'application sur le téléphone
- **Questions** : Installer Koinonia · mettre l'appli sur mon téléphone · icône sur l'écran
  d'accueil · télécharger l'application · y a une appli ?
- **Pour** : Tous
- **Réponse** : Ouvrez « Installer l'application » (menu de votre compte, ou carte sur
  l'Accueil). La page reconnaît votre appareil et n'affiche que vos étapes : sur Android et sur
  ordinateur, un bouton installe en un appui ; sur iPhone, suivez les 3 étapes illustrées
  (partager → « Sur l'écran d'accueil »). Le lien se partage aussi sur WhatsApp.
- **Lien** : Installer l'application → `/installer`

### KB-006 — Recevoir les notifications sur le téléphone
- **Questions** : Activer les notifications · je reçois pas les alertes · notif sur mon
  portable · notifications push · le téléphone sonne pas
- **Pour** : Tous
- **Réponse** : Sur iPhone, installez d'abord Koinonia sur l'écran d'accueil (voir
  « Installer l'application »). Puis, dans « Mes notifications », touchez « Activer les
  notifications sur cet appareil » et choisissez domaine par domaine ce qui arrive sur
  l'appareil.
- **Lien** : Mes notifications → `/profile/notifications`

### KB-007 — Choisir les emails reçus
- **Questions** : Trop d'emails · arrêter les mails · je veux plus recevoir d'email ·
  désactiver les emails · régler mes notifications
- **Pour** : Tous
- **Réponse** : Dans « Mes notifications », coupez l'interrupteur général ou réglez domaine par
  domaine (planning, demandes, comptabilité…) les emails et les notifications sur l'appareil.
  Les messages urgents de l'administration arrivent par email dans tous les cas.
- **Lien** : Mes notifications → `/profile/notifications`

### KB-008 — Messages de l'administration (bandeau)
- **Questions** : C'est quoi le bandeau en haut ? · fermer le message · le message revient ·
  message de l'église
- **Pour** : Tous
- **Réponse** : Le bandeau affiche les messages de votre église ou de Koinonia qui vous
  concernent. « Lire » ouvre le message complet ; la croix le ferme sur tous vos appareils. Un
  message urgent reste affiché jusqu'à la fin de sa période.
- **Lien** : Accueil → `/accueil`

### KB-009 — Changer d'église
- **Questions** : Je sers dans deux églises · changer d'église · mauvaise église · voir
  l'autre église
- **Pour** : Tous
- **Réponse** : Si votre compte a des rôles dans plusieurs églises, choisissez l'église dans le
  sélecteur en haut de l'écran (à côté du nom de l'église). Tout ce que vous voyez porte alors
  sur cette église.

### KB-010 — Le guide d'utilisation
- **Questions** : Mode d'emploi · tuto · aide · guide · comment ça marche Koinonia
- **Pour** : Tous
- **Réponse** : Le guide d'utilisation décrit chaque fonction, avec ce que votre rôle peut
  faire.
- **Lien** : Guide d'utilisation → `/guide`

---

## 2. Mon planning et mes services

### KB-020 — Voir quand je sers
- **Questions** : Je sers quand ? · mon planning · mes services · je suis de service quand ·
  quand est-ce que je passe · mon prochain service
- **Pour** : Tous les comptes liés à une fiche STAR (STAR, RD, Min, Sec, Ad, SA)
- **Réponse** : « Mon planning » liste vos services à venir dans tous vos départements, les
  événements d'équipe (répétitions, réunions) et l'agenda de l'église. (Voir aussi la question
  de données « mes services du mois ».)
- **Lien** : Mon planning → `/planning`
- **Sinon** : « Mon planning » demande un compte lié à une fiche STAR (voir KB-003).

### KB-021 — Je ne suis pas disponible un dimanche
- **Questions** : Je suis pas dispo dimanche · je serai pas là · déclarer une absence · je peux
  pas venir · absent ce week-end · pas disponible · indispo
- **Pour** : Tous
- **Réponse** : Ouvrez « Disponibilités » et répondez pour l'événement : Disponible, Si besoin
  ou Pas disponible. Si vous êtes déjà planifié sur ce service, l'écran vous prévient ; après
  confirmation, vous êtes retiré du service et votre responsable choisit un remplaçant.
- **Lien** : Disponibilités → `/disponibilites`

### KB-022 — Absence de plusieurs jours (vacances)
- **Questions** : Je pars en vacances · absent deux semaines · pas là du … au … · période
  d'absence · congés
- **Pour** : Tous
- **Réponse** : Dans « Disponibilités », utilisez « Pas disponible du … au … », avec un
  remplaçant si vous en avez un. Si vous êtes planifié pendant la période, l'écran liste ces
  services avant d'enregistrer, et vous en serez retiré pour que vos responsables vous
  remplacent. Vos périodes à venir restent modifiables sous « Mes périodes
  d'indisponibilité ».
- **Lien** : Disponibilités → `/disponibilites`

### KB-023 — Donner mes disponibilités du mois
- **Questions** : Remplir mes dispos · on me demande mes disponibilités · collecte du mois ·
  date limite des dispos · j'ai pas répondu
- **Pour** : Tous
- **Réponse** : Chaque mois, la collecte s'ouvre avec une date limite. Dans « Disponibilités »,
  répondez pour chaque événement : Disponible, Si besoin ou Pas disponible. Sans réponse après
  la date limite, vous êtes considéré comme indisponible. Si vous servez dans plusieurs
  départements, « Préciser par département » permet de répondre différemment.
- **Lien** : Disponibilités → `/disponibilites`

### KB-024 — Je ne peux plus assurer un service prévu
- **Questions** : Je peux plus venir à mon service · me désister · annuler mon service ·
  quelqu'un pour me remplacer · je suis malade dimanche
- **Pour** : STAR, RD, Min, Ad, SA
- **Réponse** : Dans « Mon planning », touchez « Je ne peux plus » sur le service, avec un
  message si vous voulez. Votre responsable est prévenu tout de suite et choisit un
  remplaçant. Tant que personne n'a été choisi, « Annuler mon désistement » vous rend votre
  place. Passé la date limite de planification, contactez directement votre responsable : ses
  coordonnées s'affichent sur le service.
- **Lien** : Mon planning → `/planning`

### KB-025 — Modifier ou annuler une période d'absence
- **Questions** : Je rentre plus tôt · annuler mon absence · changer mes dates d'absence ·
  finalement je suis là
- **Pour** : Tous
- **Réponse** : Dans « Disponibilités », sous « Mes périodes d'indisponibilité », modifiez ou
  annulez la période. Les services qui n'ont pas encore été pourvus vous sont rendus.
- **Lien** : Disponibilités → `/disponibilites`

### KB-026 — Les événements d'équipe (répétitions, réunions)
- **Questions** : Quand est la répétition ? · réunion du département · formation de l'équipe ·
  événements d'équipe
- **Pour** : Tous les comptes liés à une fiche STAR
- **Réponse** : Les répétitions, réunions et formations de vos départements apparaissent en
  lecture seule dans « Mon planning ».
- **Lien** : Mon planning → `/planning`
- **Sinon** : Les planifier revient au responsable de département ou au Ministre.

### KB-027 — Modifier le planning du département (STAR)
- **Questions** : Changer le planning · me mettre en service · modifier la grille · changer
  qui sert
- **Pour** : STAR
- **Réponse** : Modifier le planning du département revient à votre responsable de
  département ou au Ministre. Vous pouvez de votre côté déclarer une indisponibilité, vous
  désister d'un service avant la date limite (« Je ne peux plus ») ou proposer un remplaçant
  dans une période d'absence.
- **Lien** : Mon planning → `/planning`

### KB-028 — L'agenda de l'église
- **Questions** : Quels sont les événements ? · programme du mois · agenda de l'église ·
  qu'est-ce qui se passe cette semaine · calendrier
- **Pour** : Tous les rôles qui voient le planning ou les événements
- **Réponse** : L'agenda de l'église liste les événements à venir, en liste ou en calendrier
  mensuel, filtrables par type (Culte, Réunion…).
- **Lien** : Agenda de l'église → `/events`

---

## 3. Gérer le planning d'un département

### KB-040 — Faire le planning de mon département
- **Questions** : Faire le planning · planifier mon équipe · mettre les STAR en service ·
  remplir la grille · organiser le service de dimanche
- **Pour** : RD, Min, Ad, SA
- **Réponse** : Ouvrez « Planning », choisissez l'événement et le département, puis changez le
  statut de chaque STAR dans la grille (En service, En service + Debrief, Indisponible,
  Remplaçant). Tout est enregistré automatiquement. Les STAR disponibles apparaissent en
  premier ; placer un STAR indisponible reste possible mais affiche un avertissement.
- **Lien** : Planning → `/dashboard`
- **Sinon** : Le Secrétaire voit la grille en lecture seule ; un STAR passe par ses
  disponibilités (KB-021).

### KB-041 — Voir qui est disponible avant de planifier
- **Questions** : Qui est dispo dimanche ? · voir les disponibilités de l'équipe · qui a
  répondu · relancer ceux qui ont pas répondu
- **Pour** : RD, Min, Ad, SA (Sec en lecture)
- **Réponse** : Dans la grille du planning, chaque STAR affiche sa disponibilité (disponible,
  si besoin, sans réponse, indisponible) et un compteur résume la situation. « Interroger
  l'équipe sur leurs disponibilités » et « Relancer les sans-réponse » (une fois par jour)
  demandent la réponse sans attendre la collecte.
- **Lien** : Planning → `/dashboard`
- **Sinon** : Cette information est réservée aux responsables.

### KB-042 — Remplacer un STAR qui s'est désisté
- **Questions** : Un STAR s'est désisté · trouver un remplaçant · remplacer quelqu'un ·
  service à remplacer
- **Pour** : RD, Min, Ad, SA
- **Réponse** : La notification de désistement ouvre l'écran du service : son message et les
  remplaçants possibles (disponibles d'abord, puis « si besoin »). « Choisir » place le
  remplaçant et prévient le STAR désisté ; « Ne pas remplacer » clôt le désistement. Vous
  pouvez aussi placer quelqu'un depuis la grille, où le service apparaît « À remplacer »,
  jusqu'au début de l'événement.
- **Lien** : Planning → `/dashboard`

### KB-043 — Indisponibilités de mon équipe
- **Questions** : Qui est absent ce mois-ci ? · liste des absences · indisponibilités de
  l'équipe · déclarer une absence pour un STAR · répondre pour un STAR
- **Pour** : RD, Min, Sec, Ad, SA
- **Réponse** : Dans « Disponibilités », l'onglet « Indisponibilités de l'équipe » liste les
  absences à venir de votre périmètre, en tableau ou en frise, avec filtres et export Excel.
  Vous pouvez y déclarer, modifier ou annuler une période pour un STAR ; « Répondre pour… »
  saisit une réponse à sa place.
- **Lien** : Disponibilités → `/disponibilites`
- **Sinon** : Cette information est réservée aux responsables.

### KB-044 — Ouvrir ou régler la collecte des disponibilités
- **Questions** : Ouvrir les dispos du mois prochain · régler la date limite · collecte
  automatique · relance automatique
- **Pour** : Sec, Ad, SA
- **Réponse** : Dans « Disponibilités », l'onglet « Collectes » liste les mois et l'état de leur
  collecte ; « Ouvrir maintenant » ouvre un mois à l'avance et prévient les STAR. « Réglages »
  choisit la collecte automatique, son ouverture, sa clôture et la relance.
- **Lien** : Collectes → `/disponibilites/collectes`
- **Sinon** : Réservé au Secrétaire et à l'administration.

### KB-045 — Les tâches du département (qui fait quoi)
- **Questions** : Qui fait le mixage ? · répartir les tâches · tâches du département · qui fait
  quoi dimanche
- **Pour** : RD, Min, Ad, SA (Sec en lecture)
- **Réponse** : Depuis le planning, la vue « Tâches » définit les tâches récurrentes du
  département (mixage, retours, accueil VIP…) et affecte un STAR à chacune pour un événement.
- **Lien** : Planning → `/dashboard`

### KB-046 — Les consignes du département
- **Questions** : Consignes pour dimanche · tenue · heure d'arrivée · les infos du département
- **Pour** : Tous les comptes liés à une fiche STAR
- **Réponse** : Les consignes de votre département s'affichent avec vos services dans « Mon
  planning ». Les rédiger revient au responsable de département.
- **Lien** : Mon planning → `/planning`

### KB-047 — Planifier une répétition ou une réunion d'équipe
- **Questions** : Créer une répétition · réunion de département · formation de l'équipe ·
  événement interne
- **Pour** : RD, Min, Ad, SA
- **Réponse** : Depuis le planning de votre département, ajoutez un événement d'équipe
  (répétition, réunion, formation). Les membres du département le voient dans « Mon
  planning ».
- **Lien** : Planning → `/dashboard`
- **Sinon** : Réservé au responsable de département et au Ministre.

### KB-048 — Statistiques de présence
- **Questions** : Taux de présence · statistiques du planning · qui sert le plus · export du
  planning
- **Pour** : RD, Min, Sec (lecture), Ad, SA
- **Réponse** : Les statistiques du planning montrent les taux de présence et de disponibilité
  par département sur une période, avec export Excel.
- **Lien** : Statistiques → `/dashboard/stats`

---

## 4. Membres (STAR)

### KB-060 — Ajouter un STAR
- **Questions** : Ajouter un STAR · nouveau membre dans mon département · inscrire quelqu'un ·
  créer une fiche
- **Pour** : RD (dans ses départements), Min, Ad, SA
- **Réponse** : Dans « STAR », ajoutez la fiche puis affectez-la à un département (principal
  ou secondaire).
- **Lien** : STAR → `/admin/members`
- **Sinon** : Le Secrétaire voit les fiches en lecture seule ; un STAR s'adresse à son
  responsable de département.

### KB-061 — Doublons de fiches
- **Questions** : Deux fiches pour la même personne · fusionner · doublon · STAR en double
- **Pour** : RD, Min, Ad, SA
- **Réponse** : Dans « STAR », repérez et fusionnez les doublons. Un responsable de département
  ne fusionne que deux fiches entièrement dans son périmètre ; sinon, demandez à
  l'administration.
- **Lien** : STAR → `/admin/members`

### KB-062 — Donner un accès à quelqu'un
- **Questions** : Donner les droits · nommer un responsable · ajouter un rôle · valider une
  demande d'accès · quelqu'un attend son accès
- **Pour** : Min (rôles de son ministère), Sec, Ad, SA
- **Réponse** : Dans « Accès & rôles », validez les demandes d'accès, attribuez les rôles et
  liez un compte à une fiche STAR. Un Ministre n'attribue que Ministre, Resp. département et
  STAR, dans son ministère ; nommer un Admin ou un Secrétaire revient à l'Admin.
- **Lien** : Accès & rôles → `/admin/access`
- **Sinon** : Adressez-vous au Ministre de votre ministère ou à l'administration de l'église.

---

## 5. Événements et comptes rendus

### KB-070 — Créer un événement
- **Questions** : Ajouter un culte · créer un événement · programmer une réunion · nouvel
  événement
- **Pour** : Sec, Ad, SA
- **Réponse** : Dans « Gérer les événements », créez l'événement (type, date). Vous pouvez
  activer le suivi de présence pour le discipolat.
- **Lien** : Gérer les événements → `/admin/events`
- **Sinon** : Réservé au Secrétariat et à l'administration : faites une demande depuis « Mes
  demandes » si votre rôle le permet.

### KB-071 — Saisir un compte rendu de culte
- **Questions** : Faire le compte rendu · rapport du culte · nombre de présents · orateur ·
  saisir les stats du culte
- **Pour** : Rep, Sec, Ad, SA
- **Réponse** : Dans « Comptes rendus », ouvrez l'événement et saisissez l'orateur, le titre du
  message et les présences par département. Un export Excel couvre une période.
- **Lien** : Comptes rendus → `/admin/reports`

### KB-072 — La trame des annonces
- **Questions** : Feuille d'annonces · trame du culte · annonces de dimanche · déposer les
  annonces
- **Pour** : Sec, Ad, SA (dépôt) ; Min, RD (lecture)
- **Réponse** : Dans « Trame des annonces », déposez la feuille d'un culte (PDF ou Word) ; chaque
  dépôt remplace le précédent. Les Ministres et responsables la lisent au même endroit.
- **Lien** : Trame des annonces → `/events/announcement-sheets`

### KB-073 — Service d'accueil (familles)
- **Questions** : Quelle famille fait l'accueil ? · rotation de l'accueil · ajouter une famille
  à l'accueil
- **Pour** : Sec, Ad, SA
- **Réponse** : « Service d'accueil » tient le pool des familles et affecte une famille à chaque
  événement, en rotation selon leur dernier service.
- **Lien** : Service d'accueil → `/admin/welcome-duty`

---

## 6. Demandes

### KB-080 — Demander une annonce ou un visuel
- **Questions** : Faire passer une annonce · demander une affiche · visuel pour un événement ·
  poster sur les réseaux · demande à la com
- **Pour** : RD, Min, Sec, Ad, SA
- **Réponse** : Dans « Mes demandes », touchez « Nouvelle demande » : renseignez le titre, le
  brief, la date limite et les canaux (annonce interne, réseaux sociaux, visuel).
- **Lien** : Nouvelle demande → `/requests/new`
- **Sinon** : Un STAR passe par son responsable de département.

### KB-081 — Suivre mes demandes
- **Questions** : Où en est ma demande ? · ma demande est refusée pourquoi · statut de ma
  demande · mes demandes
- **Pour** : RD, Min, Sec, Ad, SA
- **Réponse** : « Mes demandes » affiche l'état de chacune : En attente, En cours, Livrée,
  Refusée (avec le motif). (Voir aussi la question de données « mes demandes en attente ».)
- **Lien** : Mes demandes → `/requests`

### KB-082 — Traiter les demandes (Secrétariat)
- **Questions** : Demandes à traiter · approuver une demande · refuser une demande · file du
  secrétariat
- **Pour** : Sec, Ad, SA, et membres du département Secrétariat
- **Réponse** : « Traitement des demandes » a trois onglets (À traiter, En cours, Traitées) et
  une file triée par échéance. Ouvrez une demande pour l'approuver, la refuser avec un motif ou
  marquer une annonce diffusée.
- **Lien** : Traitement des demandes → `/secretariat/requests`

### KB-083 — Traiter les demandes de visuels ou réseaux sociaux
- **Questions** : Demandes de visuels · livrer un visuel · demandes réseaux sociaux · marquer
  publiée
- **Pour** : Équipes Production Média et Communication, Sec, Ad, SA
- **Réponse** : Dans « Communication & Production », ouvrez Visuels (onglet Demandes) ou
  Réseaux sociaux : prenez en charge, puis marquez livré ou publié (avec le lien si besoin).
  Une annulation demande un motif, transmis au demandeur.
- **Lien** : Communication & Production → `/media`

### KB-084 — Partager des photos
- **Questions** : Partager les photos du culte · lien de partage · envoyer les photos ·
  révoquer un lien
- **Pour** : Équipes Photos et Production Média, Sec, Ad, SA
- **Réponse** : Depuis Photos ou Visuels, « Partager une sélection » crée un lien. Le bouton
  « Partages » liste les liens actifs et permet de les révoquer.
- **Lien** : Communication & Production → `/media`

### KB-085 — Demander un rendez-vous pastoral
- **Questions** : Voir un pasteur · rendez-vous avec le pasteur · parler à un responsable ·
  besoin d'un accompagnement
- **Pour** : STAR, RD, Min, Sec, Ad, SA
- **Réponse** : Déposez la demande depuis la tuile « Rendez-vous pastoral » de « Mes demandes »
  (ou le lien « Demande RDV pastoral » pour un STAR). Suivez ensuite son état au même endroit.
- **Lien** : Demande RDV pastoral → `/care/request`

---

## 7. Comptabilité, navette, trésorerie, dons

### KB-100 — Faire une note de frais ou une avance
- **Questions** : Me faire rembourser · note de frais · avance de budget · j'ai payé de ma
  poche · demander de l'argent pour mon département
- **Pour** : RD, Min, Ad, SA (et titulaires d'un profil pastoral)
- **Réponse** : Dans « Comptabilité », déposez une note de frais (dépense faite) ou une avance
  de budget (dépense à venir), avec les justificatifs. Suivez ensuite son traitement au même
  endroit.
- **Lien** : Nouvelle demande financière → `/accounting/requests/new`
- **Sinon** : Un STAR passe par son responsable de département ; pour une dépense de la
  navette, voir KB-105.

### KB-101 — Traiter une demande financière
- **Questions** : Valider une note de frais · payer une avance · refuser une demande de compta
  · confirmer un paiement
- **Pour** : Compt, Ad, SA
- **Réponse** : Dans « Comptabilité », ouvrez la demande pour la valider avec son plan de
  paiement ou la refuser avec un motif, puis confirmez chaque remise de fonds. « Payé depuis »
  indique si l'argent sort du compte commun ou d'une caisse de la trésorerie (repris alors
  automatiquement).
- **Lien** : Comptabilité → `/accounting/requests`
- **Sinon** : Le traitement revient au Comptable.

### KB-102 — Saisir la collecte du culte
- **Questions** : Enregistrer les offrandes · saisir les dîmes · compter la quête · collecte
  de dimanche · chèques du culte
- **Pour** : Compt, Ad, SA
- **Réponse** : Dans « Trésorerie », onglet « Collecte » : choisissez le culte et la caisse,
  saisissez par catégorie le total des espèces et les chèques un par un, puis les deux
  personnes qui ont compté. « Enregistrer la collecte » crée les lignes dans la caisse.
- **Lien** : Trésorerie → `/accounting/tresorerie?onglet=collecte`
- **Sinon** : La trésorerie est réservée au Comptable et à l'administration.

### KB-103 — Déposer à la banque (remise au compte commun)
- **Questions** : Déposer les chèques · remise en banque · bordereau · vider la caisse ·
  chèques pas encore déposés
- **Pour** : Compt, Ad, SA
- **Réponse** : Dans « Trésorerie », onglet « Remise » : choisissez la caisse, la date et le
  numéro de bordereau, le montant des espèces, puis cochez les chèques remis. Les chèques non
  cochés restent en caisse.
- **Lien** : Trésorerie → `/accounting/tresorerie?onglet=remise`

### KB-104 — Clôturer le mois
- **Questions** : Clôturer le mois · fermer octobre · rouvrir un mois · erreur sur un mois
  clôturé
- **Pour** : Compt, Ad, SA (clôture) ; Ad, SA (réouverture)
- **Réponse** : Dans « Trésorerie », onglet « Clôture », vérifiez les soldes du mois écoulé
  puis clôturez : ses lignes ne se modifient plus. Pour corriger un mois clôturé, un Admin le
  rouvre avec un motif.
- **Lien** : Trésorerie → `/accounting/tresorerie?onglet=cloture`

### KB-105 — Déclarer une dépense de la navette
- **Questions** : Plein d'essence de la navette · dépense navette · ticket de péage · location
  du minibus · justificatif navette
- **Pour** : Équipe navette (département Navette, quel que soit le rôle), Compt, Ad, SA
- **Réponse** : Dans « Navette », « Déclarer une dépense » : nature, montant, date et
  justificatif (photo ou document). La dépense compte aussitôt et la comptabilité est
  prévenue. Vous pouvez la corriger ou la supprimer pendant 48 heures. Payée de votre poche ?
  « Demander le remboursement » depuis la ligne.
- **Lien** : Navette → `/accounting/navette`
- **Sinon** : Réservé à l'équipe navette et à la comptabilité ; faire partie du département
  Navette donne ces droits.

### KB-106 — La page de dons
- **Questions** : Comment donner ? · IBAN de l'église · faire un don · QR code des dons ·
  message WhatsApp dîmes
- **Pour** : Tous (consulter la page publique) ; Compt, Sec, Ad, SA (paramétrer)
- **Réponse** : La page publique « Donner » indique comment donner (en ligne, virement,
  chèques et espèces dans l'enveloppe de l'accueil). Pour la paramétrer : « Page de dons »
  (aperçu en direct, slide de projection avec QR code, message WhatsApp prêt à copier).
- **Lien** : Page de dons → `/dons`

---

## 8. Discipolat

### KB-120 — Mes disciples et l'appel de présence
- **Questions** : Faire l'appel · présence de mes disciples · ajouter un disciple · mes
  disciples
- **Pour** : FD, Sec, Ad, SA (Min, RD en lecture)
- **Réponse** : Dans « Discipolat », gérez vos relations (ajouter un disciple, changer de FD) et
  enregistrez la présence de vos disciples à chaque événement de discipolat. Un FD ne marque
  que ses propres disciples.
- **Lien** : Discipolat → `/admin/discipleship`

---

## 9. Suivi pastoral et intégration

### KB-130 — Confier une demande de rendez-vous pastoral
- **Questions** : Affecter une demande de RDV · confier à un pasteur · rejeter une demande ·
  demandes en attente de suivi
- **Pour** : RSP, Ad, SA (Sec en lecture)
- **Réponse** : Dans « Suivi pastoral », confiez chaque demande à un profil pastoral ou à un
  accompagnant, avec une note, ou rejetez-la avec un motif. Une demande confiée peut être
  réaffectée.
- **Lien** : Suivi pastoral → `/care`
- **Sinon** : L'assistant ne donne aucune information sur les demandes pastorales : ouvrez
  l'écran si votre rôle y a accès.

### KB-131 — Suivi des nouveaux convertis
- **Questions** : Nouveaux convertis · suivi MSDP · appel au salut · faire avancer un suivi
- **Pour** : RSP, Ad, SA (Sec en lecture), référent en charge
- **Réponse** : L'onglet « Nouveaux convertis » de « Suivi pastoral » permet de confier le
  suivi puis, en tant que référent en charge, de le faire progresser (contacté, en formation,
  terminé) et d'ajouter des notes.
- **Lien** : Suivi pastoral → `/care`

### KB-132 — Demandes d'intégration des familles
- **Questions** : Nouvelle famille · demande d'intégration · assigner un berger · recontacter
  plus tard
- **Pour** : Sec, Ad, SA, équipe Intégration, berger assigné (ses familles)
- **Réponse** : « Intégration » suit les demandes : assignez un berger, faites avancer le
  statut, mettez « À recontacter plus tard » ou transmettez au département mission. Les
  demandes à relancer apparaissent dans le bandeau « À relancer ».
- **Lien** : Intégration → `/integration/requests`

---

## 10. Autres espaces

### KB-140 — Réserver une salle
- **Questions** : Réserver une salle · salle libre jeudi · réserver le local · mes réservations
- **Pour** : RD, Min, Sec, Ad, SA
- **Réponse** : Dans « Salles », la vue « Semaine » montre toutes les salles et leurs créneaux
  libres ; réservez un créneau depuis la même page. Certaines salles demandent l'accord de
  l'équipe de contrôle. « Mes réservations » liste les vôtres.
- **Lien** : Salles → `/rooms`
- **Sinon** : Un STAR passe par son responsable de département.

### KB-141 — Réécouter un culte
- **Questions** : Réécouter le message · prédication de dimanche · audio du culte · podcast
- **Pour** : Tous
- **Réponse** : « Audio » regroupe les cultes publiés : recherche par titre, orateur ou date,
  lecture avec vitesse réglable et reprise, lien de partage par culte ou par séquence.
- **Lien** : Audio → `/audio`

### KB-142 — Offres d'emploi
- **Questions** : Offres d'emploi · publier une offre · je cherche du travail · freelance ·
  stage
- **Pour** : Tous
- **Réponse** : L'espace Offres a deux onglets : « Opportunités » et « Profils disponibles ».
  « Publier » propose les quatre sortes d'annonces ; « Mes publications » retrouve les vôtres.
- **Lien** : Offres → `/jobs`

### KB-143 — Billetterie d'un événement
- **Questions** : Créer une billetterie · inscriptions à la soirée · vendre des places ·
  scanner les billets · contrôle à l'entrée
- **Pour** : Sec, Ad, SA (créer) ; équipe de l'événement selon son rôle (Accueil, Restauration,
  Trésorier…)
- **Réponse** : Dans « Billetterie », l'administration crée l'événement et confie les rôles.
  L'accueil scanne les billets depuis l'écran « Contrôle » (fonctionne sans réseau), la
  restauration depuis « Restauration ». Une affectation à l'équipe apparaît dans « Mon
  planning » avec son badge.
- **Lien** : Billetterie → `/billetterie`

### KB-144 — Publier un message système
- **Questions** : Prévenir toute l'église · bandeau de maintenance · message urgent · annoncer
  une nouveauté
- **Pour** : Sec, Ad, SA
- **Réponse** : Dans « Messages système », publiez un message pour toute l'église ou certains
  rôles, ministères ou départements, avec sa sévérité et sa période. Les statistiques (visées,
  vues, fermetures) s'affichent ensuite.
- **Lien** : Messages système → `/admin/messages`

---

## 11. Hors sujet et limites (réponses fixes)

### KB-900 — Question hors sujet
- **Questions** : Météo · verset du jour · conseil personnel · prière · question biblique
- **Pour** : Tous
- **Réponse** : Je vous aide uniquement à utiliser Koinonia. Pour un accompagnement, vous
  pouvez demander un rendez-vous pastoral (KB-085).

### KB-901 — Coordonnées d'une autre personne
- **Questions** : Numéro de téléphone de … · email de mon responsable · adresse de …
- **Pour** : Tous
- **Réponse** : Je ne donne pas les coordonnées d'une autre personne. Elles sont visibles,
  selon votre rôle, dans la fiche de la personne ou sur le service concerné.

### KB-902 — Agir à ma place
- **Questions** : Inscris-moi · déclare mon absence · valide la demande · fais-le pour moi
- **Pour** : Tous
- **Réponse** : Je ne fais pas d'action à votre place : je vous explique et je vous ouvre le
  bon écran.

---

## 12. Questions de données (catalogue du premier lot)

Chaque question renvoie **les informations de la personne**, pour l'église courante, avec le
même périmètre que l'écran cité. Jamais de donnée de suivi pastoral ni de coordonnée d'autrui.

| # | Question (et variantes) | Pour | Réponse | Écran |
|---|---|---|---|---|
| D01 | Mon prochain service (« je sers quand », « c'est quand mon tour ») | Comptes liés à une fiche STAR | Date, événement, département | Mon planning |
| D02 | Mes services du mois (« mon planning de novembre ») | Idem | Liste : date, événement, département | Mon planning |
| D03 | Mes indisponibilités déclarées (« mes absences ») | Tous | Périodes et réponses « Pas disponible » à venir | Disponibilités |
| D04 | Ai-je répondu à la collecte ? (« mes dispos sont faites ? ») | Tous | Mois ouvert, date limite, événements sans réponse | Disponibilités |
| D05 | Qui me remplace ? | Comptes liés à une fiche STAR | Remplaçant choisi pour mes désistements (nom seulement) | Mon planning |
| D06 | Les consignes de mon département | Idem | Consignes du prochain service | Mon planning |
| D07 | Mes événements d'équipe (« prochaine répétition ») | Idem | Date, intitulé, département | Mon planning |
| D08 | Mes affectations à l'équipe d'un événement (billetterie) | Tous | Événement, poste, créneau | Mon planning |
| D09 | Mes demandes en attente | RD, Min, Sec, Ad, SA | Demandes et leur statut | Mes demandes |
| D10 | Mes réservations de salle | RD, Min, Sec, Ad, SA | Salle, date, créneau, état | Salles |
| D11 | Qui est en service dimanche ? | RD, Min (leurs départements), Sec, Ad, SA | Par département : STAR et statut | Planning |
| D12 | Qui est indisponible dimanche ? | Idem | STAR indisponibles et sans réponse | Planning |
| D13 | Postes non pourvus / services à remplacer | RD, Min, Ad, SA | Services « À remplacer » de mon périmètre | Planning |
| D14 | Indisponibilités de mon équipe ce mois-ci | RD, Min, Sec, Ad, SA | Périodes d'absence de mon périmètre | Disponibilités |
| D15 | Les événements de la semaine | Sec, Ad, SA, Min, RD, Rep | Date, titre, type | Agenda de l'église |
| D16 | Demandes en attente par type (secrétariat) | Sec, Ad, SA | Nombre par type, en retard d'abord | Traitement des demandes |
| D17 | Comptes rendus manquants | Rep, Sec, Ad, SA | Événements passés sans compte rendu | Comptes rendus |
| D18 | Demandes financières à valider | Compt, Ad, SA | Nombre et montant total | Comptabilité |
| D19 | Montant en attente de paiement | Compt, Ad, SA | Tranches validées non versées | Comptabilité |
| D20 | Solde de la navette | Équipe navette, Compt, Ad, SA | Solde à date | Navette |
| D21 | Solde de la caisse / de la trésorerie | Compt, Ad, SA | Solde de chaque compte et total | Trésorerie |
| D22 | Chèques encore en caisse | Compt, Ad, SA | Nombre et montant | Trésorerie › Remise |
| D23 | Mes notes de frais en cours | RD, Min, Ad, SA | Demandes et état du paiement | Comptabilité |

Refus type pour une question de données hors du rôle : « Cette information est réservée à
[rôles] ; je ne peux pas l'afficher pour votre compte. » — sans aucune donnée.
