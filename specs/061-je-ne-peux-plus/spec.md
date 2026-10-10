# Spec — « Je ne peux plus » et remplacements

- **Numéro** : 061
- **Statut** : Validée
- **Créée le** : 2026-10-10
- **Branche suggérée** : `feat/je-ne-peux-plus`
- **Origine** : issue #612, lot 3 (lot 1 : spec 058 ; lot 2 : spec 060)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Un planning évolue jusqu'au dernier moment : un STAR prévu dimanche tombe malade, a un
imprévu professionnel ou familial. Aujourd'hui :

- Le bouton **« Je ne peux pas »** de la carte « Prochain service » mène seulement à l'écran de
  disponibilités (spec 058). Le STAR y répond « Pas disponible », mais **reste au planning** :
  rien n'indique dans la grille que sa place est à pourvoir, hormis un avertissement sur sa
  ligne.
- Son responsable reçoit une notification simple (« Paul n'est plus disponible le 12 »), **sans
  piste pour le remplacer** (la spec 058 renvoyait explicitement ce point à ce lot).
- Le responsable doit alors ouvrir la grille, vérifier un par un qui est disponible, qui sert
  déjà ailleurs ce jour-là, puis contacter quelqu'un — le plus souvent par message, hors de
  Koinonia.

On veut qu'un STAR puisse **se retirer d'un service** en un geste, que la place apparaisse
clairement **à remplacer**, et que son responsable reçoive aussitôt **une liste de remplaçants
possibles** parmi lesquels choisir.

## Terminologie

- **Service** : la présence d'un STAR au planning d'un département pour un événement, avec son
  statut (en service, en service + débrief, remplaçant) — même définition que la spec 060.
- **Désistement** : le geste par lequel un STAR planifié signale qu'il ne peut plus assurer un
  service.
- **Service à remplacer** : un service dont le STAR s'est désisté et pour lequel aucun
  remplaçant n'a encore été choisi.
- **Date limite de planification** : l'échéance facultative que porte chaque événement ; une
  fois passée, le planning n'est plus modifiable par les responsables (seuls Super Admin, Admin
  et Secrétaire peuvent encore y toucher).
- **Remplaçant possible** : pour un service à remplacer, un membre du même département qui
  - n'est pas déjà au planning de ce département pour cet événement ;
  - a répondu **Disponible** ou **Si besoin** pour cet événement (spec 058) ;
  - n'est pas déjà de service dans un **autre département le même jour**.

## Utilisateurs concernés

- **STAR** (et tout membre planifié dont le compte est relié à sa fiche STAR, quel que soit son
  rôle) : se désiste d'un de ses services à venir ; peut annuler son désistement tant qu'aucun
  remplaçant n'a été choisi.
- **Resp. département** (et adjoint) : est prévenu d'un désistement dans son département, voit
  la liste des remplaçants possibles, choisit un remplaçant.
- **Ministre** : mêmes droits que le responsable sur les départements de son ministère ; prévenu
  selon la règle décrite dans « Qui est prévenu ».
- **Admin, Super Admin** : peuvent choisir un remplaçant sur tout département de l'église, comme
  ils modifient déjà tout planning. Ils ne sont pas prévenus de chaque désistement.
- **Secrétaire** : en lecture seule sur le planning (comme aujourd'hui) — il voit les services à
  remplacer mais ne choisit pas de remplaçant.
- **Faiseur de Disciples, Reporter, Comptable, Référent soins pastoraux** : non concernés, sauf
  s'ils sont eux-mêmes planifiés (ils se désistent alors comme tout STAR).

## Comportement attendu

### Scénario principal

1. Paul est planifié « en service » chez les Choristes pour le culte du dimanche 12.
2. Le jeudi, il a un empêchement. Sur sa carte « Prochain service » (ou dans « Mon planning »),
   il appuie sur **« Je ne peux plus »**.
3. Une confirmation lui demande de valider, avec un **message facultatif** pour son
   responsable (« fièvre depuis hier, désolé »).
4. Paul valide. Son service apparaît « **Désisté — en attente de remplacement** » dans « Mon
   planning » ; sa disponibilité pour cet événement passe à **Pas disponible** pour les
   Choristes (cohérent avec la spec 058 : il ne peut plus servir ce jour-là dans ce
   département).
5. Marie, responsable Choristes, reçoit **immédiatement** une notification : « Paul ne peut plus
   servir le dimanche 12 (Choristes) — 3 remplaçants possibles ». Elle n'attend pas le délai de
   regroupement de la spec 060 : un désistement est urgent.
6. La notification ouvre l'écran du service à remplacer : le message de Paul, puis la liste des
   remplaçants possibles, **les « Disponible » d'abord, puis les « Si besoin »**.
7. Marie choisit Léa. Léa prend la place de Paul **avec le même statut** (en service).
8. Paul sort du planning de l'événement ; le service n'est plus à remplacer.
9. Léa est prévenue qu'elle sert le 12, par le récapitulatif habituel de la spec 060. Paul reçoit
   une confirmation : « Léa te remplace le dimanche 12 ».

### Dans la grille

- Un service à remplacer est **visible au premier coup d'œil** dans la grille du département :
  la ligne du STAR désisté est signalée « à remplacer », avec son éventuel message.
- Le compteur de l'événement indique le nombre de services à remplacer.
- Le responsable peut aussi pourvoir la place **directement depuis la grille**, comme il compose
  déjà son planning : placer quelqu'un d'autre sur l'événement et retirer le STAR désisté met fin
  au remplacement, sans passer par la liste.

### Scénarios alternatifs / cas limites

- **Annulation du désistement** : Paul retrouve finalement sa soirée. Tant qu'aucun remplaçant
  n'a été choisi, il peut **annuler son désistement** : il reprend son service, sa réponse
  revient à Disponible, et le responsable prévenu reçoit une notification « Paul peut finalement
  servir le 12 ». Une fois un remplaçant choisi, l'annulation n'est plus possible : il doit
  s'adresser à son responsable.
- **Aucun remplaçant possible** : la notification et l'écran l'indiquent clairement (« aucun
  membre disponible ni “si besoin” libre ce jour-là »). Le responsable peut quand même placer
  quelqu'un depuis la grille, avec l'avertissement habituel s'il est indisponible (spec 058).
- **Remplaçant devenu indisponible entre-temps** : la liste est recalculée à chaque ouverture ;
  si la personne choisie n'est plus un remplaçant possible au moment du choix (elle vient de se
  placer ailleurs, ou de répondre Pas disponible), le choix est refusé avec un message clair et
  la liste est rafraîchie.
