# Spec — Gestion des absences des STAR

- **Numéro** : 007
- **Statut** : Validée
- **Créée le** : 2026-07-25
- **Branche suggérée** : `feat/gestion-absences-star`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Aujourd'hui, un STAR qui sait à l'avance qu'il sera absent (voyage, maladie prévue, obligation
personnelle, etc.) n'a aucun moyen formel de le signaler dans l'application. Il doit prévenir son
responsable oralement ou par un canal externe (message, appel), sans garantie que l'information
remonte à temps ni qu'elle soit prise en compte au moment de construire le planning.

Conséquence : un STAR peut se retrouver affecté « en service » sur un événement alors qu'il a déjà
prévenu de son indisponibilité, ou l'inverse — un responsable découvre une absence au dernier
moment sans avoir eu le temps de trouver un remplaçant.

Cette fonctionnalité introduit une déclaration formelle et centralisée des absences prévues,
visible par les responsables concernés, et confrontée automatiquement au planning existant pour
signaler les situations qui nécessitent un arbitrage humain.

## Utilisateurs concernés

- **STAR** : déclare ses propres absences prévues, peut les annuler si ses plans changent, est
  notifié si l'une de ses absences chevauche un service où il est déjà prévu.
- **Resp. département** : déclare/annule une absence pour un STAR de son département, est notifié
  des absences déclarées dans son département (avec ou sans conflit), consulte la vue transverse
  filtrée sur son périmètre.
- **Ministre** : mêmes droits que Resp. département, mais à l'échelle de son ministère (tous les
  départements qu'il supervise).
- **Secrétaire** : consulte la vue transverse de toutes les absences de l'église (lecture seule),
  ne déclare/n'annule pas d'absence pour un tiers.
- **Admin / Super Admin** : consulte la vue transverse de toutes les absences de l'église.

Rôles non concernés par cette feature : Faiseur de Disciples, Reporter.

## Comportement attendu

### Scénario principal

1. Un STAR se rend sur l'espace où il peut déclarer une absence.
2. Il indique une période (date de début, date de fin) et peut ajouter un motif facultatif.
3. Il valide : l'absence est immédiatement active, sans étape d'approbation préalable.
4. Le(s) responsable(s) de son périmètre (resp. de département, ministre) reçoivent une
   notification les informant de cette absence.
5. Si aucune partie de la période déclarée ne chevauche un service où le STAR est déjà prévu « en
   service », rien de plus ne se produit : l'absence est simplement visible dans la vue transverse
   et sur le planning.
6. Si une partie de la période chevauche un ou plusieurs services où le STAR est déjà prévu « en
   service » : le STAR et le(s) responsable(s) concernés reçoivent une notification spécifique
   signalant le conflit, et ce conflit est visible directement sur le planning à l'endroit concerné.
   Aucune modification automatique de l'affectation n'a lieu — c'est au responsable d'arbitrer
   (retirer le STAR, trouver un remplaçant, etc.).

### Scénarios alternatifs / cas limites

- **Si** le STAR change d'avis avant le début de la période, **alors** il peut annuler son
  absence ; les responsables qui avaient été notifiés de la déclaration initiale (et, le cas
  échéant, du conflit) reçoivent alors une notification les informant de l'annulation.
- **Si** un responsable déclare une absence au nom d'un STAR de son périmètre, **alors** le STAR
  concerné doit pouvoir la consulter et l'annuler lui-même comme s'il l'avait saisie.
