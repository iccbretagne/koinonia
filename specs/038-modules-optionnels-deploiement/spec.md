# Spec — Modules optionnels par déploiement

- **Numéro** : 038
- **Statut** : Implémentée
- **Créée le** : 2026-09-08
- **Branche suggérée** : `feat/modules-optionnels-deploiement`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia expose depuis l'origine un réglage de déploiement censé choisir les modules actifs sur
une instance. Ce réglage **ne fait pas ce que son nom promet**, et personne ne s'en est aperçu
parce qu'il n'est défini nulle part : ni dans les variables d'exemple, ni en intégration continue,
ni dans les deux procédures de déploiement.

Constat mesuré sur le code à la version v1.22.0. Désactiver un module aujourd'hui :

- retire ses entrées de navigation — **le seul effet réel** ;
- retire ses permissions de la matrice des rôles, ce qui refuse l'accès aux rôles ordinaires ;
- **ne retire rien du tout** pour le Super Admin, qui court-circuite le contrôle de permission en
  tête de chaque garde (une dizaine d'emplacements) ;
- **ne retire rien du tout** pour un membre d'une équipe désignée : plusieurs modules autorisent
  l'accès par appartenance à un département lorsque la permission de rôle échoue ;
- **ne retire rien du tout** pour un module qui ne déclare aucune permission : son accès repose
  entièrement sur l'appartenance, la désactivation ne le touche pas ;
- laisse toutes ses adresses joignables, y compris ses liens de partage publics par jeton ;
- laisse ses traitements planifiés s'exécuter, ceux-ci appelant ses services sans condition.

Autrement dit : « déployer sans le module X » masque aujourd'hui un menu, ça ne retire pas une
capacité. Un lien de partage audio reste ouvert sur une instance censée être sans audio ; un
Super Admin y accède normalement ; les traitements de fond continuent d'envoyer les
notifications du module.

**Pourquoi maintenant.** Le besoin est de pouvoir exploiter des instances distinctes et allégées —
une autre église hébergée séparément, une démonstration, une réutilisation du projet dans un
contexte différent — sans embarquer des fonctionnalités qui ne servent pas et sans en assumer la
surface d'exposition. Tant que le réglage ne fait qu'un masquage cosmétique, cette exploitation
n'est pas possible : on croirait avoir retiré un module qui répond toujours.

Le sujet est un sujet de **contrôle d'accès**, pas de confort : la différence entre « masqué » et
« absent » est exactement la différence entre une instance réputée sans audio et une instance qui
sert encore ses fichiers audio à qui connaît l'adresse.

## Utilisateurs concernés

Cette fonctionnalité n'ajoute aucune capacité aux rôles d'église. Elle change ce qu'une
**instance** propose, pour tout le monde à la fois.

| Acteur | Ce qui change pour lui |
|---|---|
| **Exploitant** (celui qui déploie — hors matrice de rôles Koinonia) | Choisit à la mise en service les modules actifs. Se voit refuser un démarrage incohérent plutôt que de le découvrir en production. |
| **Super Admin** | **Soumis au réglage comme tout le monde.** Sur une instance sans module X, il n'accède ni aux pages ni aux données de X — ses prérogatives de plateforme (églises, comptes, journal d'audit, sauvegardes) restent entières. |
| **Tous les rôles d'église** (Admin, Secrétaire, Ministre, Resp. département, STAR, Faiseur de Disciples, Reporter, Qualificateur agenda, Comptable) | Ne voient ni n'atteignent les fonctions d'un module désactivé, y compris lorsqu'un accès leur était ouvert par appartenance à un département plutôt que par leur rôle. |
| **Visiteur non authentifié** | Un lien de partage public appartenant à un module désactivé cesse de fonctionner. |

Le Super Admin est soumis au réglage parce que sinon « désactivé » ne veut rien dire : un module
resterait accessible et modifiable par le compte le plus puissant, sur une instance réputée ne pas
le porter. Cela lui retire l'accès applicatif à des données présentes en base ; la voie de retour
est de réactiver le module et de redémarrer l'instance — acceptable pour un réglage de
déploiement, qui ne varie pas d'une église à l'autre.

