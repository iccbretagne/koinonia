# Spec — Justificatifs après la remise des fonds

- **Numéro** : 078
- **Statut** : Validée
- **Créée le** : 2026-11-08
- **Branche suggérée** : `feat/justificatifs-apres-remise`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Une **avance de budget** suit aujourd'hui le chemin suivant : un responsable dépose sa demande
avec un devis, la compta la valide et construit un plan de paiement, puis confirme chaque
tranche au moment où l'argent est remis. Dès la dernière tranche remise, la demande est
considérée comme **terminée**.

Or c'est précisément là que commence le travail de la compta : l'achat a lieu **après**, et
la facture doit revenir. Aujourd'hui, rien ne la réclame. La compta relance à la main, par
message, sans liste fiable de ce qui manque. Quand l'achat coûte moins que l'avance, la
différence n'est suivie nulle part ; quand il coûte plus, le complément se règle au cas par
cas. Les statistiques comptent l'avance versée, pas ce qui a réellement été dépensé, ce qui
fausse le rapprochement entre l'argent sorti et les factures.

Le même trou existe pour une **note de frais payée sans pièce jointe** : la pièce n'est pas
obligatoire au dépôt, et une fois payée, plus rien ne la réclame.

Cette fonctionnalité ajoute, après la remise des fonds, une étape de **justification** :
justificatifs attendus, relances automatiques, montant réellement dépensé, reliquat à rendre ou
complément à demander, jusqu'à ce que la demande soit **soldée**.

La **navette** (spec 073) n'est pas concernée : chaque dépense de son registre exige son
justificatif au moment où elle est déclarée, et les avances versées au département Navette
sont justifiées par ce registre.

## Utilisateurs concernés

- **Demandeur** (Ministre, Resp. département, Admin, Super Admin — ceux qui déposent des
  demandes comptables) :
  - voit, sur chacune de ses demandes concernées, qu'il doit fournir ses justificatifs et pour
    quand ;
  - dépose ses factures et indique le montant réellement dépensé, en une ou plusieurs fois ;
  - voit le reliquat qu'il doit rendre, ou demande le complément par une note de frais liée ;
  - reçoit les relances tant que la justification n'est pas faite.
- **Comptable** (et Admin, Super Admin, qui traitent les demandes) :
  - voit la liste des demandes en attente de justificatifs, en retard ou non, avec le
    reliquat attendu ;
  - vérifie les justificatifs déposés : les accepte, ou les renvoie avec un motif ;
  - confirme la restitution d'un reliquat, en indiquant le compte de trésorerie où l'argent
    est rendu, s'il l'est en espèces ou sur un compte suivi ;
  - peut dispenser une demande de justificatif, avec un motif (facture perdue, achat sans
    reçu…) ;
  - règle les délais de relance pour son église.
- **Ministre, Resp. département** qui consultent les demandes de leur périmètre : voient l'état
  de justification de ces demandes, sans agir à la place du demandeur ; sont prévenus quand une
  demande de leur département reste en retard après la troisième relance.
- **Secrétaire** : voit les statistiques comptables, enrichies du suivi de l'argent versé ;
  aucun geste nouveau.
- **STAR, Faiseur de Disciples, Reporter, Référent soins pastoraux** : non concernés, sauf un
  STAR auteur d'une note de frais issue de la navette, qui n'est pas relancé (voir hors
  périmètre).

## Comportement attendu

### Scénario principal — une avance justifiée avec un reliquat

1. Le responsable Louange dépose une avance de budget de 300 € pour du matériel, avec le devis.
2. La compta la valide et remet les 300 € en une tranche le 3 mars.
3. La demande passe à **« Justificatifs attendus »**, avec une date limite : 7 jours après la
   remise, soit le 10 mars. Le demandeur en est prévenu.
4. Le 10 mars, rien n'a été déposé : le demandeur reçoit une **relance**. Il en reçoit une
   chaque semaine tant que la justification n'est pas faite. La compta voit la demande dans
   la liste « En retard ».
5. Le 12 mars, le demandeur dépose ses deux factures et indique un **montant dépensé de
   268,40 €**. La demande affiche un **reliquat à rendre de 31,60 €** et passe à
   **« À vérifier »** ; les relances s'arrêtent.
6. La compta ouvre les factures, les **accepte**, puis confirme le **retour des 31,60 €** en
   espèces, **rendus sur** la caisse de l'église.
7. La demande est **soldée**. Le registre de la trésorerie montre l'entrée de 31,60 € dans la
   caisse, rattachée à la demande. Dans les statistiques du département Louange, les 300 €
   versés en mars se répartissent en **268,40 € justifiés** et **31,60 € rendus**.

### Scénarios alternatifs / cas limites