- **Deux responsables en même temps** : Marie et son adjoint choisissent chacun un remplaçant au
  même moment. Le premier choix l'emporte ; le second est informé que le service a déjà été
  pourvu, et par qui.
- **Statut conservé** : le remplaçant reprend le statut du service (en service, en service +
  débrief, remplaçant). Le responsable peut le modifier ensuite dans la grille, comme
  aujourd'hui.
- **Plusieurs services le même jour** : Paul sert chez les Choristes et à l'Accueil le 12. « Je
  ne peux plus » porte sur **un service** ; il peut se désister des deux, chaque désistement
  prévient le responsable du département concerné.
- **Jusqu'à quand se désister** : le désistement est possible jusqu'à la **date limite de
  planification** de l'événement ; si l'événement n'en a pas, jusqu'à son début.
- **Après la date limite de planification** : « Je ne peux plus » est remplacé par un message
  invitant le STAR à **joindre directement son responsable**, avec ses coordonnées s'il les a
  renseignées. Le planning étant figé pour les responsables, un désistement en ligne ne pourrait
  plus être pourvu par eux.
- **Événement passé ou commencé** : le désistement n'est plus proposé.
- **Remplacement après la date limite** : un désistement fait **avant** la date limite peut être
  pourvu **après** elle par le responsable, via la liste des remplaçants possibles : choisir un
  remplaçant pour un service à remplacer reste possible jusqu'au début de l'événement, même si le
  reste du planning est figé.
- **Le responsable se désiste lui-même** : s'il est planifié dans son propre département, son
  désistement prévient les **autres** responsables du département ; à défaut, le Ministre.
- **Département sans responsable** : le Ministre du ministère est prévenu.
- **Service retiré par le responsable avant tout choix** : si Marie retire simplement Paul de la
  grille sans le remplacer, le service n'est plus « à remplacer » ; Paul est prévenu de son
  retrait par le récapitulatif habituel (spec 060).
- **Événement supprimé ou déplacé** : déjà couvert par la spec 059 ; un désistement en cours sur
  cet événement disparaît avec lui (événement supprimé) ou est conservé tel quel (événement
  déplacé) — le STAR désisté n'est pas remis au planning.
- **STAR sans compte relié** : il ne peut pas se désister lui-même ; son responsable le retire et
  le remplace depuis la grille, comme aujourd'hui.
- **Préférences** : la notification dans l'application part toujours ; l'email suit les
  préférences « Planning et service » de chacun (spec 053).

### Qui est prévenu d'un désistement

1. Les responsables (et adjoints) du département concerné, sauf le STAR désisté lui-même.
2. À défaut de responsable autre que lui, le Ministre du ministère du département.

Le Ministre n'est pas mis en copie systématique : il n'est prévenu qu'à défaut de responsable.

### Service resté à remplacer

Si le service est encore à remplacer **48 h avant l'événement**, les destinataires du
désistement reçoivent **une relance**, une seule, avec la liste des remplaçants possibles mise à
jour. Pas de relance si le désistement survient lui-même moins de 48 h avant l'événement (la
notification initiale vient de partir).

### Depuis l'écran de disponibilités

Un STAR **déjà planifié** qui répond « Pas disponible » pour un événement depuis l'écran de
disponibilités — réponse à l'événement ou raccourci « Pas disponible du … au … » — **se
désiste** de ses services concernés, avec exactement les mêmes effets que « Je ne peux plus » :
service à remplacer, notification immédiate avec liste de remplaçants, relance, annulation
possible. Une seule règle, quel que soit le chemin emprunté. Cela remplace la notification
simple prévue par la spec 058 pour ce cas.

