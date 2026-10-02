# Spec — Collecte des disponibilités et disponibilités dans la grille

- **Numéro** : 058
- **Statut** : Validée
- **Créée le** : 2026-10-02
- **Branche suggérée** : `feat/collecte-disponibilites`
- **Origine** : issue #612, lot 1 (lots 2 et 3 : notifications regroupées, « Je ne peux plus »)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Préparer un planning se fait aujourd'hui en grande partie hors de Koinonia :

1. les STAR disent à leurs responsables, par message, quand ils sont disponibles ;
2. le responsable compile ces réponses et saisit le planning dans Koinonia ;
3. l'équipe réagit, le responsable réajuste.

Koinonia ne couvre que l'étape 2. La seule notion approchante est la **déclaration d'absence**,
jugée peu intuitive par les utilisateurs (écran chargé, vocabulaire « Backup », « Fiche STAR »,
« Vue d'ensemble »), et qui ne répond qu'à la question inverse : on ne déclare que ses absences,
jamais ses disponibilités. Un responsable ne sait donc pas distinguer « disponible » de « n'a pas
répondu ». Par ailleurs, le statut « Indisponible » de la grille est posé à la main, sans lien
avec ce que le STAR a déclaré : le responsable ressaisit l'information.

Un STAR qui sert dans plusieurs départements reçoit en outre autant de demandes informelles
qu'il a de responsables.

On veut que Koinonia **collecte lui-même les disponibilités**, une fois par mois pour toute
l'église, et que le responsable les **voie directement dans la grille** au moment de composer
son planning.

## Terminologie

- **Collecte** : la demande mensuelle de disponibilités adressée à tous les STAR de l'église,
  pour les événements d'un mois donné (le **mois cible**).
- **Réponse** : pour un événement, l'un des trois choix **Disponible**, **Si besoin**
  (« je préfère ne pas servir, mais je peux dépanner »), **Pas disponible**.
- **Sans réponse** : le STAR ne s'est pas positionné sur l'événement.
- **Indisponible** : un STAR « Pas disponible », ou « Sans réponse » une fois la collecte close.
  Ce n'est plus une déclaration distincte : c'est **la conséquence** de la réponse (ou de son
  absence). La notion d'« absence » disparaît au profit de celle-ci.

## Utilisateurs concernés

- **STAR** (et tout membre d'un département, quel que soit son rôle) : reçoit la collecte, répond
  sur un seul écran pour tous ses départements, peut modifier ses réponses.
- **Secrétaire / équipe Secrétariat, Admin, Super Admin** : règlent la fenêtre de la collecte pour
  l'église ; suivent le taux de réponse ; peuvent répondre **à la place** d'un STAR (décision
  #612 : le Secrétaire garde ce droit).
- **Resp. département, Ministre** : voient les disponibilités dans la grille de leurs
  départements ; peuvent répondre à la place d'un STAR de leur périmètre (comme ils déclarent
  aujourd'hui une absence pour lui) ; peuvent interroger leur équipe sur un événement précis.
- **Faiseur de Disciples, Reporter, Comptable, Référent soins pastoraux** : non concernés, sauf
  s'ils sont eux-mêmes membres d'un département (ils répondent alors comme tout STAR).

## Comportement attendu

### Scénario principal — collecte mensuelle

1. L'église a réglé sa fenêtre : ouverture **2 mois** avant le mois cible, clôture **7 jours**
   avant le premier événement du mois cible.
2. Le 1er octobre, la collecte de **décembre** s'ouvre automatiquement. Chaque STAR reçoit une
   notification « Indique tes disponibilités pour décembre ».
3. Paul (Accueil et Louange) ouvre l'écran de disponibilités : il voit **la liste des
   événements de décembre où au moins un de ses départements sert**, et pour chacun les trois
   choix. Une seule liste, quel que soit son nombre de départements.
4. Il répond « Disponible » à la plupart, « Pas disponible » au 25, « Si besoin » au 31.
5. Pour ses vacances, il utilise le raccourci **« Pas disponible du … au … »** : tous les
   événements de la période passent à « Pas disponible » en une fois.
6. Quelques jours avant la clôture, les STAR qui n'ont pas répondu à tout reçoivent une
   **relance**.
7. À la clôture, les événements restés sans réponse comptent comme **indisponibles**.
8. Marie, responsable Louange, ouvre la grille de décembre : à côté de chaque STAR, une
   **pastille** indique sa disponibilité pour l'événement. Les disponibles apparaissent en
   premier.

### Scénario — réponse ciblée sur un département

1. Paul accepte de servir le 18 à la Louange, mais pas à l'Accueil.
2. Sur l'événement du 18, il précise que sa réponse « Disponible » ne vaut que pour la
   **Louange** ; pour l'Accueil il est « Pas disponible ».
3. La grille Louange le montre disponible le 18, la grille Accueil le montre indisponible.

Par défaut, une réponse vaut pour **tous** ses départements : le ciblage est une précision
facultative, comme l'absence ciblée d'aujourd'hui (spec 050).

### Scénario — composer le planning

1. Dans la grille d'un événement, Marie voit pour chaque STAR : Disponible / Si besoin /
   Pas disponible / Sans réponse.
2. Un compteur par événement indique le nombre de STAR **disponibles** (et « si besoin »)
   au regard du besoin.
3. Un STAR **déjà de service dans un autre département** le même jour est signalé.
4. Marie place un STAR indisponible : c'est **possible**, avec un **avertissement** qui précise
   la raison (« a répondu Pas disponible » ou « n'a pas répondu »).

### Scénario — événement ajouté après l'ouverture

1. La collecte de décembre est ouverte ; le Secrétariat ajoute un culte le 13.
2. Les STAR des départements qui servent sur cet événement reçoivent une **demande de
   positionnement** pour ce seul événement.
3. Il apparaît dans leur écran de disponibilités, « Sans réponse » jusqu'à ce qu'ils répondent.

### Scénario — demande ponctuelle d'un responsable

1. Hors collecte (ou pour un événement déjà couvert), Marie veut confirmer son équipe pour le
   concert de Noël du 20.
2. Elle **interroge son équipe sur cet événement** : les membres de son département reçoivent
   une demande de positionnement pour cet événement seulement.
3. Leurs réponses apparaissent dans sa grille comme celles de la collecte.

### Scénario — réponse saisie par un responsable

1. Jean n'a pas de compte, ou répond par téléphone à sa responsable.
2. Marie (ou le Secrétariat) saisit la réponse de Jean pour lui, sur le même écran.
3. La réponse est marquée comme saisie par un tiers dans l'historique.

### Scénarios alternatifs / cas limites

- **Modification après la clôture** : un STAR peut encore changer sa réponse jusqu'à
  l'événement ; la grille reflète la nouvelle réponse et l'avertissement apparaît si le STAR est
  déjà placé. Si ce STAR est **déjà planifié** sur l'événement et passe « Pas disponible », le
  responsable de son département est **prévenu** (notification simple, sans suggestion de
  remplaçant — celle-ci relève du lot 3).
- **Événement hors de toute collecte** (avant la mise en service, ou événement d'un mois dont
  la collecte n'est pas encore ouverte) : aucune pastille « Sans réponse » qui laisserait croire
  que tout le monde est indisponible ; la disponibilité est simplement **non demandée**, sauf
  réponse spontanée ou demande ponctuelle.
- **Événement supprimé** : il disparaît de l'écran du STAR.
- **Événement déplacé à une autre date** : les réponses déjà données repassent « Sans réponse »
  (être libre le 12 ne dit rien du 19) et les STAR concernés reçoivent une demande de
  positionnement pour cet événement.
- **STAR ajouté à un département après l'ouverture** : les événements de ce département
  apparaissent dans son écran, « Sans réponse ».
- **STAR retiré d'un département** : les événements qui ne concernent plus aucun de ses
  départements disparaissent de son écran.
- **Collecte désactivée** : la collecte est **activée par défaut** pour toutes les églises, avec
  la fenêtre « ouverture 2 mois avant, clôture 7 jours avant le premier événement du mois » ; le
  Secrétariat ou l'Admin peut l'ajuster ou la désactiver. Désactivée, chacun garde la possibilité
  de se déclarer « Pas disponible » sur des événements ou une période, sans notion de « Sans
  réponse ».
- **Fenêtre modifiée en cours de collecte** : s'applique aux collectes à venir ; une collecte déjà
  ouverte garde la date de clôture annoncée aux STAR.
- **Mois sans événement pour un STAR** : il n'est pas sollicité pour ce mois.

## Reprise de l'existant

- Les absences déjà déclarées deviennent des réponses **« Pas disponible »** sur les événements
  qu'elles couvrent, avec le même ciblage de départements.
- Le statut « Indisponible » de la grille n'est plus posé à la main : il découle de la réponse.
  Les STAR déjà marqués « Indisponible » dans un planning existant deviennent une réponse
  « Pas disponible » saisie par le responsable, et sortent du planning de l'événement : rien
  n'est perdu, l'information change seulement de place.
- « Je ne peux pas » (carte « Prochain service ») mène à l'écran de disponibilités,
  **pré-positionné sur l'événement concerné**.
- L'écran de déclaration d'absence est remplacé par l'écran de disponibilités.
- La désignation d'un **backup** (spec 013) est **conservée** : un Resp. département ou un
  Ministre qui se déclare « Pas disponible » sur une période peut toujours désigner qui le
  remplace, sous un libellé explicite (« Qui me remplace ? ») plutôt que « Backup ».
- La vue transverse, la **frise** et l'export des absences (spec 013) sont **conservés** et
  deviennent une vue et un export des indisponibilités, alimentés par les réponses
  « Pas disponible ».

## Critères d'acceptation

- [ ] Une collecte s'ouvre automatiquement pour chaque mois cible selon la fenêtre réglée par
  l'église, et se clôt automatiquement.
- [ ] Seuls le Secrétaire, l'équipe Secrétariat, l'Admin et le Super Admin peuvent régler la
  fenêtre de collecte de leur église.
- [ ] À l'ouverture, chaque STAR concerné reçoit une notification ; une relance part avant la
  clôture vers ceux qui n'ont pas tout renseigné, et vers eux seuls.
- [ ] Un STAR membre de plusieurs départements reçoit **une seule** collecte et répond sur **un
  seul** écran, qui liste les événements où au moins un de ses départements sert.
- [ ] Le STAR peut répondre Disponible / Si besoin / Pas disponible par événement, et poser
  « Pas disponible » sur une période en une fois.
- [ ] Une réponse vaut par défaut pour tous ses départements et peut être restreinte à certains.
- [ ] Après la clôture, un événement sans réponse compte comme indisponible, mais la grille
  continue d'afficher « Sans réponse », distinct de « Pas disponible ».
- [ ] Un événement hors collecte n'affiche jamais « Sans réponse » par défaut.
- [ ] La grille affiche une pastille de disponibilité par STAR et par événement, trie les
  disponibles en premier et affiche un compteur de disponibles par événement.
- [ ] La grille signale un STAR déjà de service dans un autre département le même jour.
- [ ] Placer un STAR indisponible reste possible, avec un avertissement qui en donne la raison.
- [ ] Un événement créé après l'ouverture déclenche une demande de positionnement vers les STAR
  des départements qui y servent, et vers eux seuls.
- [ ] Un Resp. département ou un Ministre peut interroger les membres de son département sur un
  événement précis.
- [ ] Un Resp. département, un Ministre (dans leur périmètre), le Secrétariat et l'Admin peuvent
  saisir la réponse d'un STAR à sa place ; l'historique indique qui l'a saisie.
- [ ] Un STAR ne voit et ne modifie que ses propres réponses ; un responsable ne voit que celles
  des STAR de son périmètre.
- [ ] Les absences existantes apparaissent comme « Pas disponible » sur les événements qu'elles
  couvrent, avec le même ciblage.
- [ ] Quand un STAR déjà planifié sur un événement passe « Pas disponible », le responsable de
  son département est prévenu.
- [ ] Un événement déplacé à une autre date remet ses réponses à « Sans réponse » et déclenche
  une demande de positionnement.
- [ ] La collecte est active par défaut dans chaque église ; une collecte ouverte garde sa date
  de clôture si la fenêtre est modifiée.
- [ ] Les STAR marqués « Indisponible » dans un planning existant deviennent des réponses
  « Pas disponible » et ne sont plus planifiés sur l'événement.
- [ ] Un Resp. département ou un Ministre « Pas disponible » sur une période peut désigner qui
  le remplace ; la frise et l'export des indisponibilités restent disponibles.
- [ ] « Je ne peux pas » ouvre l'écran de disponibilités sur l'événement concerné.
- [ ] L'écran de disponibilités est utilisable sur mobile.

## Hors périmètre

- **Notifications des changements de planning** (« Tu sers le 12 ») — lot 2.
- **« Je ne peux plus »**, passage d'un service « à remplacer », suggestion de remplaçants,
  échanges entre STAR — lot 3.
- Brouillon / publication du planning — écarté (#612).
- **Placement automatique** des STAR à partir des disponibilités : le responsable compose
  toujours lui-même son planning.
- Disponibilités pour les **événements d'équipe** (répétitions, réunions internes — spec 044) :
  seuls les événements d'église sont collectés, y compris pour la demande ponctuelle d'un
  responsable.
- Disponibilités pour l'ouverture/fermeture de l'église (spec 041).

## Questions ouvertes

Arbitrages du 2026-10-02 intégrés ci-dessus (alerte au responsable dès le lot 1, remise à zéro
sur changement de date, collecte active par défaut, clôture annoncée non recalculée, reprise des
« Indisponible » en réponses, backup et frise conservés, événements d'équipe exclus).

- Décision structurante à consigner en **ADR** au moment du plan : fusion de « absence » et du
  statut « Indisponible », qui revient sur la spec 050 (§ Statuts de service).
