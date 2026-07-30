# Spec — Backup pour un tiers et gestion des absences par le Secrétariat

- **Numéro** : 014
- **Statut** : En revue
- **Créée le** : 2026-07-30
- **Branche suggérée** : `feat/backup-tiers-secretariat`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La spec [[013-evolutions-absences]] a introduit la désignation de backup, mais uniquement pour
un Resp. département ou un Ministre déclarant **sa propre** absence. Dans l'usage réel, c'est
souvent le Secrétariat (ou un Admin) qui déclare l'absence d'un responsable en son nom — et il n'a
alors aucun moyen de désigner un backup pour cette absence, alors que le besoin (continuité des
responsabilités pendant l'absence) est identique.

Par ailleurs, le rôle Secrétaire n'a aujourd'hui que `absences:view` (lecture) : il voit la vue
transverse mais ne peut ni déclarer, ni modifier, ni annuler une absence pour un tiers — l'option
« Déclarer pour un STAR » ne lui est pas proposée. Une remontée terrain confirme ce blocage pour
un utilisateur ayant à la fois le rôle Secrétaire et le rôle Resp. département (Secrétariat,
Modération) : il ne peut déclarer que pour les STAR de son périmètre de Resp. département, pas
pour l'ensemble de l'église comme le permet sa vision Secrétaire par ailleurs (cohérent avec les
autres fonctionnalités où le Secrétariat a une portée église entière — événements, comptes rendus,
discipolat).

Cette spec couvre deux évolutions liées :
1. Étendre la désignation de backup aux absences déclarées pour un tiers, quand ce tiers est
   lui-même Resp. département ou Ministre.
2. Donner au rôle Secrétaire la capacité de déclarer/modifier/annuler une absence pour un tiers
   (comme Admin et Super Admin), à l'échelle de toute l'église.

## Utilisateurs concernés

- **Secrétaire** : peut désormais déclarer, modifier et annuler une absence pour n'importe quel
  STAR de l'église (comme Admin/Super Admin) — plus seulement consulter la vue transverse.
- **Super Admin, Admin, Ministre, Resp. département** : quand l'un d'eux déclare ou modifie
  l'absence d'un tiers, et que ce tiers est lui-même Resp. département ou Ministre, il peut
  désormais désigner un ou plusieurs backups pour cette absence — exactement comme si le tiers
  l'avait déclarée lui-même.
- **STAR (sans rôle Resp. département/Ministre)** : aucun changement — jamais de backup sur son
  absence, qu'elle soit auto-déclarée ou déclarée par un tiers.

## Comportement attendu

### 1. Backup sur une absence déclarée pour un tiers

#### Scénario principal

1. Un Super Admin, Admin, Ministre, Resp. département ou Secrétaire déclare (ou modifie) une
   absence pour un STAR de son périmètre de gestion.
2. Si ce STAR est lui-même Resp. département ou Ministre (a un compte lié avec ce rôle), l'option
   de désigner un ou plusieurs backups est proposée — avec le même choix que si **ce STAR**
   déclarait sa propre absence : STAR de son département (ou de son ministère s'il est Ministre),
   son Ministre ou un pair Resp. département du même ministère (ou un autre Ministre de l'église
   s'il est Ministre lui-même).
3. Les backups désignés sont notifiés, comme lors d'une auto-déclaration.

#### Cas limites

- **Si** le STAR pour lequel l'absence est déclarée n'a ni rôle Resp. département ni Ministre,
  **alors** l'option de désigner un backup n'est pas proposée — comportement inchangé.
- **Si** le STAR pour lequel l'absence est déclarée a un rôle Resp. département ou Ministre mais
  **aucun compte utilisateur lié** à sa fiche, **alors** l'option de désigner un backup n'est pas
  proposée (le périmètre de backup ne peut pas être déterminé sans compte lié à un rôle).
- **Si** le STAR a plusieurs rôles (ex. Resp. département **et** Ministre), **alors** le choix de
  backups proposé cumule les deux périmètres, exactement comme pour une auto-déclaration par cette
  même personne.
- Le périmètre de backup proposé est **celui de la personne absente**, jamais celui du déclarant —
  un Secrétaire (portée église entière) déclarant pour un Resp. département ne voit que le
  périmètre de ce Resp. département pour le choix des backups, pas toute l'église.
- Cette règle s'applique symétriquement à la modification d'une absence déjà existante déclarée
  pour un tiers.

### 2. Le Secrétariat peut gérer les absences de tout STAR

#### Scénario principal

1. Un utilisateur avec le rôle Secrétaire ouvre le module Absences.
2. Il voit, en plus de la vue transverse déjà existante, la possibilité de déclarer une absence
   pour n'importe quel STAR de l'église (pas seulement d'un département dont il serait par
   ailleurs responsable).
3. Il peut également modifier ou annuler une absence existante de n'importe quel STAR, tant
   qu'elle n'est pas passée (édition) ou active (annulation) — sans restriction de périmètre.

#### Cas limites

- **Si** l'utilisateur cumule le rôle Secrétaire avec un rôle Resp. département/Ministre,
  **alors** sa portée de gestion des absences devient celle, plus large, du Secrétaire (toute
  l'église) — cohérent avec le principe déjà appliqué aux autres fonctionnalités du Secrétariat
  (événements, comptes rendus, discipolat).
- La consultation de la vue transverse par le Secrétaire reste inchangée (déjà à l'échelle de
  l'église).
- Le Secrétaire ne peut désigner un backup que dans les conditions décrites en section 1 (STAR
  cible lui-même Resp. département/Ministre) — jamais sur l'absence d'un STAR simple.

## Critères d'acceptation

- [ ] Le rôle Secrétaire peut déclarer une absence pour n'importe quel STAR de l'église.
- [ ] Le rôle Secrétaire peut modifier une absence non passée de n'importe quel STAR de l'église.
- [ ] Le rôle Secrétaire peut annuler une absence active de n'importe quel STAR de l'église.
- [ ] Quand un Super Admin, Admin, Ministre, Resp. département ou Secrétaire déclare une absence
      pour un STAR qui est lui-même Resp. département ou Ministre (avec compte lié), l'option de
      désigner un backup est proposée.
- [ ] Le choix de backups proposé dans ce cas respecte le périmètre de la **personne absente**
      (son département/ministère), pas celui du déclarant.
- [ ] Quand le STAR cible n'a ni rôle Resp. département ni Ministre, ou n'a pas de compte lié,
      l'option de backup n'est pas proposée.
- [ ] La même règle de périmètre (celui de la personne absente) s'applique à la modification d'une
      absence déclarée pour un tiers.
- [ ] Les backups désignés dans ce contexte sont notifiés, comme pour une auto-déclaration.
- [ ] Une absence déclarée pour un STAR simple (sans rôle Resp. département/Ministre) se comporte
      exactement comme avant cette feature (aucune option de backup).

## Hors périmètre

- Aucun changement sur la visibilité de la vue transverse du Secrétaire (déjà à l'échelle de
  l'église).
- Aucune extension des permissions du Secrétaire en dehors du module Absences.
- Le backup reste réservé aux absences de personnes ayant un rôle Resp. département ou Ministre —
  cette spec ne l'étend pas aux STAR simples, ni pour l'auto-déclaration ni pour un tiers.

## Questions ouvertes

Aucune question bloquante restante — tranchées avec l'utilisateur :

- Le rôle Secrétaire obtient `absences:manage` à l'échelle de l'église entière (pas de scope
  département), cohérent avec sa portée sur les autres fonctionnalités.
- Le périmètre de backup pour une absence déclarée pour un tiers est celui de la personne absente,
  jamais celui du déclarant.
