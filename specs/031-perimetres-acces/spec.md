# Spec — Périmètres d'accès : ce que chaque rôle peut réellement voir et modifier

- **Numéro** : 031
- **Statut** : Validée
- **Créée le** : 2026-08-29
- **Branche suggérée** : `feat/perimetres-acces`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia distingue depuis l'origine deux notions : **ce qu'un rôle a le droit de faire**
(une permission) et **sur quel périmètre il a le droit de le faire** (son église, son
ministère, ses départements). La première est appliquée partout. **La seconde ne l'est
presque nulle part.**

Un audit des rôles et accès mené le 2026-08-29 sur le code en production a établi quatre
constats, tous vérifiés :

1. **Le périmètre par département n'est pratiquement jamais appliqué.** Le mécanisme
   existe et fonctionne, mais il n'est utilisé que par une poignée d'écrans et d'accès aux
   données sur l'ensemble de l'application. Conséquence directe : un **responsable de
   département** peut créer et supprimer les tâches et les consignes d'un **autre**
   département de son église — un département dont il n'a pas la charge. Et comme le droit
   de consultation du planning est accordé jusqu'au rôle **STAR**, un STAR peut obtenir la
   composition, les statistiques et le planning mensuel de **n'importe quel** département
   de son église, sans passer par l'interface qui les lui masque.

2. **Une fuite de données entre églises.** L'écran de gestion des accès charge la liste de
   **tous les utilisateurs de la plateforme**, toutes églises confondues — nom, nom
   d'affichage, adresse e-mail, photo — et la transmet au navigateur de la personne
   connectée. Les rôles, eux, sont bien filtrés sur l'église courante, ce qui rend le
   problème invisible à l'écran : les utilisateurs des autres églises apparaissent
   simplement sans rôle. Les données personnelles quittent pourtant le serveur. Koinonia
   est multi-tenant : chaque église doit être hermétique aux autres.

3. **L'écran de gestion des accès et les actions qu'il propose n'obéissent pas au même
   droit.** Le **Ministre** peut ouvrir l'écran — et y voit tous les utilisateurs et tous
   les ministères de l'église — mais toute modification qu'il tente est refusée. À
   l'inverse, le **Secrétaire**, qui a bel et bien le droit de modifier les rôles, **ne
   peut pas ouvrir l'écran**. Deux droits différents gardent une seule et même fonction :
   l'un donne une visibilité indue, l'autre bloque un usage légitime.

4. **Les rôles STAR ont des accès qui ne correspondent plus à l'usage.** Un STAR accède à
   la vue planning par département alors que seule sa vue personnelle le concerne, et il
   peut réserver des salles alors que la réservation doit rester une prérogative des
   responsables.

Le fil commun est unique : **l'interface masque, le serveur n'interdit pas.** Masquer une
entrée de menu ne protège rien — les données restent accessibles à qui sait les demander
directement. Cette spec traite les quatre constats ensemble parce qu'ils ont la même cause
et que les corriger séparément laisserait le problème ouvert.

## Utilisateurs concernés

| Rôle | Ce qui change |
|---|---|
| **STAR** | Perd la vue planning par département : ne conserve que sa vue personnelle, ses événements et ses absences. Perd **tout** accès au module Salles — consultation comprise. Ne peut plus obtenir les données d'un département par un moyen détourné. |
| **Responsable de département** | Cantonné à ses départements (ceux dont il est responsable ou adjoint) : consultation **et** modification. Toute action sur un autre département est refusée. |
| **Ministre** | Cantonné à son ministère dans la gestion des accès : il ne voit et **ne gère** que les personnes et les départements de son ministère, jamais les rôles transverses. Il peut désormais y **attribuer et retirer des rôles** — capacité qu'il n'exerçait pas jusqu'ici. |
| **Secrétaire** | Son accès à l'écran de gestion des accès est aligné sur les droits qu'il exerce déjà : il peut désormais l'ouvrir. |
| **Admin** | Inchangé : périmètre de son église entière. Ne voit plus les utilisateurs des autres églises. |
| **Super Admin** | Inchangé : périmètre plateforme. |
| **Faiseur de Disciples, Reporter, Comptable, Qualificateur agenda** | Inchangés. |

## Comportement attendu

### Scénario principal — un responsable de département reste chez lui

1. Bénédicte est responsable du département *Son*. Elle n'a aucune charge sur le
   département *Accueil*.
