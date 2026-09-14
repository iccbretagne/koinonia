# Spec — Absence ciblée par département et par événement

- **Numéro** : 050
- **Statut** : Implémentée
- **Créée le** : 2026-09-14
- **Branche suggérée** : `feat/absence-ciblee`
- **Issue** : #557

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Aujourd'hui (specs 007, 012, 013), une absence est **globale** : un STAR déclare qu'il est absent
du jour J1 au jour J2, et cette absence s'applique à **tous** ses départements. Concrètement :

- un badge « absent » apparaît sur sa ligne dans la grille de planning de **chacun** de ses
  départements, pour tous les événements de la période ;
- une alerte de conflit est levée s'il est déjà planifié en service dans **n'importe lequel**
  de ses départements sur la période ;
- **tous** ses responsables (Resp. département et Ministres de chacun de ses départements) sont
  notifiés.

Or l'absence réelle est souvent **partielle** :

- **par département** — un STAR servant à l'Accueil et à la Louange peut assurer l'Accueil
  mais pas la Louange sur le même culte (répétition manquée, voix fatiguée…) ;
- **par événement** — il n'est absent que deux dimanches précis, pas sur toute la
  période qui les sépare.

Faute de mieux, le STAR déclare soit une absence globale (qui le retire à tort de ses autres
départements et alerte des responsables non concernés), soit rien du tout et prévient par
message — ce qui recrée exactement l'organisation éclatée que Koinonia veut remplacer.

## Utilisateurs concernés

- **STAR** : déclare, modifie et annule ses propres absences, globales ou ciblées.
- **Resp. département** : déclare une absence pour un STAR de son périmètre (comme
  aujourd'hui) ; voit les absences qui touchent **ses** départements.
- **Ministre** : même chose, sur les départements de son ministère.
- **Admin / Secrétaire / Super Admin** : vue transverse de toutes les absences de
  l'église, globales et ciblées (comme aujourd'hui).
