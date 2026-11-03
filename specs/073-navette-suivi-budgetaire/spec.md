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
  - corrigent ou suppriment **leurs propres** lignes pendant 48 heures ;
  - demandent le remboursement de **leurs propres** avances personnelles.
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
- **Justificatif obligatoire**, au choix :
  - **une photo** prise sur le moment avec le téléphone ;
  - **un document** déjà existant : scan, PDF reçu par email, image de la galerie, sur téléphone
    comme sur ordinateur.
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
  d'un membre. Son auteur peut en **demander le remboursement** depuis la ligne (voir « Lien avec
  la comptabilité »).

Une sortie est **prise en compte dès sa déclaration**. Il n'y a ni approbation ni refus : le
registre trace, il n'autorise pas.

**Lien avec une location** : une sortie ou une restitution peut être rattachée à une **location**
de véhicule, définie par le loueur, le véhicule, la date de début et la date de fin. Le coût de
chaque location se lit alors d'un coup d'œil, et une caution versée se rapproche de sa
restitution.

### Lien avec la comptabilité

Le registre et le circuit habituel de la comptabilité (notes de frais, avances de budget) restent
distincts, mais se rejoignent sur trois points pour éviter toute double saisie.

**A. Remboursement d'une avance personnelle**

- **Demande depuis la ligne** : sur une dépense cochée « avance personnelle », son **auteur**
  peut cliquer « Demander le remboursement ». Une **note de frais** est alors créée dans la
  comptabilité :
  - déjà remplie avec le montant, le type, la date et le fournisseur ;
  - avec le **même justificatif** ;
  - rattachée au département Navette ;
  - au nom de l'auteur.
- **Ouvert à toute l'équipe** : ce bouton est disponible pour tout membre de l'équipe navette, y
  compris un STAR qui ne peut pas faire de note de frais ailleurs. Il ne sert qu'à **ses propres**
  dépenses navette.
- **Circuit habituel** : la note de frais suit le circuit de la comptabilité (traitement,
  validation ou rejet, versement). Le demandeur reçoit les notifications habituelles.
- **Suivi sur la ligne** : la ligne affiche l'état de la demande :
  - **Demandé** ;
  - **En cours** ;
  - **Validé** ;
  - **Rejeté**, avec son motif ;
  - **Remboursé**, totalement ou partiellement, avec le montant versé.
- **Une seule demande en cours par ligne**. Tant qu'elle est en attente, l'auteur peut
  l'**annuler** depuis la ligne. Si elle est rejetée, il peut en refaire une.
- **Ligne figée** : dès que le remboursement est demandé, le membre ne peut plus modifier ni
  supprimer la ligne, même dans les 48 heures. La compta le peut toujours.
- **Solde inchangé** : le remboursement n'affecte pas le solde de la navette. La dépense a déjà
  été comptée une fois, à sa déclaration.

**B. Avances de budget versées à la Navette**

- **Entrée automatique** : quand la compta verse une **avance de budget** demandée pour le
  département Navette, chaque versement apparaît **automatiquement** dans le registre. Il prend la
  forme d'une entrée « Avance de budget versée », à la date et au montant réellement versés.
- **Pas de double saisie** : la compta n'a pas d'abondement à ressaisir.
- **Lien vers la demande** : la ligne renvoie à la demande d'origine. Elle ne se modifie pas
  depuis le registre ; une correction se fait dans la comptabilité, et le registre suit.
- **Versements partiels** : chaque versement apparaît séparément.

**C. Notes de frais de la Navette hors du registre**

- **Repérage** : une note de frais du département Navette faite **directement** dans la
  comptabilité, sans passer par le registre, n'y figure pas.
- **Rattrapage** : la compta voit la liste de ces notes de frais et peut, d'un geste, les
  **ajouter au registre** comme dépense, avec le justificatif repris.
- **But** : aucune dépense de la navette n'échappe au suivi du budget.

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
- [ ] Le justificatif peut aussi être un document existant (PDF ou image), choisi depuis un
  téléphone ou un ordinateur.
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
- [ ] L'auteur d'une dépense « avance personnelle », même STAR, en demande le remboursement depuis
  la ligne. La note de frais créée reprend le montant et le justificatif, et suit le circuit
  habituel.
- [ ] La ligne affiche l'état de la demande de remboursement. Elle n'est plus modifiable par le
  membre une fois la demande faite, et le solde de la navette ne change pas au remboursement.
- [ ] Un versement d'avance de budget pour le département Navette apparaît comme une entrée du
  registre, sans saisie par la compta, au montant réellement versé.
- [ ] Une note de frais de la Navette faite hors du registre est listée pour la compta, qui peut
  l'ajouter au registre en un geste.

## Hors périmètre

- Approbation ou refus des dépenses.
- Traitement des notes de frais et des avances (validation, versement) : il reste dans le circuit
  habituel de la comptabilité. Le registre ne fait que s'y relier.
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
