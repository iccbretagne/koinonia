# Planning de service

## En une phrase

Dire, pour chaque événement et chaque département, qui sert et qui ne sert pas — puis publier cette grille sous une forme que tout le monde peut lire.

Remplace le tableur recopié à la main et la capture d'écran envoyée dans le groupe, dont plus personne ne savait quelle version faisait foi.

## Le déclencheur

Un événement a été créé et le département y est associé : sa grille s'ouvre automatiquement. Le responsable n'a rien à demander, il a à remplir.

## Qui intervient

| Acteur | Rôle dans le circuit |
|---|---|
| Le responsable de département | Renseigne la grille de son département |
| Son adjoint | Même chose, sur le même périmètre |
| Le STAR | Consulte son propre planning, déclare ses absences |
| Le secrétariat | Reçoit la synthèse et suit les départements en retard |

## Les étapes et leurs statuts

Le responsable ouvre son département, choisit le **mois** puis l'**événement**, et positionne chaque STAR de son équipe :

| Statut | Ce qu'il signifie |
|---|---|
| – | Rien n'est décidé. C'est l'état par défaut, et celui qu'il faut faire disparaître |
| En service | La personne sert sur cet événement |
| En service + Debrief | Elle sert, et participe au debrief |
| Indisponible | Elle ne sert pas sur cet événement |
| Remplaçant | Elle est mobilisable si besoin |

Deux compteurs en tête de grille disent où l'on en est : le nombre de personnes en service sur l'effectif du département, et le nombre d'indisponibles. La saisie doit être **sauvegardée** pour être prise en compte.

**Les tâches.** Si le département a défini des tâches, un bloc apparaît en bas de la grille de saisie pour les répartir entre les personnes en service sur cet événement. C'est le même écran : on dit d'abord qui est là, puis qui fait quoi.

**L'échéance.** Chaque événement porte une date limite de planification. Une fois dépassée, un bandeau le signale — la modification reste possible, mais elle est visible comme tardive. L'échéance n'est pas un verrou, c'est un engagement collectif : elle existe pour que les autres départements et le secrétariat puissent travailler sur une base stable.

**La publication.** Une fois la grille remplie, la vue semaine produit le planning sous forme lisible, à copier en image, télécharger en PNG ou exporter en PDF. On peut y ajouter une **notice** — une consigne particulière pour ce créneau. C'est cet export qui circule, et non plus une capture d'écran d'un tableur.

## Où ça se passe

| Pour… | Aller à… |
|---|---|
| Remplir la grille | Planning → son ministère → son département, onglet **Saisie** |
| Répartir les tâches de l'événement | Le même onglet **Saisie**, en bas de la grille |
| Publier et partager | Onglet **Vue semaine**, puis copier l'image ou exporter le PDF |
| Voir le mois entier | Onglet **Vue mois** |
| Consulter son équipe | Onglet **Équipe** |
| Suivre la participation | Onglet **Statistiques** |
| Voir ses propres créneaux | **Mon planning** |

## Les règles à connaître

- **Un STAR laissé à « – » n'est pas une absence**, c'est une case non traitée. La différence compte : l'indisponibilité est une information, le vide est un oubli.
- **La grille se remplit avant l'échéance.** Après, elle reste modifiable, mais chaque modification tardive se répercute sur les départements qui s'étaient calés dessus.
- **Positionner ne suffit pas toujours.** Une grille remplie sans répartition des tâches laisse l'équipe présente sans savoir qui fait quoi. Les deux se règlent sur le même écran.
- **Publier ne remplace pas remplir** : l'export reflète l'état de la grille au moment où on le génère.

## Les cas particuliers

**Une absence déclarée après coup.** Elle remonte dans la grille sous forme de conflit, et le responsable recompose. Voir la fiche *Absences*.

**Un remplaçant.** Le statut existe pour dire « mobilisable sans être prévu ». Il évite d'avoir à choisir entre « en service » et « rien », et donne au responsable une réserve visible.

**Un département non associé à l'événement.** Il ne voit pas la grille. Si un département découvre qu'il est attendu sans l'être dans l'application, c'est la configuration de l'événement qu'il faut corriger, pas le planning.

**Une modification de planning demandée par un tiers.** La tuile *Modification planning* du menu des demandes permet de solliciter un changement sans avoir la main sur la grille.

## Ce qui sort à la fin

- Une grille complète, faisant foi, consultable par chaque STAR depuis *Mon planning*.
- Un planning publiable en image ou en PDF, éventuellement assorti d'une notice.
- Des statistiques de participation par département, exploitables dans la durée.
