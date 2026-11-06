# Spec — Billetterie : inscriptions, paiements et présences des événements

- **Numéro** : 074
- **Statut** : Implémentée
- **Créée le** : 2026-11-03
- **Branche suggérée** : `feat/billetterie`
- **Issue** : [#708](https://github.com/iccbretagne/koinonia/issues/708)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Plusieurs fois par an, l'église organise des événements ouverts à un public large, au-delà des
cultes :
- la **Nuit de la traversée**, du 31 décembre au 1er janvier ;
- un concert, une soirée, une conférence…

Il faut alors :
- **inscrire** les gens, seuls, en famille ou en groupe ;
- **encaisser** ce qui est payant, le plus souvent les repas, parfois l'entrée ;
- **savoir à tout instant combien de personnes sont dans le bâtiment**, membres de service
  compris. C'est une **obligation réglementaire de sécurité** ;
- **organiser une équipe propre à l'événement** : postes, horaires, qui fait quoi ;
- **distribuer les repas** commandés et suivre le stock.

Aujourd'hui, tout cela se fait hors Koinonia : listes WhatsApp, tableaux, argent compté à la
main, comptage à l'entrée approximatif. L'église n'a pas d'identifiant associatif permettant
d'utiliser une plateforme de paiement en ligne. Son compte bancaire est commun à plusieurs
églises et ne peut pas servir aux encaissements locaux.

La billetterie est un **module complémentaire**, activable par église, **autonome et délégable** :
l'administration crée l'événement et en confie la conduite à une équipe dédiée.

> ⏰ **Échéance** : la Nuit de la traversée du 31/12. Les inscriptions doivent ouvrir début
> décembre : les lots 1 et 2 doivent être en production fin novembre, le lot 3 si possible.

## Utilisateurs concernés

**Au niveau de l'église**
- **Super Admin**, **Admin**, **Secrétaire** : créent un événement de billetterie et en nomment
  les organisateurs.

**Au niveau de chaque événement**, des rôles attribués à **n'importe quel compte de l'église**,
STAR compris, indépendamment de son rôle et de son département :

| Rôle d'événement | Peut |
|---|---|
| **Organisateur** | tout paramétrer, voir tous les tableaux, attribuer les rôles, constituer l'équipe |
| **Trésorier** | confirmer les paiements, encaisser, rembourser, exporter les règlements |
| **Accueil / sécurité** | contrôler les entrées et sorties, chercher un nom, voir le compteur, encaisser une entrée à régler ; ne voit pas les coordonnées |
| **Restauration** (Agapé) | composer le menu (plats, descriptions, allergènes, stock), distribuer ce qui est « à retirer sur place », encaisser sur place, gérer le stock, imprimer les étiquettes |
| **Observateur** | voir les tableaux de bord, sans rien modifier |

- Une personne peut cumuler plusieurs rôles.
- Ces rôles ne valent que pour cet événement et s'arrêtent à sa **clôture**.

**Public** : toute personne, avec ou sans compte Koinonia, s'inscrit, consulte et annule sa
réservation.

**Membres de l'équipe** : un STAR ou tout autre compte affecté à un poste voit son affectation et
dispose d'un badge personnel.

## Comportement attendu

### Lot 1 — Événement, inscriptions, paiements, billets

#### Paramétrage d'un événement

L'organisateur renseigne :
- **titre, description, affiche, lieu**, date et heure de début et de fin ;
- **date limite d'inscription** ;
- **jauge réglementaire** : nombre maximal de personnes dans le bâtiment, équipe comprise ;
- **places ouvertes à l'inscription**, inférieures à la jauge pour garder une marge pour l'équipe
  et les imprévus ;
- **tarifs par participant**, selon la tranche d'âge (adulte, 12–17 ans, enfant, moins de
  3 ans). Un tarif peut être gratuit ; l'événement entier peut être gratuit ;
- **options**, facultatives (voir plus bas) ;
- **questions supplémentaires** facultatives, par exemple les allergies ;
- **moyens de paiement** acceptés, avec leurs instructions (voir plus bas) ;
- **règles de paiement et d'annulation** (voir plus bas) ;
- **autorisation des mineurs non accompagnés** : désactivée par défaut.

L'événement passe par les états **brouillon**, **ouvert aux inscriptions**, **complet**,
**inscriptions closes** puis **clôturé**. Seul un événement ouvert accepte des inscriptions.