2. Elle ouvre l'application : elle voit *Son*, et uniquement *Son*.
3. Elle modifie les tâches et les consignes de *Son* : l'action aboutit.
4. Elle tente d'obtenir ou de modifier les tâches, les consignes, la composition, les
   statistiques ou le planning d'*Accueil* — que ce soit en manipulant l'adresse d'une page
   ou en s'adressant directement au serveur.
5. **Le système refuse**, sans divulguer la moindre information sur *Accueil*.

### Scénario — un STAR ne voit que ce qui le concerne

1. Samuel est STAR, rattaché au département *Choristes*.
2. Il consulte « Mon planning » : il y voit ses propres services, tous départements
   confondus, ainsi que ses événements et ses absences. Ce parcours est **inchangé**.
3. La vue planning par département a disparu de sa navigation.
4. Il tente d'y accéder directement, ou de demander au serveur la composition ou les
   statistiques d'un département : **refus**.
5. La section Salles a disparu de sa navigation ; toute tentative d'y accéder ou de créer
   une réservation est **refusée**.

### Scénario — la gestion des accès obéit à un droit unique

1. Sarah est Secrétaire. Elle ouvre l'écran de gestion des accès : **l'écran s'affiche**,
   et les actions qu'elle y déclenche aboutissent — cohérence rétablie.
2. Marc est Ministre du ministère *Louange*. Il ouvre le même écran : il n'y voit que les
   personnes rattachées à son ministère et les départements de son ministère.
3. Marc nomme un responsable pour le département *Musiciens*, qui relève de son ministère :
   l'action aboutit.
4. Marc ne peut attribuer ni retirer aucun rôle transverse (Admin, Secrétaire, Reporter,
   Comptable…), ni intervenir sur un membre d'un autre ministère : **refus**.
5. Quel que soit le rôle de la personne connectée, **aucun utilisateur d'une autre église
   n'apparaît, et aucune de leurs données ne parvient à son navigateur.**

### Scénarios alternatifs / cas limites

- **Si** une personne cumule plusieurs rôles dans la même église, son périmètre est
  l'**union** des périmètres de ses rôles — jamais l'intersection, jamais le premier
  trouvé.
- **Si** une personne est Admin dans une église et STAR dans une autre, le périmètre
  appliqué est celui de l'**église courante uniquement** : son statut ailleurs ne lui
  ouvre rien ici.
- **Si** un responsable de département est aussi **adjoint** d'un second département, les
  deux départements sont dans son périmètre.
- **Quand** un STAR perd l'accès aux salles, **les réservations qu'il avait déjà créées
  sont conservées** : elles restent visibles, modifiables et annulables par les rôles qui
  gèrent les salles, et l'affichage ne doit pas se dégrader du fait que leur auteur n'a
  plus accès au module.
- **Quand** un Ministre n'a **aucun ministère** assigné, son périmètre de gestion des accès
  est **vide** : l'écran s'affiche sans personne à gérer plutôt que de basculer en accès
  total. Le doute se tranche toujours en faveur de la restriction.
- **Si** une ressource demandée n'existe pas, la réponse ne doit pas permettre de
  distinguer « ce département n'existe pas » de « ce département existe mais n'est pas le
  vôtre » — sans quoi le refus devient un outil d'exploration.
- **Quand** une action est refusée pour cause de périmètre, l'utilisateur doit comprendre
  qu'il s'agit d'une restriction de droits, pas d'une panne.

## Critères d'acceptation

**Périmètre par département**

- [ ] Un responsable de département ne peut **ni consulter ni modifier** les tâches, les
      consignes, la composition, les statistiques ni le planning d'un département hors de
      son périmètre — y compris en s'adressant directement au serveur.
- [ ] Un responsable de département conserve l'intégralité de ses actions actuelles sur
      **ses** départements : aucune régression.
- [ ] Un STAR ne peut obtenir la composition, les consignes, les tâches, les statistiques
      ni le planning mensuel d'**aucun** département — **y compris ceux où il sert**.
- [ ] Un Admin, un Secrétaire et un Super Admin conservent la visibilité sur tous les
      départements de leur église.
- [ ] Chaque point de refus ajouté est couvert par un test automatisé qui vérifie qu'un
      appelant hors périmètre est refusé, de sorte qu'une évolution ultérieure qui
      oublierait le périmètre soit détectée avant la mise en production.

**Étanchéité entre églises**

- [ ] Aucun écran ne transmet au navigateur les données d'un utilisateur qui n'a aucun
      rattachement à l'église courante.
