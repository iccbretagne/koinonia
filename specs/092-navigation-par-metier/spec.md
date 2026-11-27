# Spec — Navigation par métier

- **Numéro** : 092
- **Statut** : Validée
- **Créée le** : 2026-11-27
- **Branche suggérée** : `feat/navigation-metier` (branche de base, sous-PR par lot, une PR finale vers `main`)
- **Base** : [audit de la navigation](audit.md) (état au commit `20f3024b`), [audit des impacts](impacts.md), [correspondance des adresses](url-mapping.txt)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Les adresses citées sont celles que la personne voit et met en favori. Leur forme exacte est
> fixée au plan.

## Contexte & problème

Koinonia a grandi par specs successives. Chaque nouvel écran a été rangé là où il y avait de la
place au moment de sa livraison, pas selon le métier de la personne qui s'en sert. L'audit en
annexe le mesure, rôle par rôle :

- **Erreurs de destination.**
  - Sur mobile, le bouton « Demandes » du STAR ouvre directement le formulaire de rendez-vous
    pastoral, et ce bouton ne s'allume jamais.
  - En vue pastorale, « Mes membres » mène à deux écrans différents selon le menu.
- **Écrans introuvables.** Une dizaine d'écrans n'appartiennent à aucun espace. On n'y accède que
  par une notification, et le retour mène à l'Accueil. C'est le cas de la page d'un événement pour
  un STAR, des indisponibilités de l'équipe, du rendez-vous pastoral, de « Mes réservations », de
  « Mes réponses » et de « Ma fiche ».
- **Barre du bas imprévisible.** Pour un compte qui a plusieurs rôles, elle dépend d'un rôle
  choisi au hasard. La Secrétaire n'y trouve pas sa file de traitement. Le Comptable et le Référent
  soins pastoraux n'ont que deux destinations.
- **Métiers éclatés.**
  - Les finances sont réparties entre « Demandes » et « Administration ».
  - Le pastoral est coupé entre « Agenda » et « Personnes ».
  - « Agenda » mélange le calendrier de l'église et celui des pasteurs.
  - « Administration » mélange les réglages de l'église et ceux de la plateforme.
- **Libellés et adresses ambigus.**
  - Un même mot désigne plusieurs choses : « Demandes » a sept sens, « Agenda » cinq.
  - Les adresses ne disent pas où l'on est : des outils du quotidien sont sous `/admin`, la
    comptabilité sous « Demandes ».

Conséquences :
- chaque rôle met plus de taps que nécessaire pour atteindre son travail (la Secrétaire et le
  Reporter : 3 au lieu de 1) ;
- l'assistant et le guide décrivent des chemins difficiles à suivre ;
- chaque nouvel écran aggrave le désordre.

But : une **architecture d'information par métier**, stable, identique sur ordinateur et sur
mobile, où chaque écran a une place, un nom et une adresse uniques.

## Principes

1. **Un espace = un métier**, nommé par ce qu'on y fait, jamais par l'historique d'une spec.
2. **La destination d'un espace est la file de travail du rôle**, quand il en a une.
3. **Un libellé n'a qu'un sens** dans toute l'application : menus, onglets, fil d'Ariane, guide,
   assistant.
4. **Tout écran connecté a un parent** dans l'arborescence. Le fil d'Ariane et le retour mobile y
   mènent, jamais à un « Accueil » par défaut.
5. **Mobile et ordinateur rangent les écrans de la même façon** : les groupes de la barre latérale
   se retrouvent dans le panneau « Plus ».
6. **Les onglets ne répètent pas le menu** : un écran a une seule entrée de menu, et ses onglets
   restent internes à cet écran.
7. **L'adresse d'un écran commence par son espace.** Un ancien lien n'est jamais cassé.

## Utilisateurs concernés

Tous les rôles : Super Admin, Admin, Secrétaire, Ministre, Resp. département, Faiseur de
disciples, Reporter, STAR, Référent soins pastoraux, Comptable. Sont aussi concernées les
équipes définies par la fonction de leur département :
- Vie des STAR, Navette, Captation audio ;
- Photos, Production Média, Communication ;
- Secrétariat, Protocole, Intégration / MSDP.

