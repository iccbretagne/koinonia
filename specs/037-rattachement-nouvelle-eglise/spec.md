# Spec — Rattachement d'une personne à une nouvelle église

- **Numéro** : 037
- **Statut** : En revue
- **Créée le** : 2026-09-07
- **Branche suggérée** : `feat/rattachement-nouvelle-eglise`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Une personne qui sert dans une église peut aussi servir dans une autre : elle déménage, elle
rejoint une implantation, ou elle sert simplement dans deux assemblées du réseau. Aujourd'hui,
**Koinonia rend ce cas impossible** — non par une règle métier assumée, mais par un enchaînement
de verrous qui se renvoient l'un à l'autre.

Le cas a été rencontré en production : un compte déjà rattaché à un STAR dans l'église A doit
être rattaché à un STAR de l'église B. Aucun des quatre chemins existants n'aboutit :

1. L'administrateur de l'église B cherche la personne dans l'écran de rattachement d'un compte à
   un STAR : la recherche ne renvoie que les comptes ayant **déjà** un rôle ou une demande dans
   l'église B. La personne n'y a rien : elle est introuvable, quel que soit le texte saisi.
2. Même en la trouvant, le rattachement est refusé : le système exige que le compte ait déjà un
   lien avec l'église B — la condition même qu'on cherche à créer.
3. L'écran de gestion des accès de l'église B liste les mêmes personnes, avec le même filtre.
4. La personne elle-même, depuis son profil, ne peut demander à rejoindre que les églises où elle
   a **déjà** un rôle. L'église B ne lui est jamais proposée.

Le verrou est circulaire : pour entrer dans une église, il faut déjà y être. Seule la création
d'une église toute neuve permet aujourd'hui de désigner quelqu'un par son adresse email — un
mécanisme réservé à l'ouverture d'une église, inutilisable sur une église déjà en service.

Conséquence opérationnelle : la seule issue actuelle est une intervention manuelle en base de
données. C'est ce que cette feature doit supprimer.

### Ce que « rattacher » doit vouloir dire

Un constat important pour le périmètre : **lier un compte à un STAR ne donne aucun accès**. Le
lien et le droit d'entrer dans l'église sont deux choses distinctes. Une personne liée sans rôle
verrait une application vide. Le rattachement décrit ici doit donc produire une **admission
complète** — la personne accède réellement à l'église — et non un simple lien symbolique.

Cette admission complète existe déjà : c'est exactement ce que produit la validation d'une
demande de rattachement par un administrateur. Les deux chemins ci-dessous doivent y aboutir,
pas en réimplémenter une partie.

## Utilisateurs concernés

**Chemin initié par l'administration de l'église cible**

- **Super Admin, Admin, Ministre, Responsable de département** — les rôles qui gèrent déjà les
  membres de leur église. Ils peuvent désigner une personne par son adresse email exacte et la
  rattacher à un STAR de leur église. Leur périmètre habituel (ministère, départements) reste
  celui qui s'applique.
- **Secrétaire** — voir les questions ouvertes : il administre l'écran des accès mais ne gère pas
  les membres, et ne peut donc pas valider une demande aujourd'hui.

**Chemin initié par la personne elle-même**

- **Tout utilisateur authentifié**, quel que soit son rôle et même s'il n'appartient encore à
  aucune église, peut demander à rejoindre une église. Il ne s'accorde aucun droit : sa demande
  part en attente et n'a d'effet que si un administrateur de l'église visée la valide.

**Côté validation** — inchangé : les demandes arrivent dans l'écran de gestion des accès de
l'église visée, où elles sont validées, refusées ou reconsidérées comme aujourd'hui. Cette
feature n'introduit aucun écran de validation nouveau.

## Comportement attendu

### Scénario principal A — l'administrateur rattache une personne connue

1. L'administrateur de l'église B ouvre la fiche du STAR à pourvoir et demande à y rattacher un
   compte.
2. Il saisit l'adresse email **complète et exacte** de la personne, qu'il connaît déjà par
   ailleurs.
3. Le système confirme qu'un compte correspond à cette adresse, et l'affiche pour validation.
4. L'administrateur confirme le rattachement.
5. La personne est admise dans l'église B : elle y est liée au STAR choisi et y dispose d'un
   accès effectif. Elle en est informée.
6. Ses rattachements dans ses autres églises sont intacts.

### Scénario principal B — la personne demande à rejoindre une église

1. L'église B diffuse **son identifiant public** à ceux qu'elle accueille — par ses propres
   moyens : bulletin, responsable de département, affichage, QR code. C'est le même identifiant
   que celui déjà utilisé pour le partage de bibliothèque audio, pas un nouveau code.
