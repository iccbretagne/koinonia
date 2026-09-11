# Spec — L'équipe Secrétariat porte les droits du Secrétariat

- **Numéro** : 045
- **Statut** : En revue
- **Créée le** : 2026-09-12
- **Branche suggérée** : `feat/droits-equipe-secretariat`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Dans Koinonia, « le Secrétariat » désigne aujourd'hui deux choses qui n'ouvrent pas les mêmes
portes :

- le **rôle Secrétaire**, attribué à un compte, qui donne un large ensemble de droits ;
- l'**équipe Secrétariat**, c'est-à-dire les membres du département portant la fonction
  Secrétariat, dont l'appartenance n'ouvre presque rien — seulement le traitement des demandes,
  le dépôt de la trame des annonces (spec 040) et la désignation d'ouverture/fermeture (spec 041).

Or ce sont les personnes de l'équipe qui font le travail : elles préparent les cultes, créent et
corrigent les événements, rattachent les départements attendus en service. Aujourd'hui elles ne
le peuvent pas. Tout passe par le porteur du rôle, qui devient un goulot d'étranglement — ou bien
on attribue le rôle Secrétaire à plusieurs personnes pour contourner le problème, ce qui leur
donne ces droits **indépendamment** de leur présence réelle dans l'équipe, et ne les leur retire
pas quand elles la quittent.

La cible est que **l'appartenance à l'équipe soit la source de vérité** : on a les droits du
Secrétariat parce qu'on est dans l'équipe Secrétariat, et on les perd en la quittant. À terme le
rôle Secrétaire n'a plus de raison d'être et disparaîtra.

Cette spec est la **première des deux étapes** de cette bascule :

1. **(cette spec)** l'équipe Secrétariat obtient exactement les mêmes droits que le rôle
   Secrétaire. Le rôle subsiste, inchangé, le temps que tous les secrétaires soient liés à une
   fiche STAR et rattachés au département.
2. **(spec ultérieure)** le rôle Secrétaire est retiré, une fois la migration constatée.

Ce découpage est délibéré : il évite qu'un compte perde ses accès du jour au lendemain, et permet
de revenir en arrière.

## Utilisateurs concernés

- **Gagnent les droits** : les membres d'un département portant la fonction **Secrétariat**, quel
  que soit leur rôle par ailleurs (typiquement des STAR). Ils obtiennent la **totalité** de ce que
  porte le rôle Secrétaire aujourd'hui :
  - planning : consultation et grilles par département ;
  - **événements : gestion complète** (création, modification, suppression, rattachement des
    départements attendus) — le besoin d'origine ;
  - **service d'accueil** : familles d'accueil et affectations ;
  - **comptes rendus** : consultation et saisie ;
  - membres et départements : consultation ;
  - absences : consultation et gestion ;
  - discipolat : consultation, gestion et export ;
  - agenda pastoral : consultation et planification ;
  - salles : consultation ;
  - audio et médias : consultation et dépôt ;
  - emploi : usage et administration des offres ;
  - statistiques comptables ;
  - gestion des accès et des rôles, dans les mêmes limites qu'aujourd'hui — on n'accorde jamais
    un niveau supérieur au sien.
- **Inchangés** : Super Admin, Admin et le rôle Secrétaire conservent exactement leurs droits
  actuels. Cette étape n'enlève rien à personne.
- **Non concernés** : Ministre, Responsable de département, Reporter, Faiseur de Disciples,
  Qualificateur agenda, Comptable et les STAR des autres départements ne gagnent rien.

La saisie des comptes rendus reste par ailleurs ouverte au Reporter et à qui dispose du droit de
consultation des comptes rendus, exactement comme aujourd'hui.

## Comportement attendu

### Scénario principal

1. Une personne de l'équipe Secrétariat, sans rôle particulier, se connecte.
2. Sa navigation lui présente désormais les mêmes entrées qu'à un secrétaire : événements,
   service d'accueil, comptes rendus, agenda pastoral, discipolat, etc.
3. Elle ouvre la gestion des événements et crée le culte du dimanche suivant : intitulé, type,
   date, départements attendus.
4. L'événement apparaît immédiatement dans l'agenda de l'église.
5. Plus tard, elle corrige l'horaire et ajoute un département oublié.
6. Chaque action est tracée à son nom, comme pour tout autre gestionnaire.

### Scénarios alternatifs / cas limites

- **Si** la personne quitte le département Secrétariat, elle perd immédiatement tous ces droits,
  sans aucune action d'administration.
- **Si** son compte n'est pas lié à une fiche STAR, elle ne gagne rien : l'appartenance se
  constate à partir de la fiche. C'est le prérequis de la seconde étape.
