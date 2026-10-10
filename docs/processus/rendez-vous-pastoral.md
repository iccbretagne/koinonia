# Rendez-vous pastoral

## En une phrase

Obtenir un entretien pastoral, en passant par un référent qui confie la demande au bon accompagnant avant que la date soit fixée.

Remplace la sollicitation en fin de culte, qui dépend de qui est disponible sur le moment plutôt que de ce dont la personne a besoin.

## Le déclencheur

Trois portes d'entrée, un seul circuit.

**Depuis l'application** : Demandes → Mes demandes → Nouvelle demande → tuile **Rendez-vous pastoral**. Un STAR, qui n'a pas « Mes demandes », passe par Demandes → **Demande RDV pastoral**. Il retrouve ensuite ses demandes et leur état, mais pas le nom de l'accompagnant.

**Par le lien public** : un formulaire accessible sans compte, dont l'adresse est copiable depuis l'espace Suivi pastoral ou la vue agenda. C'est la porte pour les personnes qui ne sont pas encore dans Koinonia.

**Par le formulaire d'accueil** : la case « soin pastoral » crée aussi une demande.

Le formulaire demande les coordonnées, le profil (tranche d'âge, ancienneté à l'église, STAR ou non) et le **motif** de l'entretien. Le demandeur ne choisit plus de jour : la date se convient ensuite.

## Qui intervient

| Acteur | Rôle dans le circuit |
|---|---|
| Le demandeur | Remplit le formulaire, avec ou sans compte |
| Le référent soins pastoraux | Valide la demande en la confiant à un accompagnant, ou la rejette |
| L'accompagnant | Un profil pastoral, ou un STAR accompagnant (membre du département MSDP, ou ajouté à la main) : reçoit la personne et consigne l'issue |
| Le protocole | Planifie dans l'agenda pastoral les rendez-vous confiés à un profil pastoral |

Admin et Super Admin ont les mêmes droits que le référent. La Secrétaire voit les demandes, sans les confier.

## Les étapes et leurs statuts

> Reçue → Validée (ou Rejetée, avec motif) → Planifiée → Terminée

**La validation.** Le référent lit la demande puis, en une seule action, la **confie** à un accompagnant choisi dans une liste qui distingue les profils pastoraux des STAR accompagnants — ou la **rejette** avec un motif : hors du champ pastoral, doublon, retirée par la personne, injoignable, orientée vers un autre service, autre. L'accompagnant est prévenu tout de suite, dans l'application et par email.

**La planification.**
- Confiée à un **profil pastoral** : le protocole est prévenu et pose le rendez-vous dans l'agenda pastoral.
- Confiée à un **STAR accompagnant** : il contacte lui-même la personne, convient d'une date et l'indique sur la demande.

Dans les deux cas, le demandeur est prévenu de la date.

**L'issue.** Une fois la date passée, l'accompagnant indique ce qu'il en est :
- **a eu lieu, clôturé** : la demande est terminée ;
- **a eu lieu, orienté vers un suivi de nouveau converti** : la demande est terminée et un suivi naît pour la même personne (voir [Accueil d'un nouveau](accueil-nouveau.md)) ;
- **a eu lieu, un nouveau rendez-vous est nécessaire** : la demande redevient à planifier ;
- **la personne n'est pas venue** : à replanifier, ou clôturée sans suite.

Seule l'issue est consignée, jamais le contenu de l'entretien.

## Où ça se passe

| Pour… | Aller à… |
|---|---|
| Déposer une demande | Demandes → Mes demandes → Nouvelle demande, ou le lien public |
| Valider, confier, rejeter | Personnes → **Suivi pastoral**, onglet *Rendez-vous* |
| Fixer la date, consigner l'issue (accompagnant) | Personnes → Suivi pastoral, puis la fiche de la demande |
| Planifier un rendez-vous confié à un profil pastoral | Agenda → Agenda pastoral → **Planification** |
| Voir les rendez-vous de la semaine | Agenda → Agenda pastoral → **Vue agenda** |
| Régler les délais de relance et les accompagnants | Suivi pastoral → **Paramètres** |
| Mesurer | Suivi pastoral → **Statistiques** |

## Les règles à connaître

- **Le message de la demande est confidentiel.** Seuls le référent, Admin, Super Admin et l'accompagnant en charge le lisent. Les autres (protocole, Secrétaire, équipe intégration, accompagnant dessaisi) voient « Rendez-vous pastoral », sans l'objet ni le message. Dans l'agenda, le rendez-vous s'intitule « Rendez-vous pastoral » suivi du nom de la personne.
- **Une demande validée n'est pas encore un rendez-vous** : tant qu'une date n'est pas fixée, rien n'est acquis pour le demandeur.
- **Les relances sont automatiques.** Une demande reçue et non confiée alerte les référents (7 jours par défaut) ; une demande confiée sans date alerte l'accompagnant (14 jours par défaut). Les demandes concernées s'affichent sous « À relancer ».
- **Les étapes de suivi appartiennent à l'accompagnant en charge**, pas à toute l'équipe : fixer la date, consigner l'issue, rendre la demande.
- **Les STAR accompagnants** sont les membres du département de fonction MSDP. Le référent peut en écarter un ou ajouter un STAR hors MSDP dans les paramètres.

## Les cas particuliers

**Un accompagnant qui ne peut pas assurer.** Il **rend la demande au référent**, avec une raison obligatoire, tant que le rendez-vous n'a pas eu lieu. Elle redevient reçue, sans accompagnant, et les référents sont prévenus.

**Une réaffectation.** Le référent peut confier la demande à quelqu'un d'autre. Le nouvel accompagnant est prévenu, l'ancien perd aussitôt l'accès au message.

**Un profil pastoral sans compte.** Il n'est prévenu que par email, et c'est le référent qui consigne l'issue à sa place.

**Une entrée directe.** Un rendez-vous convenu de vive voix peut être posé dans l'agenda (Vue agenda → « Ajouter à l'agenda ») sans passer par la demande. À utiliser avec parcimonie : il n'a pas d'historique de motif.

**Une suppression.** Admin et Super Admin peuvent supprimer définitivement une demande, avec son historique. Le référent, lui, rejette ou clôture. Une demande d'où est né un suivi ne se supprime pas.

## Ce qui sort à la fin

- Un rendez-vous tenu, avec son issue consignée, et le cas échéant un suivi de nouveau converti ouvert.
- Un historique complet sur la fiche : réception, validation ou rejet, affectations successives, date, issue.
- Des statistiques par état, par accompagnant et par motif de rejet.