- [ ] Un Admin de l'église A ne peut obtenir ni nom, ni adresse e-mail, ni photo d'un
      utilisateur qui n'appartient qu'à l'église B.

**Gestion des accès**

- [ ] L'affichage de l'écran de gestion des accès et les actions qu'il propose sont
      gouvernés par **un seul et même droit** : quiconque voit l'écran peut y agir, et
      inversement.
- [ ] Un Secrétaire peut ouvrir l'écran de gestion des accès.
- [ ] Un Ministre ne voit et ne gère que les personnes et départements de son ministère.
- [ ] Un Ministre peut attribuer et retirer les rôles non transverses au sein de son
      ministère, et cette capacité est nouvelle.
- [ ] Un Ministre ne peut attribuer ni retirer un rôle transverse à l'église.
- [ ] Un Ministre sans ministère assigné ne gère personne.
- [ ] L'interdiction existante d'attribuer ou de retirer un rôle privilégié sans être
      Super Admin reste en vigueur, à l'identique.

**Rôle STAR**

- [ ] La vue planning par département n'est ni proposée ni accessible à un STAR.
- [ ] « Mon planning », les événements et les absences d'un STAR fonctionnent exactement
      comme avant : aucune régression.
- [ ] La section Salles n'est ni proposée ni accessible à un STAR, en consultation comme
      en réservation.
- [ ] Les réservations créées par des STAR avant ce changement restent visibles et
      gérables par les rôles compétents, sans erreur d'affichage.

**Non-régression générale**

- [ ] L'isolation entre églises déjà en place — l'église de la ressource fait autorité,
      jamais le contexte d'église choisi côté navigateur — est conservée telle quelle.
- [ ] Aucun rôle non cité dans cette spec ne voit ses accès changer.

## Hors périmètre

- **Toute refonte du modèle de rôles** : on corrige l'application des rôles existants, on
  n'en crée pas, on n'en supprime pas, on ne fusionne rien.
- **Les autres issues du dépôt** : récapitulatif WhatsApp des offres (#464), archivage
  automatique des offres (#465), filtre hebdomadaire des salles (#466), emails multiples
  de comptabilité (#468) — sans rapport avec les périmètres d'accès.
- **Un parcours de demande de réservation de salle pour les STAR** : explicitement écarté.
  Le STAR perd l'accès, sans mécanisme de substitution.
- **La séparation des comptes système de déploiement** (constat H-10 de l'audit DevSecOps),
  déjà reportée et documentée par ailleurs.
- **L'épinglage de l'identité SSH des serveurs** (constat M-08), risque formellement
  accepté et documenté.
- **L'harmonisation stylistique des contrôles Super Admin sur les sauvegardes** : le
  contrôle y est correct et complet ; seule sa forme diffère du reste du code. À signaler
  dans le plan, pas à ériger en critère d'acceptation.
- **Les modules Audio, Média, Comptabilité, Agenda, Discipolat, Intégration et Emploi** :
  leurs contrôles d'accès propres ne sont pas revus ici. Seuls les périmètres planning,
  départements, salles et gestion des accès sont concernés.

## Décisions prises

- **Le Ministre peut modifier les rôles au sein de son ministère.** Tranché le 2026-08-29.
  L'écran de gestion des accès et les actions qu'il propose sont alignés sur un droit
  unique ; le Ministre le détient, borné à son ministère. C'est une **extension réelle**
  de ses pouvoirs par rapport au comportement actuel, où toute modification lui était
  refusée : conforme à l'intention de l'issue #467, qui suppose qu'il gère effectivement
  quelque chose. L'anti-escalade vers les rôles privilégiés reste inchangée.

- **Un STAR n'accède à aucune donnée de département, pas même celles où il sert.**
  Tranché le 2026-08-29. Le rattachement d'un STAR à un département relève d'une chaîne
  d'**appartenance** (son profil de membre), distincte de la chaîne de **responsabilité**
  sur laquelle repose le périmètre. Les faire converger imposerait de distinguer un
  périmètre de lecture d'un périmètre d'écriture, changerait la sémantique du périmètre
  pour tous les rôles, et rendrait celui-ci dépendant de l'état de validation du lien
  membre. Hors du cadre de cette spec, qui corrige l'application des rôles existants sans
  refondre le modèle de périmètre. Si le besoin « un STAR consulte son département » se
  confirme, il fera l'objet d'une spec dédiée.

## Questions ouvertes

- Aucune. Les deux points de clarification ont été tranchés ci-dessus ; la spec est prête
  pour le plan.