- **Si** l'église n'a aucun département portant la fonction Secrétariat, rien ne change : seuls
  les rôles habituels ont ces droits.
- **Quand** une personne sans droit ouvre une de ces pages par un lien direct, l'accès est refusé
  avec un message clair — l'absence d'entrée de menu ne suffit jamais.
- **Multi-église** : appartenir à l'équipe Secrétariat d'une église n'ouvre aucun droit dans une
  autre église, même si la personne y a un compte.
- **Si** la personne cumule le rôle Secrétaire et l'appartenance à l'équipe, son expérience est
  strictement inchangée.
- **Quand** un membre de l'équipe attribue des rôles, il ne peut jamais accorder un niveau
  supérieur au sien : les protections existantes contre l'escalade de privilèges s'appliquent
  telles quelles.
- Appartenir à l'équipe ne rend jamais Admin ni Super Admin.

## Critères d'acceptation

- [ ] Un membre d'un département de fonction Secrétariat, lié à une fiche STAR et sans rôle
      Secrétaire/Admin/Super Admin, dispose de **tous** les droits listés ci-dessus.
- [ ] Il peut créer, modifier et supprimer un événement, et rattacher/détacher les départements
      attendus.
- [ ] Il accède au service d'accueil et aux comptes rendus.
- [ ] Il attribue et retire des rôles dans les mêmes limites qu'un porteur du rôle Secrétaire
      aujourd'hui, sans jamais pouvoir accorder un niveau supérieur au sien.
- [ ] Les entrées de menu correspondantes lui sont visibles, y compris le raccourci de gestion
      sur l'agenda de l'église.
- [ ] Pour chacun de ces droits, un membre de l'équipe et un porteur du rôle Secrétaire obtiennent
      **le même résultat** — c'est ce qui rendra le retrait du rôle sans effet à l'étape 2.
- [ ] Un STAR d'un autre département, un Responsable de département, un Ministre et un Reporter
      n'obtiennent aucun droit nouveau, ni par le menu ni par lien direct.
- [ ] Le retrait de la personne du département lui retire tous ces droits sans autre action.
- [ ] Un compte non lié à une fiche STAR n'obtient aucun droit par cette voie.
- [ ] Les droits actuels de Super Admin, Admin, Secrétaire et de tous les autres rôles sont
      inchangés.
- [ ] Le cloisonnement par église est respecté.
- [ ] Les protections contre l'escalade de privilèges restent effectives pour un membre de
      l'équipe.
- [ ] L'ensemble reste utilisable sur mobile.

## Hors périmètre

- **Le retrait effectif du rôle Secrétaire** : c'est l'objet de la seconde spec, une fois tous les
  comptes migrés.
- Étendre ce principe à d'autres équipes (Coordination, Protocole, Modération…).
- Créer un nouveau rôle, ou modifier les droits d'un rôle existant.
- Modifier le contenu ou le cycle de vie des événements, des comptes rendus ou du service
  d'accueil.
- Reprendre le circuit existant des demandes et des annonces.

## Décisions (clarifications du 2026-09-12)

- **Bascule en deux étapes** plutôt qu'en une : parité d'abord, retrait du rôle ensuite. Motif :
  aucun compte ne doit perdre ses accès le jour du déploiement, et la marche arrière reste
  possible.
- **Périmètre complet**, pas seulement les événements : puisque la cible est le remplacement du
  rôle, toute parité partielle rendrait l'étape 2 impossible.
- **Service d'accueil et comptes rendus inclus**, la saisie des comptes rendus restant par
  ailleurs ouverte au Reporter et au droit de consultation.
- **Gestion des accès et des rôles incluse** : c'est le droit le plus sensible du lot, mais
  l'exclure obligerait à le traiter à part à l'étape 2 et empêcherait le retrait du rôle d'être
  neutre. Les protections existantes contre l'escalade de privilèges s'appliquent telles quelles.
- **Doctrine des périmètres** : la règle qui veut que l'appartenance à un département ne donne
  jamais de droit d'écriture (ADR-0013) sera **amendée par une exception nommée** — certaines
  fonctions de département, énumérées, confèrent des droits d'écriture explicites. C'est déjà ce
  que font les specs 040 et 041. La lecture seule reste le défaut pour toute autre appartenance.
  L'amendement est à produire avec le `plan.md`.

## Questions ouvertes

- Comment **constater** que la migration est terminée, c'est-à-dire qu'aucun porteur du rôle
  Secrétaire n'est resté sans fiche STAR liée et sans rattachement au département ? Faut-il le
  signaler dans l'administration des accès avant d'autoriser l'étape 2 ?
- Faut-il **accompagner** la liaison des comptes secrétaires à leur fiche STAR, ou cela relève-t-il
  d'une opération manuelle d'administration ?