- **Montant dépensé égal au montant remis** : pas de reliquat ; la demande est soldée dès que
  la compta accepte les justificatifs.
- **Achat plus cher que l'avance** (350 € dépensés pour 300 € remis) : la demande indique un
  **complément de 50 €** et propose au demandeur de créer une **note de frais liée** à
  l'avance, préremplie (montant, département, intitulé, justificatifs). Cette note suit le
  circuit habituel de validation. L'avance est soldée quand ses justificatifs sont acceptés ;
  la note de frais liée vit sa propre vie et reste visible depuis l'avance.
- **Justificatifs en plusieurs fois** : le demandeur peut déposer une première facture, puis
  une autre plus tard. Il ne déclare la justification terminée qu'avec le **montant total
  dépensé** ; les relances continuent jusque-là.
- **Justificatifs refusés** (illisibles, incomplets, sans rapport) : la compta les renvoie avec
  un **motif obligatoire**. La demande revient à « Justificatifs attendus », le demandeur est
  prévenu avec le motif, et les relances reprennent au rythme réglé.
- **Facture perdue ou achat sans reçu** : la compta peut **dispenser** la demande de
  justificatif, avec un motif obligatoire et le montant retenu comme dépensé. La dispense est
  tracée.
- **Achat finalement non réalisé** : le demandeur indique 0 € dépensé ; tout le montant remis
  devient reliquat à rendre.
- **Reliquat rendu autrement qu'en espèces** (virement vers le compte commun, non suivi par la
  trésorerie) : la compta confirme la restitution sans compte de trésorerie ; aucune écriture
  en trésorerie.
- **Reliquat pas encore rendu** : la demande reste « Reliquat à rendre » et figure dans la
  liste de la compta ; le demandeur reçoit les relances au même rythme, avec le montant à
  rendre.
- **Mois de trésorerie clôturé** : la restitution ne peut pas être datée d'un mois clôturé de
  la trésorerie ; la compta choisit une date dans un mois ouvert.
- **Plan de paiement en plusieurs tranches** : la justification n'est attendue qu'après la
  **dernière** tranche remise ; le délai court à partir de cette date.
- **Note de frais payée avec sa pièce jointe** : rien ne change, elle est soldée au paiement.
- **Note de frais payée sans pièce jointe** : elle passe à « Justificatifs attendus » au
  dernier paiement, comme une avance ; le montant dépensé est celui de la note, sans reliquat
  ni complément possible.
- **Demande antérieure à la mise en service** : les demandes déjà entièrement payées avant la
  mise en service ne sont pas relancées rétroactivement.
- **Changement des délais** : il s'applique aux relances suivantes de toutes les demandes en
  cours ; il ne réécrit pas les relances déjà envoyées.
- **Avance récurrente** (virements réguliers planifiés, par exemple le budget mensuel d'un
  département) : la justification se fait **par mois**. Les tranches remises au cours d'un mois
  forment une période à justifier ; le délai court à partir de la dernière tranche remise ce
  mois-là. Chaque période a ses factures, son montant dépensé et son reliquat éventuel, et se
  solde séparément ; la série continue pendant ce temps.
- **Retard persistant** : à partir de la **troisième relance** sans justification, le
  responsable du département concerné (principal et adjoints) et le Ministre de son ministère
  sont aussi prévenus, une fois par relance. Une note de frais personnelle, sans département,
  ne remonte à personne d'autre : la compta la voit dans sa liste.
- **Demandeur qui n'a plus de compte actif dans l'église** : la demande reste dans la liste de
  la compta, qui peut dispenser ou relancer autrement ; aucune relance n'est envoyée dans le
  vide.

## Statistiques : suivi de l'argent versé

Les statistiques comptables gardent leurs indicateurs actuels (montant **demandé**, montant
**versé**, demandes par statut, retards de paiement), sans changer leur sens. Elles ajoutent un
bloc **« Suivi de l'argent versé »** fondé sur une règle unique : **chaque euro versé est rangé
dans une seule case**, et les cases s'additionnent exactement au montant versé.

| Case | Ce qu'elle contient |
|---|---|
| **Justifié** | Dépense couverte par des factures acceptées (ou retenue par une dispense), plafonnée au montant versé ; notes de frais payées avec leur pièce ; notes de frais liées à un dépassement |
| **Rendu** | Reliquats restitués |
| **À rendre** | Reliquats attendus, pas encore restitués |
| **À justifier** | Versements dont les factures ne sont pas encore acceptées (attendues ou à vérifier) |
| **Navette** | Avances versées au département Navette : leur justification est dans son registre |
| **Avant le suivi** | Versements antérieurs à la mise en service, jamais relancés |

**Versé = Justifié + Rendu + À rendre + À justifier + Navette + Avant le suivi.**

