# Spec — Email de notification à l'assignation d'un conseiller MSDP

- **Numéro** : 016
- **Statut** : Implémentée
- **Créée le** : 2026-08-16
- **Branche suggérée** : `feat/email-assignation-conseiller-msdp`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Quand une famille suit un parcours d'intégration et qu'un berger lui est affecté, le berger reçoit à la fois une notification dans l'application **et** un email — il est donc informé même s'il n'a pas l'application ouverte ou ne la consulte pas régulièrement.

Quand une personne ayant répondu à un appel au salut est prise en charge dans le suivi MSDP (Ministère de Suivi Des Personnes) et qu'un conseiller lui est assigné, ce conseiller ne reçoit aujourd'hui **qu'une notification dans l'application** — aucun email. S'il ne consulte pas l'application régulièrement, il peut ne pas se rendre compte qu'un suivi lui a été confié, ce qui retarde la prise de contact avec un nouveau converti — l'étape la plus sensible du parcours d'intégration.

On veut aligner ce comportement sur celui déjà en place pour l'affectation d'un berger, afin que tout conseiller assigné à un suivi MSDP soit notifié de façon fiable, qu'il soit connecté à l'application ou non.

## Utilisateurs concernés

- **Conseiller MSDP** : personne assignée à un suivi (rattachée au périmètre MSDP de son église). C'est un rôle fonctionnel spécifique au module intégration, pas un des rôles globaux de Koinonia — il peut être porté par un Admin, un Ministre, un Responsable de département, ou tout autre utilisateur rattaché au département de fonction MSDP de son église.
- **Équipe intégration / équipe MSDP** (celle qui assigne le conseiller) : aucun changement de comportement pour elle, l'assignation se fait exactement comme aujourd'hui.

## Comportement attendu

### Scénario principal

1. Un membre de l'équipe intégration ou de l'équipe MSDP assigne un conseiller à un suivi de nouveau converti.
2. Le conseiller assigné reçoit immédiatement une notification dans l'application (comportement déjà existant, inchangé).
3. Le conseiller assigné reçoit également un email l'informant qu'un suivi lui a été confié, avec les informations nécessaires pour identifier de qui il s'agit et retrouver le suivi dans l'application.

### Scénarios alternatifs / cas limites

- **Si** le conseiller assigné n'a pas d'adresse email connue dans l'application, **alors** seule la notification in-app est envoyée (pas d'échec bloquant pour l'action d'assignation).
- **Si** l'envoi de l'email échoue techniquement (problème de service d'envoi, etc.), **alors** l'assignation du conseiller reste effective et la notification in-app reste envoyée — l'échec de l'email ne doit jamais empêcher ou annuler l'assignation.
- **Quand** un suivi est réaffecté à un nouveau conseiller (changement de conseiller en cours de suivi), le nouveau conseiller assigné reçoit le même email de notification que lors d'une première assignation.
- L'assignation d'un conseiller est toujours réalisée par un responsable habilité (équipe intégration/MSDP), jamais par le conseiller lui-même — aucun cas d'auto-assignation à gérer.

## Critères d'acceptation

- [ ] Lorsqu'un conseiller MSDP est assigné à un suivi, il reçoit un email en plus de la notification in-app existante.
- [ ] L'email identifie clairement la personne suivie et permet d'accéder directement au suivi concerné depuis l'application.
- [ ] L'absence d'adresse email pour le conseiller n'empêche pas l'assignation de se faire normalement (dégradation silencieuse vers la notification in-app seule).
- [ ] Un échec technique d'envoi d'email n'empêche pas l'assignation de se faire normalement.
- [ ] Le ton, la structure et l'identité visuelle de l'email sont cohérents avec les autres emails de notification déjà envoyés par l'application dans ce module.

## Hors périmètre

- Modifier le contenu ou le comportement de la notification in-app existante.
- Ajouter des préférences utilisateur pour désactiver ce type d'email (aucun mécanisme de préférence de notification n'existe ailleurs dans l'application à ce jour).
- Modifier les règles d'accès ou d'assignation d'un conseiller MSDP.
- Ajouter un email pour d'autres étapes du suivi MSDP (contact, formation, clôture, abandon) — seule l'assignation initiale (ou réaffectation) est concernée.
- Ajouter un rappel automatique en cas de suivi MSDP resté inactif (couvert séparément par l'issue #450).

## Questions ouvertes

Aucune zone d'incertitude restante — spec validée :
- Pas d'auto-assignation possible : seul un responsable habilité assigne un conseiller.
- L'email reste sobre (identification de la personne suivie + lien vers l'application), même niveau de discrétion que l'email d'affectation d'un berger — pas de détail sensible du parcours dans le corps de l'email.
