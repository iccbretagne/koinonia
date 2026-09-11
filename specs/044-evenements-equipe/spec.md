# Spec — Événements d'équipe

- **Numéro** : 044
- **Statut** : Implémentée
- **Créée le** : 2026-09-11
- **Issue** : #522
- **Branche suggérée** : `feat/evenements-equipe`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Aujourd'hui, un événement dans Koinonia est toujours un **événement d'église** : créé par le
Secrétariat ou l'administration, visible de tous les rôles qui consultent les événements, et
porteur du planning de service, des comptes rendus, de l'audio, des salles et des médias.

Un département n'a aucun moyen d'inscrire dans l'application ses rendez-vous **internes** :
répétition, réunion d'équipe, formation, brief, sortie de département… Ces rendez-vous vivent
encore dans des groupes WhatsApp — exactement l'organisation éclatée que Koinonia doit remplacer.
Un membre n'a nulle part où voir, à côté de ses affectations de service, les rendez-vous propres à
son équipe.

## Définitions

- **Événement d'équipe** : rendez-vous interne rattaché à **un seul** département d'une église.
  Il n'est pas un événement d'église et n'en porte aucune des fonctionnalités (planning de service,
  compte rendu, audio, médias, salles).
- **Membre du département** : personne dont la fiche membre est rattachée à ce département.
- **Agenda personnel** : la vue « Mon planning » d'un utilisateur dont le compte est lié à une
  fiche membre, quel que soit son rôle.

## Utilisateurs concernés

| Rôle | Gère (créer/modifier/supprimer) | Voit |
|---|---|---|
| Super Admin / Admin | Tous les départements de l'église | Tous les départements de l'église |
| Ministre | Départements de **son ou ses** ministères | Départements de son ou ses ministères |
| Resp. département (titulaire ou adjoint) | **Ses** départements | Ses départements |
| Secrétaire | — | Tous les départements de l'église, en lecture seule |
| Tout utilisateur lié à une fiche membre (STAR, mais aussi tout autre rôle) | — | Départements dont il est **membre**, dans son agenda personnel |
| Reporter, Faiseur de Disciples, Qualificateur agenda, Comptable | — | Uniquement en tant que membre d'un département, comme ci-dessus |

Les droits se cumulent : un Responsable du département Son qui est aussi musicien (membre du
département Musiciens) gère les événements d'équipe de Son et voit ceux de Musiciens dans son
agenda personnel.

## Comportement attendu

### Scénario principal

1. Le Responsable du département Louange crée un événement d'équipe « Répétition générale » : un
   titre, une date, une heure de début et de fin, un lieu (texte libre) et une description
   facultative.
2. Il le retrouve dans la liste des événements d'équipe de son département.
3. Les membres du département Louange le voient dans leur agenda personnel, à côté de leurs
   affectations de service, et distinguent clairement qu'il s'agit d'un rendez-vous d'équipe et
   non d'une affectation de service.
