# Spec — Billetterie dans les assistants IA connectés

- **Numéro** : 083
- **Statut** : En revue
- **Créée le** : 2026-11-21
- **Branche suggérée** : `feat/billetterie-assistant`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La billetterie (spec 074) se conduit aujourd'hui uniquement écran par écran : créer l'événement,
régler tarifs, options, plats et moyens de paiement, constituer l'équipe, puis, pendant les
inscriptions, confirmer un à un les « J'ai payé », encaisser, rembourser, annuler. Pour un
événement comme la Nuit de la traversée, ce sont des dizaines de gestes répétitifs, souvent faits
le soir, sur téléphone.

Les assistants IA connectés (spec 081) savent déjà lire ce que voit un compte et faire, après
aperçu et confirmation, une série d'actions de planning, d'événements et de comptes rendus. En
billetterie, ils ne savent que lister les affectations de la personne. L'organisateur ou le
trésorier ne peut donc pas dire à son assistant « crée la soirée du 31 décembre, 150 places,
15 € adulte, 8 € enfant, repas au choix » ou « confirme les paiements Wero de la semaine ».

Cette spec permet à un assistant de conduire un événement de billetterie **de sa création à sa
clôture**, dans les limites exactes des droits du compte dans l'application.

## Utilisateurs concernés

Mêmes droits que dans l'application (spec 074), sans aucun ajout :

**Au niveau de l'église**
- **Super Admin**, **Admin**, **Secrétaire** (gestion de la billetterie) : créent un événement
  et sont organisateurs de tous les événements de l'église.

**Au niveau de chaque événement**, n'importe quel compte de l'église, STAR compris, selon le
rôle qui lui est attribué :

| Rôle d'événement | Ce que son assistant peut faire |
|---|---|
| **Organisateur** | tout : paramétrage, options et plats, équipe, ouverture et clôture, réservations, paiements, restauration, lectures |
| **Trésorier** | paiements (confirmer, rejeter, encaisser, rembourser), lectures |
| **Accueil / sécurité** | ajout sur place (si l'événement l'autorise), lecture du compteur et de la recherche par nom, sans coordonnées |
| **Restauration** | menu (plats, stock), remise d'un article, vente sur place, lecture du tableau de restauration |
| **Observateur** | lectures uniquement |

Les rôles d'événement s'arrêtent à la clôture, pour l'assistant comme pour l'écran.

## Comportement attendu

Principes communs, hérités de la spec 081 :

- Chaque modification se fait en **deux temps** : un **aperçu** qui ne change rien et montre ce
  qui sera fait, puis la **confirmation explicite** de la personne dans la conversation.
- Une action n'est proposée qu'au compte qui peut la faire à l'écran **pour cet événement** ;
  les droits sont revérifiés à la confirmation.
- Uniquement si la case des actions a été cochée à la connexion ; journalisé « via l'assistant
  IA » ; mêmes notifications et emails qu'à l'écran — ni plus, ni moins.
- Seule l'église choisie à la connexion est visible.

### Lot 1 — Lectures

Pour tout compte ayant un rôle sur l'événement (ou la gestion de la billetterie) :

- **Mes événements de billetterie** : titre, dates, état (brouillon, ouvert, clos, clôturé),
  places vendues / ouvertes / jauge, mon ou mes rôles.
- **Prêt à ouvrir ?** : ce qu'il reste à régler avant d'ouvrir, comme l'Aperçu de l'écran
  (bloquant et conseillé).
- **Réservations** : référence, nom du contact et des participants, état, montant dû et payé,
  options choisies — **jamais l'email ni le téléphone**.
- **Paiements à traiter** (trésorier, organisateur) : « J'ai payé » en attente, moyen, montant,
  référence, ancienneté ; remboursements à faire.
- **Présence** : compteur, entrées/sorties, niveau de jauge.
- **Restauration** : plats, stock restant, articles à remettre.

### Lot 2 — Créer et préparer l'événement (organisateur)

1. « Crée la Nuit de la traversée le 31 décembre de 20 h à 6 h, salle polyvalente, 150 places,
   inscriptions jusqu'au 28. »
   - L'aperçu montre l'événement tel qu'il sera créé, **en brouillon**, et son adresse publique.
   - Seul un compte qui peut créer un événement de billetterie dans l'église le peut.
