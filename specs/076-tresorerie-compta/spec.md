# Spec — Trésorerie de l'église : registre des entrées et des sorties

- **Numéro** : 076
- **Statut** : Implémentée
- **Créée le** : 2026-11-04
- **Branche suggérée** : `feat/tresorerie`
- **Issue** : [#712](https://github.com/iccbretagne/koinonia/issues/712)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Dans Koinonia, la comptabilité suit aujourd'hui les **demandes financières** : notes de frais,
avances de budget, validations et paiements. La navette a son propre registre (spec 073), qui
suit un budget comme un relevé de compte.

Ce qui manque, c'est la **trésorerie de l'église elle-même** : ce qui entre et ce qui sort,
compte par compte, et le solde à tout moment. Les entrées sont surtout :
- les **dîmes** ;
- les **offrandes**, ordinaires ou **spéciales** (missions, construction, actions de grâce,
  prémices, soutien à une famille…) ;
- d'autres recettes ponctuelles (participation à un événement, remboursement reçu, don
  affecté…).

Elles arrivent sous plusieurs formes : **espèces** et **chèques** collectés au culte, **virements**,
**dons en ligne**, Wero…

La compta tient aujourd'hui cette trésorerie dans **une application à part**. Chaque mouvement
est donc saisi deux fois : une fois là-bas, et parfois une fois dans Koinonia (paiement d'une
note de frais, abondement de la navette). Les écarts et les oublis se multiplient, et personne
n'a de vue d'ensemble fiable.

On veut que la compta tienne **toute la trésorerie dans Koinonia** : un registre des entrées et
des sorties par compte, des soldes justes, et les mouvements déjà connus de Koinonia (paiements
de demandes, abondements de la navette) repris **sans ressaisie**.

C'est un **outil de la compta**, réservé à ses membres. Une instance qui n'en a pas besoin peut le
**désactiver**.

## Utilisateurs concernés

- **Comptable**, **Admin**, **Super Admin** : tiennent la trésorerie de l'église.
  - saisissent les entrées et les sorties ;
  - gèrent les comptes de trésorerie, les catégories et le budget prévisionnel ;
  - corrigent ou suppriment une ligne ;
  - clôturent un mois ;
  - exportent.
- **Tous les autres rôles**, Secrétaire compris : aucun accès. La trésorerie n'apparaît pas dans leur navigation.

## Comportement attendu

### Les comptes de trésorerie

Le compte bancaire de l'église est **commun à plusieurs églises** et tenu ailleurs : la
trésorerie de Koinonia **ne le suit pas**. Elle suit l'argent que l'église détient elle-même et
ce qu'elle remet au compte commun.

L'église tient un ou plusieurs **comptes de trésorerie**, chacun avec son propre solde, par
exemple :
- la **caisse** principale (espèces et chèques en attente de remise) ;
- un **coffre** ou une caisse annexe (événement, restauration) ;
- un compte de **paiement en ligne** ou Wero, s'il en existe un propre à l'église.

Pour chaque compte, la compta renseigne un **nom**, une **nature** (caisse, en ligne, autre) et
un **solde de départ** daté, qui reprend l'état actuel au lancement. Un compte qui ne sert plus
peut être **archivé** ; son historique reste consultable.

### Le registre

La trésorerie est un **registre continu** qui ressemble à un relevé de compte. Chaque ligne
porte :
- une **date** ;
- un **sens** : entrée ou sortie ;
- un **compte** ;
- une **catégorie** ;
- un **moyen** : espèces, chèque, virement, carte, en ligne, Wero, autre ;
- un **montant** ;
- un **libellé** et, si besoin, un **tiers** (fournisseur, organisme) ;
- un **justificatif** facultatif (photo ou document) ;
- l'**auteur** de la saisie.

Le registre affiche, pour chaque compte et pour tous les comptes ensemble :
- le **solde après chaque ligne** ;
- pour la période choisie : le **solde d'ouverture**, le **total des entrées**, le **total des
  sorties** et le **solde de clôture**.

### Catégories

**Entrées**, proposées par défaut et modifiables par l'église :
- Dîmes ;
- Offrandes ;
- Offrandes spéciales, chacune avec son **objet** (missions, construction, actions de grâce,
  prémices, soutien…), que la compta peut ajouter ;
- Dons affectés ;
- Recettes d'événements ;
- Remboursements reçus ;
- Autres recettes.