#### Options

Une option peut être, par exemple, un repas, un t-shirt ou une place dans la navette. Chacune a :
- un **type** :
  - **choix unique** parmi des variantes, comme le menu (poulet, poisson, végétarien) ;
  - **quantité** ;
  - **case à cocher** ;
- un **prix**, éventuellement gratuit ;
- un **stock** facultatif : l'option n'est plus proposée quand il est épuisé ;
- une **portée** : par participant ou par réservation ;
- un réglage **« à retirer sur place »** : elle apparaît alors à la distribution (lot 3) ;
- un réglage **remboursable** et une **date limite de remboursement**.

Un concert peut n'avoir **aucune** option.

**Groupes au choix unique** (ajout du 6 novembre 2026). L'organisateur peut ranger plusieurs
options dans un même **groupe**, par exemple « Repas » : repas adulte, repas enfant, plateau du
chef. L'inscrit n'en prend **qu'une** (ou aucune) par participant, ou pour la réservation ; le
formulaire les présente en boutons radio. Chaque option garde son prix, son stock et ses
réglages. Les options d'un groupe ont toutes la même portée, et on ne groupe pas des options
qu'un inscrit a déjà cumulées.

**Qui compose le menu.** Pour une option « à retirer sur place », comme un repas, l'équipe
**Restauration** compose le menu. Elle peut :
- ajouter, renommer et décrire les plats (variantes) ;
- indiquer les allergènes ;
- fixer le stock de chaque plat.

L'**organisateur** garde ce qui engage les inscrits : l'existence de l'option, son **prix**, la
**date limite de paiement** et les règles de **remboursement**.

Une fois les inscriptions ouvertes :
- un plat déjà réservé ne peut pas être supprimé. Il peut seulement être **fermé** aux nouvelles
  commandes ;
- le stock ne peut pas descendre sous le nombre déjà réservé ;
- chaque modification est inscrite dans l'historique de l'événement.

#### Inscription (page publique)

L'événement a une **adresse publique** à partager, par exemple sur WhatsApp, accessible sans
compte. Une personne connectée voit son nom pré-rempli.

1. Elle indique **combien de participants** et, pour chacun, son **prénom, son nom et sa tranche
   d'âge**.
2. Elle choisit les **options**, par participant ou pour la réservation.
3. Elle répond aux **questions** éventuelles.
4. Elle donne le **contact de la réservation** : nom, email et téléphone.
5. Elle voit le **récapitulatif** et le **total**, puis choisit un **moyen de paiement**.
6. Elle confirme. La réservation est **enregistrée**, et elle reçoit aussitôt par email :
   - le récapitulatif ;
   - **un billet nominatif par participant** ;
   - un **lien personnel** vers sa réservation ;
   - s'il y a un montant à régler, les **instructions de paiement**.

**Mineurs**
- Par défaut, une réservation qui comporte un mineur doit comporter **au moins un adulte**.
- Si l'organisateur autorise les mineurs non accompagnés, la réservation d'un mineur seul exige :
  - un **responsable légal** : nom et téléphone joignable pendant l'événement ;
  - une **autorisation** cochée par ce responsable.

**Limites**
- On ne peut pas réserver au-delà des places ouvertes ni du stock d'une option.
- Après la date limite, ou une fois l'événement complet, l'inscription est fermée avec un message
  clair.

#### Retrouver et gérer sa réservation

La plupart des inscrits n'ont **pas de compte Koinonia**. Leur réservation leur appartient
quand même, sans mot de passe.

- **Lien personnel** : l'email de confirmation contient un lien secret, impossible à deviner,
  vers **« Ma réservation »**. Il reste valable jusqu'à la clôture de l'événement.
- **Lien perdu** : sur la page publique de l'événement, « Retrouver ma réservation » demande
  l'email de la réservation et y renvoie le lien. Le message affiché est le même que l'email soit
  connu ou non, pour ne pas révéler qui est inscrit. Le nombre de demandes est limité.
- **Avec un compte** : si l'email de la réservation est celui d'un compte Koinonia, la
  réservation apparaît aussi dans « Mes réservations », sans passer par le lien.

Depuis « Ma réservation », le titulaire :
- voit le récapitulatif, ce qui est payé et ce qui reste à régler, avec la référence et les
  instructions de paiement ;
