# Spec — Plusieurs départements pour une même fonction

- **Numéro** : 046
- **Statut** : En revue
- **Créée le** : 2026-09-12
- **Branche suggérée** : `feat/fonctions-multi-departements`
- **Issue** : #551

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Une église désigne, dans la configuration des fonctions de département, **quel département
remplit une fonction** : Secrétariat, Communication, Production Média, Protocole, Intégration,
Soins Pastoraux (MSDP), Captation Audio, Modération, Sécurité. Cette désignation ouvre des
écrans et des droits aux membres du département (traitement des demandes, espace Audio, suivi
d'intégration…) et détermine qui reçoit certaines demandes et notifications.

Aujourd'hui, **une fonction ne peut être portée que par un seul département** :

- l'écran de configuration ne permet d'en choisir qu'un ; en choisir un second retire le premier ;
- là où l'application a besoin de « l'équipe » d'une fonction, elle en retient un seul,
  arbitrairement, si plusieurs existent déjà.

Or une église peut légitimement répartir une même mission entre plusieurs départements, chacun
couvrant une partie du périmètre de la fonction (par exemple deux départements qui se partagent
le travail d'Intégration). Faute de pouvoir le
déclarer, les membres du second département n'ont ni les écrans ni les notifications de leur
mission, et les demandes n'arrivent qu'à une seule équipe, sans que l'admin puisse savoir
laquelle.

Le contrôle « cette personne fait-elle partie de l'équipe X ? » accepte déjà plusieurs
départements ; c'est la configuration et le routage qui bloquent.

## Utilisateurs concernés

- **Super Admin / Admin / Secrétaire** (porteurs de la gestion des événements) : configurent les
  fonctions et peuvent désormais rattacher **plusieurs** départements à une même fonction.
- **Membres (STAR, Resp. département, Ministre) d'un département portant une fonction** : obtiennent
  les écrans, droits et notifications de la fonction, quel que soit celui des départements
  concernés auquel ils appartiennent.
- **Demandeurs** (tout rôle pouvant soumettre une demande ou une annonce) : leur demande arrive à
  l'équipe de la fonction, sans qu'ils aient à connaître la répartition interne.
- Faiseur de Disciples, Reporter, Qualificateur agenda, Comptable : non concernés, sauf s'ils sont
  membres d'un département portant une fonction.

## Comportement attendu

### Scénario principal

1. Un Admin ouvre la configuration des fonctions de département.
2. Pour la fonction Intégration, il sélectionne deux départements : « Intégration Adultes » et
   « Intégration Jeunes ». Il n'est pas prévenu de la perte d'un département, car aucun n'est retiré.
3. La configuration affiche les deux départements pour cette fonction.
4. Un STAR d'« Intégration Jeunes » voit désormais le lien Intégration dans son menu et accède aux
   mêmes écrans qu'un STAR d'« Intégration Adultes ».
5. Une nouvelle demande d'intégration est soumise : les membres **des deux** départements sont
   notifiés et la voient dans la file de traitement.
6. L'Admin retire « Intégration Jeunes » de la fonction : ses membres perdent les écrans et les
   notifications de la fonction ; ceux d'« Intégration Adultes » ne sont pas affectés.

### Scénarios alternatifs / cas limites

- **Si une fonction n'a qu'un seul département**, le comportement est strictement identique à
  aujourd'hui.
- **Si une fonction n'a aucun département**, les écrans et messages actuels « fonction non
  configurée » restent inchangés.
- **Quand une demande est destinée à une fonction portée par plusieurs départements** (demande de
  visuel, demande au Secrétariat, annonce), elle est visible et traitable par les membres de
  **tous** ces départements (file partagée) ; le demandeur ne choisit pas d'équipe, et le premier
  qui la prend en charge la traite, comme aujourd'hui au sein d'une même équipe.
- **Quand une demande a déjà été reçue par un département** puis que ce département est retiré de
  la fonction, la demande reste visible et traitable par l'équipe de la fonction (les départements
  qui la portent désormais) : elle suit la fonction, pas le département qui l'a reçue.
- **Quand un demandeur consulte ses demandes**, il voit comme destinataire les départements qui
  portent **actuellement** la fonction : le nom du département s'il n'y en a qu'un (comme
  aujourd'hui), la liste s'il y en a plusieurs, ou la fonction marquée « non configurée » s'il n'y
  en a aucun.
- **Quand une relance automatique** (demande d'intégration ou suivi MSDP sans suite) est envoyée,
  elle part aux membres de tous les départements de la fonction, sans doublon pour une personne
  membre de plusieurs d'entre eux.
- **Quand la liste des conseillers MSDP** est proposée, elle réunit les membres de tous les
  départements MSDP, sans doublon.
- **Si une personne appartient à plusieurs départements** d'une même fonction, elle reçoit une seule
  notification par événement et voit chaque demande une seule fois.
- **Quand un département porte déjà une fonction**, il ne peut pas en porter une seconde en même
  temps (règle actuelle inchangée : un département a au plus une fonction).
- **Quand les départements sont de ministères différents** de la même église, c'est autorisé ; un
  département d'une autre église n'est jamais proposé.

## Critères d'acceptation

- [ ] La configuration permet d'associer 0, 1 ou plusieurs départements à chaque fonction, et
      d'en retirer un sans affecter les autres.
- [ ] Sélectionner un second département pour une fonction ne retire pas le premier.
- [ ] Un membre de n'importe lequel des départements d'une fonction accède aux écrans et au lien de
      menu de cette fonction (Traitement des demandes, Demandes visuels, Demandes réseaux sociaux,
      Intégration, Audio, Agenda pastoral, trame des annonces, ouverture/fermeture).
- [ ] Un membre d'un département retiré de la fonction perd ces accès.
- [ ] Les notifications et relances d'une fonction atteignent les membres de tous ses départements,
      une seule fois par personne.
- [ ] Une demande destinée à une fonction multi-départements est visible et traitable par les
      membres de chacun de ses départements, sans choix d'équipe demandé au demandeur.
- [ ] Une demande reçue avant le retrait d'un département de la fonction reste visible et
      traitable par les départements qui portent la fonction après ce retrait.
- [ ] Dans ses demandes, le demandeur voit le ou les départements portant actuellement la fonction
      destinataire ; avec un seul département, l'affichage est identique à aujourd'hui.
- [ ] La liste des conseillers MSDP inclut les membres de tous les départements MSDP.
- [ ] Aucun écran ni aucun traitement ne dépend d'un choix arbitraire entre plusieurs départements
      d'une même fonction (résultat identique quel que soit l'ordre des départements).
- [ ] Une église dont chaque fonction a au plus un département ne constate aucun changement.

## Hors périmètre

- Créer de nouvelles fonctions ou modifier le rôle d'une fonction existante.
- Permettre à un département de porter plusieurs fonctions.
- Répartir automatiquement les demandes entre équipes (tourniquet, affectation par critère).
- Renommer l'écran ou les URL des espaces liés aux fonctions (voir #554, #555).
- La suppression du rôle Secrétaire (seconde étape de la spec 045).

## Questions ouvertes

Tranchées le 2026-09-12 :

- **Cas réel** : plusieurs départements se partagent le périmètre d'une même fonction.
- **Routage** : file partagée entre tous les départements de la fonction, sans choix du demandeur.
- **Retrait d'un département** : les demandes déjà reçues suivent la fonction.
- **Destinataire affiché au demandeur** : départements portant actuellement la fonction.
