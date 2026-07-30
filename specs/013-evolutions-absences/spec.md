# Spec — Évolutions du module Absences

- **Numéro** : 013
- **Statut** : En revue
- **Créée le** : 2026-07-30
- **Branche suggérée** : `feat/evolutions-absences`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Le module Absences (spec [[007-gestion-absences-star]]) est en production depuis peu et a déjà
reçu une passe d'harmonisation ergonomique (spec [[012-harmonisation-ergonomie-absences]]). Son
usage courant fait apparaître cinq limites :

1. Quand un Resp. département ou un Ministre déclare sa propre absence, il n'a aucun moyen de
   noter tout de suite qui assurera la continuité de ses responsabilités pendant cette période —
   cette information circule oralement ou se perd, et doit être redécouverte plus tard.
2. Corriger une absence déjà déclarée (mauvaise date, motif à préciser) oblige aujourd'hui à
   l'annuler puis à en recréer une nouvelle, ce qui casse la traçabilité de la déclaration
   d'origine et repart de zéro sur les notifications.
3. La vue transverse actuelle liste les absences sous forme de tableau : elle ne permet pas de
   voir d'un coup d'œil comment les absences d'une période se répartissent dans le temps.
4. Les responsables qui doivent partager ou archiver les absences hors de l'application (compte
   rendu, réunion) n'ont aucun moyen d'en exporter la liste.
5. À la déclaration, la saisie de la date de fin est indépendante de la date de début, ce qui
   permet de sélectionner par erreur une date de fin antérieure à la date de début et alourdit la
   saisie sur une période courte (souvent un seul jour ou quelques jours consécutifs).

Cette feature regroupe ces cinq évolutions car elles portent toutes sur le même module et visent
le même objectif : rendre la déclaration et le suivi des absences plus fiables et plus rapides au
quotidien pour les responsables.

## Utilisateurs concernés

- **STAR** : peut modifier sa propre absence tant qu'elle n'est pas passée ; consulte la nouvelle
  vue frise et peut exporter ce qu'il voit dans son périmètre ; ne désigne jamais de backup (le
  backup ne concerne que les absences des Resp. département et des Ministres).
- **Resp. département** : peut désigner en backup, lors de la déclaration ou de la modification de
  **sa propre** absence, un ou plusieurs STAR de son département, le Ministre dont il dépend et/ou
  un autre Resp. département du même ministère, pour assurer la continuité de ses responsabilités ;
  peut modifier une absence de son périmètre tant qu'elle n'est pas passée ; consulte la vue frise
  et exporte sur son périmètre.
- **Ministre** : mêmes droits que Resp. département pour la modification, la vue frise et
  l'export ; pour le backup, peut désigner en backup de **sa propre** absence un STAR de
  n'importe quel département de son ministère et/ou un autre Ministre de l'église.
- **Secrétaire, Admin, Super Admin** : consultent la vue frise et exportent sur tout le périmètre
  auquel ils ont déjà accès en lecture (vue transverse existante) ; ne désignent pas de backup et
  ne modifient pas d'absence pour un tiers (cohérent avec leur absence de droit de déclaration
  aujourd'hui).

Rôles non concernés : Faiseur de Disciples, Reporter (déjà hors périmètre du module Absences).

## Comportement attendu

### 1. Backup optionnel sur une absence de responsable

#### Scénario principal

1. Un Resp. département ou un Ministre déclare (ou modifie) **sa propre** absence.
2. En option, il désigne un ou plusieurs backups pour assurer la continuité de ses
   responsabilités pendant la période concernée :
   - un Resp. département choisit parmi les STAR de son département, le Ministre dont il dépend
     et/ou un autre Resp. département du même ministère ;
   - un Ministre choisit parmi les STAR des départements de son ministère et/ou un autre Ministre
     de l'église.
3. L'absence est enregistrée avec ses backups. Les personnes désignées comme backup (STAR, Resp.
   département ou Ministre) sont notifiées qu'elles ont été proposées en remplacement, avec la
   période et le motif (si renseigné).
4. Le ou les backups apparaissent sur l'absence dans la vue transverse, à côté du responsable
   absent.

#### Cas limites

- **Si** aucun backup n'est désigné, **alors** l'absence se comporte exactement comme aujourd'hui
  (aucun changement de comportement pour les déclarations sans backup).
- **Si** la personne qui déclare une absence n'a le rôle ni de Resp. département ni de Ministre
  (STAR simple), **alors** l'option de désigner un backup ne lui est pas proposée, y compris pour
  sa propre absence.