**Sorties**, proposées par défaut et modifiables :
- Remises au compte commun (dépôt des espèces et des chèques) ;
- Loyer et charges ;
- Énergie et fluides ;
- Matériel et équipement ;
- Missions et soutien ;
- Action sociale ;
- Reversements (fédération, siège…) ;
- Notes de frais et avances (reprises de la comptabilité) ;
- Navette (abondements, repris du registre de la navette) ;
- Autres dépenses.

Une catégorie déjà utilisée ne se supprime pas ; elle peut être **désactivée** pour les nouvelles
saisies.

### Saisir une collecte de culte

Après chaque culte, la compta enregistre la **collecte** en une seule
fois :
1. Elle choisit le **culte** (l'événement de l'agenda de l'église), ou une date libre.
2. Elle saisit, **par catégorie** (dîmes, offrandes, offrandes spéciales…) :
   - le montant total en **espèces** (sans le détail des billets et des pièces) ;
   - les **chèques**, un par un (montant, et numéro facultatif), ou leur total.
3. Elle indique les **deux personnes qui ont compté**, comme le veut l'usage.
4. Koinonia affiche le **total** par catégorie et par moyen, puis enregistre les lignes
   correspondantes dans la **caisse** (espèces et chèques en attente de remise).

### Remise au compte commun et transferts entre comptes

- **Remise au compte commun** : quand la compta dépose les espèces et les chèques sur le compte
  commun, elle enregistre une **sortie** de la caisse, catégorie « Remises au compte commun »,
  avec la date et la référence du bordereau de dépôt. Elle coche les chèques remis, pour savoir à
  tout moment **quels chèques sont encore en caisse**.
- **Transfert entre deux comptes de l'église** (de la caisse vers le coffre, par exemple) : les
  soldes des deux comptes bougent, le total de l'église ne change pas, et ce n'est **ni une
  recette ni une dépense**.

### Mouvements repris de Koinonia, sans ressaisie

Certains mouvements sont déjà connus de Koinonia. Ils apparaissent **automatiquement** dans le
registre, marqués comme repris, avec un lien vers leur origine :
- le **paiement** d'une note de frais ou d'une avance de budget **payé depuis un compte de
  trésorerie** (en espèces depuis la caisse, par exemple) : au moment où la compta l'enregistre
  comme payé, elle choisit le compte et la sortie apparaît ;
- l'**abondement** de la navette remis depuis un compte de trésorerie : c'est une sortie, sur le
  compte choisi.

Un paiement fait depuis le compte commun (virement) n'est pas un mouvement de la trésorerie de
l'église : il n'est pas repris.

Une ligne reprise ne se modifie qu'à son origine, pour qu'aucun écart n'apparaisse entre les deux.

### Corrections, historique et clôture

- La compta peut **corriger** ou **supprimer** une ligne. Chaque changement est conservé dans
  l'historique (avant, après, auteur, date) ; une ligne supprimée reste visible dans l'historique.
- **Clôture mensuelle** : une fois le mois vérifié, la compta le **clôture**. Ses lignes ne se
  modifient plus et ses soldes sont figés. Un Admin peut **rouvrir** un mois clôturé, avec un
  motif conservé dans l'historique.

### Budget prévisionnel

- Pour une **année**, la compta fixe un **budget** par catégorie : montant attendu pour chaque
  catégorie d'entrée, montant prévu pour chaque catégorie de sortie. Elle peut le répartir par
  mois, ou laisser Koinonia le répartir également.
- Le tableau de bord compare le **réalisé** au **budget**, par catégorie, pour le mois et depuis
  le début de l'année : montant, écart et pourcentage.
- Une catégorie de sortie qui dépasse son budget de l'année est **signalée**.
- Le budget d'une année se **reprend** de l'année précédente (montants budgétés ou réalisés), puis
  s'ajuste.

### Rapports et export

- **Tableau de bord** : solde de chaque compte, total de la trésorerie, entrées et sorties du
  mois, comparaison avec le mois précédent, avec le même mois de l'année précédente et avec le
  budget.
- **Par catégorie** : totaux des entrées et des sorties par catégorie, sur une période, avec le
  détail des offrandes spéciales par objet.
- **Par moyen** : part des espèces, des chèques et des autres moyens.
- **Export** : le registre de la période (avec soldes) et les totaux par catégorie, dans un
  classeur, avec les justificatifs.

### Scénarios alternatifs / cas limites

- **Saisie en double** : si une ligne a la même date, le même montant, le même compte et la même
  catégorie qu'une ligne existante, Koinonia demande confirmation avant d'enregistrer.
- **Solde négatif** : un solde de caisse négatif est signalé (une caisse ne peut pas l'être).
- **Mois clôturé** : une saisie datée d'un mois clôturé est refusée, avec un message clair.
- **Paiement d'une demande annulé ou corrigé** : la ligne reprise suit le changement.
- **Module navette désactivé** : aucune ligne de la navette n'est reprise.
- **Plusieurs églises** : chaque église a sa propre trésorerie ; un Comptable qui travaille pour
  deux églises ne voit que celle de l'église courante.
- **Justificatif** : photo ou document, de type vérifié, de taille limitée.

## Critères d'acceptation

- [ ] Seuls le Comptable, l'Admin et le Super Admin accèdent à la trésorerie ; elle n'apparaît
      pas dans la navigation des autres rôles, Secrétaire compris.
- [ ] La compta crée plusieurs comptes de trésorerie, chacun avec son solde de départ daté.
- [ ] Le registre affiche le solde après chaque ligne, par compte et pour tous les comptes.
- [ ] Pour une période, le registre affiche le solde d'ouverture, les entrées, les sorties et le
      solde de clôture, et ces montants se recoupent.
- [ ] Une collecte de culte, saisie par catégorie et par moyen avec ses deux compteurs, crée les
      lignes correspondantes dans la caisse.
- [ ] Une remise au compte commun sort de la caisse, avec sa référence, et les chèques remis ne
      figurent plus parmi les chèques en caisse.
- [ ] Un transfert entre deux comptes de l'église ne change pas le total et n'apparaît ni dans les
      recettes ni dans les dépenses.
- [ ] Le paiement d'une note de frais ou d'une avance payé depuis un compte de trésorerie apparaît
      automatiquement en sortie, sans ressaisie, et ne se modifie qu'à son origine ; un paiement
      par le compte commun n'est pas repris.
- [ ] Un abondement de la navette remis depuis un compte de trésorerie apparaît automatiquement en
      sortie.
- [ ] Toute correction ou suppression est conservée dans l'historique.
- [ ] Un mois clôturé ne se modifie plus ; sa réouverture par un Admin exige un motif.
- [ ] La compta fixe un budget annuel par catégorie, réparti par mois ; le tableau de bord
      compare réalisé et budget (montant, écart, pourcentage) et signale une catégorie de sortie
      qui dépasse son budget annuel.
- [ ] Le budget d'une année se reprend de l'année précédente.
- [ ] Les rapports par catégorie, par moyen et par mois se recoupent avec le registre.
- [ ] L'export contient le registre avec les soldes, les totaux par catégorie et les
      justificatifs.
- [ ] Les catégories sont modifiables par l'église ; une catégorie utilisée se désactive mais ne
      se supprime pas.
- [ ] Aucune donnée ne passe d'une église à une autre.
- [ ] Le module se désactive sans rien changer à la comptabilité existante (demandes, navette).

## Hors périmètre

- Le **compte bancaire commun** à plusieurs églises : ni son solde, ni ses mouvements, ni le
  rapprochement avec son relevé. Les remises de l'église vers ce compte sont, elles, suivies.
- **Dîmes nominatives** et **reçus fiscaux** par donateur : les entrées sont des montants globaux,
  sans nom de donateur.
- Reprise automatique des encaissements de la **billetterie** : ils restent suivis dans la
  billetterie ; la compta peut les saisir comme recette d'événement.
- **Import de l'historique** de l'application actuelle : on part d'un solde de départ par compte.
- Détail des billets et des pièces dans une collecte.
- **Comptabilité en partie double**, plan comptable officiel, bilan et compte de résultat
  réglementaires : on suit une trésorerie, pas une comptabilité générale.
- Encaissement en ligne par Koinonia : la page de dons reste une page d'information.
- Gestion de la paie et des déclarations sociales.

## Décisions

- Accès : Comptable, Admin, Super Admin ; aucun accès pour les autres rôles, Secrétaire compris.
- Pas de suivi du compte bancaire commun : caisse(s) et remises au compte commun seulement.
- Collecte : montant total en espèces par catégorie, chèques un par un.
- Budget prévisionnel annuel par catégorie inclus dès la première version.
- Hors première version : billetterie reprise, dîmes nominatives, import de l'historique.