- **affiche ou transmet** chaque billet séparément, par lien ou par WhatsApp ;
- clique **« J'ai payé »** ;
- **modifie ses options** (changer de menu, en ajouter, en retirer) jusqu'à la **date limite de
  paiement des options**, dans la limite du stock. Une option déjà payée qu'il retire suit les
  règles de remboursement ;
- **ajoute un participant**, tant que l'inscription est ouverte et qu'il reste des places, avec
  les mêmes règles que l'inscription ;
- **corrige le nom** d'un participant, par exemple pour un billet transmis à quelqu'un d'autre,
  jusqu'au début de l'événement ;
- **met à jour son téléphone** ;
- **annule** un participant ou toute la réservation.

Chaque modification envoie un email récapitulatif. Les billets restent les mêmes, sauf ceux des
participants annulés.

Le lien d'un **billet individuel** ne donne accès qu'à ce billet : son porteur ne voit ni les
autres participants ni les paiements, et ne peut rien modifier.

#### Billets

- **Un billet par participant**, avec son nom et un code à scanner. Chaque billet a son propre
  lien, qu'on peut **transmettre séparément** : un participant qui arrive seul ou plus tard entre
  avec son billet.
- **Un code de réservation** regroupe tous les participants. Scanné à l'entrée, il affiche la
  liste des participants et permet d'en faire entrer **une partie seulement** (lot 2).
- **Billets émis tout de suite**, que la réservation soit payée ou non. Le comptage des personnes
  ne dépend jamais d'un paiement.

#### Paiements

**Moyens de paiement** : l'organisateur active, pour son événement, ceux qu'il accepte :

| Moyen | Instructions montrées au participant |
|---|---|
| **Wero** (moyen principal) | numéro de téléphone ou email du bénéficiaire, celui du trésorier de l'événement |
| **Revolut** | lien de paiement du bénéficiaire |
| **Virement** (facultatif) | IBAN **propre à l'événement**, saisi par l'organisateur ; jamais celui de l'église |
| **Espèces, chèque** | sur place, à l'accueil ou à la restauration |

**Référence et déclaration**
- Chaque réservation a une **référence unique et courte**, par exemple `NT26-0042`, à indiquer
  avec le paiement.
- Le participant clique **« J'ai payé »** et indique le moyen utilisé : le paiement passe à
  **déclaré**.

**Ce que le paiement porte**
- Seul ce qui est **payant** porte un état de paiement : l'**entrée** si l'événement est payant,
  et chaque **option payante**.
- États : **à régler**, **déclaré**, **payé**, **remboursé**.

**Le trésorier**
- Il voit les paiements **déclarés** et confirme ceux qu'il a reçus : ils passent à **payé**. Il
  peut aussi refuser une déclaration erronée, avec un motif ; le paiement repasse à régler et le
  participant est prévenu.
- Il **encaisse** un paiement reçu en direct (espèces, chèque) : moyen, montant et date.
- Un paiement partiel est possible, et le reste dû reste affiché.

**Date limite de paiement des repas et options**
- L'organisateur fixe une **date limite de paiement des options**. Il l'aligne en général sur la
  date de commande ou de préparation des repas.
- Avant cette date, une **relance** automatique part vers les réservations qui doivent encore
  quelque chose. L'organisateur règle ce délai (3 jours par défaut).
- À la date limite, les options **non réglées** (ni payées ni déclarées) sont **libérées** : elles
  sortent de la réservation, le stock est rendu, et le participant est prévenu.
- **Exception** : si l'organisateur autorise le **paiement sur place**, l'option reste réservée et
  s'affichera « à régler » au retrait.

**Entrée payante non réglée** : le billet reste valable. À l'entrée, le contrôle affiche « à
régler » et l'accueil encaisse.

#### Annulations et remboursements

- **Annulation libre**, à tout moment, par le participant (lien personnel) ou par l'organisateur.
  On peut annuler toute la réservation ou un seul participant. Les places et le stock sont rendus,
  et les billets annulés ne passent plus au contrôle.
- **Remboursement par élément payant**, selon ses réglages :
  - **remboursable et dans le délai** : une ligne **« à rembourser »** apparaît chez le trésorier.
    Il la marque **remboursée**, avec le moyen et la date ;
  - **non remboursable, ou hors délai** : l'annulation est acceptée, mais le participant est
    prévenu **avant de confirmer** qu'il ne sera pas remboursé.
