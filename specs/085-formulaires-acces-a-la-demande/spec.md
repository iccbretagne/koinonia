# Spec — Formulaires : accès à la demande

- **Numéro** : 085
- **Statut** : Brouillon
- **Créée le** : 2026-11-22
- **Branche suggérée** : `feat/formulaires-acces-delegue`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'outil de formulaires (spec 079) est réservé au Super Admin, à l'Admin et à la Secrétaire,
qui voient **tous** les formulaires de l'église, avec leurs réponses et les coordonnées des
répondants. Des responsables (Ministres, responsables de département, organisateurs d'une
activité) ont pourtant besoin de collecter eux-mêmes des inscriptions ou des avis pour leur
équipe : aujourd'hui, ils passent par le secrétariat ou retournent vers des outils extérieurs.

Ouvrir le droit actuel à ces rôles leur donnerait accès à tous les formulaires de l'église, et
donc à des données personnelles qui ne les concernent pas. Il faut un accès **accordé personne
par personne**, et **limité aux formulaires de la personne**.

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| **Super Admin, Admin, Secrétaire** (gestionnaires des formulaires) | Comme aujourd'hui, tout voir et tout gérer. En plus : accorder et retirer l'accès à l'outil à un compte de l'église, voir la liste des accès accordés |
| **Compte autorisé** (n'importe quel compte de l'église : Ministre, Resp. département, STAR, Comptable…) | Créer des formulaires et gérer **seulement** ceux dont il est l'auteur ou qui lui sont partagés : construire, publier, clôturer, dupliquer, supprimer, consulter et exporter les réponses, gérer places et liste d'attente, désigner des intervenants, noter les présences |
| **Co-gestionnaire d'un formulaire** | Un compte autorisé à qui l'auteur a partagé un formulaire : mêmes gestes que l'auteur sur ce formulaire, sauf le supprimer et gérer le partage |
| **Intervenant** (spec 079) | Inchangé : consulte les réponses et note les présences de son périmètre, sans gérer le formulaire |
| **Répondants** | Inchangé |

## Comportement attendu

### Scénario principal — accorder l'accès

1. Un Ministre demande à la Secrétaire de pouvoir créer ses propres formulaires.
2. Dans l'outil de formulaires, la Secrétaire ouvre la gestion des accès, cherche le compte du
   Ministre parmi les comptes de l'église et lui accorde l'accès.
3. Le Ministre reçoit une notification : il a désormais accès aux formulaires. L'outil
   apparaît dans sa navigation, au même endroit que pour la Secrétaire.
4. Le Ministre crée un formulaire « Retraite des musiciens », le publie et partage le lien.
5. Il voit et exporte les réponses de **son** formulaire. Il ne voit aucun autre formulaire de
   l'église.
6. La Secrétaire voit ce formulaire dans la liste complète, avec son auteur.

### Scénario — partager un formulaire (co-gestion)

1. L'auteur ouvre son formulaire et le partage avec un autre compte **déjà autorisé**.
2. Ce co-gestionnaire est prévenu, et le formulaire apparaît dans sa liste.
3. Il peut tout faire sur ce formulaire, sauf le supprimer et modifier le partage.
4. L'auteur peut retirer le partage à tout moment : le formulaire disparaît de la liste du
   co-gestionnaire.

### Scénario — retirer l'accès

1. La Secrétaire retire l'accès du Ministre.
2. Le Ministre ne voit plus l'outil ; une adresse qu'il avait gardée lui répond comme pour une
   page inexistante.
3. Ses formulaires **continuent de fonctionner** (publiés, réponses, accusés, relances) et
   restent gérés par le Super Admin, l'Admin et la Secrétaire, qui voient toujours leur auteur.
4. Si l'accès lui est de nouveau accordé, il retrouve ses formulaires et ses partages.

### Scénarios alternatifs / cas limites

- **Formulaires existants** : ceux créés avant cette fonctionnalité restent gérés par les
  gestionnaires. Leur auteur (la personne qui les a créés, quand elle est connue) ne les voit que
  s'il obtient l'accès — ce qui est normal puisqu'il était déjà gestionnaire.
