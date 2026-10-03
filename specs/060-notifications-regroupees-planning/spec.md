# Spec — Notifications regroupées des changements de planning

- **Numéro** : 060
- **Statut** : Validée
- **Créée le** : 2026-10-03
- **Branche suggérée** : `feat/notifications-regroupees-planning`
- **Origine** : issue #612, lot 2 (lot 1 : spec 058 ; lot 3 : « Je ne peux plus », remplacements)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Le planning n'a pas de brouillon (décision de l'issue #612) : il est visible par l'équipe dès
qu'il est saisi. Les STAR doivent donc apprendre **qu'ils servent**, ou ne servent plus, sans que
le responsable ait à y penser.

Aujourd'hui :

- La grille enregistre **chaque clic**, et chaque changement de statut d'un STAR part aussitôt en
  notification (et en email). Un responsable qui compose son planning, hésite, déplace une
  personne d'un événement à l'autre, produit une rafale de messages contradictoires
  (« Vous êtes affecté(e) », puis « Vous avez été retiré(e) » une minute plus tard).
- Une notification porte sur **un seul événement** : un STAR placé sur quatre dimanches reçoit
  quatre messages, sans vue d'ensemble.
- Le lien de ces notifications ouvre la grille par département, à laquelle un STAR n'a pas accès.
- Certains changements ne préviennent **personne** : la recopie du planning d'un événement sur un
  autre, ou le retrait d'un département d'un événement (ses STAR planifiés perdent leur service
  sans le savoir).

On veut qu'un STAR reçoive **un seul message**, envoyé une fois que le responsable a fini ses
modifications, qui dise ce qui a changé **pour lui** : « Tu sers le 12 et le 19 », « Tu ne sers
plus le 26 ».

## Utilisateurs concernés

- **STAR** (et tout membre planifié ayant un compte relié à sa fiche STAR, quel que soit son
  rôle) : reçoit le récapitulatif de ses changements de service.
- **Resp. département, Ministre, Admin, Super Admin** (ceux qui modifient le planning) : n'ont
  rien à faire de plus. Ils ne sont pas prévenus de leurs propres modifications.
- **Secrétaire** : en lecture seule sur le planning, il ne provoque pas de changement. S'il est
  lui-même planifié comme STAR, il est prévenu comme tout STAR.
- **Secrétaire, Admin, Super Admin** (ceux qui règlent déjà la collecte des disponibilités,
  spec 058) : règlent le **délai de regroupement** de leur église.

## Définitions

- **Service** : la présence d'un STAR au planning d'un département pour un événement, avec son
  statut (en service, en service + débrief, remplaçant).
- **Changement de service** pour un STAR, sur un événement et un département :
  - **ajouté** : il n'y était pas, il y est ;
  - **retiré** : il y était, il n'y est plus ;
  - **modifié** : il y reste, avec un autre statut (ex. remplaçant → en service).
- **Changement net** : la différence entre la situation **avant la première modification** et la
  situation **au moment de l'envoi**. Les étapes intermédiaires ne comptent pas.

## Comportement attendu

### Scénario principal

1. Marie, responsable Choristes, compose le planning de novembre dans la grille. En dix minutes,
   elle place Paul sur les cultes du 2, du 9 et du 16, l'enlève du 9 et le place sur le 23.
2. Aucune notification ne part tant qu'elle modifie.
3. Une fois qu'aucune modification concernant Paul n'a eu lieu pendant le **délai de
   regroupement** de l'église (15 minutes par défaut), Paul reçoit **une seule** notification :
   « Planning mis à jour : tu sers le 2, le 16 et le 23 novembre ».
4. Le détail liste chaque service par date, avec l'événement, le département et le statut.
5. Le lien ouvre « Mon planning ».
6. Le même récapitulatif part par email, selon ses préférences « Planning et service ».

### Régler le délai

1. Sophie, secrétaire, ouvre les réglages des disponibilités de son église.
2. Elle voit « Délai avant l'envoi des changements de planning : 15 minutes ».
3. Elle le passe à 30 minutes : les récapitulatifs partent désormais après 30 minutes sans
   nouvelle modification.

### Scénarios alternatifs / cas limites

- **Changement annulé avant l'envoi** : Marie place Paul le 9 puis l'enlève avant l'envoi.
  Rien ne part pour le 9. Si plus rien n'a changé pour Paul, il ne reçoit rien du tout.
- **Plusieurs départements, plusieurs auteurs** : Paul est placé chez les Choristes par Marie et
  chez les Musiciens par Jean pendant la même fenêtre. Il reçoit **un seul** récapitulatif qui
  couvre les deux départements.
