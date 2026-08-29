# Spec — Fin de l'intégration externe MRBS (SSO et liaison de comptes)

- **Numéro** : 027
- **Statut** : Implémentée
- **Créée le** : 2026-08-29
- **Branche suggérée** : `fix/decommission-mrbs`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia s'est historiquement intégré à **MRBS**, un logiciel externe de réservation de salles,
via un mécanisme de connexion unique (SSO) : un utilisateur connecté à Koinonia était
automatiquement reconnu dans MRBS, grâce à un cookie de session partagé entre les deux
applications et une page d'administration permettant de lier manuellement un compte MRBS à un
compte Koinonia.

Ce partage de cookie affaiblit la sécurité de **toute** l'application : le cookie de session
Koinonia devient lisible par n'importe quel service hébergé sur un sous-domaine du même domaine
parent, pas seulement par MRBS. Un tel service, s'il était un jour compromis, pourrait voler ou
rejouer la session d'un utilisateur de Koinonia — un risque qui pèse sur l'ensemble de
l'application pour le bénéfice d'une seule intégration externe (finding H-04 de l'audit sécurité
du 2026-08-29).

La réservation de salles est désormais assurée **nativement** par Koinonia — l'intégration
externe avec MRBS n'a donc plus lieu d'être. Il ne s'agit plus de sécuriser ce pont entre les
deux applications, mais de le retirer entièrement : supprimer le risque en supprimant la
fonctionnalité qui l'imposait.

## Utilisateurs concernés

- **Super Admin / Admin** : perdent l'accès à la page d'administration de liaison des comptes
  MRBS ↔ Koinonia, devenue sans objet.
- **Tout utilisateur authentifié** : voit son cookie de session redevenir strictement réservé à
  Koinonia (bénéfice de sécurité transparent, aucune action requise).
- Aucun rôle ne perd de fonctionnalité de réservation de salles : celle-ci reste entièrement
  assurée par le module natif de Koinonia, non concerné par cette spec.

## Comportement attendu

### Scénario principal

1. Un administrateur qui se rendait auparavant sur la page de liaison des comptes MRBS constate
   qu'elle n'existe plus (retirée du menu d'administration, plus accessible).
2. Le cookie de session posé lors d'une connexion à Koinonia n'est plus configurable pour être
   partagé avec un domaine parent : il reste strictement attaché à Koinonia, quelle que soit la
   configuration de déploiement.
3. Aucune tentative d'appel des anciens points d'entrée réservés à l'intégration MRBS
   n'aboutit plus — ils n'existent plus.
4. La réservation de salles native (module Koinonia existant, hors périmètre de cette spec)
   continue de fonctionner exactement comme avant.

### Scénarios alternatifs / cas limites

- **Si** une installation de Koinonia avait été configurée pour partager son cookie de session
  (variable d'environnement dédiée), **alors** cette configuration doit être documentée comme
  n'ayant plus aucun effet, pour éviter qu'un déploiement croie encore en bénéficier.
- **Si** des données de liaison de comptes MRBS existent encore en base au moment du retrait,
  **alors** leur suppression doit être un choix explicite et documenté (pas un effet de bord
  silencieux d'un changement de schéma).

## Critères d'acceptation

- [x] Le cookie de session ne peut plus être configuré pour être partagé avec un domaine parent
      ou un autre sous-domaine, quelle que soit la configuration de déploiement.
- [x] La page d'administration de liaison des comptes MRBS ↔ Koinonia n'est plus accessible, à
      aucun rôle.
- [x] Aucun point d'entrée réservé à l'intégration MRBS externe (résolution de session,
      information utilisateur, liaison de comptes) n'est plus exposé par l'application.
- [x] La réservation de salles native (module Koinonia) n'est pas affectée par ce retrait —
      aucune régression sur son fonctionnement existant.
- [x] Aucune trace résiduelle dans la documentation ou la configuration d'exemple ne laisse
      penser que l'intégration MRBS est encore disponible ou recommandée.

## Hors périmètre

- Le fonctionnement du module natif de réservation de salles de Koinonia (`rooms`) — cette spec
  ne fait que retirer l'intégration avec le logiciel externe MRBS, jamais la fonctionnalité de
  réservation elle-même.
- Toute migration ou reprise de données déjà présentes côté MRBS externe (l'import ponctuel des
  réservations existantes est un sujet distinct, déjà traité séparément).
- La désinstallation ou l'arrêt du logiciel MRBS lui-même, hors du périmètre de Koinonia.

## Questions ouvertes

*Aucune — le porteur du produit a confirmé que l'intégration MRBS externe n'a plus d'usage,
la réservation de salles étant désormais entièrement assurée par le module natif Koinonia.*