- Les montants sont rattachés au **mois où l'argent a été versé** : « en mars, 300 € versés,
  dont 268,40 € justifiés et 31,60 € rendus ». Une justification déposée en avril fait évoluer les
  cases de mars ; elle ne crée pas de montant en avril.
- Par **département**, la même égalité vaut ligne par ligne, avec le taux de justification
  (Justifié ÷ (Versé − Navette − Avant le suivi)).
- Une case vide n'est pas affichée ; chaque montant ouvre la liste des demandes qu'il contient.
- Un **dépassement** n'est jamais compté deux fois : l'avance compte au plus son montant versé en
  « Justifié », et la note de frais liée compte son propre versement.

## Critères d'acceptation

- [ ] Une avance de budget dont la dernière tranche est remise passe à « Justificatifs
  attendus », avec une date limite affichée (7 jours par défaut).
- [ ] Le demandeur est relancé à la date limite, puis chaque semaine, tant que la justification
  n'est pas déposée ; une seule relance par échéance, jamais en double.
- [ ] À partir de la troisième relance, le responsable du département (principal et adjoints)
  et le Ministre de son ministère sont aussi prévenus ; une note de frais personnelle ne remonte
  à personne.
- [ ] Une avance récurrente se justifie par mois : chaque mois de tranches remises forme une
  période avec ses factures, son montant dépensé, son reliquat et ses relances, soldée
  séparément.
- [ ] La compta règle pour son église le délai avant la première relance et l'intervalle entre
  deux relances.
- [ ] Le demandeur dépose une ou plusieurs factures et déclare le montant total dépensé ; la
  demande passe alors « À vérifier » et les relances s'arrêtent.
- [ ] Si le montant dépensé est inférieur au montant remis, le reliquat à rendre est affiché au
  demandeur et à la compta.
- [ ] Si le montant dépensé est supérieur, le demandeur peut créer une note de frais liée,
  préremplie avec le complément, qui suit le circuit de validation habituel et reste reliée à
  l'avance.
- [ ] La compta accepte les justificatifs, ou les renvoie avec un motif obligatoire, ce qui
  relance le cycle et prévient le demandeur.
- [ ] La compta confirme la restitution d'un reliquat, avec ou sans compte de trésorerie ; avec
  un compte, l'entrée apparaît dans le registre de la trésorerie, rattachée à la demande, et
  ne s'y modifie pas.
- [ ] Une restitution ne peut pas être datée d'un mois de trésorerie clôturé.
- [ ] La compta peut dispenser une demande de justificatif avec un motif et un montant retenu ;
  la dispense est tracée.
- [ ] Une demande est soldée quand ses justificatifs sont acceptés (ou dispensés) et son
  reliquat éventuel rendu ; elle disparaît alors de la liste à traiter.
- [ ] Une note de frais payée sans pièce jointe suit le même circuit ; une note payée avec sa
  pièce est soldée au paiement.
- [ ] La compta dispose d'une liste des demandes en attente de justification, avec les retards
  et les reliquats attendus en évidence.
- [ ] Les statistiques présentent le suivi de l'argent versé selon la règle ci-dessous, pour la
  période et par département, et l'égalité « versé = somme des cases » est toujours exacte.
- [ ] Les indicateurs existants (montant demandé, montant versé, taux de validation, retards de
  paiement) gardent exactement leur définition actuelle.
- [ ] Les avances versées au département Navette et les notes de frais issues de la navette ne
  sont jamais relancées.
- [ ] Les demandes entièrement payées avant la mise en service ne sont pas relancées.
- [ ] Chaque dépôt, acceptation, refus, dispense et restitution est inscrit dans l'historique.
- [ ] Un demandeur ne voit et ne justifie que ses propres demandes ; un Ministre ou Resp.
  département voit l'état de celles de son périmètre sans pouvoir agir ; une autre église ne
  voit rien.

## Hors périmètre

- La **navette** : ses dépenses sont justifiées à la déclaration ; ses abondements et les
  avances versées au département Navette sont justifiés par son registre.
- La lecture automatique des factures (montant, date) : le demandeur saisit le montant.
- Le contrôle de cohérence entre le devis et les factures, ligne à ligne.
- Le recouvrement forcé d'un reliquat non rendu (retenue sur une autre demande, etc.).
- Le suivi du compte bancaire commun : un reliquat rendu par virement est seulement confirmé.

## Questions ouvertes

Aucune. Tranché avec la compta le 8 novembre 2026 :
- navette exclue ; dépassement par une note de frais liée ; notes de frais payées sans pièce
  relancées ; reliquat en espèces « rendu sur » un compte de trésorerie ;
- première relance 7 jours après la remise, puis chaque semaine, délais réglables ;
- avances récurrentes justifiées par mois ;
- responsable du département et Ministre prévenus à partir de la troisième relance.