- La **restauration** est prévenue de toute annulation qui touche une option « à retirer sur
  place ».

#### Emails

Envoyés au contact de la réservation, qui n'a souvent pas de compte :
- **réservation enregistrée** : billets, lien personnel, instructions de paiement ;
- **paiement confirmé**, ou **déclaration refusée** avec son motif ;
- **relance** avant la date limite de paiement des options ;
- **option libérée** faute de paiement ;
- **rappel la veille** : billets et informations pratiques ;
- **annulation**, avec la mention du remboursement ou de son absence.

L'équipe est prévenue dans Koinonia :
- le **trésorier**, d'un paiement déclaré à confirmer ;
- l'**organisateur**, quand les places restantes passent sous 10 %.

#### Tableaux

- **Organisateur** :
  - inscrits par tarif ;
  - places restantes ;
  - recettes encaissées, déclarées et attendues ;
  - comptage de chaque option, par variante.
- **Trésorier** : liste des réservations avec le dû, le déclaré, le payé et le reste ; filtres ;
  relance d'un geste ; export.
- **Export** : participants, règlements, remboursements, récapitulatif des options.

### Lot 2 — Équipe de l'événement et contrôle des présences

#### Équipe et postes

- L'organisateur crée les **postes** de l'événement, par exemple porte principale, sortie de
  secours, parking, vestiaire, restauration, louange ou coordination. Il peut ajouter des
  **créneaux horaires**, utiles pour une nuit entière.
- Il **affecte** n'importe quel membre de l'église à un poste et un créneau, quel que soit son
  département habituel. Les départements l'aident seulement à retrouver les personnes.
- Chaque personne affectée :
  - voit son affectation dans **« Mon planning »** : événement, poste, horaires ;
  - la reçoit par notification ;
  - dispose d'un **badge personnel** à scanner.
- Les **intervenants, prestataires et invités** sans compte sont ajoutés par nom, avec un badge
  imprimable.

Cette organisation est **propre à l'événement** : elle ne modifie pas le planning des
départements.

**Planning de l'équipe** (ajout du 6 novembre 2026). L'onglet Équipe présente les affectations
**par poste** : un bloc par poste avec le nombre de personnes, leurs horaires (ou « Tout
l'événement »), puis les personnes sans poste. L'organisateur peut **renommer** un poste et
**modifier** une affectation (poste, horaires) sans la recréer ; la personne en est prévenue.
Pour affecter quelqu'un, il **filtre par département** (départements dont la personne est
responsable ou membre par sa fiche STAR liée) et **cherche par nom**.

#### Contrôle des entrées et sorties

L'écran de contrôle sert à l'équipe d'accueil et de sécurité, sur téléphone.

- **Mode du téléphone**, choisi à l'ouverture : **Entrée** ou **Sortie** ; un mode
  **automatique** suffit pour une seule porte.
- **Scan** d'un billet, d'un code de réservation ou d'un badge, avec l'appareil photo. Le résultat
  s'affiche en grand :
  - **vert** : la personne est autorisée, avec son nom ;
  - **orange** : « déjà à l'intérieur », ou « entrée à régler : 10 € » ;
  - **rouge** : billet inconnu, annulé, ou d'un autre événement.
- **Code de réservation** : la liste des participants s'affiche, et l'agent coche ceux qui entrent
  maintenant.
- **Recherche par nom** pour qui n'a ni billet ni code.
- **Ajout sur place**, si l'organisateur l'autorise : inscription minimale et encaissement à la
  porte.
