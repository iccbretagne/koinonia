# Spec — Suivi de l'accueil des nouveaux arrivants (consentement, états d'attente, relances)

- **Numéro** : 051
- **Statut** : Validée
- **Créée le** : 2026-09-21
- **Mise à jour le** : 2026-09-21
- **Branche suggérée** : `feat/suivi-accueil-nouveaux-arrivants`
- **Issue source** : [#579](https://github.com/iccbretagne/koinonia/issues/579)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Aujourd'hui, un nouvel arrivant à l'accueil peut remplir un formulaire s'il souhaite être
contacté. Sa demande suit ensuite un parcours strictement linéaire : demande reçue → famille
affectée → premier contact établi → ajout au groupe de la famille → intégration terminée. Une
demande peut être abandonnée à tout moment, et une demande abandonnée peut être rouverte.

Ce parcours ne couvre que le cas idéal : la personne veut être contactée **immédiatement**, et
son adresse permet de l'affecter directement à une famille. Trois problèmes en découlent.

**1. Le consentement au contact n'a que deux valeurs, alors qu'il en faut trois.** Une personne
qui ne souhaite pas être contactée tout de suite, mais accepte qu'on garde son contact pour plus
tard, n'a aujourd'hui aucune case à cocher : elle est traitée comme quelqu'un qui veut être
contacté maintenant (et sera importunée), ou comme un refus (et sera perdue).

**2. Une demande qui ne peut pas avancer n'a nulle part où attendre.** Deux situations bloquent
le parcours sans qu'aucun état ne les représente : la personne demande à être recontactée plus
tard, ou son adresse ne correspond à aucune famille d'impact et la décision revient au
département en charge de la mission — lequel n'utilise pas Koinonia aujourd'hui. Faute d'état
dédié, ces demandes restent affichées comme « à traiter » et polluent la file, ou sont
abandonnées à tort.

**3. Rien ne signale qu'une demande traîne.** Une fois mise de côté, une demande n'alerte
personne. L'équipe intégration n'est jamais prévenue qu'une personne attend depuis trois mois,
et aucune trace ne permet de savoir si quelqu'un l'a déjà relancée, ni quand, ni qui.

S'ajoute un défaut d'intégrité constaté sur le parcours existant : une demande rouverte après
abandon repart à l'état « demande reçue » tout en conservant la famille et le berger qui lui
avaient été affectés. Elle apparaît donc comme neuve dans la file de traitement alors qu'un
berger la croit toujours sienne.

Sans cette évolution, des personnes intéressées par l'église restent silencieusement sans suite,
et les cas qui sortent du parcours standard sont gérés hors de l'outil.

## Utilisateurs concernés

- **STAR** (membre de l'équipe intégration) : recueille le formulaire, traite les demandes, pose
  et lève les états d'attente, reçoit les relances, consulte l'historique d'une demande.
- **Berger assigné** (responsable de la famille d'impact à laquelle une demande a été affectée) :
  fait avancer les demandes qui lui sont confiées et peut les mettre en attente une fois le
  premier contact établi. Il ne peut ni affecter une famille, ni rouvrir une demande abandonnée.
- **Resp. département** (responsable de l'équipe intégration) : même périmètre qu'un membre de
  l'équipe, plus la supervision de l'ensemble des demandes en attente et le réglage des deux
  délais avant relance.
- **Ministre** (du ministère dont dépend l'intégration) : vue d'ensemble sur le parcours des
  nouveaux arrivants de son ministère.
- **Secrétaire** : dispose déjà d'un accès au suivi de l'intégration et reste concerné à ce titre.
- **Admin / Super Admin** : accès complet, et réglage des deux délais avant relance — cette
  responsabilité est partagée avec le responsable de l'équipe intégration.

## Comportement attendu

### Deux dimensions indépendantes

Le suivi croise deux questions **distinctes**, qui ne doivent pas être confondues :

| Dimension | Valeurs possibles |
|---|---|
| **Consentement au contact** | être contacté maintenant · être recontacté plus tard · aucun contact |
| **Rattachement à une famille** | adresse rattachable à une famille · adresse hors zone connue |

Une même personne peut combiner n'importe quelle valeur de l'une avec n'importe quelle valeur de
l'autre. En particulier, une personne qui demande à être recontactée plus tard **et** dont
l'adresse est hors zone doit, une fois le recontact effectué, basculer sur le traitement du cas
« hors zone » — et non être considérée comme traitée.

### Scénario principal

1. À l'accueil, un nouvel arrivant est invité à remplir le formulaire s'il est intéressé, qu'il
   souhaite être contacté maintenant ou seulement plus tard.
2. S'il ne souhaite aucun contact, il ne remplit pas le formulaire : aucune information n'est
   collectée, aucune demande n'est créée.
3. S'il souhaite être contacté maintenant et que son adresse correspond à une famille, la demande
   suit le parcours standard existant, inchangé.
4. S'il souhaite être recontacté plus tard, sa demande est placée en **attente de recontact** :
   son contact est conservé, aucune famille ne lui est affectée dans l'immédiat, et elle
   disparaît de la file des demandes à traiter.
5. Si son adresse ne correspond à aucune famille connue, sa demande est placée en **attente de
   décision du département mission**, avec la même conséquence sur la file de traitement.
6. Passé le délai configuré, toute demande encore dans l'un de ces deux états d'attente déclenche
   une alerte auprès de l'équipe intégration, précisant qui doit être relancé : la personne pour
   une attente de recontact, le département mission pour l'autre.

### Entrée et sortie des états d'attente

Les deux états d'attente s'insèrent dans le parcours existant selon des règles explicites.

**Entrée** — une demande peut être mise en attente depuis deux points du parcours seulement :

- depuis l'état **« demande reçue »** — action réservée à l'équipe intégration, puisqu'aucun
  berger n'est encore désigné ;
- depuis l'état **« premier contact établi »** — action ouverte au berger assigné comme à
  l'équipe intégration, le berger étant alors la personne en charge.

**Sortie** — deux issues possibles, et deux seulement :

- **Reprise du parcours** : la demande repart à l'étape qui suit immédiatement celle où elle
  s'était arrêtée. Une demande mise en attente depuis « demande reçue » reprend à l'affectation
  d'une famille ; une demande mise en attente depuis « premier contact établi » reprend à l'ajout
  au groupe de la famille. L'état d'attente doit donc mémoriser son point de départ.
- **Abandon** : une demande peut être abandonnée directement depuis un état d'attente, sans
  repasser par le parcours.

Le droit de lever une attente suit la même règle que celui de la poser : équipe intégration seule
si l'attente a été posée depuis « demande reçue », berger assigné ou équipe si elle a été posée
depuis « premier contact établi ».

### Historique des statuts

Chaque changement d'état d'une demande est conservé et **consultable par l'équipe intégration
directement sur la fiche de la demande** — pas seulement par un administrateur dans un journal
technique séparé.

L'historique indique, pour chaque changement : l'état de départ, l'état d'arrivée, la date et
l'auteur. Il conserve toutes les occurrences, y compris répétées : une demande mise en attente
puis reprise puis remise en attente garde trace des trois événements.

### Relances

Chacun des deux états d'attente a **son propre délai**, réglé indépendamment de l'autre :
l'attente de recontact et l'attente d'une décision du département mission n'ont ni la même
urgence, ni le même interlocuteur. Ces deux délais sont réglables aussi bien par un
administrateur que par le responsable de l'équipe intégration, au niveau de l'église.

Une demande qui reste dans un état d'attente au-delà du délai correspondant déclenche une alerte
auprès de **tous les membres de l'équipe intégration**. L'alerte précise la cible de la relance
(la personne, ou le département mission).

Une fois la relance effectuée, le membre de l'équipe la consigne sur la demande. La demande reste
en attente, mais le décompte repart de zéro : une nouvelle alerte ne se déclenchera qu'après un
nouveau délai complet. Les relances successives sont conservées dans l'historique, de sorte que
l'équipe voie combien de fois et à quelles dates une personne a déjà été sollicitée.

Tant qu'une relance due n'a pas été consignée, l'alerte reste visible : elle ne disparaît pas
d'elle-même avec le temps.

Il n'existe **aucun nombre maximal de relances**. Tant que l'état de la demande ne change pas, le
cycle se répète à chaque échéance du délai, indéfiniment. Une demande n'est jamais abandonnée
automatiquement : seule une décision humaine la fait sortir de l'attente.

### Correction des états incohérents

Deux situations du parcours existant produisent aujourd'hui des demandes dont l'état affiché
contredit les informations qu'elles portent. Cette spec les corrige.

- **Réouverture après abandon** : une demande rouverte reprend l'état qu'elle occupait juste
  avant son abandon, et non l'état initial « demande reçue ». Si l'équipe souhaite au contraire
  la reprendre de zéro, la famille et le berger précédemment affectés lui sont retirés, et le
  berger concerné en est informé.
- **Changement de famille** : lorsqu'une demande déjà affectée est réaffectée à une autre
  famille, le berger précédemment en charge est informé qu'il ne l'est plus.

**Invariant** : une demande ne peut jamais afficher l'état « demande reçue » tout en portant une
famille ou un berger affecté.

### Scénarios alternatifs / cas limites

- **Si** une personne en attente de recontact reprend contact d'elle-même avant l'échéance,
  l'équipe peut lever l'attente et reprendre le parcours sans perdre l'historique de sa demande.
- **Si** le département mission tranche un cas d'adresse hors zone, l'équipe intégration lève
  l'attente et reprend le parcours à l'affectation d'une famille.
- **Quand** une demande sort d'un état d'attente, quelle qu'en soit l'issue, aucune alerte de
  relance ne la concerne plus.
- **Si** une demande est mise en attente puis reprise plusieurs fois, chaque cycle est conservé
  dans l'historique — aucun n'écrase le précédent.

## Critères d'acceptation

- [ ] Le formulaire d'accueil permet de choisir entre « être contacté maintenant » et « être
      recontacté plus tard » ; une personne qui ne remplit pas le formulaire ne crée aucune
      demande ni aucune trace.
- [ ] Une demande peut être mise en attente depuis l'état « demande reçue » et depuis l'état
      « premier contact établi ». Toute tentative depuis un autre état est refusée.
- [ ] Une mise en attente depuis « demande reçue » est refusée à un berger assigné ; une mise en
      attente depuis « premier contact établi » est acceptée du berger assigné comme d'un membre
      de l'équipe intégration.
- [ ] Une demande en attente n'apparaît plus dans la file des demandes à traiter, et apparaît
      dans la liste des demandes en attente.
- [ ] La levée d'une attente posée depuis « demande reçue » place la demande à l'étape
      d'affectation d'une famille ; celle posée depuis « premier contact établi » la place à
      l'étape d'ajout au groupe de la famille.
- [ ] Une demande en attente peut être abandonnée directement, sans repasser par le parcours.
- [ ] La fiche d'une demande affiche, pour chaque changement d'état : état de départ, état
      d'arrivée, date et auteur — y compris pour des changements répétés du même type.
- [ ] Les deux délais avant relance — attente de recontact et attente du département mission —
      se règlent indépendamment l'un de l'autre, et le réglage est accessible aussi bien à un
      administrateur qu'au responsable de l'équipe intégration.
- [ ] Une demande en attente depuis plus que le délai **correspondant à son état** apparaît comme
      à relancer, en indiquant la cible de la relance (la personne ou le département mission).
- [ ] L'alerte de relance est visible par tous les membres de l'équipe intégration, et non par le
      seul responsable.
- [ ] Consigner une relance remet le décompte à zéro : la demande n'apparaît plus comme à
      relancer, et la relance figure dans son historique.
- [ ] Une demande sortie d'un état d'attente n'apparaît plus jamais comme à relancer.
- [ ] Une demande en attente n'est jamais abandonnée automatiquement, quel que soit le nombre de
      relances déjà consignées ou le temps écoulé.
- [ ] Une demande rouverte après abandon retrouve l'état qui précédait son abandon ; si elle est
      reprise de zéro, elle ne porte plus ni famille ni berger.
- [ ] Aucune demande à l'état « demande reçue » ne porte de famille ou de berger affecté.
- [ ] Un berger dessaisi d'une demande — par réaffectation à une autre famille ou par reprise de
      zéro après réouverture — en est informé.

## Hors périmètre

- Faire du département en charge de la mission un acteur de Koinonia (rôle dédié, file de
  traitement, notifications propres). Cette spec se limite à rendre visible, côté équipe
  intégration, qu'une demande attend son retour. L'arbitrage lui-même continue de se faire hors
  de l'outil.
- Toute relance envoyée automatiquement à la personne concernée. Le système alerte un membre de
  l'équipe, qui relance lui-même et consigne l'avoir fait ; il n'écrit jamais à la personne à sa
  place.
- Toute modification du parcours après l'intégration dans une famille (vie de la famille
  d'impact, accompagnement ultérieur).
- Le suivi des nouveaux convertis et le workflow de rendez-vous pastoral, traités séparément dans
  l'issue [#580](https://github.com/iccbretagne/koinonia/issues/580).
- La purge ou la rétention de l'historique des changements d'état (voir Questions ouvertes).

## Décisions actées

Décisions prises lors de la revue de cette spec, consignées pour éviter de les rejouer :

- **Demandes déjà en cours au déploiement** : aucun traitement particulier. Les demandes
  existantes restent dans leur état actuel et sont susceptibles de déclencher immédiatement une
  alerte de relance si elles dépassent déjà le délai. Le volume de demandes concernées étant
  faible, ce risque est **accepté** plutôt que d'ajouter une reprise de données.
- **Historique visible sur la fiche** : l'historique des changements d'état est consultable par
  l'équipe intégration sur la demande elle-même, et non réservé au journal d'administration.
- **Points d'entrée en attente** : « demande reçue » et « premier contact établi » uniquement.
- **Sortie d'attente** : reprise à l'étape suivante du parcours, ou abandon — pas d'autre issue.
- **Correction des états incohérents** : incluse dans cette feature, bien qu'elle dépasse le
  périmètre initial de l'issue #579.
- **Rétention de l'historique** : aucune purge alignée sur l'archivage à 12 mois de la demande.
  L'historique des changements d'état survit donc à l'archivage de la fiche et continue de porter
  des noms de personnes. Ce risque est **accepté** au vu du volume concerné, plutôt que
  d'introduire un mécanisme de purge dédié.
- **Pas de plafond de relances** : tant que l'état de la demande ne change pas, le cycle de
  relance se répète indéfiniment. Aucune demande n'est abandonnée automatiquement — seule une
  décision humaine la fait sortir de l'attente.
- **Deux délais distincts** : l'attente de recontact et l'attente du département mission ont
  chacune leur propre délai, réglable indépendamment.
- **Réglage partagé** : administrateur **et** responsable de l'équipe intégration peuvent régler
  ces deux délais.
- **Alerte à toute l'équipe** : la relance est signalée à l'ensemble des membres de l'équipe
  intégration, quelle que soit la cible de la relance, et non au seul responsable.

## Questions ouvertes

Aucune. Tous les points en suspens ont été tranchés lors de la revue et figurent dans
« Décisions actées » ci-dessus. La spec est prête pour `/plan`.
