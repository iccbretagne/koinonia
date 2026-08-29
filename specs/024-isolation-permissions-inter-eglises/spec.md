# Spec — Isolation inter-églises des contrôles de permission

- **Numéro** : 024
- **Statut** : Implémentée
- **Créée le** : 2026-08-29
- **Branche suggérée** : `fix/isolation-permissions-inter-eglises`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia est multi-tenant : une même personne peut servir dans plusieurs églises, avec un
rôle **différent** dans chacune. Elle peut être Admin de l'église A et simple STAR de
l'église B.

Aujourd'hui, deux décisions distinctes sont prises séparément lors d'une action :

1. **« A-t-il le droit ? »** — évaluée en agrégeant les droits détenus dans **toutes** les
   églises de la personne, sans tenir compte de celle sur laquelle l'action porte.
2. **« Sur quelle église ? »** — déterminée ensuite, à partir du sélecteur d'église courante,
   dont la valeur est fournie par le navigateur et n'est validée que par la présence d'un
   rôle **quelconque** dans l'église demandée.

Ces deux décisions ne sont jamais rapprochées. Une personne Admin de A et simple STAR de B
peut donc désigner B comme église courante : le contrôle de droits est satisfait par son
rôle dans A, tandis que la lecture ou l'écriture s'applique à B. Elle agit ainsi dans B avec
des droits qu'elle n'y possède pas.

Le problème n'est pas une route mal écrite mais un **contrat qui autorise cette erreur** :
le contrôle de droits accepte de ne pas savoir sur quelle église il statue. L'écart mesuré
dans le code confirme que ce n'est pas un cas isolé — la grande majorité des contrôles est
effectuée sans préciser l'église concernée, et de nombreux endroits enchaînent ensuite la
résolution de l'église courante. Les modules touchés couvrent l'audio, la comptabilité,
l'accueil, l'emploi, les réservations de salles, la gestion des églises et le journal
d'audit.

Aucun test ne démontre aujourd'hui l'isolation entre deux églises : le défaut peut donc
réapparaître silencieusement après correction.

**Pourquoi maintenant** : le constat est classé au plus haut niveau de gravité de l'audit
du 2026-08-29, et c'est le seul dont un chemin d'exploitation concret a été établi. Il
concerne la confidentialité des données d'églises tierces, qui sont des organisations
distinctes et juridiquement indépendantes.

## Utilisateurs concernés

| Rôle | Impact attendu |
|---|---|
| **Super Admin** | Aucun changement : conserve son accès global à toutes les églises. |
| **Admin, Secrétaire, Ministre, Resp. département** | Aucun changement **dans leur propre église**. Perdent la capacité — non voulue — d'exercer ces droits dans une autre église où ils ont un rôle moindre. |
| **STAR, Faiseur de Disciples, Reporter** | Aucun changement dans leur église. Protégés en tant que **victimes** : leurs données cessent d'être exposées à un responsable d'une autre église. |
| **Personne multi-églises** (quel que soit le rôle) | Seul profil dont le comportement change réellement : ses droits sont désormais évalués église par église. |

Le bénéficiaire principal n'est pas l'utilisateur qui agit, mais **l'église tierce** dont
les données cessent d'être accessibles.

## Comportement attendu

### Scénario principal

