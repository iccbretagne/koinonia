# Spec — Navette : suivi budgétaire déclaratif

- **Numéro** : 073
- **Statut** : Validée
- **Créée le** : 2026-11-03
- **Branche suggérée** : `feat/navette-suivi-budgetaire`
- **Issue** : [#707](https://github.com/iccbretagne/koinonia/issues/707)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La navette transporte les fidèles vers les cultes. Elle loue surtout des vans au Super U, plus
rarement ailleurs ou avec un véhicule personnel. Elle dépense de l'argent que la comptabilité lui
remet **au fil de l'eau** : d'un dimanche à l'autre, selon les moyens de l'église, la compta lui
alloue un montant, ou rien.

Aujourd'hui, les justificatifs arrivent à la compta de façon dispersée : photos de tickets sur
WhatsApp, montants donnés de vive voix, cautions dont on ne sait plus si elles ont été rendues.
Le comptable ne sait jamais, à un instant donné :
- combien la navette a reçu ;
- combien elle a dépensé, et en quoi ;
- ce qu'il lui reste.

Le circuit actuel de la comptabilité (demandes, validation, paiement, avances, remboursements)
ne répond pas à ce besoin. Il autorise des dépenses **à venir**, alors qu'il faut ici **tracer
des dépenses déjà faites** et suivre un **solde**.

La fonctionnalité est un **complément de la comptabilité** propre à la navette. Une instance
qui n'en a pas besoin peut la **désactiver**.

## Utilisateurs concernés

- **Comptable**, **Admin**, **Super Admin** (gestionnaires de la comptabilité de l'église) :
  - saisissent les abondements et le solde de départ ;
  - voient tout le registre ;
  - corrigent ou suppriment n'importe quelle ligne à tout moment ;
  - signalent une ligne douteuse ;
  - exportent.
- **Membres de l'équipe navette**, c'est-à-dire tout membre ou responsable d'un département dont
  la fonction est « Navette », quel que soit son rôle (STAR, Resp. département, Ministre) :
  - déclarent des dépenses et des restitutions de caution ;
  - voient le solde et tout le registre ;
  - corrigent ou suppriment **leurs propres** lignes pendant 48 heures.
- **Tous les autres rôles**, dont le Secrétaire : aucun accès, sauf s'ils appartiennent à l'équipe
  navette.

## Comportement attendu

### Le registre

La navette dispose d'un **registre unique et continu**, sans période imposée, qui ressemble à un
relevé de compte. Chaque ligne est soit une **entrée**, soit une **sortie** d'argent, datée.

**Entrées** :
- **Solde de départ** : saisi une seule fois par la compta au lancement, pour reprendre l'état
  actuel du budget. C'est la première ligne du registre.
- **Abondement** : argent remis par l'église. Saisi par la compta, avec la date, le montant, le
  mode (virement, espèces, carte de l'église, chèque), un commentaire et un justificatif
  facultatifs.
- **Caution restituée** ou **remboursement du loueur** : saisi par la navette ou par la compta,
  avec un justificatif.

**Sorties**, déclarées par la navette :
- **Champs** : la date, le montant, le **type**, le fournisseur et un commentaire facultatif.
- **Fournisseur** : « Super U Location » est proposé par défaut, et tout autre fournisseur peut
  être saisi librement.
- **Justificatif obligatoire** : une photo prise depuis le téléphone, ou un fichier image ou PDF.
- **Types** :

  | Type | Précisions |
  |---|---|
  | Carburant | litres facultatifs |
  | Frais kilométriques | montant déclaré, kilomètres facultatifs ; aucun barème appliqué |
  | Location de véhicule | |
  | Caution versée | reste « en cours » tant qu'elle n'est pas restituée |
  | Péage, parking | |
  | Nettoyage, lavage | |
  | Franchise, sinistre, amende | |
  | Assurance | |
  | Autre | libellé obligatoire |

- **Avance personnelle** : une case indique que la dépense a été réglée avec l'argent personnel
  d'un membre. Elle est **seulement signalée**. Le remboursement suit le circuit habituel de la
  comptabilité, en dehors de ce registre.

Une sortie est **prise en compte dès sa déclaration**. Il n'y a ni approbation ni refus : le
registre trace, il n'autorise pas.

**Lien avec une location** : une sortie ou une restitution peut être rattachée à une **location**
de véhicule, définie par le loueur, le véhicule, la date de début et la date de fin. Le coût de
chaque location se lit alors d'un coup d'œil, et une caution versée se rapproche de sa
restitution.

### Corrections et traçabilité

- **Auteur d'une ligne** : il peut la corriger ou la supprimer pendant **48 heures** après sa
  création. Passé ce délai, la ligne est figée pour lui.
- **Compta** : elle peut corriger ou supprimer **n'importe quelle ligne, à tout moment**.
- **Historique** : chaque création, modification ou suppression est conservée (qui, quand, et
  les valeurs avant et après). Une ligne supprimée reste visible dans cet historique.
- **Notification de la compta** : elle est prévenue de **chaque** création, modification ou
  suppression faite par la navette.
- **Signalement** : la compta peut signaler une ligne, par exemple « justificatif illisible » ou
  « montant à vérifier ». Ce n'est pas un refus, la ligne reste comptée. Le signalement est
  visible par la navette, et son auteur est prévenu. La compta lève le signalement une fois le
  point réglé.

### Tableau de suivi

- **Solde à date**, toujours affiché en tête : total des entrées moins total des sorties,
  depuis le solde de départ.
- **Sélecteur de période** : depuis le début, ce mois, le mois dernier, les trois derniers mois,
  ou d'une date à une autre. Sur la période choisie :
  - total des entrées ;
  - total des sorties ;
  - écart ;
  - solde en début et en fin de période.
- **Relevé chronologique** des lignes de la période :
  - le **solde courant** après chaque ligne ;
  - le justificatif ouvrable d'un geste ;
  - des filtres par type, auteur, location et lignes signalées.
- **Répartitions** des sorties de la période par type, par mois et par location.
- **Cautions en cours** : cautions versées et pas encore restituées, avec leur ancienneté.
- **Alerte de solde bas** : la compta et les responsables de la navette sont prévenus quand le
  solde passe sous un seuil réglable par la compta, pour préparer le prochain abondement.
- **Export** de la période (tableur) et de ses justificatifs, regroupés en un seul fichier.

### Activation

La fonctionnalité peut être **activée ou désactivée pour l'instance**. Désactivée, elle
disparaît entièrement : aucun menu, aucun écran, aucune notification. Les données déjà
saisies sont conservées et réapparaissent à la réactivation.

Le reste de la comptabilité n'est pas touché.

### Scénario principal

1. Au lancement, la comptable saisit le **solde de départ** de la navette : 120 € restant à date.
2. Dimanche, la comptable remet 200 € à la navette et saisit l'**abondement**. Le solde passe à
   320 €.
3. Samedi suivant, un membre de la navette loue un van au Super U. Depuis son téléphone, il
   crée la location et déclare :
   - la **location** (85 €) ;
   - la **caution versée** (300 €) ;

   avec, chaque fois, une photo du ticket. Le solde passe à -65 €, et la caution apparaît
   « en cours ».
4. La comptable reçoit une notification pour chaque déclaration. Elle voit que le solde est
   négatif : l'alerte de solde bas est partie.
5. Dimanche, le membre fait le plein (62 €) et le déclare. Le lundi, Super U restitue la caution :
   il déclare la **caution restituée** (300 €) avec le reçu. La caution n'est plus « en cours »,
   et le solde remonte à 173 €.
6. En fin de mois, la comptable choisit « ce mois », le solde de départ ayant été daté du mois
   précédent. Elle lit :
   - un solde de début de période de 120 € ;
   - 500 € d'entrées : l'abondement de 200 € et la caution restituée de 300 € ;
   - 447 € de sorties : la location (85 €), la caution (300 €) et le carburant (62 €) ;
   - un solde de fin de période de 173 €.

   Elle exporte la période et ses justificatifs.

### Scénarios alternatifs / cas limites

- **Déclaration sans justificatif** : l'enregistrement est impossible, et un message demande
  d'en joindre un.
- **Erreur de montant découverte le lendemain** : l'auteur corrige sa ligne. Le solde est
  recalculé, la compta est notifiée et l'historique garde l'ancien montant.
- **Erreur découverte après 48 heures** : l'auteur ne peut plus modifier la ligne. Il le
  demande à la compta, qui la corrige.
- **Membre qui quitte l'équipe navette** : il perd l'accès au registre. Ses lignes restent
  inchangées.
- **Ligne datée dans le passé**, par exemple un ticket oublié : elle se place à sa date dans le
  relevé, et les soldes courants qui suivent sont recalculés.
- **Solde négatif** : il est permis et affiché comme tel (dépenses avancées avant
  l'abondement). L'alerte de solde bas se déclenche.
- **Caution versée jamais restituée**, par exemple retenue pour un dommage : la compta la
  marque « non restituée ». Elle sort alors des cautions en cours, avec un commentaire.
- **Église sans département « Navette »** : personne ne voit le registre, à part la compta, qui
  voit un registre vide.
- **Personne de plusieurs églises** : elle ne voit que le registre de l'église dans laquelle
  elle travaille.

## Critères d'acceptation

- [ ] La compta saisit le solde de départ, puis un abondement. Le solde à date se met à jour
  immédiatement.
- [ ] Un membre de la navette déclare une dépense depuis son téléphone, avec la photo du
  justificatif. Elle compte aussitôt, sans validation.
- [ ] Une sortie sans justificatif ne peut pas être enregistrée.
- [ ] Pour n'importe quelle période, le tableau donne les entrées, les sorties, l'écart, les
  soldes de début et de fin, et le solde à date.
- [ ] Le relevé affiche le solde courant après chaque ligne. Il est recalculé quand une ligne est
  ajoutée, corrigée, supprimée ou antidatée.
- [ ] L'auteur corrige ou supprime sa ligne pendant 48 heures, et plus après. La compta le peut
  à tout moment.
- [ ] Toute création, modification ou suppression par la navette notifie la compta et figure
  dans l'historique, avec les valeurs avant et après.
- [ ] Une ligne signalée par la compta reste comptée, et le signalement est visible par la
  navette.
- [ ] Les cautions versées et non restituées sont listées. Elles en sortent à leur restitution,
  ou quand la compta les marque « non restituée ».
- [ ] L'alerte de solde bas part quand le solde franchit le seuil.
- [ ] Une personne hors navette et hors compta n'a aucun accès, y compris par appel direct.
- [ ] L'export d'une période contient ses lignes et ses justificatifs.
- [ ] Désactivée, la fonctionnalité n'apparaît nulle part. Réactivée, les données sont
  intactes.
- [ ] Le registre d'une église n'est jamais visible depuis une autre église.

## Hors périmètre

- Approbation ou refus des dépenses.
- Avances et remboursements aux membres : circuit habituel de la comptabilité.
- Barème kilométrique et toute notion fiscale.
- Réservation des véhicules auprès du loueur, planification des trajets et des chauffeurs.
- Rapprochement bancaire automatique.
- Budget par période ou plafond de dépenses.
- Registres pour d'autres départements que la navette. Le besoin pourra s'étendre plus tard.

## Questions ouvertes

Décisions prises sur la base des réponses à l'issue #707, à revoir en recette si besoin :

- la compta notifiée est celle de l'église : les Comptables, et, à défaut, les Admins. Elle
  reçoit une notification dans l'application, et un email selon ses préférences de
  notification ;
- les **responsables** de la navette (chef et adjoints du département) reçoivent l'alerte de
  solde bas, les simples membres non ;
- la restitution de caution peut être saisie par la navette comme par la compta ;
- le seuil d'alerte de solde bas est désactivé tant que la compta ne l'a pas réglé.
