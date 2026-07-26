# Spec — Gestion des salles et de leur réservation

- **Numéro** : 008
- **Statut** : Brouillon
- **Créée le** : 2026-07-26
- **Branche suggérée** : `feat/gestion-reservation-salles`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Aujourd'hui, la réservation des salles pour les activités de l'église est gérée dans un outil
externe (MRBS), déconnecté du reste de la planification Koinonia. Cette externalisation pose
plusieurs limites à mesure que les besoins évoluent :

- Certaines salles sont utilisées par **plusieurs églises en parallèle** (bâtiments partagés),
  sans visibilité centralisée des créneaux déjà pris par une autre église.
- Aucun lien avec les événements planifiés dans Koinonia.
- Aucune traçabilité de la **prise en main effective** d'une salle : qui a ouvert, qui avait les
  clés, si la salle a été correctement fermée et nettoyée à la fin de l'usage. Ce suivi se fait
  aujourd'hui de façon informelle (ou pas du tout), ce qui complique la responsabilisation en cas
  de salle mal fermée, non nettoyée, ou de clés égarées.

Cette fonctionnalité intègre la réservation de salles directement dans Koinonia, avec une gestion
cross-église des salles partagées, et introduit une **main courante** : un journal d'ouverture et
de fermeture par réservation, avec une déclaration par l'utilisateur de la salle puis un contrôle
indépendant par une équipe dédiée (sécurité / entretien).

## Utilisateurs concernés

- **STAR** : réserve une salle pour une activité de son département, déclare l'ouverture (prise en
  main, réception des clés) et la fermeture (état de la salle, remise des clés) lorsqu'il utilise
  une salle qu'il a réservée.
- **Resp. département / Ministre** : mêmes capacités que le STAR pour les besoins de leur
  périmètre, consultent les réservations de leur département/ministère.
- **Équipe dédiée (sécurité / entretien)** : consulte les déclarations d'ouverture/fermeture,
  contrôle et valide chaque fermeture, ou signale un écart si la réalité constatée diffère de la
  déclaration.
- **Secrétaire** : consulte l'ensemble des réservations et des mains courantes de son église
  (lecture seule), sans capacité de réservation pour un tiers au-delà de ce rôle de suivi.
- **Admin / Super Admin** : gèrent le référentiel des salles (création, capacité, activation/
  désactivation) et définissent quelles églises sont autorisées à réserver quelles salles
  partagées.

Rôles non concernés par cette feature : Faiseur de Disciples, Reporter.

## Comportement attendu

### Scénario principal

1. Un STAR (ou un responsable) souhaite réserver une salle pour une activité, éventuellement
   rattachée à un événement déjà planifié dans Koinonia.
2. Il consulte les salles que son église peut réserver (celles dont son église est propriétaire,
   ou celles pour lesquelles son église a été explicitement autorisée) et leur disponibilité sur
   la période souhaitée.
3. Il choisit une salle libre sur le créneau demandé et confirme la réservation — elle est
   effective immédiatement, sans étape de validation par un tiers.
4. Le jour de l'utilisation, la personne qui prend en main la salle déclare l'ouverture : heure de
   prise en main, et le cas échéant de qui elle a reçu les clés.
5. À la fin de l'utilisation, elle déclare la fermeture : la salle a été correctement fermée,
   nettoyée (ou non), et à qui les clés ont été remises.
6. L'équipe dédiée (sécurité / entretien) de l'église consulte les déclarations de fermeture,
   contrôle leur exactitude, et valide — ou signale un écart si la situation constatée diffère de
   ce qui a été déclaré.

### Scénarios alternatifs / cas limites

- **Si** une salle demandée est déjà réservée (par n'importe quelle église autorisée à l'utiliser)
  sur tout ou partie du créneau souhaité, **alors** la réservation est refusée immédiatement — pas
  de file d'attente ni d'arbitrage, la salle est prise ou libre.
- **Si** une salle n'est pas dans la liste des salles que l'église de l'utilisateur est autorisée à
  réserver, **alors** elle n'apparaît pas comme réservable pour cette église.
- **Quand** une réservation est liée à un événement lui-même récurrent, **alors** chaque occurrence
  de l'événement donne lieu à sa propre réservation, avec sa propre vérification de disponibilité
  et sa propre main courante — annuler une occurrence n'annule pas les autres.
- **Si** une réservation récurrente n'est pas liée à un événement planifié (ex. réunion
  hebdomadaire non saisie comme événement), **alors** elle peut tout de même être déclarée comme
  récurrente, avec les mêmes règles : chaque occurrence est indépendante pour la disponibilité et
  la main courante.