4. Un membre du département Accueil (qui n'est pas membre de Louange) ne le voit nulle part.
5. Le Responsable décale l'heure de début ; les membres voient l'horaire mis à jour à leur
   consultation suivante.
6. Une fois la date passée, l'événement reste consultable dans la liste des événements d'équipe
   du département (historique), et n'est plus mis en avant comme à venir dans l'agenda personnel.

### Récurrence

- À la création, le gestionnaire peut rendre l'événement **récurrent** : hebdomadaire,
  bi-hebdomadaire ou mensuel, jusqu'à une date de fin — mêmes fréquences que les événements
  d'église, pour ne pas introduire deux logiques différentes.
- Chaque occurrence apparaît à sa date dans l'agenda des membres.
- Pour modifier ou supprimer une occurrence d'une série, le gestionnaire choisit entre
  **« cette occurrence uniquement »** et **« cette occurrence et les suivantes »** — même choix
  que pour les séries d'événements d'église. Les occurrences passées ne sont jamais modifiées
  ni supprimées par une action portant sur « les suivantes ».

### Scénarios alternatifs / cas limites

- **Quand** un Responsable tente de créer, modifier ou supprimer un événement d'équipe d'un
  département qui n'est pas le sien, **le système doit** refuser l'action — y compris par un
  accès direct qui contournerait l'interface.
- **Quand** un Ministre agit sur un département hors de son ou ses ministères, **le système
  doit** refuser l'action.
- **Si** un Responsable adjoint agit sur son département, **alors** il a exactement les mêmes
  droits que le titulaire.
- **Si** un membre appartient à deux départements, **alors** il voit dans son agenda les
  événements d'équipe des deux.
- **Si** un membre est retiré d'un département, **alors** il cesse immédiatement de voir les
  événements d'équipe de ce département, passés comme futurs.
- **Si** un utilisateur n'a pas de compte lié à une fiche membre, **alors** il ne voit aucun
  événement d'équipe au titre de l'appartenance (il peut toujours les voir au titre de son rôle
  de gestionnaire ou de Secrétaire).
- **Si** un Responsable perd la responsabilité d'un département, **alors** il ne peut plus gérer
  ses événements d'équipe ; les événements déjà créés restent en place pour le département.
- **Si** un département est supprimé, **alors** ses événements d'équipe disparaissent avec lui.
- **Quand** l'heure de fin est antérieure ou égale à l'heure de début, **le système doit**
  refuser l'enregistrement avec un message explicite.
- **Quand** un événement d'équipe existe, **il** n'apparaît jamais dans la liste, le calendrier
  ni l'agenda hebdomadaire des événements d'église, ni dans le planning de service, les comptes
  rendus ou les statistiques d'événements — pour aucun rôle.
- **Les données restent cloisonnées par église** : un utilisateur ne voit jamais un événement
  d'équipe d'une autre église, même s'il y a un rôle.

## Critères d'acceptation

**Gestion**
- [x] Un Responsable de département (titulaire ou adjoint) crée, modifie et supprime un
      événement d'équipe sur son propre département.
- [x] Un Responsable de département est refusé sur un département qui n'est pas le sien, y
      compris par accès direct sans passer par l'interface.
- [x] Un Ministre gère les événements d'équipe de tous les départements de son ou ses
      ministères, et est refusé hors de ce périmètre.
- [x] Un Super Admin / Admin gère les événements d'équipe de n'importe quel département de
      l'église.
- [x] Un Secrétaire voit les événements d'équipe de tous les départements mais ne peut ni en
      créer, ni en modifier, ni en supprimer.
- [x] Un STAR ne peut ni créer, ni modifier, ni supprimer un événement d'équipe.
- [x] Un événement dont l'heure de fin n'est pas postérieure à l'heure de début est refusé.

**Visibilité**
- [x] Un membre du département voit les événements d'équipe de ce département dans son agenda
      personnel, distingués visuellement des affectations de service.
- [x] Un utilisateur qui n'est ni membre, ni gestionnaire, ni Secrétaire, ni Admin ne voit pas
      l'événement d'équipe — ni dans l'interface, ni par accès direct.
- [x] Un membre retiré du département ne voit plus ses événements d'équipe.
- [x] Aucun événement d'équipe n'apparaît dans la liste, le calendrier ou l'agenda hebdomadaire
      des événements d'église, le planning de service, les comptes rendus ni les statistiques.
- [x] Aucun événement d'équipe d'une autre église n'est jamais visible.

**Récurrence**
- [x] Un gestionnaire crée un événement d'équipe récurrent (hebdomadaire, bi-hebdomadaire ou
      mensuel, avec date de fin) ; chaque occurrence apparaît à sa date dans l'agenda des membres.
- [x] Modifier ou supprimer « cette occurrence uniquement » n'affecte aucune autre occurrence.
- [x] Modifier ou supprimer « cette occurrence et les suivantes » n'affecte aucune occurrence
      passée.

**Cohérence**
- [x] Les écrans de gestion et l'agenda personnel sont utilisables sur mobile comme sur
      ordinateur.
- [x] La documentation des rôles et permissions reflète les nouveaux droits.

## Hors périmètre

- Réservation de salle depuis un événement d'équipe.
- Notification des membres à la création, modification ou annulation.
- Déclaration d'indisponibilité ou confirmation de présence à un événement d'équipe.
- Planning de service, tâches, compte rendu, audio ou médias rattachés à un événement d'équipe.
- Catégorie ou type d'événement d'équipe (le titre suffit dans cette première version).
- Événement d'équipe rattaché à plusieurs départements à la fois (un rendez-vous commun à deux
  équipes se crée dans chacune d'elles).
- Export ou synchronisation vers un agenda externe.
- Gestion des événements d'équipe par le Secrétaire (lecture seule uniquement).

## Questions ouvertes

Aucune question comportementale bloquante.

À traiter dans le plan (non comportemental) : la visibilité d'un membre repose sur son
**appartenance** au département, alors que les droits de gestion reposent sur la
**responsabilité** — deux périmètres que l'application a volontairement choisi de ne pas fusionner
jusqu'ici (ADR-0009). Cette feature introduit le premier cas où une donnée de département est
visible au titre de l'appartenance : le plan doit acter comment ce second périmètre est exprimé,
et créer ou référencer l'ADR correspondant.