2. Paramétrage, chacun en aperçu puis confirmation :
   - **informations** (titre, description, lieu, dates, date limite d'inscription) ;
   - **jauge et places ouvertes** — jamais sous le nombre d'inscrits ni au-dessus de la jauge ;
   - **tarifs par tranche d'âge** ;
   - **moyens de paiement** (Wero, Revolut, PayPal, virement, espèces, chèque) — l'IBAN dicté est
     enregistré, puis toujours affiché masqué ;
   - **règles** : paiement des options et date limite, relance, annulation et remboursement,
     mineurs non accompagnés, ajout sur place, conservation des données ;
   - **options** (repas, t-shirt…), leurs groupes au choix unique, et leurs **plats** (ajouter,
     renommer, modifier stock et prix, fermer, supprimer un plat jamais réservé).
3. **Équipe** : attribuer ou retirer un rôle d'événement à un compte de l'église ; créer, renommer
   ou supprimer un poste ; affecter une personne à un poste et un créneau, modifier ou retirer une
   affectation. La personne est prévenue comme à l'écran.
4. **Ouvrir les inscriptions** : l'aperçu reprend « Prêt à ouvrir ? » ; un point bloquant empêche
   l'ouverture. **Fermer** puis **rouvrir** se font de la même façon.
5. **Clôturer** l'événement : l'aperçu prévient que les rôles d'équipe prennent fin et que
   l'événement passe en lecture seule.

### Lot 3 — Paiements (trésorier, organisateur)

- **Confirmer** un ou plusieurs « J'ai payé » (par exemple « tous les Wero de moins de 7 jours ») :
  l'aperçu liste chaque paiement (référence, nom, moyen, montant). Le participant reçoit l'email
  habituel.
- **Rejeter** un « J'ai payé » avec un motif, transmis au participant comme à l'écran.
- **Encaisser** un règlement espèces ou chèque sur une réservation.
- **Marquer un remboursement effectué.**

Une série est bornée (au plus 50 paiements par confirmation) ; si l'un d'eux a changé d'état
entre l'aperçu et la confirmation, **rien n'est fait** et l'assistant refait l'aperçu.

### Lot 4 — Réservations et restauration

- **Annuler une réservation au nom de l'organisation** (organisateur), avec les remboursements
  qui en découlent, comme à l'écran.
- **Ajouter une inscription sur place** (organisateur, accueil), si l'événement l'autorise.
- **Remettre un article** « à retirer sur place » et **enregistrer une vente sur place**
  (organisateur, restauration).

### Scénarios alternatifs / cas limites

- **Rôle retiré ou événement clôturé entre l'aperçu et la confirmation** : refus, rien n'est fait.
- **Données changées entre-temps** (places vendues, paiement déjà confirmé par un autre
  trésorier, plat épuisé) : refus avec la raison ; l'assistant refait l'aperçu.
- **Plusieurs événements au même nom** : l'assistant demande lequel, il ne choisit pas.
- **Baisse des places sous le nombre d'inscrits** : refusée dès l'aperçu, avec le nombre
  d'inscrits.
- **Ouverture avec un point bloquant** (pas de tarif, pas de moyen de paiement alors que c'est
  payant…) : refusée, l'aperçu dit quoi régler.
- **Compte sans rôle sur l'événement** : l'événement est absent pour son assistant, comme s'il
  n'existait pas.
- **Observateur** : aucune action proposée.
- **Accueil** : jamais les coordonnées des participants, y compris en lecture.

## Critères d'acceptation

- [ ] Un organisateur crée un événement de billetterie, le paramètre entièrement (informations,
      jauge, places, tarifs, moyens de paiement, règles, options, plats), constitue son équipe et
      ouvre les inscriptions **uniquement par son assistant**, chaque étape après aperçu et
      confirmation.
- [ ] Chaque action n'est proposée qu'aux rôles qui peuvent la faire à l'écran pour cet
      événement — vérifié pour organisateur, trésorier, accueil, restauration et observateur.
- [ ] Un STAR sans rôle sur aucun événement ne se voit proposer aucune action de billetterie.
- [ ] Un trésorier confirme une série de « J'ai payé » en une confirmation ; les participants
      reçoivent les mêmes emails qu'à l'écran.
- [ ] Une confirmation dont les droits ou les données ont changé depuis l'aperçu est refusée sans
      rien faire, y compris pour une série.
- [ ] L'ouverture des inscriptions est refusée tant qu'un point bloquant de « Prêt à ouvrir ? »
      subsiste.
- [ ] Aucune lecture ni aucun aperçu ne renvoie l'email ou le téléphone d'un participant.
- [ ] L'IBAN d'un événement n'est jamais renvoyé en clair par l'assistant, y compris juste après
      sa saisie.
- [ ] Toute action est journalisée « via l'assistant IA ».
- [ ] Après clôture, l'assistant d'un membre d'équipe ne voit plus l'événement ; celui d'un
      organisateur de l'église le voit en lecture seule.

## Hors périmètre

- **Contrôle des entrées et sorties** (scan, compteur manuel +1/−1) : geste physique à la porte,
  reste sur l'écran de contrôle.
- **Fichiers** : affiche, étiquettes, badges, exports — l'assistant ne lit ni ne produit de fichier.
- **Suppression d'un événement** (n'existe pas à l'écran non plus).
- **Encaissement réel** : Koinonia n'encaisse toujours rien, l'assistant non plus.
- **Inscription en tant que participant** pour le compte d'autrui : la page publique reste le seul
  chemin.
- Toute modification de l'assistant intégré (spec 075).

## Questions ouvertes

- **IBAN par l'assistant** (tranché le 21 novembre 2026) : l'assistant peut **saisir** l'IBAN de
  l'événement dicté par l'organisateur, vérifié comme à l'écran, mais ne le **relit jamais** :
  aperçus et lectures l'affichent masqué (« FR76 •••• 1234 »). L'interdiction de lecture des
  coordonnées bancaires de la spec 081 reste entière.
- **Actions financières** (tranché le 21 novembre 2026) : l'exclusion « aucune action
  financière » de la spec 081 est levée **pour la billetterie seulement** (lot 3). La comptabilité
  et la trésorerie de l'église restent exclues.
- **Ordre de livraison** : proposition lot 1 + lot 2, puis lot 3, puis lot 4, en une seule
  release (décision du 21 novembre 2026 : la release v1.38.0 attend ces actions).