- **Si** personne n'a déclaré l'ouverture ou la fermeture d'une réservation déjà passée, **alors**
  l'équipe dédiée doit pouvoir le constater clairement (état « non renseigné ») pour pouvoir
  relancer ou signaler la situation.
- **Si** la personne qui remet ou reçoit les clés n'a pas de compte Koinonia (ex. gardien, tiers
  externe), **alors** il doit être possible de la désigner par son nom sans lui associer de compte.
- **Si** le contrôle de l'équipe dédiée constate un écart avec la déclaration de fermeture (ex.
  déclarée fermée et nettoyée, mais ce n'est pas le cas), **alors** cet écart est enregistré et
  visible distinctement de la déclaration initiale — les deux ne sont jamais fusionnées ou
  écrasées l'une par l'autre.
- **Quand** des réservations futures existent déjà dans l'outil actuellement utilisé, **alors**
  elles doivent pouvoir être reprises dans Koinonia sans qu'il soit nécessaire de les ressaisir
  manuellement une à une.

## Critères d'acceptation

- [ ] Un STAR (ou un responsable de son périmètre) peut réserver une salle sur un créneau donné.
- [ ] Une réservation peut, en option, être rattachée à un événement planifié existant.
- [ ] Une réservation est effective immédiatement, sans étape de validation par un tiers.
- [ ] Une réservation en conflit avec une réservation existante de la même salle (par n'importe
      quelle église autorisée) est refusée immédiatement.
- [ ] Une église ne peut réserver qu'une salle dont elle est propriétaire ou pour laquelle elle a
      été explicitement autorisée.
- [ ] Une réservation peut être récurrente, qu'elle soit liée ou non à un événement planifié.
- [ ] Chaque occurrence d'une réservation récurrente est vérifiée et gérée indépendamment pour la
      disponibilité et pour la main courante.
- [ ] L'utilisateur ayant pris en main une salle peut déclarer l'ouverture (heure, provenance des
      clés) et la fermeture (état de la salle, destination des clés) de son utilisation.
- [ ] La provenance/destination des clés peut être une personne sans compte Koinonia (nom libre).
- [ ] Une équipe dédiée peut consulter les déclarations de fermeture, les valider, ou signaler un
      écart par rapport à la réalité constatée.
- [ ] La déclaration initiale de l'utilisateur et le constat de l'équipe dédiée restent visibles
      distinctement l'un de l'autre, sans écrasement.
- [ ] Une réservation ou une occurrence dont l'ouverture ou la fermeture n'a pas été déclarée est
      identifiable comme telle.
- [ ] Le Secrétaire peut consulter l'ensemble des réservations et mains courantes de son église.
- [ ] L'Admin/Super Admin peut créer, modifier et désactiver une salle, et gérer la liste des
      églises autorisées à la réserver.
- [ ] Les réservations futures déjà existantes dans l'outil actuellement utilisé peuvent être
      reprises dans Koinonia sans ressaisie manuelle.

## Hors périmètre

- Aucune réservation « libre » pour un usage externe à l'église (associations, particuliers) — la
  réservation reste strictement liée aux activités de l'église.
- Aucun workflow d'approbation ou d'arbitrage en cas de conflit entre deux demandes — la règle est
  le refus immédiat, premier arrivé premier servi.
- Aucune gestion du matériel/équipement associé à une salle (vidéoprojecteur, sonorisation...) au-
  delà de son nom et de sa capacité.
- Aucune gestion de plusieurs remises de clés au sein d'une même occurrence de réservation — une
  ouverture, une fermeture par occurrence.
- Le mécanisme technique de reprise des réservations existantes (accès aux données de l'outil
  actuel, format d'import) n'est pas décrit ici — seule l'exigence de non-ressaisie l'est ; le
  comment revient au plan technique.

## Questions ouvertes

Aucune question bloquante restante — les points suivants ont été tranchés en amont :

- Partage cross-église : liste blanche explicite par salle, pas d'ouverture automatique à tout un
  réseau d'églises.
- Gestion des conflits : refus immédiat, pas de validation manuelle.
- Main courante : déclaration par l'utilisateur de la salle **et** contrôle indépendant par une
  équipe dédiée (sécurité/entretien) — les deux sont conservés séparément.
- Récurrence : chaque occurrence est indépendante (disponibilité et main courante), qu'elle soit
  liée à un événement récurrent ou déclarée directement sur la réservation.