- Avant de valider, l'écran l'avertit : « Tu es planifié le 12 (Choristes) : ton responsable va
  devoir te remplacer. »
- Avec le raccourci période, chaque service planifié dans la période donne lieu à un
  désistement distinct, chacun prévenant le responsable de son département.
- Après la date limite de planification d'un événement, la réponse « Pas disponible » reste
  enregistrée (spec 058) mais ne crée pas de service à remplacer : le STAR est invité à joindre
  son responsable, qui reçoit la notification simple de la spec 058.

## Critères d'acceptation

- [ ] Un STAR planifié sur un service à venir dispose d'une action « Je ne peux plus » depuis sa
      carte « Prochain service » et depuis « Mon planning ».
- [ ] Le désistement demande une confirmation et accepte un message facultatif destiné au
      responsable.
- [ ] Après un désistement, le service apparaît « à remplacer » dans la grille du département et
      dans « Mon planning » du STAR, et le compteur de l'événement l'indique.
- [ ] Après un désistement, la disponibilité du STAR pour cet événement et ce département est
      « Pas disponible ».
- [ ] Les destinataires définis dans « Qui est prévenu » reçoivent une notification
      **immédiate** (sans délai de regroupement), qui indique le nombre de remplaçants possibles
      et ouvre l'écran du service à remplacer.
- [ ] La liste des remplaçants possibles ne contient que des membres du département, non déjà
      planifiés dans ce département pour l'événement, ayant répondu Disponible ou Si besoin, et
      non planifiés dans un autre département le même jour ; les « Disponible » apparaissent
      avant les « Si besoin ».
- [ ] Le choix d'un remplaçant le place au planning avec le statut du service remplacé, retire
      le STAR désisté, et met fin à l'état « à remplacer ».
- [ ] Le remplaçant est prévenu par le récapitulatif de la spec 060 ; le STAR désisté reçoit une
      confirmation nommant son remplaçant.
- [ ] Un choix devenu invalide (remplaçant plus libre, service déjà pourvu) est refusé avec un
      message clair.
- [ ] Le STAR peut annuler son désistement tant qu'aucun remplaçant n'est choisi ; le responsable
      prévenu en est informé.
- [ ] Seuls ceux qui peuvent modifier le planning du département (responsable et adjoint,
      Ministre du ministère, Admin, Super Admin) peuvent choisir un remplaçant ; le Secrétaire
      voit les services à remplacer sans pouvoir les pourvoir.
- [ ] Le désistement est proposé jusqu'à la date limite de planification de l'événement, ou
      jusqu'à son début s'il n'en a pas ; au-delà, le STAR est invité à joindre son responsable.
- [ ] Un service à remplacer peut être pourvu via la liste des remplaçants jusqu'au début de
      l'événement, même après la date limite de planification.
- [ ] Le Ministre n'est prévenu que lorsque le département n'a pas d'autre responsable que le
      STAR désisté.
- [ ] Un service encore à remplacer 48 h avant l'événement donne lieu à une relance unique des
      destinataires du désistement, sauf si le désistement date de moins de 48 h avant
      l'événement.
- [ ] Répondre « Pas disponible » depuis l'écran de disponibilités (événement ou période) pour un
      service planifié, avant la date limite, produit un désistement identique à « Je ne peux
      plus », après un avertissement explicite.
- [ ] Les notifications respectent les préférences de notification (in-app toujours, email selon
      « Planning et service »).
- [ ] Tous les écrans du parcours (désistement, notification, liste de remplaçants) sont
      utilisables sur mobile.

## Hors périmètre

- **Échange entre deux STAR** validé par le responsable (issue #612, lot ultérieur).
- **Sollicitation des remplaçants** : le responsable choisit directement un remplaçant ; le
  système n'envoie pas de demande « Peux-tu remplacer Paul ? » aux candidats, ni ne laisse un
  STAR se proposer lui-même.
- **Choix du remplaçant par le STAR désisté** : seul un responsable désigne le remplaçant.
- Effectif requis par événement et alerte de sous-effectif.
- Remplacement sur les **événements d'équipe** (répétitions, réunions — spec 044) : ils n'ont pas
  de planning de service.

## Décisions (clarifications du 2026-10-10)

- Fin du désistement : la **date limite de planification** de l'événement, à défaut son début.
- Destinataires : responsables et adjoints du département ; le **Ministre seulement à défaut**.
- **Relance unique** 48 h avant l'événement si le service est encore à remplacer.
- Une réponse « Pas disponible » donnée depuis l'écran de disponibilités par un STAR déjà
  planifié a **le même effet** que « Je ne peux plus ».

## Questions ouvertes

- Aucune bloquante.
- À noter pour le plan : la documentation de processus (« planning de service ») présente la date
  limite de planification comme non bloquante, alors que le planning est aujourd'hui figé pour
  les responsables une fois l'échéance passée ; la documentation est à réaligner.