- **Gestionnaire auteur** : un formulaire créé par la Secrétaire peut lui aussi être partagé
  avec un compte autorisé.
- **Compte qui quitte l'église** : son accès et ses partages s'éteignent ; ses formulaires
  restent aux gestionnaires.
- **Un compte autorisé qui est aussi intervenant** d'un formulaire d'autrui garde seulement les
  droits d'intervenant sur ce formulaire.
- **Duplication** : un compte autorisé ne duplique que les formulaires qu'il gère ; la copie lui
  appartient, sans le partage ni les intervenants de l'original.
- **Rattachement à un événement** (participation) : un compte autorisé ne rattache son
  formulaire qu'à un événement qu'il peut voir dans Koinonia.
- **Plusieurs églises** : l'accès est accordé dans une église précise et ne vaut que pour elle.
- **Adresse d'un formulaire d'autrui** : réponse identique à celle d'un formulaire inexistant.
- **Accorder un accès déjà accordé** : sans effet, aucun doublon ni seconde notification.

## Critères d'acceptation

- [ ] Le Super Admin, l'Admin et la Secrétaire peuvent accorder et retirer l'accès à
      n'importe quel compte de leur église, et voient la liste des accès en cours (qui, accordé
      par qui, depuis quand).
- [ ] Aucun autre rôle ne peut accorder ou retirer un accès.
- [ ] Chaque octroi et chaque retrait est inscrit dans l'historique des modifications, et la
      personne concernée est notifiée.
- [ ] Un compte autorisé voit l'outil de formulaires dans sa navigation ; un compte non autorisé
      (et non gestionnaire) ne le voit pas.
- [ ] Un compte autorisé ne voit, dans la liste, la recherche et l'export, que les formulaires
      dont il est l'auteur ou le co-gestionnaire.
- [ ] Sur un formulaire qui n'est pas le sien, toute action d'un compte autorisé reçoit la même
      réponse qu'un formulaire inexistant.
- [ ] Sur ses formulaires, un compte autorisé dispose de tous les gestes de la spec 079, y
      compris les règles qui bornent la modification d'un formulaire ayant déjà des réponses.
- [ ] L'auteur peut partager un formulaire avec un compte autorisé de la même église, et
      retirer ce partage ; le co-gestionnaire ne peut ni supprimer le formulaire ni modifier
      le partage.
- [ ] Après le retrait de l'accès, la personne n'accède plus à aucun formulaire, y compris
      ceux qui lui étaient partagés, et ses formulaires continuent de recevoir des réponses.
- [ ] Les gestionnaires voient l'auteur de chaque formulaire.
- [ ] Le signal au secrétariat (nouvelles réponses regroupées) d'un formulaire créé par un
      compte autorisé est envoyé à son auteur et à ses co-gestionnaires, et plus au
      secrétariat (qui le voit toujours dans la liste). Un formulaire créé par un gestionnaire
      garde le signal actuel.
- [ ] Le comportement des gestionnaires, des intervenants et des répondants est inchangé.

## Hors périmètre

- Accès par rôle ou par département (« tous les Ministres », une fonction de département) :
  seulement nominatif.
- Date d'expiration automatique de l'accès.
- Demande d'accès faite par la personne dans l'application : elle le demande par les canaux
  habituels.
- Transfert de la propriété d'un formulaire à un autre auteur.
- Partage avec un compte qui n'a pas l'accès à l'outil.
- Accès aux formulaires par les assistants IA (aucune question de données « formulaires »
  aujourd'hui).

## Questions ouvertes

- Tranché : le signal des nouvelles réponses d'un formulaire de compte autorisé va à l'auteur
  et aux co-gestionnaires seulement.
- Décisions prises par défaut (à confirmer en revue) : partage réservé à l'auteur ; le
  co-gestionnaire ne supprime pas ; les formulaires d'un accès retiré restent en ligne.