S'y ajoutent les rôles et accès attribués par données : rôles d'événement de billetterie,
gestionnaires de campagne, accès délégués aux formulaires. Enfin, les pasteurs (vue pastorale).

**Aucun droit ne change, à trois exceptions près**, décidées par le propriétaire et listées
ci-dessous. Hors de ces exceptions, chaque personne voit exactement les mêmes écrans
qu'aujourd'hui, rangés autrement. Le rangement suit les droits, il ne les décide pas.

Les trois exceptions :
1. **Mes demandes** est ouvert à tout compte de l'église, en **consultation** de ce qui le
   concerne (rendez-vous pastoraux, questionnaires, inscriptions, demandes déjà déposées). Créer
   une demande interne (annonce, visuel, etc.) reste réservé à qui le peut aujourd'hui.
2. **Demander un rendez-vous pastoral** est ouvert à tout compte de l'église, et plus seulement à
   qui a accès au planning.
3. **La lecture pastorale** s'étend aux comptes rendus et aux demandes comptables des écrans
   communs, **en lecture seule**, sur le même périmètre que les écrans pastoraux actuels.

## Comportement attendu

### Les espaces

L'application compte au plus onze espaces. Un espace n'apparaît que si la personne a accès à au
moins un de ses écrans.

| Espace | Contenu (selon les droits) |
|---|---|
| **Accueil** | Vue du jour et bloc **À traiter** propre au rôle |
| **Planning** | Mon planning · Disponibilités (avec les indisponibilités de l'équipe) · Départements, groupés par ministère · Statistiques du département |
| **Événements** | Calendrier de l'église · Gérer les événements · Service d'accueil · Comptes rendus · Trame des annonces · *Inscriptions* : Billetterie, Formulaires, Mes inscriptions |
| **Pastoral** | Mon agenda · Agenda des pasteurs · Planification · Suivi pastoral · Demander un rendez-vous |
| **Personnes** | STAR · Discipolat · Candidatures · *Intégration* : dossiers, bergers de famille, parcours, statistiques, paramètres |
| **Demandes** | Mes demandes · Traitement des demandes · Questionnaires |
| **Finances** | Demandes comptables · Statistiques · Navette · Trésorerie · Page de dons |
| **Médias** | Communication & Production · Audio |
| **Ressources** | Salles · Offres · Familles |
| **Administration** | *Église* : paramètres de l'église, ministères, départements, fonctions des départements, configuration des salles · *Accès* : utilisateurs, accès & rôles, profils pastoraux · *Communication* : messages système · *Suivi* : historique |
| **Plateforme** | Églises · Sauvegardes · API · Icône de l'application · Domaines des sites · Assistant · Assistants IA |

Règles de rangement :
- **Plateforme** n'est visible que du Super Admin. L'Admin d'église ne voit plus que les réglages
  de son église dans Administration.
- **Finances** : le Ministre et le Resp. département n'y entrent pas. Ils soumettent et suivent
  leurs demandes comptables depuis **Mes demandes**, avec la même portée qu'aujourd'hui.
  L'équipe Navette voit Finances réduit à la Navette. Toute personne qui gère la page de dons la
  trouve dans Finances.
- **Pastoral** n'apparaît que pour qui a au moins un écran de travail pastoral : agenda,
  planification ou suivi. Pour les autres, « Demander un rendez-vous » est accessible depuis
  **Mes demandes** et la recherche.
- **Familles**, le site externe, reste visible pour tous, rangé dans Ressources.
- **Mes demandes** est ouvert à tous les comptes, STAR compris (exception 1). C'est la page de
  « ce que j'ai demandé ou que je dois remplir » :
  - les demandes internes, pour qui peut en créer ;
  - les demandes de rendez-vous pastoral ;
  - les questionnaires à remplir ;
  - le rappel des inscriptions (réservations et réponses aux formulaires) ;
  - pour un membre de l'équipe Navette, le lien vers la Navette.
  Une section sans objet pour la personne n'apparaît pas.
- **Mes inscriptions** réunit les réservations de billetterie et les réponses aux formulaires de
  la personne, même si elle ne gère aucun événement ni formulaire.

### Les libellés

Chaque libellé a un sens unique dans toute l'application.

| Aujourd'hui | Demain |
|---|---|
| Agenda (espace) | Événements, ou Pastoral selon le contenu |
| Agenda de l'église | Calendrier de l'église |
| Vue agenda | Agenda des pasteurs |
| Comptabilité | Demandes comptables, dans Finances |
| Demande RDV pastoral | Demander un rendez-vous |
| Fonctions dép. | Fonctions des départements |
| Salles (administration) | Configuration des salles |
| Demandes (intégration) | Dossiers d'intégration |
| Collectes (disponibilités) | Collectes de disponibilités |
| Offres (deux entrées) | Offres (une seule entrée) |

Le guide, les fiches de l'assistant, la visite guidée et les fils d'Ariane emploient ces mêmes
libellés.

### La barre du bas (mobile)

La barre du bas affiche Accueil, puis au plus trois destinations, puis « Plus ». Elle est
construite à partir d'un **rôle principal déterministe**. Pour un compte qui a plusieurs rôles
dans l'église courante, c'est le premier de cet ordre :

Admin > Secrétaire > Comptable > Référent soins pastoraux > Ministre > Resp. département >
Reporter > Faiseur de disciples > STAR.

Le Super Admin suit l'Admin. Un compte sans rôle d'église, comme un pasteur seul, suit le STAR.
La première destination après Accueil est la file de travail du rôle quand il en a une.

| Rôle principal | Destinations visées |
|---|---|
| Admin, Super Admin | Accueil · Événements · Personnes · Planning · Plus |
| Secrétaire | Accueil · Traitement des demandes · Événements · Personnes · Plus |
| Comptable | Accueil · Demandes comptables · Trésorerie · Navette · Plus |
| Référent soins pastoraux | Accueil · Suivi pastoral · Mes demandes · Plus |
| Ministre, Resp. département | Accueil · Planning · Événements · Personnes · Plus |
| Reporter | Accueil · Comptes rendus · Calendrier de l'église · Plus |
| Faiseur de disciples | Accueil · Discipolat · Mes demandes · Plus |
| STAR | Accueil · Mon planning · Calendrier de l'église · Mes demandes · Plus |

Une destination à laquelle la personne n'a pas accès est remplacée par la suivante de sa liste.
Deux boutons ne mènent jamais au même écran. Le bouton de l'écran courant, ou de son parent, est
toujours allumé.

Le panneau « Plus » présente tous les espaces accessibles avec les mêmes groupes que la barre
latérale : *Église*, *Accès*, *Inscriptions*, *Intégration*…

### L'Accueil « À traiter »

L'Accueil garde la vue du jour : prochains services, événements, questionnaires à remplir. Il y
ajoute un bloc **À traiter**. Ce bloc montre uniquement les files de travail auxquelles la
personne a accès, chacune avec son compteur et un lien direct :
- demandes du secrétariat ;
- demandes comptables à valider ou à payer ;
- justificatifs à examiner ;
- demandes de rendez-vous pastoral et suivis à qualifier ;
- candidatures à traiter ;
- paiements de billetterie déclarés ;
- remplacements demandés ;
- questionnaires soumis à valider.

Les huit files sont livrées ensemble. Sans aucune file, le bloc n'apparaît pas.
- Une file qui a déjà un écran avec un compteur affiche **le même nombre** que cet écran. S'il en
  existe aujourd'hui plusieurs versions qui divergent (par exemple la comptabilité), c'est celle de
  l'écran qui fait foi.
- Une file qui n'a pas encore d'écran propre (paiements de billetterie déclarés, remplacements
  demandés, questionnaires soumis à valider, candidatures à traiter) reçoit une définition écrite
  au plan. Son lien ouvre l'écran le plus proche, déjà filtré sur ces éléments.

### La vue pastorale

La vue pastorale reste une bascule. Elle ne construit plus une navigation à part : elle **filtre**
la navigation commune.
- Le pasteur retrouve les mêmes espaces, limités à ce que la lecture pastorale lui ouvre :
  Personnes (« Mes membres », discipolat), Événements (calendrier, comptes rendus), Pastoral,
  Finances (consultation).
- Les écrans propres à la vue pastorale qui doublent un écran commun (événements, comptes rendus,
  comptabilité) disparaissent. Le pasteur ouvre l'écran commun **en lecture seule** (exception 3) :
  aucune action de création, de modification ou de validation n'y apparaît, et le serveur les
  refuse. Seuls « Mes membres » et le tableau pastoral de l'Accueil restent propres aux pasteurs.
- Les liens de la vue pastorale qui mènent aujourd'hui à un écran refusé au pasteur (saisie d'un
  compte rendu, détail d'une demande comptable hors périmètre) ouvrent désormais la lecture.
- Il garde en plus ses propres écrans, par exemple Planning et Audio s'il est aussi STAR.
- « Mes membres » mène au même écran depuis la barre du bas, la barre latérale et la recherche.
- L'Accueil de la vue pastorale montre le tableau pastoral actuel.

### Retour et fil d'Ariane

Sur toute page qui n'est pas une page d'espace :
- le fil d'Ariane (ordinateur) montre le chemin réel : espace, groupe, page, sous-page ;
- le chevron (mobile) ramène au parent réel.

Cela vaut notamment pour la page d'un événement vue par un STAR, les indisponibilités de
l'équipe, le rendez-vous pastoral, Mes inscriptions, Ma fiche, un message de l'administration et
les onglets de Finances. Un onglet ne fait pas reculer vers un onglet frère : son parent est
l'écran qui porte les onglets.

### La recherche (⌘K)

En plus des pages, des STAR et des événements, la recherche propose les **actions fréquentes**
auxquelles la personne a droit :
- déclarer une absence ;
- nouvelle demande ;
- demander un rendez-vous ;
- nouvel événement ;
- nouvelle demande comptable ;
- nouvelle saisie de trésorerie.

Sans saisie, elle propose d'abord les destinations du rôle principal.

### Les adresses

Chaque écran connecté a une adresse qui commence par son espace (par exemple `/finances/…`,
`/evenements/…`, `/personnes/…`, `/plateforme/…`).

**Toute ancienne adresse redirige vers la nouvelle**, avec le même objet et les mêmes
paramètres. La redirection est d'abord **temporaire** pendant une période d'observation de deux à
quatre semaines, pour qu'un retour arrière reste possible. Elle devient ensuite **permanente** et
n'a pas d'échéance. Cela couvre :
- les liens enregistrés dans les notifications existantes ;
- les liens des emails déjà envoyés ;
- les favoris et raccourcis de l'application installée ;
- les redirections historiques déjà en place.

Les adresses **publiques** ne changent pas : dons, inscription, billet, réservation, formulaire,
collecte, servir, entretien, rejoindre, installer, connexion d'un assistant IA, liens de partage
des médias. Les pages des **sites d'événement** ne sont jamais touchées par une redirection, même
quand leur nom ressemble à celui d'un ancien écran (par exemple « billetterie »).

Restent aussi à leur adresse, hors préfixe d'espace : l'Accueil, Mon profil et ses sous-pages, le
Guide, un message de l'administration, l'autorisation d'un assistant IA.

Les adresses mémorisées par l'application elle-même (aide contextuelle de l'assistant, liens des
messages système, liens des notifications) sont réécrites vers la nouvelle adresse au moment de la
bascule. Elles ne dépendent pas des redirections.

