# ADR-0024 — Notifications natives par Web Push, livrées depuis les notifications de l'application

- **Statut** : Proposé
- **Date** : 2026-10-27

## Contexte

La spec 068 ajoute un troisième canal de notification, la notification native sur le téléphone
ou l'ordinateur, à côté de la cloche de l'application et de l'email (spec 053, ADR-0016).

Trois contraintes guident le choix :

- **Couverture.** Toutes les notifications de tous les modules doivent pouvoir partir sur les
  appareils, réglables par domaine. Or elles sont émises depuis 34 sites, dont certains à
  l'intérieur d'une transaction Prisma, avant que les données ne soient validées.
- **Confidentialité.** Le contenu ne doit pas dépasser ce que montre la cloche, et aucune donnée
  de destinataire ne doit être confiée à un service tiers en dehors des services push des
  navigateurs, que l'on ne peut pas éviter.
- **Exploitation.** Pas d'infrastructure supplémentaire : pas de file de messages, pas de compte
  chez un fournisseur, et un déploiement qui reste le même artefact promu d'un environnement à
  l'autre.

## Décision

- On utilise le **standard Web Push** (VAPID, RFC 8030/8291/8292), avec une paire de clés propre
  à chaque environnement et la librairie `web-push` pour le chiffrement. Aucun intermédiaire
  entre Koinonia et les services push des navigateurs.
- **La notification de l'application est la source de la notification native.** Seule une ligne
  `Notification` existante peut partir sur un appareil, avec son titre, son message et son lien.
  Chaque ligne porte son état de livraison (`pushedAt`), pris en charge de façon atomique.
- **Deux moments de livraison** passent par la même prise de main :
  - **immédiatement** après l'email, dans le circuit commun de `src/lib/notifications.ts`, pour
    les notifications créées hors transaction ;
  - **en rattrapage** par une tâche `every-run` du planificateur (ADR-0021), qui couvre les
    notifications créées dans une transaction ou interrompues, sur une fenêtre d'une heure.
- **Les préférences push** sont rangées dans une table distincte de celle de l'email, de même
  forme (domaine, ou `*` pour l'interrupteur général).
- **La clé publique VAPID** est servie à l'exécution, jamais figée au build.

Toute nouvelle notification d'un module suit ce canal sans code supplémentaire, dès qu'elle est
créée par les helpers existants.

## Alternatives considérées

- **Firebase Cloud Messaging, OneSignal.** *Écarté :* un compte et un SDK tiers, des identifiants
  de destinataires stockés chez un tiers, et aucun gain pour une application web installée.
- **Envoi déclenché par chaque site d'appel**, avec un hook « après commit » pour les
  transactions. *Écarté :* Prisma n'offre pas ce hook. Il faudrait modifier chaque site
  transactionnel, avec un risque d'oubli permanent.
- **File de tâches dédiée** (table de jobs, Redis, BullMQ). *Écarté :* le planificateur et l'état
  porté par la notification suffisent, sans infrastructure de plus (ADR-0021).
- **Colonne « canal » dans la table des préférences email.** *Écarté :* elle impose une migration
  de clé primaire sur une table en production, pour un gain nul.
- **Clé publique en variable `NEXT_PUBLIC_*`.** *Écarté :* elle serait figée dans l'artefact
  construit sur le tag, puis promu de staging à la production avec des clés différentes.

## Conséquences

- **Plus facile :**
  - tous les modules gagnent le canal push sans changement ;
  - une notification créée en transaction part après validation, au plus tard 5 minutes après ;
  - le contenu d'une notification native ne peut, par construction, rien montrer de plus que la
    cloche.
- **Plus contraint :**
  - une information envoyée **seulement par email**, sans ligne dans la cloche, ne peut pas
    partir en push ; il faut d'abord la faire exister dans la cloche ;
  - les clés VAPID deviennent un secret d'exploitation : en changer invalide tous les
    abonnements des appareils.
- **Coût :**
  - une colonne et un index sur `notifications` ;
  - deux tables ;
  - une tâche cron de plus à chaque passage, limitée à la fenêtre d'une heure.

## Références

- Spec 068 : `specs/068-notifications-push/` (spec et plan)
- ADR-0016 : préférences de notification par email
- ADR-0021 : planificateur des tâches cron
