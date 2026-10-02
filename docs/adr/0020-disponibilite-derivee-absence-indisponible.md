# ADR-0020 — La disponibilité d'un STAR est dérivée ; « absence » et statut `INDISPONIBLE` fusionnent

- **Statut** : Accepté
- **Date** : 2026-10-02

## Contexte

Deux notions décrivaient jusqu'ici la même réalité — un STAR qui ne peut pas servir :

- l'**absence** déclarée (spec 007, ciblée par période ou par événements depuis la spec 050) ;
- le statut de service **`INDISPONIBLE`**, posé à la main par le responsable dans la grille.

La spec 050 (§ Statuts de service) avait acté qu'une absence ne pose **jamais** le statut :
c'est un signal, le responsable reste maître du planning. En pratique le responsable ressaisit
l'information, et rien ne distingue « disponible » de « n'a pas répondu ».

La spec 058 (issue #612, lot 1) introduit une collecte mensuelle des disponibilités : chaque
STAR répond Disponible / Si besoin / Pas disponible par événement, et une absence de réponse à
l'échéance vaut indisponibilité.

## Décision

La disponibilité d'un STAR pour un événement et un département est **calculée**, jamais saisie
comme statut de planning. Sources, par priorité :

1. la **réponse** du STAR (ou d'un responsable pour lui) à l'événement, par département ;
2. à défaut, une **période d'indisponibilité** qui couvre l'événement (l'absence `PERIOD`,
   conservée avec son ciblage, ses backups, sa frise et son export) ;
3. à défaut, **« Sans réponse »** si la disponibilité a été demandée — indisponible une fois
   l'échéance passée — sinon « Non demandée ».

Conséquences directes :

- le statut `INDISPONIBLE` n'est plus accepté en écriture ; un STAR indisponible n'est pas
  planifié. Les lignes existantes deviennent des réponses « Pas disponible » et sortent du
  planning ;
- l'absence « par événements » (`kind = EVENTS`) n'est plus créable ; les existantes deviennent
  des réponses « Pas disponible » ;
- le responsable reste maître du planning : placer un STAR indisponible est possible, avec un
  avertissement (principe de la spec 050 conservé).

## Alternatives considérées

- **Poser automatiquement `INDISPONIBLE` à partir des réponses** — *écarté* : deux sources de
  vérité à synchroniser, et une ligne de planning créée pour quelqu'un qui ne sert pas.
- **Remplacer aussi les périodes par des réponses** — *écarté* : une période couvre les
  événements créés après coup et porte le backup des responsables ; une réponse par événement
  ne sait faire ni l'un ni l'autre.
- **Garder absence et `INDISPONIBLE` séparés et ajouter les réponses à côté** — *écarté* : trois
  notions pour une seule réalité, le défaut que l'issue #612 veut corriger.

## Conséquences

- Plus de ressaisie : la grille affiche directement ce que le STAR a répondu.
- Les écrans et API d'absence perdent le mode « par événements » ; la vue d'ensemble devient une
  vue des indisponibilités.
- Les valeurs `ServiceStatus.INDISPONIBLE` et `AbsenceKind.EVENTS` restent dans le schéma pour
  l'historique ; leur retrait est un chantier ultérieur.
- Toute nouvelle fonctionnalité qui a besoin de savoir si un STAR peut servir (remplacements du
  lot 3, ouverture/fermeture spec 041) doit passer par ce calcul, et non relire les absences.

## Références

- Issue #612 ; spec et plan `specs/058-collecte-disponibilites/`
- Specs 007, 013, 050 (§ Statuts de service, que cette décision remplace)
