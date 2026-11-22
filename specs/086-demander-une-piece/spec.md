# Spec — Compta : « Demander une pièce »

- **Numéro** : 086
- **Statut** : Implémentée
- **Créée le** : 2026-11-22
- **Branche suggérée** : `feat/compta-demander-piece`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Un demandeur ne peut ajouter une pièce jointe à sa demande financière (note de frais, avance)
que tant qu'elle est « Soumise ». Dès que la compta la prend en traitement, il ne peut plus rien
déposer, et la compta n'a aucun moyen de lui demander une pièce depuis Koinonia : elle relance
par WhatsApp, et la pièce arrive hors de l'application.

Le besoin est devenu urgent avec l'incident de stockage du 22/11/2026 : 14 pièces jointes et un
justificatif de la navette ont été perdus sur des demandes déjà en traitement ou validées. Leurs
auteurs ne peuvent pas les redéposer aujourd'hui.

Les relances automatiques existantes (justificatifs après versement, spec 078) ne couvrent pas
ce cas : elles portent sur les factures à fournir après la remise des fonds, pas sur une pièce
demandée par la compta à un moment quelconque.

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| **Comptable, Admin, Super Admin** (traitement des demandes) | Demander une pièce sur une demande, avec un message facultatif ; relancer ; voir si une pièce est demandée, depuis quand et combien de fois ; être prévenu du dépôt ; annuler la demande de pièce |
| **Comptable, Admin, Super Admin** (gestion de la navette) | Demander le justificatif d'une ligne de la navette à son auteur ; relancer ; annuler |
| **Demandeur** (tout compte ayant déposé une demande, quel que soit son rôle) | Recevoir la demande, voir le message, déposer une ou plusieurs pièces sur sa demande même si elle n'est plus « Soumise » |
| **Auteur d'une ligne de la navette** (membre de l'équipe navette) | Redéposer le justificatif demandé, même après le délai habituel de 48 h |

## Comportement attendu

### Scénario principal — demande financière

1. Le comptable ouvre une demande « En traitement » dont la facture manque.
2. Il clique sur « Demander une pièce », écrit « Merci de joindre la facture du magasin » et
   valide.
3. La demande affiche « Pièce demandée le 22/11 » ; le demandeur reçoit une notification (cloche,
   email selon ses préférences, notification sur ses appareils) avec le message et un lien vers sa
   demande.
4. Le demandeur ouvre sa demande : un encart reprend le message et lui permet de déposer une ou
   plusieurs pièces (mêmes formats et taille que d'habitude).
5. Dès le premier dépôt, la mention « Pièce demandée » disparaît, et le comptable est prévenu
   (« Nouvelle pièce sur la demande … »).
6. Le comptable poursuit le traitement comme d'habitude.

### Scénario — relance

1. Sans réponse après quelques jours, le comptable clique à nouveau sur « Demander une pièce »
   (libellé « Relancer »), avec ou sans nouveau message.
2. Le demandeur est notifié à nouveau ; la demande indique « Pièce demandée le 22/11 · relancée 1
   fois, le 26/11 ».

### Scénario — navette

1. Le comptable ouvre le registre de la navette, choisit une dépense sans justificatif et clique
   sur « Demander le justificatif ».
2. L'auteur de la ligne est notifié ; il peut redéposer le justificatif sur cette ligne, même si
   elle date de plus de 48 h, sans pouvoir modifier ses autres champs.
3. Au dépôt, la compta est prévenue et la mention disparaît.

### Scénarios alternatifs / cas limites

- **Demande annulée ou rejetée** : le bouton n'est pas proposé.
- **Demandeur sans compte actif dans l'église** (parti, compte supprimé) : le bouton n'est pas
  proposé ; un message l'explique.
- **Annuler la demande de pièce** : le comptable peut retirer la mention (pièce reçue autrement) ;
  le demandeur ne peut plus déposer hors de l'état « Soumise ».
- **Dépôt sans demande en cours** : impossible hors de l'état « Soumise », comme aujourd'hui.
- **Le demandeur dépose plusieurs pièces** : toutes acceptées tant qu'il est sur l'encart ; la
  compta est prévenue une seule fois par lot.
- **Une demande de pièce et un suivi de justificatifs (spec 078) en même temps** : les deux restent
  indépendants ; le dépôt de pièce ne change pas l'état du suivi des justificatifs.
- **Relances répétées** : pas de limite, mais chaque relance est visible (compteur, dates) et
  journalisée.
- **Ligne de navette supprimée** entre-temps : la demande de justificatif disparaît avec elle.

## Critères d'acceptation

- [ ] Sur une demande financière non annulée ni rejetée, un détenteur du traitement compta voit
      « Demander une pièce » ; aucun autre rôle ne le voit.
- [ ] La demande de pièce accepte un message facultatif, notifie le demandeur (cloche, email
      selon ses préférences, appareils) avec un lien vers sa demande.
- [ ] Tant qu'une pièce est demandée, le demandeur — et lui seul — peut déposer une ou plusieurs
      pièces sur sa demande, quel que soit son état (hors annulée ou rejetée), avec les contrôles
      habituels de format et de taille.
- [ ] Au premier dépôt, la mention « Pièce demandée » disparaît et la compta est prévenue.
- [ ] Une relance renvoie la notification et met à jour le compteur et la date affichés.
- [ ] La compta peut annuler une demande de pièce ; le dépôt redevient alors impossible hors
      « Soumise ».
- [ ] Les demandes en attente de pièce se repèrent dans la liste des demandes de la compta
      (mention ou filtre).
- [ ] Pour la navette, la gestion peut demander le justificatif d'une ligne à son auteur, qui peut
      le redéposer hors délai de 48 h sans modifier le reste de la ligne ; la compta est prévenue.
- [ ] Chaque demande, relance, annulation et dépôt est inscrit dans l'historique des
      modifications.
- [ ] Les règles actuelles (dépôt à l'état « Soumise », délai de 48 h de la navette, suivi des
      justificatifs de la spec 078) restent inchangées hors de ce parcours.

## Hors périmètre

- Relances automatiques d'une demande de pièce (seulement manuelles ; la spec 078 garde ses
  relances propres).
- Demande de pièce à une personne autre que le demandeur ou l'auteur de la ligne.
- Trésorerie : ses écritures sont saisies par la compta elle-même.
- Remplacement ou suppression d'une pièce existante par le demandeur.
- Envoi aux demandeurs de l'incident du 22/11 : fait à la main par la compta une fois la
  fonction en ligne.

## Questions ouvertes

- Décisions par défaut (à confirmer en revue) : relance manuelle sans limite ; dépôt possible par
  le demandeur seul ; mention retirée au premier dépôt.