- **Quand** un responsable planifie un STAR « en service » sur un événement qui tombe dans une
  période où ce STAR a déjà une absence active, le système doit signaler visuellement la
  situation au moment de la planification (avant même que l'affectation soit enregistrée), pas
  seulement après coup.
- **Si** deux responsables différents (resp. de département et ministre) supervisent le même
  STAR, **alors** les deux sont notifiés d'une déclaration ou d'un conflit le concernant.
- **Quand** un STAR change de département ou quitte un département en cours de période
  d'absence, le système continue de rattacher l'absence à sa fiche STAR, pas au département —
  le responsable notifié est celui du/des départements auxquels le STAR est rattaché **au moment
  de la déclaration**.
- **Si** un STAR est rattaché à plusieurs départements (et donc potentiellement plusieurs
  ministères), **alors** tous les responsables de tous ces départements/ministères sont notifiés
  de la déclaration — pas seulement ceux du département où un conflit est détecté — car
  l'absence peut avoir un impact sur n'importe lequel des services où le STAR est engagé.
- **Si** une période d'absence chevauche un événement pour lequel le STAR n'a aucune affectation
  planning (ni en service, ni indisponible, ni remplaçant), **alors** il n'y a pas de conflit à
  signaler — seule l'existence de l'absence est visible.
- **Si** une personne possède une fiche STAR dans l'église A et un rôle (responsable, ministre...)
  dans l'église B, **alors** une absence déclarée pour sa fiche STAR de l'église A n'est visible,
  notifiée ou comptabilisée que dans le périmètre de l'église A — aucune fuite d'information vers
  l'église B, même s'il s'agit du même compte utilisateur.
- **Si** une personne possède une fiche STAR distincte dans plusieurs églises, **alors** elle
  déclare une absence séparément pour chaque fiche, dans le contexte de l'église concernée — il
  n'existe pas de déclaration unique valable pour toutes ses églises à la fois.
- **Quand** un responsable ou un STAR travaille dans le contexte d'une église donnée (celle
  actuellement sélectionnée dans l'application), toute déclaration, notification ou consultation
  d'absence ne concerne que cette église.

## Critères d'acceptation

- [ ] Un STAR peut déclarer une absence (période + motif optionnel) pour lui-même.
- [ ] Un Resp. département ou un Ministre peut déclarer une absence pour un STAR de son périmètre.
- [ ] Une absence déclarée est immédiatement visible, sans étape de validation préalable.
- [ ] À la déclaration, les responsables du périmètre du STAR (resp. département + ministre)
      reçoivent une notification.
- [ ] Si la période d'absence chevauche un service où le STAR est déjà « en service », le STAR et
      les responsables concernés reçoivent une notification de conflit distincte.
- [ ] Un conflit entre une absence et une affectation planning est visible directement dans la vue
      de planification, sans action manuelle supplémentaire.
- [ ] Le STAR ou son responsable/ministre de périmètre peut annuler une absence active à tout
      moment.
- [ ] Une absence annulée n'apparaît plus comme active dans le planning ni dans les notifications
      de conflit futures.
- [ ] L'annulation d'une absence notifie systématiquement les responsables qui avaient été
      notifiés de la déclaration initiale (et du conflit, le cas échéant).
- [ ] Si un STAR est rattaché à plusieurs départements/ministères, la déclaration d'une absence
      notifie l'ensemble des responsables de tous ces départements/ministères, pas uniquement
      ceux du département en conflit.
- [ ] Une vue transverse liste toutes les absences, avec filtres par ministère, par département et
      par rôle du déclarant.
- [ ] La vue transverse respecte le même périmètre de visibilité que la consultation des membres :
      un Ministre ne voit que son ministère, un Resp. département que ses départements, le
      Secrétariat et l'Admin/Super Admin voient toute l'église.
- [ ] Le Secrétariat peut consulter la vue transverse mais ne peut pas déclarer ou annuler une
      absence pour un tiers.
- [ ] Un STAR ne peut ni déclarer ni annuler une absence pour un autre STAR.
- [ ] Une absence est toujours rattachée à une seule église : celle de la fiche STAR concernée.
- [ ] Une personne ayant une fiche STAR dans une église et un rôle de responsable dans une autre
      église ne voit, ni ne reçoit de notification, concernant une absence en dehors de l'église
      où cette absence a été déclarée.
- [ ] La vue transverse ne montre jamais les absences de plusieurs églises simultanément ; elle
      suit l'église actuellement sélectionnée par l'utilisateur, comme les autres vues de
      l'application.

## Hors périmètre

- Aucune bascule automatique du statut d'un STAR sur le planning (ex. passage automatique à
  « indisponible ») suite à la déclaration d'une absence — l'arbitrage reste toujours manuel.
- Aucun workflow d'approbation/validation de l'absence par un tiers avant qu'elle soit effective.
- Aucune gestion de quota, de solde ou de décompte d'absences (pas de logique de type congés).
- Aucune récurrence d'absence (ex. « tous les premiers dimanches du mois ») — chaque absence est
  une période ponctuelle avec une date de début et une date de fin.
- Le Secrétariat ne peut pas déclarer d'absence au nom d'un STAR (peut uniquement consulter).
- Aucune notification vers des rôles hors périmètre du STAR (Faiseur de Disciples, Reporter, ou
  responsables d'autres départements/ministères non liés au STAR).
- Aucune vue agrégée ou consolidée des absences à travers plusieurs églises, même pour un
  Super Admin supervisant plusieurs églises — la consultation reste toujours limitée à une église
  à la fois.

## Questions ouvertes

Aucune question bloquante restante — tous les points ont été tranchés :

- Notification à l'annulation : systématique, vers les responsables notifiés à la déclaration.
- Portée de la notification (STAR multi-départements) : tous les responsables de tous les
  départements/ministères du STAR, pas uniquement ceux en conflit.
- Impact multi-église : absence toujours rattachée à une seule église, aucune fuite ni vue
  agrégée cross-église.