- **Si** un Resp. département ou un Ministre déclare une absence pour un tiers de son périmètre
  (et non pour lui-même), **alors** l'option de désigner un backup ne lui est pas proposée — le
  backup ne s'applique qu'à l'absence du responsable lui-même.
- **Si** un Resp. département désigne le Ministre dont il dépend, ou un autre Resp. département du
  même ministère, en backup, **alors** la personne désignée est notifiée exactement comme le
  serait un STAR désigné en backup.
- **Si** un Ministre désigne un autre Ministre en backup, **alors** ce dernier est notifié
  exactement comme le serait un STAR désigné en backup.
- **Si** un Resp. département tente de désigner en backup un Resp. département d'un autre
  ministère que le sien, **alors** cette personne ne lui est pas proposée dans le choix des
  backups possibles.
- **Si** la personne désignée en backup (STAR, Resp. département ou Ministre) est elle-même déjà
  en absence active sur tout ou partie de la même période, **alors** le système le signale
  visuellement au moment de la désignation, sans empêcher la sauvegarde — c'est au responsable
  d'arbitrer.
- **Si** une absence avec backup est annulée ou modifiée (date, backup retiré), **alors** les
  backups concernés sont notifiés du changement comme le sont aujourd'hui les responsables lors
  d'une annulation.

### 2. Modification d'une absence non passée

#### Scénario principal

1. Un STAR (pour sa propre absence) ou un responsable de son périmètre ouvre une absence active
   dont la date de fin n'est pas encore passée.
2. Il modifie la période et/ou le motif et/ou les backups.
3. Il valide : l'absence est mise à jour immédiatement, sans étape d'approbation, comme c'est déjà
   le cas pour la déclaration.
4. Le système réévalue les conflits avec le planning existant sur la nouvelle période, exactement
   selon la même logique qu'à la création.
5. Les responsables et backups qui avaient été notifiés de la déclaration initiale sont notifiés
   de la modification.

#### Cas limites

- **Si** l'absence est déjà passée (date de fin dans le passé), **alors** elle ne peut plus être
  modifiée — seule sa consultation reste possible, comme aujourd'hui.
- **Si** l'absence est en cours (date de début passée, date de fin future), **alors** elle reste
  modifiable pour sa partie future ; la modification ne peut pas faire remonter la date de début
  dans le passé.
- **Si** la modification fait apparaître un nouveau conflit avec le planning qui n'existait pas
  avant, **alors** le système notifie ce conflit exactement comme il le ferait pour une nouvelle
  déclaration.
- **Si** la modification fait disparaître un conflit existant (ex. la période est raccourcie),
  **alors** le conflit n'est plus signalé sur le planning.
- L'action « Annuler » reste disponible en parallèle de la modification : modifier corrige une
  absence qui reste d'actualité, annuler y met fin définitivement.

### 3. Vue frise temporelle

#### Scénario principal

1. Un utilisateur ayant accès à la vue transverse des absences bascule vers une vue « frise
   temporelle ».
2. Il voit les absences réparties visuellement sur un axe temporel, organisées par STAR ou par
   département, pour la période actuellement sélectionnée.
3. Il peut naviguer dans le temps (période précédente/suivante) et cliquer sur une absence pour en
   voir le détail, comme depuis la vue tableau existante.

#### Cas limites

- **Si** aucun filtre n'est appliqué, **alors** la frise respecte le même périmètre de visibilité
  que la vue tableau existante (département/ministère/église selon le rôle).
- **Si** un filtre est actif dans la vue tableau (statut, période, recherche), **alors** basculer
  vers la frise conserve ce filtre.
- **Si** une absence a un conflit signalé, **alors** ce conflit reste visuellement identifiable
  dans la frise, de la même manière que dans la vue tableau.

### 4. Export Excel

#### Scénario principal

1. Depuis la vue transverse des absences (tableau ou frise), un utilisateur déclenche l'export.
2. Il obtient un fichier Excel contenant les absences actuellement visibles compte tenu des
   filtres appliqués et de son périmètre de visibilité.
3. Chaque ligne exportée reprend les informations affichées dans la vue transverse (STAR,
   département, période, motif, statut, conflit éventuel, backup(s) éventuel(s)).

#### Cas limites

- **Si** aucune absence ne correspond aux filtres actifs, **alors** l'export produit un fichier
  vide (avec en-têtes) plutôt qu'une erreur.
- L'export ne contient jamais d'absence hors du périmètre de visibilité de l'utilisateur, même si
  ses filtres tentent d'en afficher davantage.

### 5. Date de fin liée à la date de début

#### Scénario principal

1. Lors de la déclaration ou de la modification d'une absence, l'utilisateur choisit d'abord la
   date de début.