## Comportement attendu

### Scénario principal

1. L'exploitant met en service une instance en indiquant les modules qu'il souhaite y activer.
2. L'instance vérifie la cohérence de cette liste au démarrage. Si un module activé a besoin d'un
   module absent de la liste, **l'instance refuse de démarrer** et nomme la dépendance manquante.
3. L'instance démarre. La navigation ne propose que les modules actifs — comme aujourd'hui.
4. Un utilisateur, quel que soit son rôle, demande une adresse appartenant à un module désactivé.
   L'instance répond **« introuvable »**, comme si la fonctionnalité n'existait pas.
5. Les traitements planifiés ne déclenchent aucun travail appartenant à un module désactivé :
   aucune notification, aucun courriel, aucune tâche de fond de ce module.

Le choix de « introuvable » plutôt que « accès refusé » est délibéré : « accès refusé » révèle
l'existence de la fonctionnalité et invite à chercher le bon compte. Sur une instance qui ne porte
pas le module, la réponse honnête est qu'il n'y a rien à cet endroit.

### Scénarios alternatifs / cas limites

- **Si un Super Admin** demande une adresse d'un module désactivé, il obtient « introuvable »
  comme les autres. Aucun compte ne fait exception.

- **Si un utilisateur tire son accès de son appartenance à un département** plutôt que de son rôle
  (équipe de captation, équipe d'intégration, protocole), cet accès disparaît aussi. Les chemins
  d'accès par appartenance ne survivent pas à la désactivation.

- **Si un module ne déclare aucune permission** et repose entièrement sur l'appartenance, sa
  désactivation le rend malgré tout injoignable. Ne pas déclarer de permission ne dispense pas du
  réglage.

- **Quand un lien de partage public** (partage d'écoute, galerie, formulaire ouvert) appartient à un
  module désactivé, il cesse de fonctionner pour tout visiteur, authentifié ou non.

- **Si une donnée d'un module désactivé existe déjà en base**, elle est conservée intacte. La
  désactivation retire l'accès, elle ne supprime rien et ne modifie aucun schéma. Réactiver le
  module restitue l'accès à ces données telles quelles.

- **Quand une suppression touche des données d'un module désactivé** — supprimer un événement
  auquel un module absent rattache des lignes — **la suppression réussit quand même**. Les
  traitements qui garantissent la cohérence référentielle **ne sont pas soumis au réglage** :
  les données existent en base indépendamment de l'affichage, et refuser de les nettoyer ferait
  échouer des opérations légitimes du noyau. C'est l'unique exception, et elle est nommée.

- **À l'inverse, quand un traitement d'un module actif produirait une donnée appartenant à un
  module désactivé**, ce traitement ne s'exécute pas : on ne crée pas de données pour un module
  absent. La distinction est nette : **nettoyer, oui ; créer, non.**

- **Si une adresse de l'application n'est rattachée à aucun module** ni déclarée comme relevant du
  noyau, le projet doit le signaler comme une anomalie avant livraison. Une adresse orpheline
  resterait joignable sur toutes les instances sans que personne ne l'ait décidé — c'est le
  défaut que cette fonctionnalité existe pour empêcher, il ne doit pas pouvoir se réintroduire en
  silence.

- **Si aucune liste n'est fournie** au démarrage, tous les modules sont actifs. C'est le
  comportement d'aujourd'hui et celui de l'instance de production ; cette fonctionnalité ne change
  rien pour elle.

- **Si la liste désactive le module racine** — celui qui porte la gestion des églises, des comptes
  et des accès — **l'instance refuse de démarrer**. C'est le seul module non désactivable : sans
  lui, personne ne peut créer une église ni attribuer un accès, l'instance serait inadministrable.
  Tous les autres modules sont optionnels, y compris ceux qui portent l'essentiel des
  fonctionnalités : une instance réduite à l'administration est un état légitime, notamment au
  moment d'amorcer un nouveau déploiement.

- **Si un utilisateur n'a de rôle que sur des modules désactivés** — un Comptable sur une instance
  sans comptabilité, un Qualificateur agenda sans agenda — il suit le **parcours « aucun accès »
  déjà existant**, celui d'un utilisateur sans église. Aucun écran ni message spécifique à la
  désactivation n'est ajouté : le résultat observable est le même, et la cause exacte relève de
  l'exploitant, pas de l'utilisateur.

## Critères d'acceptation

- [ ] Sur une instance où un module est désactivé, **toute** adresse de ce module — page, service,
      lien public par jeton — répond « introuvable ».
- [ ] Ce refus s'applique au Super Admin.
- [ ] Ce refus s'applique à un utilisateur dont l'accès au module venait de son appartenance à un
      département et non de son rôle.
- [ ] Ce refus s'applique à un module qui ne déclare aucune permission.
- [ ] Un lien de partage public d'un module désactivé, valide par ailleurs, ne donne plus accès.
- [ ] Le démarrage échoue, avec un message nommant la dépendance manquante, si un module activé
      dépend d'un module absent de la liste.
- [ ] Le démarrage réussit et active tous les modules quand aucune liste n'est fournie.
- [ ] Le démarrage échoue si la liste désactive le module racine.
- [ ] Le démarrage réussit avec le seul module racine actif, produisant une instance réduite à
      l'administration.
- [ ] Un utilisateur dont tous les rôles portent sur des modules désactivés aboutit au parcours
      « aucun accès » existant, sans écran ni message dédié.
- [ ] Aucun traitement planifié appartenant à un module désactivé ne s'exécute.
- [ ] Supprimer une donnée du noyau à laquelle un module désactivé rattache des lignes réussit,
      et laisse la base cohérente.
- [ ] Un traitement qui créerait une donnée appartenant à un module désactivé ne s'exécute pas.
- [ ] La navigation ne propose aucune entrée d'un module désactivé (comportement actuel, à ne pas
      régresser).
- [ ] Réactiver un module désactivé restitue l'accès à ses données antérieures, inchangées.
- [ ] Le projet dispose d'une vérification automatique qui échoue si une adresse de l'application
      n'est rattachée ni à un module ni au noyau.
- [ ] Les permissions d'un module désactivé n'apparaissent dans les droits d'aucun rôle.

## Hors périmètre

- **L'activation par église.** Le réglage vaut pour l'instance entière, pas par tenant. Un besoin
  du type « l'église A a l'audio, l'église B non » sur un même déploiement est une tout autre
  fonctionnalité : ce serait une donnée par église, pas un réglage de déploiement, et aucune
  brique de cette spec ne l'anticipe.
- **Le retrait du code, du schéma ou des tables** d'un module désactivé. Le code reste livré, les
  tables restent créées, les données restent en place. Seule la surface accessible disparaît.
- **La suppression ou la purge des données** d'un module désactivé.
- **Un écran d'administration** pour activer/désactiver les modules depuis l'application. Le
  réglage est un paramètre de mise en service, modifié par l'exploitant, pris en compte au
  démarrage.
- **La refonte de la composition des modules** (l'inversion évoquée au chantier 4 de la roadmap
  modularité). Sans objet ici.
- **Toute modification des droits** attachés aux rôles. La matrice des permissions n'est pas
  touchée : elle se réduit mécaniquement aux modules actifs.

## Questions ouvertes

*Les deux points bloquants ont été tranchés le 2026-09-08 et sont remontés dans les scénarios et
les critères : le module racine est le seul non désactivable, et un utilisateur privé de tous ses
rôles suit le parcours « aucun accès » existant. Restent deux points non bloquants, à trancher au
plus tard pendant le plan.*

- **Comment l'exploitant vérifie-t-il la configuration effective ?** Aujourd'hui rien n'indique,
  depuis l'application, quels modules sont actifs. Un point de diagnostic est-il attendu dans le
  cadre de cette fonctionnalité, ou hors périmètre ?

- **Faut-il documenter le réglage à destination de l'exploitant** (procédure de déploiement,
  variables d'exemple) dans le cadre de cette fonctionnalité ? Il n'y figure aujourd'hui nulle
  part, ce qui explique en partie que son inefficacité soit passée inaperçue.
