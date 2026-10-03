# Annonce aux églises — mise en service de la collecte des disponibilités (spec 058)

À diffuser **avant** la mise en production de la version qui contient la spec 058, aux
administrateurs, secrétaires, Ministres et responsables de département de chaque église. Un
second message, plus court, est destiné aux STAR.

## Ce qui se passe à la mise en service

- Dans l'heure qui suit la mise en ligne, la tâche planifiée ouvre d'un coup une collecte pour
  **chaque mois de la fenêtre qui a des événements** : le mois en cours et les deux suivants
  (réglage par défaut « 2 mois avant »). Par exemple, une mise en ligne en octobre ouvre octobre,
  novembre et décembre.
- Chaque STAR dont le compte est lié à sa fiche reçoit **une notification par collecte ouverte**,
  donc jusqu'à trois d'un coup, chacune avec un email selon sa préférence « Planning et service ».
- Pour le mois en cours, la date de clôture (7 jours avant le premier événement à venir) est
  souvent déjà passée. Le message demande alors de « répondre au plus vite », et les
  sans-réponse apparaissent tout de suite comme « en retard » dans la grille. C'est voulu : cela
  permet de compléter le planning du mois en cours.
- Les absences « sur certains événements » et les statuts « Indisponible » déjà posés dans la
  grille sont convertis en réponses « Pas disponible ». Les périodes d'absence restent des
  indisponibilités.
- Les STAR sans compte lié ne reçoivent rien : leur responsable peut répondre pour eux
  (« Répondre pour… »).

## Message aux responsables (admin, secrétariat, Ministres, responsables de département)

> **Nouveau dans Koinonia : la collecte des disponibilités**
>
> À partir de la mise à jour du [date], les STAR indiqueront chaque mois leur disponibilité pour
> chaque événement (Disponible / Si besoin / Pas disponible), depuis le menu « Disponibilités ».
> Dans la grille de planning, vous verrez directement qui est disponible, avec un avertissement
> si vous placez quelqu'un d'indisponible.
>
> **Ce qui change dès la mise en ligne :**
> - Plusieurs collectes s'ouvrent en même temps (le mois en cours et les deux suivants). Vos
>   STAR recevront donc jusqu'à trois notifications le même jour : c'est normal, ce sera
>   ensuite une collecte par mois.
> - Pour le mois en cours, la réponse est demandée « au plus vite ». Les sans-réponse
>   apparaîtront en retard dans la grille. Utilisez « Relancer les sans-réponse » si besoin.
> - Les absences par événement et les statuts « Indisponible » déjà saisis sont repris
>   automatiquement en « Pas disponible ».
> - Les STAR sans compte Koinonia ne sont pas prévenus : utilisez « Répondre pour… » depuis
>   « Disponibilités ».
>
> **Réglages** (administration et secrétariat) : menu « Disponibilités » → onglet « Collectes »
> → « Réglages ». Vous pouvez y désactiver la collecte automatique, ou changer les délais
> d'ouverture, de clôture et de relance. « Ouvrir maintenant » ouvre un mois à l'avance.

## Message aux STAR

> **Indique tes disponibilités dans Koinonia**
>
> Désormais, chaque mois, Koinonia te demandera si tu es disponible pour les événements du mois
> suivant (Disponible / Si besoin / Pas disponible), depuis le menu « Disponibilités ». Ça prend
> une minute et ça aide ton responsable à préparer le planning.
>
> À la mise en route, tu recevras plusieurs demandes d'un coup (ce mois-ci et les deux
> suivants) : réponds d'abord pour ce mois-ci. Une absence longue (vacances, déplacement) se
> déclare en une fois avec « Pas disponible du … au … ».

## Points à vérifier avant la mise en production

- [ ] Date de mise en ligne fixée et reportée dans le message (`[date]`).
- [ ] Message envoyé aux responsables au moins quelques jours avant.
- [ ] Une église qui ne veut pas de la collecte immédiatement doit la désactiver juste après la
      mise en ligne, **avant le passage suivant de la tâche horaire**. Sinon, prévoir de
      l'empêcher par configuration au déploiement (non prévu aujourd'hui).