2. Emmanuella, déjà utilisatrice de Koinonia pour l'église A, ouvre son profil et demande à
   rejoindre une nouvelle église. Elle saisit l'identifiant que l'église B lui a communiqué. Le
   nom de l'église correspondante s'affiche, pour qu'elle vérifie qu'elle s'adresse bien à la
   bonne église, puis elle confirme.
3. Elle indique la fiche STAR à laquelle elle veut être rattachée, ou demande la création d'une
   fiche, comme le permet déjà le formulaire existant.
4. Sa demande part en attente ; les administrateurs de l'église B en sont informés.
5. Un administrateur de l'église B la valide depuis l'écran des accès habituel.
6. Emmanuella est admise dans l'église B, avec un accès effectif, sans rien perdre de l'église A.

### Scénarios alternatifs / cas limites

- **Si l'adresse email saisie par l'administrateur ne correspond à aucun compte**, le système le
  dit clairement et propose de rattacher tout de même la personne : elle sera admise à sa
  première connexion avec cette adresse. Une erreur de frappe ne doit pas créer silencieusement
  un rattachement dormant vers une adresse inexistante — la confirmation est explicite.
- **Si la personne est déjà rattachée à un STAR dans cette église**, le rattachement est refusé
  avec un message qui le dit — comportement actuel, conservé.
- **Si le STAR visé est déjà lié à un autre compte**, le rattachement est refusé — comportement
  actuel, conservé.
- **Si une demande de la même personne est déjà en attente dans cette église**, le système ne
  crée pas de doublon.
- **À aucun moment l'application ne propose la liste des églises** à l'utilisateur : ni à la
  saisie, ni en suggestion, ni en autocomplétion. L'identifiant vient toujours de l'extérieur —
  même règle que pour le partage de bibliothèque audio.
- **Si l'identifiant saisi ne correspond à aucune église**, l'utilisateur reçoit un message
  l'invitant à le vérifier auprès de l'église concernée, et rien n'est créé.
- **Si l'utilisateur saisit l'identifiant d'une église où il a déjà un rôle ou une demande en
  attente**, il en est informé et aucun doublon n'est créé.
- **Les tentatives répétées de saisie d'identifiants sont limitées en débit.** Afficher le nom
  d'une église en regard de son identifiant est nécessaire pour éviter d'adresser sa demande à
  la mauvaise assemblée, mais ne doit pas devenir un moyen de reconstituer l'annuaire des
  églises par sondage. Ce contrôle existe déjà pour le partage audio ; il s'applique ici à un
  public plus large — tout utilisateur authentifié, et non plus les seuls administrateurs — ce
  qui rend son réglage d'autant plus important.
- **Si l'administrateur cherche par nom** (et non par email), il ne voit que les personnes déjà
  rattachées à son église : ce comportement est **inchangé et voulu**. Aucun annuaire des
  personnes des autres églises n'est exposé.
- **Si la personne existe déjà comme STAR de l'église visée sous une fiche homonyme**, le
  garde-fou anti-doublon existant s'applique à la validation, comme aujourd'hui.
- **Quand une demande est refusée**, la personne en est informée et peut être reconsidérée
  ultérieurement — comportement actuel, conservé.

## Critères d'acceptation

- [ ] Un administrateur de l'église B peut rattacher à un STAR de son église un compte dont
      l'unique rattachement est l'église A, en saisissant son adresse email exacte.
- [ ] À l'issue de ce rattachement, la personne accède effectivement à l'église B (elle n'est pas
      liée sans droits).
- [ ] Ses rattachements et accès dans ses autres églises sont inchangés.
- [ ] Une recherche par **nom** effectuée par un administrateur ne renvoie aucune personne
      extérieure à son église, quel que soit le nom saisi.
- [ ] Une recherche par **fragment** d'adresse email ne renvoie rien : seule l'adresse complète
      et exacte donne un résultat.
- [ ] Un utilisateur peut, depuis son profil, soumettre une demande de rattachement à une église
      où il n'a aucun rôle, en saisissant l'identifiant public que cette église lui a communiqué.
- [ ] À aucun endroit du parcours l'utilisateur ne se voit proposer la liste des églises de la
      plateforme — ni liste, ni suggestion, ni autocomplétion.
- [ ] Un identifiant inconnu ne crée rien et n'indique pas si l'église existe autrement que par
      l'absence de nom affiché.
- [ ] Les saisies répétées d'identifiants sont limitées en débit.
- [ ] Cette demande n'accorde aucun droit tant qu'un administrateur de l'église visée ne l'a pas
      validée.
