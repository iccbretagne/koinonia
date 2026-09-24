# ADR-0015 — Module `care` : suivi et rendez-vous pastoraux, distinct d'`integration` et d'`agenda`

- **Statut** : Proposé
- **Date** : 2026-09-24

## Contexte

Deux flux d'accompagnement spirituel vivent aujourd'hui dans deux modules qui ne se parlent pas :

- le **suivi des nouveaux convertis** (MSDP) est rangé dans `integration`, attaché 1:1 à la
  demande d'accueil qui l'a fait naître. Son accompagnant est un membre du département de
  fonction MSDP (un compte utilisateur) ;
- les **demandes de rendez-vous pastoral** sont rangées dans `agenda`, avec leur qualification
  (permission `agenda:qualify`) et leur affectation à un profil pastoral. `agenda` porte aussi,
  et c'est son métier propre, les profils pastoraux et la planification des créneaux par le
  protocole.

La spec 052 (issue #580) demande de traiter ces deux flux comme **un seul métier** : une même
qualification, un même vivier d'accompagnants (profils pastoraux **et** membres du MSDP), un même
cycle de vie tracé, des règles de confidentialité propres, des passerelles d'une sorte de
demande à l'autre (un rendez-vous qui débouche sur un suivi de nouveau converti).

Ce métier ne tient bien dans aucun des deux modules existants :

- dans `integration`, il resterait accroché à l'accueil et aux familles d'impact, alors que la
  plupart des demandes de rendez-vous n'ont aucun lien avec une demande d'accueil ;
- dans `agenda`, il mêlerait l'accompagnement des personnes à la gestion de calendrier, et
  imposerait aux membres du MSDP, qui n'ont pas d'agenda pastoral, un modèle pensé pour des
  créneaux.

Il est déjà, de fait, à cheval : le formulaire d'accueil crée directement une demande de
rendez-vous d'`agenda` depuis une route d'`integration` quand « soin pastoral » est coché.

Contraintes qui s'appliquent : les modules ne s'importent jamais entre eux
(`.dependency-cruiser.cjs`, ADR-0001) ; chaque module déclare ses permissions et sa surface HTTP
dans son manifeste (ADR-0011, ADR-0012) ; un module peut être absent d'une instance (spec 038,
`registry.has`).

## Décision

On crée un module **`care`** (« Suivi et rendez-vous pastoraux ») dans `src/modules/care` — nom
interne en anglais comme tous les modules (`discipleship`, `rooms`, `jobs`…), libellés affichés
en français —, qui
**possède le cycle de vie des demandes d'accompagnement** :

- les demandes de rendez-vous pastoral (dépôt, qualification, affectation, rejet, issue) ;
- les suivis de nouveaux convertis (naissance, affectation, étapes, clôture) ;
- l'affectation à un accompagnant, qu'il soit profil pastoral ou membre du MSDP, les retours au
  qualificateur, les relances et la confidentialité du contenu des demandes.

Frontières :

- **`agenda` garde** les profils pastoraux et le calendrier : entrées d'agenda, planification par
  le protocole. Il ne qualifie ni n'affecte plus de demandes.
- **`integration` garde** l'accueil et le rattachement aux familles. Il ne porte plus le suivi des
  nouveaux convertis ; il se contente d'**annoncer** qu'une personne a répondu à l'appel au salut
  ou demandé un soin pastoral.

Principes de collaboration :

1. **`care` ne dépend que de `core`** (`dependsOn: ["core"]`), comme `agenda` et `integration`.
   Aucun des trois n'importe les deux autres.
2. **Les réactions passent par les bus d'événements** : `integration` émet (appel au salut reçu,
   soin pastoral demandé) et `care` s'y abonne pour créer la demande correspondante. Si `care`
   est absent de l'instance, l'événement n'a pas d'abonné et rien n'est créé.
