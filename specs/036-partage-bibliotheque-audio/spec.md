# Spec — Partage de bibliothèque audio entre églises

- **Numéro** : 036
- **Statut** : Implémentée
- **Créée le** : 2026-09-02
- **Branche suggérée** : `feat/partage-bibliotheque-audio`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'espace Audio permet aujourd'hui à chaque église de publier ses cultes et à ses membres de les
réécouter. La bibliothèque est strictement cloisonnée : un membre ne voit que les cultes de son
église, et rien ne permet de faire circuler un enseignement d'une église à une autre.

Or les églises qui travaillent ensemble (implantations, églises partenaires d'un même réseau)
souhaitent que leurs membres puissent réécouter les cultes des autres. Aujourd'hui, la seule
solution est le lien de partage public, généré culte par culte et diffusé hors de l'application :
laborieux, non révocable finement, et sans aucune traçabilité de qui accède à quoi.

Cette feature permet à une église d'**ouvrir sa bibliothèque publiée à d'autres églises de la
plateforme**, une fois pour toutes, sans manipulation par culte et sans sortir de l'application.

Le partage est un geste **unilatéral et dirigé** : l'église propriétaire décide seule à qui elle
ouvre sa bibliothèque. Il n'y a ni hiérarchie entre églises, ni réciprocité automatique.

Contrainte structurante : aujourd'hui, **seule l'administration de la plateforme connaît la liste
des églises hébergées**. Un administrateur d'église n'a — volontairement — aucun moyen de les
énumérer. Cette feature ne doit pas ouvrir cet annuaire : le partage se noue donc par **saisie
d'un identifiant** que l'église destinataire communique elle-même, hors application. Le geste ne
consiste qu'à **donner** accès à son propre contenu : une erreur de saisie n'expose que l'église
qui la commet, jamais un tiers.

## Utilisateurs concernés

**Côté église propriétaire (celle qui ouvre sa bibliothèque)**

- **Super Admin, Admin** — administrent le partage : ouvrent leur bibliothèque à une ou plusieurs
  autres églises, consultent la liste des églises destinataires, révoquent un partage à tout
  moment. Ce sont les seuls rôles qui peuvent le faire (mêmes rôles que la gestion des
  paramètres audio).
- **Aucun autre rôle** de l'église propriétaire n'est impacté : publier, déposer, nommer et
  dépublier un culte restent inchangés.

**Côté église destinataire (celle qui reçoit l'accès)**

- **Tous les rôles pouvant déjà réécouter** (Super Admin, Admin, Secrétaire, Ministre,
  Responsable de département, Faiseur de Disciples, Reporter, STAR) — voient les cultes publiés
  des bibliothèques qui leur ont été ouvertes, aux côtés de ceux de leur propre église, et
  peuvent les écouter.
- Ces utilisateurs n'obtiennent **aucun autre droit** sur l'église propriétaire : ni dépôt, ni
  publication, ni dépublication, ni génération de lien public, ni accès à quoi que ce soit
  d'autre que les cultes publiés.

## Comportement attendu

### Scénario principal

1. Un Admin de l'église B, sollicité par l'église A, ouvre les paramètres de l'espace Audio de
   son église et y relève **l'identifiant public de son église**, affiché à cet endroit. Il le
   communique à l'église A par ses propres moyens (message, téléphone, réunion).
2. Un Admin de l'église A ouvre les paramètres de l'espace Audio de son église. Il y trouve une
   section dédiée au partage de sa bibliothèque, listant les églises auxquelles elle est
   actuellement ouverte (vide au départ).
3. Il saisit l'identifiant transmis par l'église B. Le nom de l'église correspondante s'affiche,
   pour qu'il vérifie qu'il ouvre bien sa bibliothèque à la bonne église, puis il confirme.
4. L'église B apparaît immédiatement dans la liste des destinataires, avec son nom.
5. Un membre de l'église B ouvre l'onglet de réécoute. Sa bibliothèque contient désormais, en
   plus des cultes de son église, tous les cultes publiés de l'église A.
6. Chaque culte provenant d'une autre église porte une **marque d'origine visible** indiquant de
   quelle église il vient. Les cultes de sa propre église n'en portent pas.
7. Un **filtre par église** apparaît à côté des filtres existants, lui permettant de restreindre
   l'affichage à une bibliothèque en particulier.
8. Il ouvre un culte de l'église A et l'écoute normalement, comme un culte de son église.

### Scénarios alternatifs / cas limites

- **À aucun moment l'application ne propose la liste des églises** : ni à la saisie, ni en
  suggestion, ni en autocomplétion. L'identifiant vient toujours de l'extérieur.
- **Si l'identifiant saisi ne correspond à aucune église**, l'Admin reçoit un message l'invitant
  à le vérifier auprès de l'église concernée, et rien n'est créé.
- **Si l'Admin saisit l'identifiant de sa propre église**, l'action est refusée : une église
  n'ouvre pas sa bibliothèque à elle-même.
- **Si l'identifiant saisi correspond à une église déjà destinataire**, aucun doublon n'est créé
  et l'Admin en est informé.
- **Si l'identifiant d'une église change** (renommage par l'administration de la plateforme), les
  partages déjà noués avec elle restent intacts : un partage lie deux églises, pas deux
  identifiants. Seules les futures saisies doivent utiliser le nouvel identifiant.
- **Les tentatives répétées de saisie d'identifiants sont limitées en débit** : afficher le nom
  d'une église en regard de son identifiant est nécessaire pour éviter une erreur de destinataire,
  mais ne doit pas devenir un moyen de reconstituer l'annuaire des églises par sondage.
- **Si l'église destinataire n'a reçu aucun partage**, son espace de réécoute est strictement
  identique à aujourd'hui : ni marque d'origine sur les cartes, ni filtre par église. La
  fonctionnalité est invisible tant qu'elle n'est pas utilisée.
- **Par défaut, aucun filtre église n'est appliqué** : la bibliothèque affiche les cultes de
  toutes les églises accessibles, triés par date comme aujourd'hui. La marque d'origine suffit à
  lever l'ambiguïté ; le filtre sert à restreindre volontairement.
- **Quand l'église propriétaire dépublie un culte**, celui-ci disparaît instantanément de la
  bibliothèque des églises destinataires, exactement comme il disparaît de la sienne.
- **Quand l'église propriétaire révoque un partage**, l'église destinataire perd l'accès
  immédiatement : les cultes concernés disparaissent de sa bibliothèque, et toute tentative
  d'écoute d'un culte déjà ouvert dans un onglet est refusée.
- **Si un membre de l'église destinataire tente de générer un lien de partage public** depuis un
  culte de l'église A, l'action est refusée. Exposer publiquement le contenu d'une autre église
  reste la décision de son propriétaire seul.
- **Si un membre de l'église destinataire tente d'accéder directement à un culte non publié** de
  l'église A (par une adresse devinée), l'accès est refusé : seuls les cultes publiés circulent.
- **Quand deux bibliothèques contiennent un orateur ou une série portant le même nom**, la
  sélection d'une église dans le filtre restreint aussi les orateurs et séries proposés à cette
  église. Sans église sélectionnée, les listes affichent l'ensemble des valeurs disponibles.
- **Si l'utilisateur bricole l'adresse** pour filtrer sur une église dont la bibliothèque ne lui
  a pas été ouverte, la demande est ignorée et il retrouve l'affichage par défaut — jamais un
  contenu auquel il n'a pas droit.
- **Quand l'église A ouvre sa bibliothèque à l'église B**, cela ne donne **aucun** accès à
  l'église A sur la bibliothèque de l'église B. Le partage inverse doit être décidé séparément
  par l'église B.
- **Si l'église A ouvre sa bibliothèque à plusieurs églises**, chacune y accède indépendamment et
  n'a aucune visibilité sur les autres destinataires.
- **Toute ouverture et toute révocation de partage sont tracées** dans l'historique des
  modifications de l'église propriétaire, avec l'auteur de la décision : exposer des contenus
  hors de son église doit laisser une trace nommée.

## Critères d'acceptation

- [x] Un Admin voit l'identifiant public de son église dans les paramètres de l'espace Audio,
      accompagné de l'explication de son usage.
- [x] Un Admin de l'église A peut ouvrir la bibliothèque de son église à l'église B en saisissant
      l'identifiant de B, après affichage du nom de B pour vérification, et voir B apparaître
      dans la liste des destinataires.
- [x] À aucun endroit du parcours l'Admin de A ne se voit proposer la liste des églises de la
      plateforme.
- [x] Un identifiant inconnu produit un message de vérification et ne crée aucun partage.
- [x] Saisir l'identifiant de sa propre église est refusé.
- [x] Saisir l'identifiant d'une église déjà destinataire ne crée pas de doublon.
- [x] Les tentatives de saisie d'identifiant sont limitées en débit.
- [x] Un partage déjà noué survit à un changement d'identifiant de l'une des deux églises.
- [x] Un Admin peut révoquer ce partage, et B disparaît de la liste.
- [x] Un utilisateur de l'église A qui n'est ni Admin ni Super Admin ne peut ni ouvrir ni
      révoquer un partage.
- [x] Après ouverture, un membre de l'église B voit dans sa bibliothèque tous les cultes publiés
      de l'église A, en plus des siens.
- [x] Chaque culte de l'église A affiché chez B porte une marque d'origine identifiant l'église A ;
      les cultes de l'église B n'en portent aucune.
- [x] Le filtre par église est présent chez un membre de l'église B, et absent chez un membre
      d'une église qui n'a reçu aucun partage.
- [x] Sans filtre appliqué, la bibliothèque de B mélange les cultes des deux églises, triés comme
      aujourd'hui.
- [x] Sélectionner l'église A dans le filtre n'affiche que les cultes de A, et restreint les
      orateurs et séries proposés à ceux de A.
- [x] Un membre de l'église B peut lire de bout en bout un culte de l'église A.
- [x] Un membre de l'église B ne peut pas générer de lien de partage public sur un culte de A.
- [x] Un membre de l'église B ne peut ni déposer, ni publier, ni dépublier, ni modifier quoi que
      ce soit dans l'église A.
- [x] Un membre de l'église B ne peut accéder à aucune autre donnée de l'église A (planning,
      membres, événements, comptes rendus…).
- [x] Après révocation du partage, un membre de l'église B ne voit plus aucun culte de A et se
      voit refuser l'écoute d'un culte de A dont il connaît l'adresse.
- [x] Un culte dépublié par A disparaît de la bibliothèque de B sans délai.
- [x] Une église sans partage entrant ni sortant constate un espace Audio strictement inchangé.
- [x] L'ouverture et la révocation d'un partage apparaissent dans l'historique des modifications
      de l'église A.

## Hors périmètre

- **Toute hiérarchie entre églises** (église mère / église fille, réseau, arborescence) : cette
  feature ne modélise que des partages dirigés, décidés au cas par cas.
- **Le partage culte par culte** : c'est toute la bibliothèque publiée qui est ouverte, ou rien.
  Le grain fin pourra être ajouté plus tard sans remettre en cause ce modèle.
- **La demande d'accès par l'église destinataire** : pas de flux de demande/validation. L'église
  propriétaire décide seule et unilatéralement ; les églises se concertent hors de l'application.
- **La notification automatique** de l'église destinataire lors de l'ouverture d'un partage.
- **Tout annuaire des églises accessible aux administrateurs d'église** : la liste des églises
  hébergées reste réservée à l'administration de la plateforme.
- **La mise en relation des églises par l'application** (recherche, suggestion, annuaire
  consultable) : les églises se connaissent et échangent leur identifiant hors application.
- **Le partage vers l'extérieur de la plateforme** : les liens publics par jeton existants ne
  changent pas et restent la seule voie hors application.
- **Les statistiques d'écoute croisées** : savoir combien de membres de B ont écouté les cultes
  de A n'est pas couvert.
- **L'extension du partage à d'autres modules** (comptes rendus, planning, discipolat…) : cette
  feature ne concerne que la bibliothèque audio.
- **La production audio partagée** : la file d'attente, le dépôt et le nommage restent
  strictement internes à chaque église.

## Questions ouvertes

- Faut-il afficher à l'église destinataire la liste des églises qui lui ont ouvert leur
  bibliothèque (transparence sur l'origine de ce qu'elle voit), ou la marque d'origine sur
  chaque culte suffit-elle ?
- Le Secrétaire doit-il pouvoir administrer les partages au même titre que l'Admin ? Il gère déjà
  le dépôt et la publication mais pas les paramètres du module audio ; la spec le laisse
  volontairement en dehors pour l'instant.
- Faut-il borner le nombre d'églises destinataires, ou laisser l'ouverture libre ?
- L'affichage du nom de l'église en regard de l'identifiant saisi est un compromis assumé : il
  évite d'ouvrir sa bibliothèque à la mauvaise église, au prix d'une possibilité de sondage
  identifiant → nom, bornée par la limitation de débit et réservée aux Admins. À confirmer.

*Tranché le 2026-09-02 : le lien entre églises est noué par l'église propriétaire seule, par
saisie de l'identifiant du destinataire — pas de liste d'églises exposée aux administrateurs
d'église, pas de passage obligé par l'administration de la plateforme.*

*Tranché le 2026-09-02 : l'identifiant utilisé est **l'identifiant court et unique déjà porté par
chaque église** — pas de nouvel identifiant dédié au partage.*