Un écran de module désactivé répond comme une page inexistante, à l'ancienne comme à la nouvelle
adresse. Ce n'est pas toujours le cas aujourd'hui, et c'est corrigé avant la bascule.

Les écrans **hors ligne** de la billetterie (contrôle d'entrée, restauration) restent utilisables
après la bascule. La bascule n'est pas déployée pendant un événement en cours. Les liens par
jeton déjà distribués non plus. Les notifications et emails créés après la livraison portent
directement la nouvelle adresse.

### Scénario principal — une Secrétaire sur son téléphone

1. Elle ouvre l'application. L'Accueil affiche « À traiter : 4 demandes du secrétariat ».
2. Elle touche le second bouton de la barre du bas, « Traitement des demandes » : sa file s'ouvre
   en un tap.
3. Elle ouvre une demande. Le chevron indique « Traitement des demandes », et l'adresse commence
   par `/demandes/`.
4. Elle ouvre un ancien lien de notification de la semaine dernière. Il mène au même écran, à sa
   nouvelle adresse.
5. Elle ouvre « Plus ». Finances, dans laquelle elle n'a que la page de dons et les statistiques,
   et Administration y apparaissent, groupées comme sur ordinateur.

### Scénarios alternatifs / cas limites

- **STAR.**
  - La barre du bas propose Accueil · Mon planning · Calendrier de l'église · Mes demandes.
  - « Mes demandes » liste ses rendez-vous pastoraux, ses questionnaires et ses inscriptions, et
    propose « Demander un rendez-vous ».
  - Ouvrir un événement depuis l'Accueil puis revenir le ramène au Calendrier de l'église.
- **Comptable qui est aussi STAR.** Sa barre du bas est toujours celle du Comptable, quel que soit
  l'ordre de ses rôles en base.
- **Admin d'église.** Il ne voit pas l'espace Plateforme. L'Historique est dans Administration ›
  *Suivi*.
- **Super Admin.** Il voit Administration, avec les réglages de l'église courante, et Plateforme.
- **Ministre.**
  - Il n'a pas d'espace Finances.
  - Il crée une demande comptable depuis Mes demandes et y voit celles de son ministère, comme
    aujourd'hui.
  - Un lien comptable reçu par notification ouvre bien la demande.
- **Membre de l'équipe Navette sans autre droit comptable.** Finances ne contient que la Navette.
  Mes demandes y renvoie.
- **Pasteur, sur un compte rendu ou une demande comptable en vue pastorale.** Il lit l'écran
  commun, sans aucun bouton d'action. Une tentative d'écriture est refusée.
- **STAR qui demande un rendez-vous pastoral.** Il le demande depuis Mes demandes, sans avoir
  besoin d'un accès au planning.
- **Retour arrière pendant la période d'observation.** Une version de secours remet les anciennes
  adresses. Les liens émis entre-temps sous les nouvelles adresses continuent de fonctionner.
- **Inscrit à un événement de billetterie sans rôle.** Il retrouve sa réservation dans Événements ›
  Mes inscriptions, et depuis Mes demandes.
- **Référent soins pastoraux.** Ses demandes sont dans Pastoral › Suivi pastoral, et non plus
  dans Personnes. Sa barre du bas a trois destinations distinctes.
- **Pasteur, profil pastoral sans rôle, en vue pastorale.**
  - « Mes membres » est le même écran partout.
  - S'il est aussi STAR, Planning et Audio restent visibles.
  - Revenir à la vue normale garde la même structure d'espaces.
- **Ancienne adresse avec un identifiant**, par exemple une ancienne demande comptable ou un
  ancien événement. La redirection garde l'identifiant et les paramètres. Si l'objet n'existe plus
  ou n'est pas accessible, la réponse est la même qu'aujourd'hui pour la nouvelle adresse.
- **Ancienne adresse inconnue sous un ancien préfixe.** Elle répond comme une adresse inexistante,
  sans boucle de redirection.
- **Module désactivé**, par exemple la navette ou la trésorerie. Son entrée disparaît, et l'espace
  disparaît s'il devient vide. Les redirections vers ses écrans répondent comme le module absent.
- **Église sans aucun département de fonction Navette.** Finances ne montre pas la Navette, comme
  aujourd'hui.
- **Visite guidée et guide.** Ils désignent les nouveaux espaces et libellés. Aucune étape ne
  pointe un élément absent.
- **Assistant (bulle et assistants IA).** Les fiches et les réponses donnent les nouveaux chemins
  de menu et les nouvelles adresses.

## Critères d'acceptation

**Structure**
- [ ] Les espaces sont exactement ceux du tableau ci-dessus. Aucun espace n'apparaît vide.
- [ ] Pour chaque rôle et cas d'équipe de l'audit (§2.1–2.3), l'ensemble des écrans accessibles
      est identique avant et après, en dehors des trois exceptions listées. Seuls le rangement,
      les libellés et les adresses changent.
- [ ] Tout compte de l'église peut ouvrir Mes demandes et demander un rendez-vous pastoral. Il ne
      peut créer une demande interne que s'il le pouvait déjà.
- [ ] En vue pastorale, les comptes rendus et les demandes comptables communs s'ouvrent en lecture
      seule, sur le périmètre pastoral actuel. Aucune action n'est affichée, et toute écriture est
      refusée côté serveur.
- [ ] Plateforme n'est visible que du Super Admin. Administration ne contient aucun réglage de
      plateforme.
- [ ] Finances regroupe les demandes comptables, les statistiques, la navette, la trésorerie et la
      page de dons. Ni « Demandes » ni « Administration » n'en contiennent.
- [ ] Le Ministre et le Resp. département n'ont pas l'espace Finances. Ils créent et consultent
      leurs demandes comptables depuis Mes demandes.
- [ ] Le suivi pastoral et l'agenda des pasteurs sont dans Pastoral, et plus dans Personnes ni
      dans Événements.
- [ ] Aucun libellé de menu, d'onglet ou de fil d'Ariane n'est employé pour deux écrans différents.

**Mobile**
- [ ] Pour un compte qui a plusieurs rôles, la barre du bas est identique quel que soit l'ordre
      d'attribution des rôles. Elle suit l'ordre de priorité fixé.
- [ ] Pour chaque rôle principal, la barre du bas correspond au tableau. Elle n'a jamais deux
      boutons vers le même écran, et jamais un bouton qui ouvre directement un formulaire.
- [ ] Sur tout écran, le bouton de son espace, ou de son parent, est allumé.
- [ ] Le panneau « Plus » reprend les groupes de la barre latérale.
- [ ] Le STAR a « Mes demandes » en quatrième destination. Il y trouve ses rendez-vous pastoraux,
      ses questionnaires, ses inscriptions et « Demander un rendez-vous ».

**Retour et parenté**
- [ ] Chaque écran connecté a un parent qui n'est pas l'Accueil par défaut. Font exception les
      pages d'espace et l'Accueil lui-même.
- [ ] Le chevron mobile et le fil d'Ariane mènent à ce parent, y compris pour les écrans hors
      espace relevés par l'audit (H3).
- [ ] Un onglet a pour parent l'écran qui porte les onglets, jamais un onglet frère.

**Accueil, recherche, vue pastorale**
- [ ] L'Accueil affiche « À traiter » avec les huit files, limitées à celles qui sont accessibles.
      Une file qui a un écran affiche le même nombre que cet écran. Les autres suivent la
      définition écrite au plan.
- [ ] La recherche propose les actions fréquentes autorisées, et rien d'autre.
- [ ] En vue pastorale, « Mes membres » ouvre le même écran depuis tous les menus. Un pasteur
      aussi STAR garde Planning et Audio.

**Adresses**
- [ ] L'adresse de chaque écran connecté commence par le préfixe de son espace.
- [ ] Chaque ancienne adresse d'un écran connecté redirige vers la nouvelle, avec l'identifiant et
      les paramètres : de façon temporaire pendant l'observation, puis permanente. Un test couvre
      la liste complète.
- [ ] Aucune page d'un site d'événement ni aucun lien de partage public n'est redirigé.
- [ ] Un écran de module désactivé répond comme une page inexistante, à l'ancienne comme à la
      nouvelle adresse.
- [ ] Les adresses mémorisées par l'application (aide contextuelle, messages système,
      notifications) sont réécrites. L'aide contextuelle de l'assistant s'affiche sur les mêmes
      écrans qu'avant.
