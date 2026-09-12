# Mains courantes des salles

## En une phrase

Tracer l'ouverture et la fermeture d'une salle, et faire contrôler par un tiers que le local a bien été rendu en état.

Remplace le « je croyais que quelqu'un d'autre avait fermé » et les dégradations dont personne ne sait quand elles sont apparues.

## Le déclencheur

Il n'y a rien à déclencher : **toute réservation de salle crée sa main courante**. Elle attend simplement d'être renseignée le jour venu.

## Qui intervient

| Acteur | Rôle dans le circuit |
|---|---|
| Le responsable du créneau | Déclare l'ouverture, puis la fermeture |
| L'équipe de contrôle | Vérifie après coup et statue |

Le principe est que celui qui utilise la salle n'est pas celui qui valide. La séparation des deux rôles est ce qui donne sa valeur au contrôle.

## Les étapes et leurs statuts

> Non ouverte → Ouverte, en attente de fermeture → Fermeture déclarée, à contrôler → Contrôlée et conforme (ou Écart signalé)

**Non ouverte.** L'activité n'a pas encore commencé, ou le responsable a oublié de déclarer son arrivée.

**Ouverte.** Le responsable a pris possession du local et constaté son état initial.

**Fermeture déclarée.** Le responsable a rendu la salle et signalé dans quel état il la laisse. La main courante entre alors dans la file de contrôle.

**Contrôlée.** L'équipe de contrôle a vérifié. Soit tout est conforme, soit un **écart** est signalé — matériel manquant, dégradation, salle non rangée.

## Où ça se passe

| Pour… | Aller à… |
|---|---|
| Déclarer ouverture et fermeture | Ressources → Salles, depuis sa réservation |
| Contrôler | Ressources → Salles → Contrôle des mains courantes |

L'écran de contrôle se filtre par salle, par statut, par responsable et par période — de quoi voir en un coup d'œil ce qui reste à vérifier, et repérer un responsable dont les créneaux restent systématiquement non déclarés.

## Les règles à connaître

- **Déclarer l'ouverture protège le responsable précédent autant que soi-même.** Un état des lieux d'entrée constaté est ce qui permet d'établir qu'un dégât n'a pas été causé pendant son créneau.
- **La fermeture se déclare le jour même.** Déclarée trois jours plus tard, elle ne prouve plus rien.
- **Un écart n'est pas une accusation.** C'est un constat, qui permet de réparer et d'ajuster.

## Les cas particuliers

**Un créneau jamais ouvert.** L'activité a été annulée sans que la réservation le soit, ou le responsable n'a rien déclaré. Dans les deux cas, l'information est utile : elle signale une réservation à libérer ou une consigne à rappeler.

**Une fermeture jamais déclarée.** La main courante reste en attente et apparaît dans les filtres. C'est ce qui permet de relancer la bonne personne, plutôt que de découvrir le problème au créneau suivant.

**Un écart signalé.** Il ouvre une conversation entre l'équipe de contrôle et le responsable du créneau, et le cas échéant une demande comptable si du matériel doit être remplacé.

## Ce qui sort à la fin

- Un historique complet d'occupation et d'état des salles, par salle, par responsable et par date.
- La possibilité de remonter à l'origine d'un dégât plutôt que de le constater sans explication.
- Une base pour ajuster les consignes d'usage des locaux.
