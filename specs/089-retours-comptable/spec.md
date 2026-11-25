# Spec — Retours du comptable (archives, aperçu des pièces, caisse d'un paiement, date de départ)

- **Numéro** : 089
- **Statut** : Implémentée
- **Créée le** : 2026-11-25
- **Branche suggérée** : `feat/retours-comptable`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

Après quelques jours d'usage de la comptabilité et de la trésorerie, le comptable remonte quatre gênes :

1. **La file ne se vide jamais.** Une demande validée, entièrement versée et justifiée reste dans la
   liste « Tous » pour toujours : les dossiers terminés noient ceux qui demandent une action.
2. **Voir une pièce oblige à la télécharger.** Chaque facture consultée finit dans le dossier de
   téléchargements, alors qu'il veut seulement la regarder.
3. **Un paiement remis ne peut plus être rattaché à une caisse.** Si « Payé depuis » n'a pas été
   choisi à la remise (cas d'une avance Navette remise le 22/11), la sortie n'apparaît jamais dans la
   caisse principale et il n'y a aucun moyen de corriger.
4. **Le refus d'une collecte est incompréhensible.** « La date est antérieure au solde de départ de ce
   compte » ne dit ni quelle date de départ, ni comment la corriger (elle se modifie dans Réglages).

Les demandes « Dîmes ID » / « Offrandes ID » sont déjà possibles (catégories ajoutables dans Réglages)
et l'EJP est une autre église, avec une comptabilité séparée : hors code.

## Utilisateurs concernés

- **Comptable, Admin, Super Admin** (`accounting:manage` / `treasury:manage`) : archivent, rattachent
  un paiement à une caisse, saisissent les collectes.
- **Tout lecteur d'une pièce** (demandeur, compta, responsables autorisés) : aperçu sans téléchargement.

## Comportement attendu

### Archives

1. Une demande **close** — validée, toutes ses tranches remises, aucune pièce demandée en attente, et
   justificatifs soldés ou jamais attendus — est **archivée d'office** : elle sort de « Tous » et
   apparaît sous un nouveau filtre « Archivées ».
2. La compta peut aussi **archiver à la main** une demande validée, rejetée ou annulée, même si
   quelque chose reste ouvert (ex. justificatifs attendus d'un demandeur qui ne répondra plus).
   L'archivage à la main ne change rien au suivi : relances et dépôts continuent.
3. Une demande archivée à la main **revient d'elle-même** dans la file dès qu'elle demande une action
   de la compta (tranche à remettre, justificatifs déposés à vérifier, reliquat à confirmer).
4. « Désarchiver » retire l'archivage manuel. Une demande close reste archivée (rien à faire).
5. Archiver et désarchiver sont journalisés.

### Aperçu des pièces

- Chaque pièce (PDF ou image) a un bouton **« Voir »** qui l'ouvre dans un nouvel onglet, à côté de
  « Télécharger ». Les mêmes droits de lecture s'appliquent.

### Caisse d'un paiement déjà remis

- Sur une tranche remise, la compta voit **d'où** elle est partie (caisse ou « Compte commun ») et peut
  le **modifier** : choisir une caisse active, ou revenir au compte commun. La sortie apparaît (ou
  disparaît) alors dans le registre de la trésorerie.
- Refusé si le mois de la remise est clôturé dans la trésorerie (ancien comme nouveau compte).
- Journalisé (avant / après).

### Date de départ

- Le refus d'une saisie (ligne, collecte, remise, transfert) antérieure au solde de départ indique le
  nom du compte, sa date de départ, et qu'elle se modifie dans Réglages.

## Critères d'acceptation

- [x] Une demande validée, entièrement remise, sans justificatif ouvert ni pièce demandée n'apparaît pas dans « Tous » et apparaît dans « Archivées »
- [x] Une demande validée avec une tranche non remise, ou des justificatifs déposés à vérifier, n'est jamais archivée (même archivée à la main)
- [x] La compta archive à la main une demande validée/rejetée/annulée ; refusé (400) pour une demande soumise ou en traitement ; refusé (403) sans `accounting:manage`
- [x] « Désarchiver » remet une demande archivée à la main dans la file
- [x] Archiver/désarchiver produisent une ligne d'historique
- [x] « Voir » ouvre la pièce dans le navigateur sans la télécharger, avec les mêmes droits que le téléchargement
- [x] La compta change la caisse d'une tranche remise ; la sortie suit dans le registre ; refusé si le mois est clôturé ou la caisse archivée
- [x] Le message de date de départ cite le compte, sa date et Réglages

## Hors périmètre

- Archivage dans les autres listes (navette, trésorerie).
- Catégories « Dîmes ID » / « Offrandes ID » (déjà paramétrables) ; comptabilité de l'EJP (autre église).
- Aperçu intégré dans la page (une fenêtre de visionneuse) : l'onglet du navigateur suffit.
