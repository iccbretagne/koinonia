# Spec — Téléchargement de toutes les photos (même non validées) dans une collection

- **Numéro** : 001
- **Statut** : Implémentée
- **Créée le** : 2026-07-03
- **Branche suggérée** : `feat/collection-toutes-photos`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

Une **collection** est un lien de partage public (sans authentification) qui regroupe des
contenus média provenant de plusieurs événements et/ou projets, pour qu'un destinataire externe
(prestataire, responsable, partenaire) puisse les consulter et les télécharger — photo par photo
ou en une archive ZIP.

Aujourd'hui, une collection n'expose **que les photos validées**. Les photos en attente de
validation ne sont jamais accessibles via une collection. Or il existe des situations où l'on veut
partager **l'ensemble des photos**, indépendamment de leur statut de validation :

- confier le lot brut complet à un photographe ou à un prestataire pour tri/retouche externe ;
- archiver ou transmettre l'intégralité des prises de vue d'un événement ;
- partager rapidement quand le circuit de validation interne n'est pas nécessaire.

À noter : cette capacité « tout télécharger » existe déjà pour le partage d'un **événement unique**
(un type de lien dédié permet de télécharger toutes les photos, validées ou non). Les **collections
multi-sources** ne l'offrent pas encore. Cette spec vise à combler cet écart.

## Utilisateurs concernés

- **Créateur de la collection** (rôles disposant de la gestion média : Super Admin, Admin, et
  membres du département Production Média habilités). C'est lui qui décide, à la création, du
  périmètre des photos incluses.
- **Destinataire du lien** (externe, non authentifié) : consulte et télécharge ce que le créateur
  a choisi d'inclure. Il n'a aucun contrôle sur le périmètre.

## Comportement attendu

### Scénario principal

1. Un créateur habilité ouvre l'outil de création de collection.
2. Il sélectionne les événements (et/ou projets) à inclure et un intitulé.
3. Il choisit le **périmètre des photos** via une **option binaire** : *« photos validées
   uniquement »* (comportement actuel, par défaut) **ou** *« toutes les photos »*. L'option
   *« toutes les photos »* inclut **l'intégralité** des photos des sources, quel que soit leur
   statut (validées, en attente, pré-validées et rejetées) — mêmes semantics que le lien
   « toutes photos » déjà proposé pour un événement unique.
4. Il génère le lien de collection.
5. Le destinataire ouvre le lien : la collection affiche les photos correspondant au périmètre
   choisi, **sans aucune mention de leur statut de validation**, et le téléchargement (individuel
   comme ZIP) porte exactement sur ce même périmètre.

### Scénarios alternatifs / cas limites

- **Périmètre par défaut** : si le créateur ne change rien, la collection reste sur *« photos
  validées uniquement »* — le comportement historique est préservé.
- **Collection « toutes les photos » sur un lot mixte** : la collection expose l'intégralité des
  photos (validées, en attente, pré-validées, rejetées) dans une seule vue et une seule archive,
  sans distinction visible.
- **Aucune photo validée mais des photos en attente** : une collection *« validées uniquement »*
  apparaît vide côté photos ; une collection *« toutes les photos »* les expose.
- **Chaque collection est indépendante** : le périmètre est figé à la création et propre à ce lien.
  Créer un autre lien avec un autre périmètre reste possible.
- **Le périmètre ne modifie jamais le statut des photos** : inclure une photo non validée dans une
  collection ne la valide pas et ne change rien à son statut.

## Critères d'acceptation

- [ ] À la création d'une collection, le créateur peut choisir entre « photos validées uniquement »
      et « toutes les photos ».
- [ ] Par défaut (choix non modifié), une collection n'expose que les photos validées — identique à
      aujourd'hui.
- [ ] Une collection créée en mode « toutes les photos » affiche **l'intégralité** des photos de ses
      sources, quel que soit leur statut (validées, en attente, pré-validées, rejetées).
- [ ] La vue publique ne fait apparaître **aucune** mention du statut de validation des photos.
- [ ] Le téléchargement ZIP d'une telle collection contient exactement les photos affichées (même
      périmètre).
- [ ] Le téléchargement individuel d'une photo non validée est autorisé si — et seulement si — la
      collection est en mode « toutes les photos ».
- [ ] Une collection en mode « validées uniquement » refuse toujours l'accès aux photos non validées
      (aucune régression).
- [ ] Le périmètre ne s'applique **qu'aux photos** : les visuels/fichiers d'une collection conservent
      leur comportement actuel (approuvés uniquement), quel que soit le choix.
- [ ] Le choix du périmètre est journalisé à la création de la collection (traçabilité de qui a
      partagé quoi).

## Hors périmètre

- Le comportement du partage d'un **événement unique** (lien « toutes photos » existant) n'est pas
  modifié.
- Le **workflow de validation** des photos (validation, rejet, pré-validation) n'est pas modifié.
- Aucune modification du contrôle d'accès à la **création** de collections (mêmes rôles habilités
  qu'aujourd'hui).
- La modification du périmètre d'une collection **après** sa création n'est pas prévue (une
  collection existante garde son périmètre ; on en recrée une au besoin).
- Les **visuels/fichiers** d'une collection ne sont pas concernés : ils restent limités aux éléments
  approuvés, quel que soit le périmètre choisi pour les photos.
- Aucune **mention de statut** (badge « non validée », etc.) n'est affichée au destinataire.

## Décisions arrêtées

- **Option binaire** : « photos validées uniquement » (défaut, comportement actuel) **ou** « toutes
  les photos ». On ne change jamais le périmètre d'une photo ; on choisit seulement l'un des deux
  ensembles à partager.
- **« Toutes les photos » = intégralité**, y compris les photos rejetées — mêmes semantics que le
  lien « toutes photos » existant pour un événement unique.
- **Photos uniquement** : le choix n'affecte pas les visuels/fichiers.
- **Aucune distinction de statut** dans la vue publique du destinataire.
