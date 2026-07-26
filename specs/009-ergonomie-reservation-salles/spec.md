# Spec — Ergonomie de la réservation de salles

- **Numéro** : 009
- **Statut** : Implémentée
- **Créée le** : 2026-07-26
- **Branche suggérée** : `feat/gestion-reservation-salles` (poursuite de la feature 008, non mergée)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La feature 008 (gestion des salles et de leur réservation) est codée mais n'a pas encore été
mergée — elle est toujours en phase de conception/ajustement ergonomique. En l'utilisant, plusieurs
manques sont apparus, indépendants des règles métier déjà tranchées dans la spec 008 (partage
cross-église, récurrence, refus immédiat en cas de conflit) :

- La vue par défaut de la page de réservation est une liste, alors que la question qu'on se pose en
  premier est « qu'est-ce qui est libre/pris, et quand ? » — une question à laquelle un calendrier
  répond plus naturellement qu'une liste.
- Consulter le détail d'une réservation depuis le calendrier, ou agir dessus (annuler, déclarer une
  ouverture/fermeture), oblige aujourd'hui à basculer vers la vue liste.
- La vue liste, à mesure que le nombre de réservations grandit, devient difficile à parcourir sans
  possibilité de trier ou de filtrer.
- La main courante (déclaration d'ouverture/fermeture) telle que spécifiée dans la 008 ne capture
  que peu d'informations (heure, provenance/destination des clés, propreté/fermeture, notes) — un
  usage réel fait remonter le besoin d'informations supplémentaires, à préciser dans cette spec
  (voir Questions ouvertes).
- L'équipe dédiée (sécurité/entretien) qui contrôle les mains courantes n'a aujourd'hui une action
  possible que lorsqu'une fermeture a été déclarée (« Contrôler »). Rien ne lui permet d'agir sur une
  réservation passée dont l'ouverture ou la fermeture n'a jamais été déclarée — alors que la spec 008
  prévoit explicitement que ce cas doit être identifiable par l'équipe dédiée pour qu'elle puisse
  « relancer ou signaler la situation ». Ce constat existe déjà visuellement (statut affiché), mais
  aucune action de suivi n'est proposée à partir de ce constat.

## Utilisateurs concernés

- **STAR / Resp. département / Ministre** : consultent la disponibilité des salles en un coup d'œil
  (vue calendrier), retrouvent et agissent sur leurs réservations (annulation, main courante) sans
  changer de vue, et trient/filtrent la liste de leurs réservations.
- **Équipe dédiée (sécurité / entretien)** : dispose, en plus du contrôle d'une fermeture déjà
  déclarée, d'une action pour relancer/signaler une réservation dont la main courante n'a pas été
  renseignée à temps.
- **Secrétaire, Admin / Super Admin** : bénéficient des mêmes améliorations de consultation (vue
  calendrier par défaut, tri/filtre) pour leur rôle de suivi global.

Rôles non concernés : Faiseur de Disciples, Reporter (déjà hors périmètre de la 008).

## Comportement attendu

### Scénario principal

1. Un utilisateur arrive sur la page de réservation de salles : il voit directement le calendrier
   d'une salle (vue par défaut), et peut changer de salle ou de mois.
2. Il clique sur une réservation affichée dans le calendrier : le détail de cette réservation
   s'affiche (toutes ses informations), avec les actions pertinentes selon son état — annulation
   (occurrence ou série), déclaration d'ouverture, déclaration de fermeture — accessibles directement
   depuis cet écran de détail, sans devoir chercher la réservation ailleurs.
3. S'il préfère une vue d'ensemble, il bascule vers la vue liste, où il peut trier (par exemple par
   date, par salle) et filtrer (par exemple par salle, par statut de main courante, par période) les
   réservations affichées.
4. Un membre de l'équipe dédiée consulte le tableau de contrôle des mains courantes : pour une
   réservation passée dont l'ouverture ou la fermeture n'a pas été déclarée, il dispose d'une action
   pour relancer la personne concernée ou signaler la situation, en plus de l'action de contrôle déjà
   disponible pour les fermetures déclarées.

### Scénarios alternatifs / cas limites

- **Si** aucune réservation n'existe pour la salle et le mois affichés dans le calendrier, **alors**
  cela reste visuellement clair (mois vide, pas d'erreur).
- **Si** un utilisateur n'a pas la permission d'agir sur une réservation (ex. il n'en est pas le
  créateur), **alors** le détail affiché depuis le calendrier ne propose pas les actions réservées au
  créateur.
- **Quand** un tri ou un filtre est appliqué en vue liste, **alors** il reste appliqué tant que
  l'utilisateur ne le change pas ou ne quitte pas la page.
- **Si** l'équipe dédiée signale un écart sur une réservation dont l'ouverture ou la fermeture n'a
  jamais été déclarée, **alors** cet écart est enregistré au même titre qu'un écart constaté après
  une déclaration normale, sans qu'une déclaration préalable de l'utilisateur soit requise.
- **Si** l'équipe dédiée constate, après vérification hors application, qu'une réservation non
  déclarée ne pose en fait aucun problème, **alors** elle peut la marquer comme traitée/close
  manuellement, sans créer de signalement d'écart ni envoyer de notification.
- **Depuis** le détail d'une réservation ouvert pour contrôle (ou depuis le calendrier), **alors**
  un bouton permet de revenir explicitement à l'écran précédent (tableau de contrôle, calendrier ou
  liste), sans dépendre uniquement de la navigation du navigateur.

## Critères d'acceptation

- [x] La vue calendrier par salle est affichée par défaut à l'ouverture de la page de réservation.
- [x] Cliquer sur une réservation dans le calendrier ouvre son détail complet.
- [x] Depuis ce détail, les actions d'annulation (occurrence/série) et de déclaration
      d'ouverture/fermeture sont disponibles selon l'état de la réservation et les droits de
      l'utilisateur, sans changer de vue.
- [x] La vue liste permet de trier les réservations affichées selon au moins un critère pertinent
      (date, salle).
- [x] La vue liste permet de filtrer les réservations affichées selon au moins : la salle et le
      statut de main courante.
- [x] La déclaration d'ouverture et/ou de fermeture permet de signaler un état des lieux/du
      matériel constaté (dégât, matériel manquant/déplacé, panne), en plus des informations déjà
      prévues par la spec 008.
- [x] Pour une réservation passée dont l'ouverture ou la fermeture n'a pas été déclarée, l'équipe
      dédiée peut : signaler un écart directement (sans déclaration préalable requise), ou marquer
      la réservation comme traitée/close manuellement sans signalement ni notification.
- [x] Un bouton de retour explicite permet de revenir à l'écran précédent depuis le détail d'une
      réservation ouvert pour contrôle.

## Hors périmètre

- Toute règle métier déjà tranchée dans la spec 008 (partage cross-église, récurrence, refus
  immédiat en cas de conflit, statuts de main courante) : non rediscutée ici.
- La création d'une réservation par clic direct sur une case du calendrier : explicitement écartée
  pour cette itération (décision prise en amont de cette spec) — le calendrier reste, pour la
  création, un point de consultation, pas de saisie.
- Toute nouvelle notification automatique non explicitement listée dans les critères d'acceptation.

## Questions ouvertes

Aucune question bloquante restante — les points suivants ont été tranchés :

- Informations complémentaires de la main courante : état des lieux/du matériel constaté (dégât,
  matériel manquant/déplacé, panne), en plus de ce que prévoit déjà la spec 008.
- Actions de suivi sur le tableau de contrôle : signalement d'écart sans déclaration préalable, et
  clôture manuelle sans signalement ni notification — pas de relance par notification automatique
  pour cette itération.
- « Boutons retour » : un bouton de navigation explicite vers l'écran précédent depuis le détail
  d'une réservation en contrôle — pas une fonction d'annulation d'une validation déjà faite.

Reste à préciser au moment du plan (non bloquant) : le critère de tri/filtre en vue liste se limite
à salle/statut/période ; d'autres critères pourront être ajoutés plus tard si le besoin apparaît.