3. **Les écrans qui composent plusieurs modules** (planification d'un rendez-vous par le
   protocole, fiche d'accueil qui montre l'état d'un suivi) sont orchestrés par la couche
   `src/app/`, qui importe chaque module par son index — jamais par un module qui en importerait
   un autre.
4. **`care` déclare ses propres permissions.** Le droit de qualifier et d'affecter est une
   permission de `care`, accordée aux mêmes rôles qu'`agenda:qualify` aujourd'hui (Super Admin,
   Admin, et le rôle aujourd'hui nommé Qualificateur agenda, renommé « Référent soins
   pastoraux ») ; `agenda:qualify` disparaît avec la fonction qu'il gardait.
   L'accès des accompagnants et la confidentialité du message se vérifient par des gardes propres
   au module (ADR-0009, ADR-0010), comme `requireIntegrationAccess` pour `integration`.
5. **Les données changent de propriétaire, pas forcément de table.** Les demandes de rendez-vous
   et les suivis de nouveaux convertis deviennent la propriété de `care` : seul `care` les écrit.
   Le lien d'un suivi vers sa demande d'accueil d'origine est conservé comme simple référence.

## Alternatives considérées

- **Laisser le suivi MSDP dans `integration` et y ajouter l'affectation à un profil pastoral** —
  *Écarté* : moins de déplacement aujourd'hui, mais le rendez-vous pastoral resterait dans
  `agenda` ; les passerelles (rendez-vous → suivi), le vivier commun et la confidentialité
  devraient être codés deux fois, de part et d'autre d'une frontière qu'on ne peut franchir que
  par événement.
- **Tout regrouper dans `agenda`** (y faire migrer le suivi MSDP) — *Écarté* : fait d'`agenda` un
  module fourre-tout, mêle calendrier et accompagnement, et plaque un modèle de créneaux sur des
  accompagnants (membres du MSDP) qui n'ont pas d'agenda.
- **Nouveau module qui absorberait aussi les profils pastoraux et le calendrier** — *Écarté* :
  `agenda` sert aussi aux activités pastorales sans rapport avec une demande (saisie directe par
  le protocole) ; le vider de son cœur rendrait `care` obligatoire pour toute église qui veut un
  agenda pastoral.
- **Réutiliser la permission `agenda:qualify` depuis `care`** — *Écarté* : une permission
  appartient au module qui la déclare ; `care` dépendrait de la présence d'`agenda` pour garder
  sa propre fonction centrale.

## Conséquences

- **Positif** : un seul endroit pour le métier de l'accompagnement — qualification, vivier,
  cycle de vie, confidentialité, relances — sans duplication entre deux modules. `integration`
  et `agenda` redeviennent centrés sur l'accueil et sur le calendrier.
- **Positif** : le couplage actuel (une route d'`integration` qui écrit directement une demande
  d'`agenda`) est remplacé par un événement, conformément à ADR-0001.
- **Négatif / contrainte** : **déplacement de code, de routes et de pages** depuis `integration`
  et `agenda` vers `care`, avec mise à jour des manifestes (ADR-0012). Les adresses connues du
  public — en particulier le formulaire public de demande de rendez-vous, dont le lien a pu être
  diffusé (QR codes, messages) — doivent **continuer de fonctionner** (même adresse ou
  redirection permanente).
- **Négatif / contrainte** : **les droits et le rôle changent de nom**. `agenda:qualify` devient
  une permission de `care` ; le rôle « Qualificateur agenda » (`AGENDA_QUALIFIER`), dont le
  périmètre n'a plus rien d'un agenda, devient **« Référent soins pastoraux »**
  (`PASTORAL_CARE_REFERENT`), dans la même feature — libellé affiché et nom interne, ce dernier
  par migration du rôle stocké en base. Matrice figée de `permissions.test.ts`, tableau de
  `CLAUDE.md`, `docs/auth.md` et guide intégré à mettre à jour dans le même commit.
- **Négatif / contrainte** : **une instance sans `care`** n'a plus de demandes de rendez-vous
  pastoral ni de suivis de nouveaux convertis. Le formulaire d'accueil ne doit alors plus proposer
  « soin pastoral » ; l'appel au salut reste enregistré sur la demande d'accueil, sans suivi.
  L'agenda pastoral reste utilisable pour la saisie directe.
- **Contrainte** : la création d'une demande en réaction à un événement ne doit pas faire échouer
  la soumission du formulaire d'accueil ; la stratégie (même transaction ou non, reprise en cas
  d'échec) est à trancher dans le plan de la spec 052.

## Références

- `specs/052-suivi-rendez-vous-pastoraux/spec.md` (issue #580)
- ADR-0001 (modules en monolithe, communication par événements), ADR-0009 et ADR-0010 (gardes
  propres au module), ADR-0011 et ADR-0012 (manifeste, surface HTTP)
- Spec 038 (modules activables par instance)
