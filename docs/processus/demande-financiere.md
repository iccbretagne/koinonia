# Demande financière

## En une phrase

Se faire rembourser une dépense déjà engagée, ou obtenir l'argent avant de dépenser, avec un justificatif attaché et un plan de paiement que chacun peut suivre.

Remplace l'avance de poche qu'on finit par oublier de réclamer, et le tableur de remboursements que personne ne tient à jour.

## Le déclencheur

Une dépense est nécessaire, ou vient d'être faite. Le responsable ouvre **Demandes → Mes demandes → Nouvelle demande → Demande comptable**, ou directement **Demandes → Comptabilité → Nouvelle demande**. Le dépôt est ouvert aux Ministres, aux responsables de département, à Admin et Super Admin.

Il choisit d'abord le **type**, qui détermine tout le reste :

| Type | Quand l'utiliser |
|---|---|
| Note de frais | La dépense a déjà été effectuée |
| Avance one-shot | Une dépense à venir, ponctuelle |
| Avance récurrente | Un virement régulier, planifié à l'avance |

Puis il renseigne le **département** concerné — facultatif pour une note de frais personnelle, obligatoire pour une avance récurrente —, un **intitulé**, le **montant TTC**, une description si nécessaire, et les **pièces jointes** : reçu, facture ou devis, au format JPEG, PNG ou PDF, jusqu'à 5 Mo.

## Qui intervient

Le demandeur, et le comptable (rôle Comptable, ou Admin et Super Admin). C'est le circuit le plus court de l'application : un seul guichet, une seule décision. Ministres et responsables de département consultent les demandes de leur périmètre ; la Secrétaire voit les statistiques, sans traiter.

## Les étapes et leurs statuts

> En attente → En traitement → Validée (ou Rejetée, ou Annulée)

Le comptable **prend en charge** la demande, ce qui la fait passer en traitement et signale au demandeur qu'elle est regardée.

**À la validation**, le comptable construit un **plan de paiement** : une ou plusieurs tranches, chacune avec un montant et une date prévue. Une avance récurrente s'étale naturellement ; une dépense importante peut aussi être découpée.

Chaque tranche est ensuite confirmée au moment où l'argent est effectivement remis. Le compteur *Remis / Total* progresse, et la demande reste signalée « paiements à confirmer » tant que le plan n'est pas soldé. C'est la somme de ces tranches en attente qui alimente l'indicateur **Paiements dus**.

Une demande n'est donc réellement terminée qu'une fois la dernière tranche remise — pas au moment de la validation.

## Où ça se passe

| Pour… | Aller à… |
|---|---|
| Déposer une demande | Demandes → Mes demandes → Nouvelle demande, ou Demandes → Comptabilité |
| Suivre ses propres demandes | Demandes → **Comptabilité** (ou le bouton *Demandes comptables* de « Mes demandes ») |
| Traiter, valider et payer | Demandes → **Comptabilité** |
| Mesurer | Comptabilité, onglet **Statistiques** |

L'écran de traitement affiche les compteurs en tête — en attente, en traitement, validées, rejetées, paiements dus — puis la file à traiter, et enfin la liste complète filtrable par statut et par type, avec le total engagé.

## Les règles à connaître

- Le montant se saisit **TTC**.
- Une note de frais sans justificatif est difficilement défendable : la pièce jointe n'est pas techniquement obligatoire, mais elle conditionne l'instruction.
- Une note de frais **personnelle** peut se passer de département. Une dépense au nom d'un département doit le désigner, car c'est ce qui alimente les statistiques par département.
- La marque **Urgent** remonte la demande dans la file. Elle perd tout effet si tout le monde l'utilise.
- Les deux types d'avance apparaissent sous le libellé unique **Avance de budget** dans les listes de suivi.

## Les cas particuliers

**Un rejet.** Le comptable motive sa décision, le motif est obligatoire. La demande reste consultable avec son motif, et son auteur peut la **corriger et la resoumettre** : une nouvelle demande naît, reliée à la première.

**Une annulation.** Le demandeur peut annuler sa demande tant qu'elle n'a pas été prise en charge — par exemple si la dépense n'a finalement pas lieu. Ensuite, c'est au comptable de la rejeter.

**Un plan de paiement qui traîne.** Une demande validée dont les tranches ne sont pas confirmées reste visible dans les paiements dus. C'est volontaire : rien ne disparaît tant que l'argent n'est pas sorti.

## Ce qui sort à la fin

- La dépense est remboursée ou avancée, avec la trace de qui a demandé, qui a validé, et quand chaque tranche a été remise.
- Le justificatif reste attaché à la demande.
- Le montant vient alimenter les statistiques et le total engagé de son département.