1. Marie est Admin de l'église A et simple STAR de l'église B.
2. Marie bascule son contexte de travail sur l'église B.
3. Marie tente une action réservée aux Admin (par exemple modifier un paramètre de l'église).
4. Le système évalue ses droits **dans l'église B uniquement**, où elle n'est que STAR.
5. L'action est **refusée**, avec le même message d'accès refusé que pour toute personne
   sans le droit requis — sans révéler qu'elle possède ce droit ailleurs.
6. Marie rebascule sur l'église A et refait la même action : elle **réussit**.

### Scénarios alternatifs / cas limites

- **Si** la personne n'a qu'une seule église, son expérience est strictement inchangée.
- **Si** la personne est Super Admin, elle conserve l'accès à toutes les églises.
- **Si** le contexte d'église transmis par le navigateur désigne une église où la personne
  n'a **aucun** rattachement, le système ignore cette valeur et n'agit jamais sur cette
  église — ni en lecture, ni en écriture.
- **Si** le contexte d'église est absent, invalide ou corrompu, le système applique un
  contexte par défaut légitime pour cette personne, ou refuse l'action ; il ne devine
  jamais une église sur laquelle la personne n'a pas de droits.
- **Quand** une action porte sur un objet précis (un document, un événement, un membre),
  l'église de rattachement de cet objet fait autorité : le contrôle porte sur **l'église de
  l'objet**, jamais sur le contexte affiché, afin qu'un contexte manipulé ne puisse pas
  déplacer l'action vers une autre église.
- **Quand** une action est légitimement globale (administration de la plateforme,
  supervision), elle reste possible, mais sa portée globale doit être **explicite et
  assumée**, pas la conséquence d'une église non précisée.
- **Si** un profil pastoral supervise une église sans y détenir de rôle, il conserve sa
  **vue en lecture seule** sur le périmètre de supervision prévu, et **rien de plus** :
  aucune action de modification ne lui est ouverte sur une église supervisée.
- **Si** ce même profil pastoral détient par ailleurs un rôle privilégié dans une **autre**
  église, ce rôle ne lui confère **aucun droit d'écriture** sur l'église supervisée. C'est
  aujourd'hui le cas le plus exposé : la supervision est correctement restreinte à la
  lecture là où l'église est explicitement désignée, mais cette restriction est entièrement
  contournée par le chemin décrit dans « Contexte & problème ».

## Critères d'acceptation

- [ ] Une personne ayant un rôle privilégié dans l'église A et un rôle moindre dans
      l'église B **ne peut effectuer aucune action** dans B qui excède ses droits dans B,
      quel que soit le contexte d'église qu'elle transmet.
- [ ] Cela vaut aussi bien en **lecture** qu'en **écriture** : elle ne peut pas non plus
      consulter dans B des données réservées aux rôles qu'elle n'y détient pas.
- [ ] Un refus d'accès est **indiscernable** du refus opposé à une personne ne détenant ce
      droit dans aucune église (pas de fuite d'information sur les rattachements).
- [ ] Aucun contrôle d'autorisation ne peut être écrit sans que l'église sur laquelle il
      statue soit déterminée : un contrôle omettant cette information est **rejeté ou
      impossible à exprimer**, et non silencieusement traité comme « toutes les églises ».
- [ ] Les portées volontairement globales sont **énumérables** : on peut lister les endroits
      qui autorisent une décision sans église, et chacun est justifié.
- [ ] Un contexte d'église fourni par le navigateur et désignant une église sans
      rattachement est **sans effet** : il ne devient jamais le périmètre de l'action.
- [ ] Pour toute action portant sur un objet identifié, l'église retenue est celle de
      l'objet ; un contexte affiché divergent ne modifie pas la cible de l'action.
- [ ] Un profil pastoral ne peut effectuer **aucune écriture** sur une église qu'il
      supervise sans y détenir de rôle, y compris lorsqu'il détient un rôle privilégié dans
      une autre église.
- [ ] La restriction de la supervision à la consultation est appliquée **uniformément**,
      quel que soit le chemin d'accès emprunté.
- [ ] Les actions transverses (lister les églises, consulter le journal d'audit, créer une
      église) sont **réservées au Super Admin**.
- [ ] Dans un contexte d'église donné, les actions non autorisées **ne sont pas proposées**
      à l'utilisateur ; un accès direct à ces actions reste malgré tout **refusé côté
      serveur**, le masquage n'étant jamais l'unique protection.
- [ ] Une personne mono-église ne constate **aucun changement** de comportement.
- [ ] Le Super Admin conserve son accès global.
- [ ] Des tests automatisés couvrent explicitement le scénario **deux églises, deux rôles
      différents**, pour la lecture comme pour l'écriture, et échouent si le défaut
      réapparaît.
- [ ] Les modules identifiés comme touchés (audio, comptabilité, accueil, emploi,
      réservations de salles, gestion des églises, journal d'audit) sont tous couverts.

## Hors périmètre

- Les autres constats de l'audit : accès direct à un objet par identifiant deviné,
  partage du cookie de session entre sous-domaines, bornes d'envoi de fichiers,
  chaîne de déploiement. Ils font l'objet de corrections distinctes.
- La refonte du modèle de rôles et de permissions lui-même : le tableau des droits par
  rôle reste inchangé.
- L'ergonomie du sélecteur d'église (son apparence, sa position, la mémorisation du choix).
- L'ajout de nouveaux rôles ou de nouvelles permissions.
- La journalisation ou la détection des tentatives d'accès inter-églises.
- La correction des tests existants qui ne concernent pas l'isolation multi-tenant.

## Décisions prises

- **Profils pastoraux — lecture seule stricte.** La supervision d'une église ne confère
  jamais de droit de modification. Cette intention est **déjà celle du code** là où
  l'église est explicitement désignée : la supervision n'y ouvre qu'un ensemble restreint
  et énuméré de consultations. La correction consiste donc à rendre cette règle
  **inévitable**, et non à l'inventer. Aucun modèle de droits nouveau n'est nécessaire.

- **Actions transverses — réservées au Super Admin.** Toute action légitimement sans église
  cible relève du Super Admin, déjà porteur d'un accès global. La liste des portées
  globales autorisées reste ainsi courte, énumérable et auditable ; aucun autre rôle
  n'obtient de portée hors église.

- **Expérience utilisateur — actions masquées.** Dans un contexte d'église donné, les
  actions que la personne n'y est pas autorisée à effectuer ne lui sont pas proposées,
  plutôt que d'être proposées puis refusées. Le masquage est un confort d'interface, jamais
  une protection : le refus côté serveur reste appliqué indépendamment, y compris pour un
  accès direct.

## Questions ouvertes

*Aucune. Les trois points en suspens ont été tranchés ci-dessus ; la spec est prête pour `/plan`.*