- [ ] Les écrans hors ligne de la billetterie fonctionnent après la bascule.
- [ ] Un lien de notification créé avant la livraison ouvre le bon écran.
- [ ] Les adresses publiques et les liens par jeton sont inchangés.
- [ ] Aucune redirection ne boucle. Une ancienne adresse inexistante répond comme une adresse
      inexistante.

**Contenus**
- [ ] Le guide, la visite guidée, les fiches de l'assistant et la documentation du design system
      emploient les nouveaux espaces, libellés et adresses.
- [ ] Les déclarations de navigation mortes, qui pointent vers des écrans disparus, n'existent
      plus.

## Hors périmètre

- Toute modification de droits, de permissions ou de périmètres autre que les trois exceptions
  listées. En particulier, la création de demandes internes n'est pas ouverte à d'autres rôles.
- Les adresses publiques, les liens par jeton, les sites d'événement et les adresses techniques
  utilisées par les assistants IA et les intégrations.
- La refonte visuelle des écrans eux-mêmes : la spec 055 et la mise en conformité s'appliquent
  telles quelles.
- La fusion d'écrans en doublon autres que ceux cités. Par exemple, « Calendrier de l'église » et
  « Gérer les événements » restent deux entrées (voir question 4).
- La recherche plein texte des demandes dans la palette.
- La suppression de la vue pastorale (elle devient un filtre).
- Les adresses des services internes (API) : elles ne bougent pas.