- **Retrait et changement de statut** dans le même récapitulatif :
  « Tu ne sers plus le 9 novembre (Choristes) » ; « Le 16 novembre (Choristes) : tu passes de
  remplaçant à en service ».
- **Recopie du planning d'un événement** vers un autre : les STAR ajoutés par la recopie sont
  prévenus comme s'ils avaient été placés à la main.
- **Retrait d'un département d'un événement** : ses STAR planifiés sur cet événement sont
  prévenus qu'ils ne servent plus, dans le même récapitulatif.
- **Auteur planifié lui-même** : Marie se place elle-même au planning. Elle n'est pas prévenue de
  ses propres modifications. Si Jean la place aussi chez les Musiciens dans la même fenêtre, elle
  reçoit le récapitulatif de ce que Jean a changé.
- **Événement passé** : un changement sur un événement déjà passé n'est jamais notifié.
- **Événement déplacé ou supprimé** : déjà couvert par la spec 059. Cette feature n'y ajoute
  aucune notification (pas de double message).
- **STAR sans compte relié** : personne à prévenir dans l'application. Aucun email n'est envoyé
  à une adresse de fiche STAR (comportement inchangé).
- **Préférences** : notification dans l'application toujours ; email seulement si la personne ne
  l'a pas désactivé pour « Planning et service ».
- **Événement très proche** : un service ajouté ou retiré pour un événement imminent suit le même
  délai de regroupement : pas d'envoi immédiat, une seule règle.

## Critères d'acceptation

- [ ] Modifier la grille n'envoie plus de notification à chaque changement : aucune notification
  de planning ne part tant que des modifications concernant le STAR se succèdent dans le délai de
  regroupement.
- [ ] Le délai de regroupement est un **réglage par église**, de **15 minutes** par défaut,
  borné entre **5 minutes et 2 heures** ; il s'applique à tous les événements, y compris
  imminents.
- [ ] Le délai se règle avec les autres réglages des disponibilités, par les seuls rôles qui
  peuvent déjà les modifier (Secrétaire, Admin, Super Admin) ; une valeur hors bornes est refusée
  avec un message clair.
- [ ] Un changement de délai s'applique aux envois à venir, y compris aux changements déjà en
  attente.
- [ ] Le récapitulatif part au plus tard quelques minutes après l'échéance du délai (la précision
  exacte est fixée par le plan), jamais avant.
- [ ] Une fois le délai écoulé sans nouvelle modification le concernant, le STAR reçoit **une
  seule** notification qui couvre tous ses changements de la fenêtre, tous événements et
  départements confondus.
- [ ] Le récapitulatif ne contient que le **changement net** : un service ajouté puis retiré
  pendant la fenêtre n'apparaît pas ; s'il ne reste aucun changement net, rien n'est envoyé.
- [ ] Chaque ligne indique la date, l'événement, le département et la nature du changement
  (ajouté avec son statut, retiré, ou statut avant → après), triée par date.
- [ ] Le lien de la notification ouvre « Mon planning », accessible à un STAR.
- [ ] L'email suit les préférences « Planning et service » ; il reprend le même contenu.
- [ ] L'auteur d'une modification n'est jamais prévenu de sa propre modification.
- [ ] Les changements sur des événements passés ne sont jamais notifiés.
- [ ] La recopie du planning d'un événement prévient les STAR ajoutés.
- [ ] Le retrait d'un département d'un événement à venir prévient ses STAR planifiés qu'ils ne
  servent plus.
- [ ] Un événement déplacé ou supprimé ne produit aucune notification de plus que celles de la
  spec 059.
- [ ] Un STAR sans compte relié ne provoque ni notification ni erreur.
- [ ] Un échec d'envoi (email) n'empêche jamais l'enregistrement du planning.

## Hors périmètre

- **Brouillon / publication** du planning : écarté par l'issue #612.
- Prévenir les **responsables** des changements faits par un autre responsable ou un Ministre.
- « **Je ne peux plus** », remplacements, échanges entre STAR : lot 3.
- Les changements de **tâches ou consignes** de département et les **événements d'équipe**.
- Un délai de regroupement réglable **par l'utilisateur** (seul le réglage par église est prévu).
- Un envoi groupé à heure fixe (ex. résumé quotidien) à la place du regroupement par inactivité.
- Les suppressions massives de structure (membre, département, ministère, église supprimés ;
  fusion de fiches STAR) : aucune notification, comme aujourd'hui.

## Questions ouvertes

Aucune. Arbitrages du 2026-10-03 : délai de regroupement **réglable par église** (15 minutes par
défaut, de 5 minutes à 2 heures, avec les réglages des disponibilités) ; **même délai**
pour un événement imminent (pas d'envoi immédiat) ; le **retrait d'un département** d'un
événement prévient ses STAR planifiés.