2. La date de fin se pré-remplit avec la même date (absence d'un jour par défaut) et son
   sélecteur ne propose plus de dates antérieures à la date de début.
3. L'utilisateur peut ajuster librement la date de fin vers une date ultérieure si l'absence dure
   plusieurs jours.

#### Cas limites

- **Si** l'utilisateur modifie la date de début après avoir déjà choisi une date de fin, **et
  que** la date de fin devient antérieure à la nouvelle date de début, **alors** la date de fin se
  réaligne automatiquement sur la nouvelle date de début.
- **Si** l'utilisateur modifie la date de début après avoir déjà choisi une date de fin, **et
  que** la date de fin reste postérieure ou égale à la nouvelle date de début, **alors** la date
  de fin choisie est conservée telle quelle.

## Critères d'acceptation

- [ ] Un Resp. département peut désigner en backup, lors de la déclaration de **sa propre**
      absence, un ou plusieurs STAR de son département, le Ministre dont il dépend et/ou un autre
      Resp. département du même ministère.
- [ ] Un Resp. département ne peut pas désigner en backup un Resp. département d'un autre
      ministère que le sien.
- [ ] Un Ministre peut désigner en backup, lors de la déclaration de **sa propre** absence, un ou
      plusieurs STAR de n'importe quel département de son ministère et/ou un autre Ministre de
      l'église.
- [ ] L'option de désigner un backup n'est jamais proposée à un STAR simple (sans rôle Resp.
      département ni Ministre), y compris pour sa propre absence.
- [ ] L'option de désigner un backup n'est jamais proposée lorsqu'un responsable déclare une
      absence pour un tiers — uniquement pour sa propre absence.
- [ ] Les backups désignés sont notifiés de leur désignation avec la période concernée.
- [ ] Les backups d'une absence sont visibles dans la vue transverse.
- [ ] Une absence sans backup se comporte exactement comme avant cette feature.
- [ ] Un STAR peut modifier sa propre absence tant que sa date de fin n'est pas passée.
- [ ] Un Resp. département ou un Ministre peut modifier une absence de son périmètre tant que sa
      date de fin n'est pas passée.
- [ ] Une absence dont la date de fin est passée n'est plus modifiable.
- [ ] La modification d'une absence réévalue les conflits avec le planning sur la nouvelle
      période et notifie les nouveaux conflits comme à la création.
- [ ] La modification d'une absence notifie les responsables et backups déjà notifiés de la
      déclaration initiale.
- [ ] Une vue « frise temporelle » est disponible en alternative à la vue tableau, avec le même
      périmètre de visibilité et les mêmes filtres.
- [ ] Un export Excel des absences est disponible depuis la vue transverse, respectant les
      filtres actifs et le périmètre de visibilité de l'utilisateur.
- [ ] Lors de la déclaration ou modification d'une absence, la date de fin se pré-remplit sur la
      date de début et ne peut pas être choisie antérieure à celle-ci.
- [ ] Changer la date de début après coup réaligne automatiquement une date de fin devenue
      antérieure, sans modifier une date de fin restée valide.

## Hors périmètre

- Aucune notification automatique proposant à un backup de « prendre le service » à la place du
  responsable absent — la désignation reste informative, l'arbitrage et l'affectation planning
  restent manuels (cohérent avec le hors-périmètre de la spec [[007-gestion-absences-star]]).
- Aucune limite au nombre de backups désignés.
- Le backup ne s'applique jamais à l'absence d'un STAR simple (sans rôle Resp. département ni
  Ministre), ni à une absence déclarée par un responsable pour un tiers.
- La vue frise n'introduit pas de nouvelle action (création/modification) qui n'existerait pas
  déjà dans la vue tableau — elle n'est qu'un mode de visualisation supplémentaire.
- L'export ne couvre que le format Excel — pas de CSV, PDF, ou autre format.
- Aucune récurrence ou modification en masse (édition groupée de plusieurs absences à la fois).
- La modification d'une absence ne permet pas de la réattribuer à un autre STAR — elle reste
  rattachée au STAR d'origine ; changer de STAR nécessite d'annuler et de déclarer une nouvelle
  absence.

## Questions ouvertes

Aucune question bloquante restante — tous les points ont été tranchés :

- Le backup ne concerne que les absences des Resp. département et des Ministres, jamais celles
  d'un STAR simple, et jamais une absence déclarée par un responsable pour un tiers.
- Un Resp. département désigne un backup parmi les STAR de son département, le Ministre dont il
  dépend et/ou un autre Resp. département du même ministère ; un Ministre désigne un backup parmi
  les STAR de n'importe quel département de son ministère et/ou un autre Ministre de l'église.