## Questions ouvertes

Décisions déjà prises par le propriétaire (2026-11-27) :
- espace Finances propre ;
- Événements + Pastoral ;
- espace Plateforme ;
- adresses alignées dès maintenant ;
- Mes demandes en 4e bouton du STAR ;
- vue pastorale gardée comme filtre ;
- rôle principal par priorité fixe ;
- Familles visible pour tous.

Choix complémentaires validés par le propriétaire (2026-11-27) :

1. **À traiter** — les files listées plus haut, sur l'Accueil
   seulement. Pas de compteur supplémentaire sur la barre du bas ni sur la barre latérale (les
   badges actuels sont conservés).
2. **Actions de la recherche** — la liste des six actions ci-dessus, sans recherche
   de demandes.
3. **Salles** — deux entrées : « Salles » pour réserver, dans Ressources, et
   « Configuration des salles » dans Administration. Pas de fusion.
4. **Événements** — « Calendrier de l'église » pour consulter et « Gérer les
   événements » pour créer et modifier restent deux entrées.
5. **Familles** — dans Ressources pour tous, plutôt que dans Personnes,
   où il formait à lui seul un espace pour le STAR, le Reporter et le Comptable.
6. **Vue pastorale** — les écrans propres à la vue pastorale qui doublent un écran
   commun (événements, comptes rendus, comptabilité) sont remplacés par l'écran commun, en
   lecture. Seuls « Mes membres » et le tableau pastoral de l'Accueil restent propres aux
   pasteurs.