- **Compteur manuel** +1 / −1 pour les cas sans billet (secours, forces de l'ordre), avec un motif
  obligatoire.

**Fonctionnement sans réseau**
- Une salle pleine a souvent un réseau médiocre : le contrôle **continue de fonctionner sans
  réseau**.
- Il suffit d'avoir **ouvert l'écran une fois avec du réseau** avant l'événement.
- Les passages enregistrés hors ligne sont **transmis dès que le réseau revient**, sans doublon.
- Chaque téléphone affiche l'**heure de sa dernière mise à jour** et le **nombre de passages en
  attente d'envoi**. Un signal visible apparaît en cas de retard.
- Si deux téléphones hors ligne enregistrent la même personne, les deux passages sont gardés dans
  l'ordre chronologique et l'anomalie est signalée à la coordination, sans rien bloquer.

#### Compteur et jauge

- **Présents** = entrés − sortis, à tout instant, avec le détail :
  - participants ;
  - équipe ;
  - autres : intervenants, comptage manuel ;
  - dont mineurs.
- Le compteur est **commun à tous les téléphones** et à l'écran de l'organisateur.
- **Alerte de jauge** visible sur tous les écrans de contrôle et chez l'organisateur, à **90 %**
  puis à **100 %** de la jauge réglementaire.
- **Mineur non accompagné** : à sa sortie, le contrôle affiche « mineur : sortie à vérifier » et le
  numéro du responsable légal.
- **Registre** horodaté de tous les passages : qui, quand, quelle porte, quel agent. Il est
  **exportable** pour la sécurité.

### Lot 3 — Restauration (Agapé)

#### Distribution

L'écran de distribution sert à l'équipe de restauration, sur téléphone, et marche sans réseau
comme le contrôle.

- **Scan** d'un billet ou recherche par nom. La fiche affiche :
  - **ce que la personne a réservé** à retirer : plat et variante, quantités ;
  - l'**état du paiement** : payé, ou « à régler : 12 € » ;
  - ce qui a **déjà été remis**.
- **« Remis »** en un geste. Le **paiement sur place** (espèces, Wero) est enregistré dans le même
  geste.
- **Vente sur place** d'un repas restant à quelqu'un qui n'en avait pas réservé.

#### Stock

- La restauration saisit, par variante, le nombre de repas **préparés**.
- Par variante, l'écran affiche en direct :
  - **réservés** ;
  - **remis** ;
  - **restant à remettre** ;
  - **disponibles à la vente sur place**, c'est-à-dire préparés moins réservés et vendus.
- **Avant l'événement** : nombre de repas à préparer par variante, payés ou dus sur place, et
  allergies signalées.
- **Après l'événement** : repas non retirés et ventes sur place.

#### Étiquettes (préparation nominative)

Option par repas, **« Préparation nominative »**, activable par l'organisateur ou la
restauration. Elle sert quand les repas sont préparés en paquets au nom des personnes.

**Contenu d'une étiquette** (une par repas) :
- le nom du participant ;
- le plat ;
- les allergies signalées ;
- la référence de la réservation ;
- « à régler : 12 € » si le repas n'est pas encore payé ;
- un code facultatif qui ouvre la réservation sur l'écran de distribution. Ce code **ne permet
  pas d'entrer** : il est distinct du billet.

**Impression** sur planches d'étiquettes A4 standard, depuis le navigateur, sans logiciel. On
choisit :
- **le format** de la planche ;
- **l'ensemble à imprimer** :
  - tous les repas ;
  - un plat à la fois ;
  - les repas groupés par réservation, pour faire un sac par famille ;
  - seulement les étiquettes nouvelles ou modifiées depuis la dernière impression.

**Étiquette périmée.** Quand un inscrit change de plat ou annule après l'impression, l'écran de
distribution signale « étiquette à refaire ». La restauration peut réimprimer cette étiquette
seule.

### Données personnelles

- **Données minimales** :
  - nom et tranche d'âge par participant ;
  - contact de la seule réservation ;
  - réponses aux questions, comme les allergies, seulement si l'organisateur les pose ;
  - responsable légal, seulement pour un mineur non accompagné.
- L'**accueil** ne voit ni email, ni téléphone, ni montants, hormis un « à régler ».
- Une **mention d'information** figure sur la page d'inscription.
- Les données nominatives sont **supprimées après l'événement**, au terme d'une durée de
  conservation que l'organisateur peut raccourcir. Les **statistiques anonymes** sont gardées :
  inscrits, présents, recettes, repas.

### Scénario principal (Nuit de la traversée)

1. Le 1er décembre, la secrétaire crée l'événement « Nuit de la traversée 2026 » et nomme
   l'organisatrice.
2. L'organisatrice :
   - fixe la jauge à 400 et ouvre 340 places, avec une entrée gratuite ;
   - ajoute l'option « Repas » à 12 €, avec trois variantes, à retirer sur place, remboursable
     jusqu'au 24/12, et une date limite de paiement au 20/12 ;
   - active Wero, avec le numéro du trésorier, ainsi que les espèces et le chèque ;
   - nomme le trésorier, deux agents d'accueil et deux membres d'Agapé, puis ouvre les
     inscriptions.
3. Une mère inscrit sa famille de quatre personnes, choisit deux repas poulet et deux repas
   poisson, et règle 48 € par Wero en indiquant la référence `NT26-0042`. Elle clique « J'ai
   payé ». Elle reçoit quatre billets et transmet celui de son fils aîné, qui viendra plus tard.
4. Le trésorier voit les 48 € arriver sur son téléphone et confirme. La mère reçoit la
   confirmation.
5. Le 18/12, une relance part vers les réservations dont les repas ne sont pas réglés. Le 20/12,
   les repas toujours non réglés sont libérés. Agapé lit alors le nombre exact de repas à
   préparer par variante.
6. Le 31/12, les agents d'accueil ouvrent le contrôle avant l'ouverture des portes.
   - La mère scanne le code de réservation, et l'agent coche trois personnes.
   - Le fils aîné arrive à 23 h avec son billet.
   - Les STAR de service passent avec leur badge.
   - Le réseau tombe vingt minutes ; le contrôle continue, et les passages remontent au retour du
     réseau.
   - Le compteur atteint 362 présents, dont 41 en service. L'alerte des 90 % apparaît à 360.
7. À 1 h, la famille récupère ses repas à la restauration : un scan, puis « Remis ». Agapé voit le
   stock restant et vend trois repas sur place.
8. Après l'événement, l'organisatrice exporte le registre des passages, et le trésorier exporte
   les règlements.

### Scénarios alternatifs / cas limites

- **Paiement déclaré mais jamais reçu** : le trésorier refuse la déclaration avec un motif. Le
  paiement repasse à régler et le participant est prévenu.
- **Option non payée à la date limite** : elle est libérée, sauf si le paiement sur place est
  autorisé.
- **Annulation d'un participant d'une famille** : ses places et son option sont rendues, et ses
  billets ne passent plus. Les autres participants ne sont pas touchés.
- **Annulation hors délai de remboursement** : un message demande confirmation avant d'annuler sans
  remboursement.
- **Billet scanné deux fois à l'entrée sans sortie** : orange, « déjà à l'intérieur ». Il n'est
  pas compté deux fois.
- **Billet d'un autre événement**, ou billet annulé : rouge.
- **Réservation pleine** : une inscription qui dépasserait les places est refusée avant le
  paiement, avec un message clair.
- **Réservation d'un mineur seul sans autorisation** des mineurs non accompagnés : refusée, avec un
  message clair.
- **Rôle retiré pendant l'événement** : la personne perd immédiatement l'accès correspondant.
- **Module désactivé** : ni menu, ni page publique, ni écran de contrôle. Les données sont
  conservées.

## Critères d'acceptation

### Lot 1
- [ ] Un Admin, un Super Admin ou une Secrétaire crée un événement et nomme un organisateur. Un
  autre rôle ne le peut pas, même par appel direct.
- [ ] L'organisateur attribue les rôles trésorier, accueil, restauration et observateur à des
  comptes de l'église, STAR compris. Chacun n'accède qu'à ce que son rôle permet.
- [ ] Un concert gratuit sans option, une soirée gratuite avec repas payants et un événement à
  entrée payante se paramètrent tous.
- [ ] Le titulaire d'une réservation, sans compte, la retrouve par son lien personnel ou par
  « Retrouver ma réservation ». Il y modifie ses options avant la date limite, ajoute un
  participant, corrige un nom et annule. Le lien d'un billet seul ne permet rien de tout cela.
- [ ] « Retrouver ma réservation » affiche le même message que l'email soit connu ou non.
- [ ] Une personne sans compte inscrit quatre personnes, choisit leurs options et reçoit aussitôt
  quatre billets nominatifs, chacun transmissible séparément, ainsi que les instructions de
  paiement.
- [ ] On ne peut pas dépasser les places ouvertes ni le stock d'une option.
- [ ] Un mineur ne peut pas être inscrit sans adulte, sauf si l'organisateur l'autorise. Dans ce
  cas, un responsable légal et son autorisation sont exigés.
- [ ] « J'ai payé » passe le paiement à « déclaré ». Le trésorier le confirme ou le refuse avec un
  motif, et le participant est prévenu dans les deux cas.
- [ ] Le trésorier enregistre un paiement en espèces ou par chèque.
- [ ] La relance part avant la date limite. À la date limite, les options non réglées sont
  libérées, sauf si le paiement sur place est autorisé.
- [ ] L'annulation, totale ou d'un participant, rend les places et le stock. Elle crée une ligne
  « à rembourser » si l'élément est remboursable et dans le délai ; sinon, elle prévient avant de
  confirmer.
- [ ] Aucune donnée bancaire de l'église n'est proposée comme moyen de paiement.
- [ ] Les exports des participants, des règlements et des options sont disponibles.

### Lot 2
- [ ] L'organisateur crée des postes et des créneaux, et y affecte des membres de l'église de
  n'importe quel département. Chacun voit son affectation dans « Mon planning » et a un badge.
- [ ] Les membres d'une réservation entrent à des heures différentes, avec leur billet ou par le
  code de réservation, et le compteur reste exact.
- [ ] Un billet déjà à l'intérieur n'est pas compté deux fois, et un billet annulé ou d'un autre
  événement est refusé.
- [ ] Sans réseau, un téléphone de contrôle valide et enregistre les passages. Au retour du réseau,
  tout est transmis sans doublon et le compteur commun est exact.
- [ ] Les membres de l'équipe et les intervenants sont comptés dans les présents, séparément des
  participants.
- [ ] L'alerte de jauge apparaît à 90 % et à 100 % sur les écrans de contrôle et chez
  l'organisateur.
- [ ] La sortie d'un mineur non accompagné est signalée, avec le numéro de son responsable.
- [ ] L'agent d'accueil ne voit ni coordonnées ni montants, hormis un « à régler ».
- [ ] Le registre horodaté des passages est exportable.

### Lot 3
- [ ] La restauration scanne un billet et voit ce qui est à retirer et l'état du paiement. Elle
  encaisse si besoin et marque « remis » en un geste, y compris sans réseau.
- [ ] Le stock par variante (préparés, réservés, remis, disponibles) se met à jour en direct, et la
  vente sur place décompte le stock disponible.
- [ ] Avant l'événement, la restauration lit le nombre de repas à préparer par variante.
- [ ] La restauration compose le menu : plats, descriptions, allergènes et stock. Elle ne peut
  modifier ni le prix, ni la date limite de paiement, ni les règles de remboursement. Un plat
  réservé ne se supprime pas, et le stock ne descend pas sous le nombre réservé.
- [ ] Avec la préparation nominative, la restauration imprime une étiquette par repas : tout, par
  plat, par réservation, ou seulement les nouvelles. Une étiquette périmée est signalée à la
  distribution.
- [ ] Le code d'une étiquette ne fait pas entrer au contrôle.

### Commun
- [ ] Désactivé, le module n'apparaît nulle part et sa page publique répond « non disponible ».
  Réactivé, les données sont intactes.
- [ ] Un événement et ses données ne sont jamais visibles depuis une autre église.
- [ ] Les données nominatives sont supprimées après la durée de conservation, et les statistiques
  anonymes restent.

## Hors périmètre

- Paiement par carte bancaire en ligne avec confirmation automatique : pas de statut associatif
  pour l'instant.
- Paiement sur le compte bancaire de l'église.
- Rapprochement automatique avec un relevé bancaire.
- Plan de salle et places numérotées.
- Codes promo, liste d'attente, revente ou échange de billets.
- Application native : le téléphone et son navigateur suffisent.
- Rapprochement de l'équipe de l'événement avec le planning des départements.

## Questions ouvertes

Décisions prises d'après l'issue #708, à revoir en recette si besoin :

- **Bénéficiaire Wero et Revolut** : le trésorier de l'événement, avec le numéro ou le lien saisi
  par l'organisateur.
- **Durée de conservation** : 3 mois après la clôture, par défaut.
- **Code de réservation** : il fait entrer tout ou partie des participants, au choix de l'agent.
  Les billets individuels restent valables.
- **Création d'événement** : ouverte aux Super Admin, Admin et Secrétaire. Le Ministre ne crée pas
  d'événement, mais peut en être organisateur.
- **Relance de paiement** : son délai avant la date limite est **réglable par l'organisateur**
  (3 jours par défaut).
- **Ajout sur place** à l'entrée : livré avec le lot 2, disponible dès le 31/12.