- Faiseur de Disciples, Reporter, Qualificateur agenda, Comptable : non concernés (aucun accès
  aux absences aujourd'hui, inchangé).

## Terminologie

- **Absence** : ce qu'un STAR (ou un responsable pour lui) **déclare** — globale ou ciblée. C'est
  le seul terme employé côté utilisateur pour une déclaration.
- **Absence ciblée** : absence restreinte à certains départements et/ou à des événements précis.
- **Indisponible** : reste exclusivement le **statut de service** posé par un responsable dans le
  planning. Une absence ne le pose jamais automatiquement (voir « Statuts de service ») ; employer
  « indisponibilité » pour une déclaration entretiendrait la confusion entre les deux.

## Comportement attendu

Une déclaration d'absence porte désormais sur deux dimensions, chacune pouvant être
**totale** ou **ciblée** :

| | Tous mes départements | Certains départements |
|---|---|---|
| **Période** (du … au …) | absence globale — comportement actuel | ex. « pas de Louange tout le mois d'août » |
| **Événements précis** | ex. « absent les dimanches 6 et 20 » | ex. « pas de Louange le dimanche 6 » |

La déclaration globale existante reste le cas par défaut (aucune case à cocher en plus pour qui
veut simplement déclarer une période) ; le ciblage est une précision optionnelle.

### Scénario principal — absence ciblée sur un département et un événement

1. Paul sert à l'Accueil et à la Louange. Il ouvre la déclaration d'absence.
2. Il choisit **« Des événements précis »** : la liste des prochains événements où **au moins
   un de ses départements est attendu** s'affiche, et il coche le culte du dimanche 6.
3. Il choisit **« Certains départements »** et coche **Louange** uniquement. Seuls ses propres
   départements sont proposés.
4. Il peut, comme aujourd'hui, indiquer un motif et désigner des backups.
5. Il valide. La déclaration apparaît dans « Mes absences » avec son ciblage lisible :
   « Louange — culte du dimanche 6 ».
6. Dans la grille de planning **Louange** du culte du 6, Paul porte le badge d'absence.
   Dans la grille **Accueil** du même culte, **aucun badge** : il reste planifiable normalement.
7. Seuls les responsables de **Louange** sont notifiés. Les responsables de l'Accueil ne le sont
   pas.

### Scénario — plusieurs événements, tous départements

1. Marie déclare une absence sur **les dimanches 6 et 20**, pour **tous ses
   départements**.
2. Le badge apparaît dans toutes ses grilles pour ces deux événements seulement — pas pour le
   culte du 13, ni pour un événement du mercredi 9 situé entre les deux.

### Scénario — période ciblée sur un département

1. Jean déclare une absence **du 1er au 31 août**, pour **Louange** uniquement.
2. Tous les événements d'août où Louange est attendu montrent le badge sur sa ligne Louange ;
   ses autres départements ne sont pas affectés.

### Scénarios alternatifs / cas limites

- **Conflit ciblé** : si le STAR est déjà planifié en service dans un département **et** sur un
  événement couverts par la déclaration, l'alerte de conflit existante est levée — mais
  uniquement pour ces couples département/événement. Être planifié à l'Accueil le 6 ne crée pas
  de conflit avec une absence Louange du 6.
- **Événement déplacé** : si un événement ciblé change de date après la déclaration,
  l'absence **suit l'événement** (elle vise ce culte-là, pas une date).
- **Événement supprimé** : l'absence ciblée sur cet événement ne s'applique plus à rien.
  Si c'était son seul événement, la déclaration **reste visible dans l'historique**, marquée
  « événement supprimé », sans aucun effet sur le planning.
- **Département quitté** : si le STAR quitte un département visé, l'absence ne
  s'applique plus à ce département ; elle continue de s'appliquer aux autres départements visés.
- **Département ajouté après coup** : une absence « tous mes départements » s'applique
  aussi à un département rejoint après la déclaration (comme aujourd'hui). Une absence
  ciblée ne s'étend jamais à un département qui n'était pas coché.
- **Département non attendu** : on ne peut cibler un événement que si au moins un des
  départements visés y est attendu. Si un département visé n'est pas attendu sur un événement
  visé, cette combinaison est simplement sans effet (pas d'erreur).
- **Déclaration par un responsable** : un Resp. département ou un Ministre qui déclare pour un
  STAR de son périmètre **conserve le comportement actuel** : il peut déclarer une absence
  « tous départements », qui s'applique aussi aux départements du STAR hors de son périmètre.
  S'il choisit de cibler des départements, seuls ceux **de son périmètre** lui sont proposés.
- **Chevauchement** : un STAR peut avoir une absence globale et une absence ciblée qui se
  recouvrent. Aucune fusion n'est faite ; le badge s'affiche une seule fois sur une ligne donnée.
- **Modification** : on peut modifier le ciblage (ajouter/retirer un département ou un
  événement) d'une déclaration active, avec les mêmes règles que la modification d'une absence
  aujourd'hui. Les responsables nouvellement concernés sont notifiés.
- **Annulation** : inchangée — une déclaration annulée ne s'applique plus nulle part.
- **Mobile** : la sélection d'événements et de départements reste utilisable au doigt sur un
  écran de téléphone.

## Visibilité

- Le **STAR** voit toutes ses déclarations, avec leur ciblage.
- Un **Resp. département / Ministre** voit, dans la liste des absences, les déclarations qui
  touchent **au moins un de ses départements**. Pour une déclaration multi-départements, il voit
  **tous les départements visés**, y compris hors de son périmètre (« Louange + Accueil ») — ce qui
  lui permet de se coordonner avec les autres équipes.
- Une absence **ciblée hors de ses départements** n'apparaît pas pour ce responsable —
  même si le STAR est aussi membre de l'un de ses départements. C'est une différence avec
  aujourd'hui, où toute absence d'un membre de son département lui est visible.
- **Admin / Secrétaire / Super Admin** : tout, comme aujourd'hui.
- Les filtres existants de la liste (ministère, département, rôle du déclarant) tiennent compte
  du ciblage : filtrer sur « Accueil » ne remonte pas une absence ciblée Louange.

## Statuts de service

Une absence, globale ou ciblée, **ne modifie pas automatiquement** le statut de service
dans le planning — comme aujourd'hui : c'est un signal (badge + alerte de conflit) pour le
responsable, qui reste maître du planning et choisit de passer le STAR `INDISPONIBLE`, de le
remplacer (`REMPLACANT`) ou de le laisser en service. Cela vaut aussi pour une absence
ciblée sur un événement précis.

## Rétrocompatibilité

- Toutes les absences déjà saisies deviennent des déclarations **« période + tous mes
  départements »**, avec un comportement strictement identique à aujourd'hui (badge, conflits,
  visibilité, backups, historique).
- Aucune action n'est demandée aux utilisateurs.
- L'export des absences continue de fonctionner et indique le ciblage (« Tous » par défaut).

## Critères d'acceptation

- [x] Un STAR peut déclarer une absence sur une **période** pour **tous** ses
      départements, exactement comme aujourd'hui, sans étape supplémentaire.
- [x] Un STAR peut restreindre une déclaration à **un ou plusieurs de ses départements**.
- [x] Un STAR peut déclarer une absence sur **un ou plusieurs événements précis** au lieu
      d'une période, choisis parmi les événements où au moins un de ses départements est attendu.
- [x] Les deux ciblages se combinent (départements précis × événements précis).
- [x] Le badge d'absence n'apparaît dans une grille de planning que pour les couples
      département/événement couverts par la déclaration.
- [x] Un événement situé entre deux événements ciblés n'est pas affecté.
- [x] L'alerte de conflit ne se déclenche que si le STAR est planifié en service sur un couple
      département/événement couvert.
- [x] Seuls les responsables des départements couverts sont notifiés à la déclaration, à la
      modification et à l'annulation.
- [x] Un Resp. département / Ministre ne voit pas une absence ciblée uniquement sur des
      départements hors de son périmètre.
- [x] Un Resp. département / Ministre qui déclare pour un STAR peut toujours déclarer « tous
      départements » ; s'il cible, seuls les départements de son périmètre lui sont proposés.
- [x] Un Resp. département / Ministre voit tous les départements visés par une déclaration qui
      touche au moins un des siens.
- [x] Une absence (globale ou ciblée) ne modifie jamais automatiquement un statut de
      service.
- [x] Une déclaration dont le seul événement visé est supprimé reste dans l'historique, marquée
      « événement supprimé », sans effet.
- [x] Une absence ciblée sur un événement suit cet événement s'il change de date.
- [x] Les absences existantes se comportent strictement comme avant (tous départements, période).
- [x] Les filtres ministère/département de la liste des absences tiennent compte du ciblage.
- [x] L'export des absences indique le ciblage.
- [x] Motif, backups, modification et annulation fonctionnent pour les déclarations ciblées.
- [ ] La déclaration ciblée est utilisable sur mobile. *(revue de code : cibles tactiles ≥44px,
      listes à défilement interne, cohérent avec le reste de l'app ; non vérifié sur un appareil
      réel — à confirmer manuellement en recette)*
- [x] Aucune fuite entre églises : les événements et départements proposés sont ceux de l'église
      de la déclaration.

## Hors périmètre

- Disponibilité **positive** (« je suis disponible uniquement tel jour ») ou préférences de
  service récurrentes (« jamais le premier dimanche du mois »).
- Absence sur une **tâche/affectation** précise à l'intérieur d'un département.
- Absence sur les **événements d'équipe** (répétitions, réunions — spec 044).
- Planification automatique d'un remplaçant.
- Changement des rôles ou permissions : aucune nouvelle permission, `absences:view` /
  `absences:manage` inchangés.
- Refonte visuelle de la page des absences au-delà de l'affichage du ciblage.

## Questions ouvertes

Tranchées le 2026-09-14 :

- Déclaration par un responsable : comportement global actuel **conservé** ; le ciblage de
  départements est limité à son périmètre.
- Visibilité d'une déclaration multi-départements : le responsable voit **tous** les départements
  visés.
- Statut de service : **aucun passage automatique** en `INDISPONIBLE`, y compris sur événement
  précis — l'absence reste un signal.
- Événement ciblé supprimé : la déclaration **reste en historique**, marquée « événement
  supprimé ».
