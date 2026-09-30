# ADR-0019 — Supprimer une demande efface son historique et ses notifications

- **Statut** : Accepté
- **Date** : 2026-10-01

## Contexte

La spec 057 permet à l'Admin et au Super Admin de supprimer définitivement une demande de
rendez-vous pastoral, un suivi de nouveau converti ou une demande d'intégration. L'un des deux
motifs est l'**effacement à la demande de la personne** : ces demandes portent des données
personnelles et pastorales sensibles.

Or ces données ne vivent pas que dans la ligne de la demande :

- son **historique** est stocké dans `audit_logs` (`entityType` + `entityId`), dont les
  `details` contiennent des notes libres et des noms d'accompagnants ;
- ses **notifications in-app** citent presque toujours la personne (« On vous a confié la
  demande de X »), et plusieurs pointent vers une page générique (`/care`, `/agenda/schedule`)
  plutôt que vers la demande — le lien seul ne permet donc pas de les retrouver.

Jusqu'ici, aucune ligne de `audit_logs` n'était jamais effacée.

## Décision

Supprimer une demande (au sens de la spec 057) :

1. supprime **physiquement** la ligne, pas de suppression logique ;
2. supprime dans la même transaction ce qui n'existe que par elle : ses lignes `audit_logs`
   (même `entityType`/`entityId`), ses notifications, l'entrée d'agenda d'un rendez-vous ;
3. écrit, une fois la transaction validée, **une seule** ligne `audit_logs` `DELETE` pour
   l'objet, **sans `details`** : qui, quand, quel type (`entityType`) — aucune donnée
   personnelle.

Les notifications sont rattachées à leur objet par deux colonnes nullables
`Notification.entityType`/`entityId` (mêmes valeurs que `audit_logs.entityType`), renseignées
par toute notification émise à propos d'une demande ou d'un suivi. À la suppression, on efface
les notifications rattachées **ou** dont le lien pointe vers l'objet (rattrapage des
notifications antérieures à cette décision).

Portée : effacer des lignes `audit_logs` n'est admis **que** pour l'objet même qu'on supprime
définitivement, afin d'en effacer les données personnelles. Ce n'est pas un moyen général de
réécrire ou d'élaguer le journal.

## Alternatives considérées

- **Suppression logique (`deletedAt`)** — les données personnelles resteraient en base, contraire
  au besoin d'effacement ; chaque liste, statistique, relance et export devrait filtrer.
- **Conserver l'historique et les notifications** — contredirait l'effacement : notes et noms y
  subsistent.
- **Retrouver les notifications par le nom de la personne dans le texte** — homonymes, faux
  positifs, dépendance aux libellés.
- **Remplacer les liens génériques par le lien de la demande** — casse le parcours du Protocole
  (`/agenda/schedule`) et enverrait un ancien accompagnant vers une page qu'il ne peut plus voir.

## Conséquences

- La vue `/admin/audit-logs` ne montre plus rien de la demande supprimée, hormis la ligne
  `DELETE`.
- Les notifications **antérieures** à cette décision et à lien générique ne sont pas rattachées :
  elles restent après suppression. Le résidu diminue avec le temps.
- Les e-mails déjà envoyés ne peuvent pas être rappelés.
- Toute nouvelle notification émise à propos d'un objet supprimable doit renseigner
  `entityType`/`entityId` (couvert par des tests d'émission).

## Références

- Spec : `specs/057-suppression-demandes-pastorales/`
- ADR-0001 (frontières de modules), ADR-0016 (notifications), ADR-0017 (permissions dédiées)