- [ ] Une demande validée produit exactement la même admission que le chemin administrateur.
- [ ] Les deux chemins sont tracés dans l'historique des modifications de l'église concernée.
- [ ] Aucun rattachement ne peut être créé par un utilisateur pour lui-même sans validation.
- [ ] Le rattachement reste impossible si la personne est déjà liée à un STAR dans cette église,
      ou si le STAR visé est déjà pris.

## Hors périmètre

- **La refonte du système de rôles multi-église.** Une personne admise reçoit un accès à l'église
  visée ; l'attribution fine de ses rôles reste le travail des écrans d'accès existants.
- **La fusion de fiches STAR entre églises.** Une personne rattachée dans deux églises a deux
  fiches STAR distinctes, une par église. C'est le modèle actuel et il n'est pas remis en cause.
- **Le nom d'affichage partagé entre églises.** Le fait qu'un rattachement dans l'église B écrase
  le nom d'affichage défini par l'église A est une limitation connue et documentée par ailleurs ;
  cette feature ne la traite pas, mais elle en augmente mécaniquement la fréquence — à signaler
  au plan.
- **Tout transfert automatique de données entre églises** (historique de service, discipolat,
  absences). Le rattachement crée un accès, il ne déplace rien.
- **La révocation d'un rattachement**, qui existe déjà et reste inchangée.

## Décisions prises

### Désignation de l'église par l'utilisateur — par identifiant, pas par liste *(tranché)*

L'orientation initiale — proposer la liste de toutes les églises de la plateforme dans le
formulaire de profil — a été écartée : elle contredisait frontalement une décision déjà
implémentée et en production.

La spec 036 (partage de bibliothèque audio, livrée en v1.20.0) pose comme contrainte
structurante que *« seule l'administration de la plateforme connaît la liste des églises
hébergées ; un administrateur d'église n'a — volontairement — aucun moyen de les énumérer »*.
Elle porte le critère d'acceptation validé : *« à aucun endroit du parcours l'Admin de A ne se
voit proposer la liste des églises de la plateforme »*. Or tout administrateur d'église est
aussi un utilisateur disposant d'un profil : afficher la liste complète des églises dans cet
écran lui aurait remis, à un clic, l'annuaire que la 036 lui refuse — et vidé de son sens le
mécanisme d'identifiant mis en place quelques jours plus tôt.

**Décision** : l'utilisateur saisit **l'identifiant public de l'église**, que celle-ci lui
communique elle-même hors application. Même mécanisme, même identifiant et mêmes garde-fous que
le partage de bibliothèque audio — nom affiché pour confirmation avant validation, saisies
limitées en débit, aucune liste ni autocomplétion. La 036 reste valide et cohérente.

Conséquence à porter au plan : ce parcours ouvre la saisie d'identifiant à **tout utilisateur
authentifié**, alors que la 036 la réservait aux administrateurs. Le contrôle anti-sondage
existe déjà, mais son réglage doit être revu à l'aune de ce public plus large.

### Accès accordé par le chemin administrateur — l'accès de base du STAR *(tranché par défaut)*

Le chemin utilisateur permet de demander un rôle précis, que l'administrateur valide. Le chemin
administrateur part d'une fiche STAR : la personne admise reçoit **l'accès de base correspondant
au STAR**, rien de plus. Toute élévation ultérieure passe par les écrans de gestion des accès
existants, qui sont faits pour ça.

C'est l'option la plus sobre et la moins surprenante : rattacher quelqu'un à une fiche STAR ne
doit jamais accorder implicitement plus que ce que cette fiche représente. À corriger si l'usage
montre que les administrateurs enchaînent systématiquement les deux écrans.

## Questions ouvertes

### Le Secrétaire doit-il pouvoir valider ces demandes ? — hors périmètre, à décider séparément

Constat sur l'existant, **indépendant de cette feature** : le Secrétaire administre l'écran des
accès mais ne gère pas les membres — il voit donc les demandes de rattachement en attente sans
pouvoir les valider. Cette feature augmentera le volume de ces demandes et rendra l'incohérence
plus visible, sans la créer ni l'aggraver en nature.

Volontairement laissé hors périmètre : corriger cela revient à modifier la matrice des
permissions d'un rôle, ce qui dépasse le rattachement inter-églises et mérite sa propre
décision.

### Point à porter au plan

La décision d'ouvrir la recherche par **adresse email exacte** au-delà de la frontière d'église
est une exception assumée au cloisonnement multi-église. Elle est déjà consignée dans le
registre des exceptions de sécurité et devra y être tenue à jour, avec sa justification : une
correspondance exacte suppose de connaître l'adresse complète et ne permet donc pas d'énumérer
des comptes, contrairement à une recherche par fragment.