7. **Libellé « Dossiers d'intégration »** — remplace « Demandes » dans le groupe
   Intégration.

Arbitrages complémentaires après l'[audit des impacts](impacts.md) (2026-11-27) :
- la lecture pastorale est étendue (exception 3) ;
- Mes demandes : consultation et rendez-vous pour tous, sans dépôt de demande interne
  (exceptions 1 et 2) ;
- toutes les adresses sont alignées, en dernier lot, d'abord en redirection temporaire ;
- les huit files de « À traiter » sont livrées ensemble.

Découpage de livraison, à préciser au plan :
- **Lot 0** : corrections. Écrans de modules désactivés, rôle principal déterministe, liens
  pastoraux cassés, déclarations mortes. Registre unique des adresses, sans changer d'adresse.
- **Lot 1** : espaces, libellés et parenté, sur les adresses actuelles.
- **Lot 2** : barre du bas, « Plus », Accueil « À traiter » (huit files) et recherche.
- **Lot 3** : vue pastorale en filtre et extension de la lecture pastorale, Mes demandes ouvert
  à tous.
- **Lot 4** : bascule des adresses, avec redirections temporaires, réécriture des adresses
  mémorisées, et mise à jour du guide, de l'assistant et de la documentation dans la même PR.
- **Lot 5** : passage en redirection permanente, après l'observation.

Chaque lot est une sous-PR vers `feat/navigation-metier`, avec un passage en recette.
