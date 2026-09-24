# Spec — Suivi des nouveaux convertis et des demandes de rendez-vous pastoral

- **Numéro** : 052
- **Statut** : Validée
- **Créée le** : 2026-09-24
- **Branche suggérée** : `feat/suivi-rendez-vous-pastoraux`
- **Issue source** : [#580](https://github.com/iccbretagne/koinonia/issues/580)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Deux flux voisins servent aujourd'hui à accompagner une personne qui a besoin d'un suivi
spirituel, et ils ne se parlent pas :

- **Le suivi des nouveaux convertis** : quand une personne répond à l'appel au salut, l'équipe
  intégration peut démarrer un suivi et le confier à un membre du département MSDP (Soins, Santé
  Divine et Prière), qui le fait progresser jusqu'à la formation des nouveaux convertis. Ce suivi
  est rangé dans l'espace intégration, et rien ne garantit qu'il soit démarré.
- **Les demandes de rendez-vous pastoral** : une personne (depuis le formulaire public, depuis son
  compte, ou en cochant « soin pastoral » sur le formulaire d'accueil) demande un rendez-vous. Un
  qualificateur la valide en la confiant à un profil pastoral (pasteur, assistant pasteur,
  berger), ou la rejette ; l'équipe protocole planifie ensuite le rendez-vous dans l'agenda
  pastoral. Le flux s'arrête là : on ne sait jamais si le rendez-vous a eu lieu.

Le ministère MSDP demande une refonte de ces flux, pour quatre raisons :

1. **La personne choisit ses jours préférés**, alors que c'est au ministère de fixer le
   rendez-vous. Ce choix crée une attente qui ne sera pas forcément tenue.
2. **Les deux populations d'accompagnants sont cloisonnées** : une demande de rendez-vous ne peut
   être confiée qu'à un profil pastoral, un suivi de nouveau converti qu'à un membre du MSDP. Or
   le besoin est de pouvoir confier l'une ou l'autre à **l'un ou l'autre**, selon la situation.
3. **Le cycle de vie n'est pas lisible** : on ne voit pas d'un coup d'œil qui a reçu la demande,
   à qui elle a été confiée, si elle a été validée ou abandonnée, ni par qui, ni comment elle
   s'est terminée.
4. **La personne à qui l'on confie une demande n'en est pas prévenue** : à la validation d'un
   rendez-vous, seule l'équipe protocole est notifiée ; le profil pastoral désigné l'apprend
   indirectement.

S'y ajoute un enjeu de **confidentialité** : une demande de soin pastoral peut contenir des
éléments intimes, aujourd'hui lisibles par des équipes qui n'en ont pas besoin pour faire leur
travail.

Ces deux flux sont regroupés dans un **espace unique consacré au suivi et aux rendez-vous
pastoraux**, distinct de l'espace intégration (accueil et rattachement aux familles) et de
l'agenda pastoral (planification des créneaux), qui restent chacun centrés sur leur métier.

## Utilisateurs concernés

- **Qualificateur agenda** (et Admin, Super Admin, qui détiennent le même droit) : seul à
  confier, réaffecter ou rejeter une demande — de rendez-vous comme de suivi de nouveau
  converti. Reçoit les demandes rendues par un accompagnant et les alertes sur les demandes non
  qualifiées.
- **Membre du département MSDP** : peut se voir confier une demande — de rendez-vous ou de suivi
  de nouveau converti. Il la fait progresser, fixe lui-même la date des rendez-vous qui lui sont
  confiés, en consigne l'issue, et peut rendre une demande au qualificateur.
- **Profil pastoral** (pasteur, assistant pasteur, berger) : peut se voir confier une demande, en
  est prévenu, la retrouve, en consigne l'issue, et peut la rendre au qualificateur.
- **Membre de l'équipe intégration** : n'a plus à démarrer le suivi d'un nouveau converti, qui
  naît automatiquement ; voit depuis la demande d'accueil qu'un suivi existe et où il en est. Ne
  lit pas le contenu des demandes de rendez-vous.
- **Membre de l'équipe protocole** : planifie dans l'agenda pastoral les rendez-vous confiés à un
  profil pastoral, comme aujourd'hui. Voit le nom, l'objet général, l'accompagnant et l'état des
  demandes à planifier, pas le message de la personne.
- **Secrétaire** : vue d'ensemble de l'espace (qui, quoi, où en est-on), sans lecture du message
  de la personne.
- **Admin, Super Admin** : accès complet.
- **Demandeur** (personne extérieure, ou STAR depuis son compte) : dépose une demande sans plus
  choisir de jours ; est prévenu de la date du rendez-vous, qu'elle soit fixée par le protocole
  ou par un membre du MSDP.

## Comportement attendu

### Un espace unique pour deux sortes de demandes

L'espace regroupe deux sortes de demandes, reconnaissables au premier coup d'œil :

- les **demandes de rendez-vous pastoral**, quelle que soit leur origine (formulaire public,
  compte d'un membre, case « soin pastoral » du formulaire d'accueil) ;
- les **suivis de nouveaux convertis**.

Les suivis de nouveaux convertis existants à la mise en service apparaissent dans ce nouvel
espace, avec leur état, leur accompagnant et leur historique ; ils ne sont plus gérés depuis
l'espace intégration. Les personnes ayant répondu à l'appel au salut avant la mise en service
sans qu'aucun suivi ne soit démarré (demande d'accueil non archivée) reçoivent un suivi « reçu »,
pour que personne ne reste oublié. La fiche de la demande d'accueil continue d'indiquer qu'un suivi existe et
où il en est, avec un accès direct vers lui.

### Plus de choix de jours par le demandeur

Le formulaire de demande de rendez-vous ne propose plus de choisir des jours préférés. Les jours
déjà indiqués sur des demandes antérieures sont conservés mais ne sont plus affichés nulle part.

### Scénario principal — demande de rendez-vous

1. Une personne dépose une demande de rendez-vous. Elle est **reçue**.
2. Un qualificateur l'examine, puis en une seule action :
   - soit il la **valide** en la confiant à un profil pastoral ou à un membre du département
     MSDP, au choix, à partir d'une liste qui distingue clairement les deux ;
   - soit il la **rejette**, en choisissant un motif dans une liste fixe (voir « Motifs de
     rejet »), complété au besoin d'un commentaire ; le demandeur en est informé comme
     aujourd'hui.
3. L'accompagnant désigné est **prévenu immédiatement**, dans l'application et par email s'il en
   a un, avec l'identité du demandeur, l'objet de la demande et un accès direct à celle-ci.
4. Le rendez-vous est fixé :
   - **accompagnant profil pastoral** : l'équipe protocole est prévenue et planifie le rendez-vous
     dans l'agenda pastoral, comme aujourd'hui ;
   - **accompagnant membre du MSDP** : il contacte lui-même la personne, convient d'une date hors
     agenda pastoral, et l'indique sur la demande.
5. La demande est **planifiée** : la date du rendez-vous figure sur la fiche, et le demandeur est
   prévenu de la date dans les deux cas, dans l'application s'il a un compte et par email s'il en
   a laissé un.
6. Après le rendez-vous, l'accompagnant en consigne l'**issue** (voir « Issue du rendez-vous »).

À chaque étape, la fiche de la demande montre sa réception, sa validation ou son rejet (par qui,
quand, motif), les affectations successives (à qui, par qui, quand), la date du rendez-vous et
son issue.

### Scénario principal — suivi d'un nouveau converti

1. Dès qu'une personne répond à l'appel au salut sur le formulaire d'accueil, son suivi de
   nouveau converti **naît automatiquement**, à l'état **reçu**, sans action de l'équipe
   intégration.
2. Un qualificateur le **confie** à un membre du département MSDP ou à un profil pastoral, au
   choix.
3. L'accompagnant est prévenu, dans l'application et par email.
4. Le suivi progresse par les étapes existantes (premier contact, formation des nouveaux
   convertis) jusqu'à être **terminé** ou **abandonné**.

### Issue du rendez-vous

Une fois la date du rendez-vous passée, l'accompagnant indique ce qu'il en est, parmi :

- **a eu lieu, clôturé** : la demande est terminée ;
- **a eu lieu, orienté vers un suivi de nouveau converti** : la demande est terminée, et un suivi
  de nouveau converti naît pour la même personne, à l'état reçu, à confier par un qualificateur ;
- **a eu lieu, un nouveau rendez-vous est nécessaire** : la demande redevient « à planifier »,
  par le protocole ou par le membre du MSDP selon l'accompagnant ;
- **la personne n'est pas venue** : l'accompagnant choisit entre replanifier et clôturer sans
  suite.

Seule l'issue est consignée, jamais le contenu de l'entretien. Si l'accompagnant est un profil
pastoral sans compte, le qualificateur consigne l'issue à sa place.

### Rendre une demande au qualificateur

Un accompagnant qui ne peut pas assurer une demande qui lui est confiée (indisponibilité, profil
inadapté, conflit personnel…) la **rend au qualificateur**, avec une raison obligatoire, tant que
le rendez-vous n'a pas eu lieu (ou, pour un suivi, tant qu'il n'est ni terminé ni abandonné). La
demande redevient « reçue » sans accompagnant ; les qualificateurs sont prévenus, raison
comprise, et la confient de nouveau. Si le protocole devait planifier le rendez-vous, il n'a plus
à le faire. Le retour figure dans l'historique.

### Réaffectation

Un qualificateur peut confier à quelqu'un d'autre une demande déjà confiée, dans les mêmes
limites. Le nouvel accompagnant est prévenu ; l'ancien est informé qu'il n'en a plus la charge.
L'historique garde les deux affectations. Si le rendez-vous avait été transmis au protocole et que
le nouvel accompagnant est un membre du MSDP, le protocole n'a plus à le planifier.

### Rapprochement des demandes d'une même personne

Une même personne peut avoir, au fil du temps, une demande d'accueil, un suivi de nouveau
converti et une ou plusieurs demandes de rendez-vous. Quand ces demandes sont rattachées au même
dossier de parcours de la personne, la fiche de chacune signale les autres (sorte, date, état),
avec un accès direct. Le contenu d'une demande de rendez-vous reste soumis à la règle de
confidentialité ci-dessous, même à travers ce rapprochement.

### Relances

Deux situations déclenchent une alerte une fois un délai dépassé :

- une demande **reçue et non encore confiée** : alerte aux qualificateurs ;
- une demande **confiée mais non planifiée** (rendez-vous sans date, ou suivi resté à l'état
  confié sans premier contact) : alerte à l'accompagnant.

Chaque délai est réglable par église, par les détenteurs du droit de qualification (7 jours par
défaut pour une demande non confiée, 14 jours pour une demande confiée non planifiée). Tant que la situation ne change pas, l'alerte reste visible
dans l'espace ; une notification est émise à chaque échéance dépassée, sans répétition au-delà.

### Motifs de rejet

Rejeter une demande de rendez-vous impose de choisir un motif dans une liste fixe : hors du champ
pastoral · doublon · demande retirée par la personne · injoignable · orientée vers un autre
service · autre. Un commentaire libre peut compléter. Le motif est visible sur la fiche et dans
les statistiques de l'espace. Les rejets antérieurs, sans motif, restent tels quels.

### Confidentialité du contenu des demandes

Le message qu'une personne écrit dans sa demande de rendez-vous n'est lisible que par :

- les détenteurs du droit de qualification (Qualificateur agenda, Admin, Super Admin) ;
- l'accompagnant à qui la demande est confiée, tant qu'il en a la charge.

Les autres personnes ayant accès à la demande — équipe protocole, Secrétaire, équipe
intégration, accompagnant dessaisi — en voient l'identité du demandeur, l'objet général, l'état,
l'accompagnant et la date, mais pas le message.

### Scénarios alternatifs / cas limites

- **Si** l'accompagnant choisi n'a pas d'adresse email, il est prévenu dans l'application
  seulement ; l'affectation n'échoue pas pour autant.
- **Si** un profil pastoral n'est rattaché à aucun compte, il ne peut recevoir de notification
  dans l'application ni se connecter : l'email est alors le seul canal, le qualificateur en est
  averti au moment de choisir, et c'est lui qui consigne l'issue du rendez-vous.
- **Si** l'accompagnant membre du MSDP n'a pas encore indiqué de date, la demande reste
  « validée, à planifier », figure dans sa liste de demandes à traiter, et déclenche la relance
  une fois le délai dépassé.
- **Si** le formulaire d'accueil qui coche l'appel au salut est soumis deux fois par la même
  personne, un seul suivi de nouveau converti doit en résulter.
- **Quand** une demande d'accueil portant un suivi de nouveau converti est archivée, le suivi
  reste consultable dans l'espace.
- **Quand** un accompagnant est dessaisi (retour, réaffectation), il perd immédiatement l'accès
  au message de la demande.

## Critères d'acceptation

- [ ] Le formulaire de demande de rendez-vous ne propose plus de choisir des jours ; les jours
      déjà saisis ne sont plus affichés, et ne sont pas perdus.
- [ ] Les demandes de rendez-vous et les suivis de nouveaux convertis sont consultables et
      gérables depuis un même espace dédié, distinct de l'espace intégration et de l'agenda.
- [ ] Les suivis de nouveaux convertis existants apparaissent dans le nouvel espace avec leur
      état, leur accompagnant et leur historique.
- [ ] Un formulaire d'accueil cochant l'appel au salut crée automatiquement un suivi de nouveau
      converti à l'état reçu, sans action de l'équipe intégration, et une seule fois par personne.
- [ ] À la mise en service, chaque demande d'accueil non archivée ayant coché l'appel au salut
      sans suivi reçoit un suivi à l'état reçu.
- [ ] La fiche d'une demande d'accueil indique l'existence et l'état d'un suivi de nouveau
      converti, avec un accès direct vers lui.
- [ ] Un qualificateur valide une demande de rendez-vous en la confiant, en une seule action, à
      un profil pastoral ou à un membre du département MSDP, au choix.
- [ ] Rejeter une demande de rendez-vous impose un motif choisi dans la liste ; le motif est
      visible sur la fiche et dans les statistiques.
- [ ] Un suivi de nouveau converti peut être confié par un qualificateur à un membre du
      département MSDP ou à un profil pastoral, au choix.
- [ ] Seuls les détenteurs du droit de qualification peuvent confier, réaffecter ou rejeter ;
      l'équipe intégration, l'équipe MSDP et les accompagnants ne le peuvent pas.
- [ ] La liste de choix distingue visiblement les profils pastoraux des membres du MSDP.
- [ ] L'accompagnant désigné est notifié dans l'application et par email dès l'affectation ;
      l'absence d'email ne bloque pas l'affectation.
- [ ] Un accompagnant dessaisi par réaffectation en est informé.
- [ ] Un accompagnant peut rendre une demande au qualificateur avec une raison obligatoire ; la
      demande redevient reçue sans accompagnant, les qualificateurs sont prévenus, et le retour
      figure dans l'historique.
- [ ] Une demande de rendez-vous confiée à un profil pastoral est transmise à l'équipe protocole
      pour planification ; une demande confiée à un membre du MSDP ne l'est pas, et c'est ce
      membre qui en indique la date.
- [ ] Le demandeur est prévenu de la date du rendez-vous, qu'elle soit fixée par le protocole ou
      par un membre du MSDP.
- [ ] Après le rendez-vous, l'accompagnant consigne une issue parmi la liste ; « orienté vers un
      suivi de nouveau converti » crée ce suivi, « nouveau rendez-vous nécessaire » remet la
      demande à planifier ; aucun contenu d'entretien n'est demandé.
- [ ] La fiche d'une demande signale les autres demandes rattachées au même dossier de parcours
      de la personne, avec un accès direct.
- [ ] Une demande reçue non confiée au-delà du délai alerte les qualificateurs ; une demande
      confiée non planifiée au-delà du délai alerte l'accompagnant ; les deux délais (7 et 14
      jours par défaut) sont réglables par église par les détenteurs du droit de qualification.
- [ ] Le message d'une demande de rendez-vous n'est lisible que par les qualificateurs, les Admin
      et Super Admin, et l'accompagnant en charge ; l'équipe protocole, la Secrétaire, l'équipe
      intégration et un accompagnant dessaisi ne le voient pas.
- [ ] La fiche de chaque demande montre son cycle de vie : réception, validation ou rejet (par
      qui, quand, motif), affectations et retours successifs (à qui, par qui, quand), date du
      rendez-vous et issue, ou issue du suivi.
- [ ] Un STAR ou une personne extérieure peut toujours déposer une demande de rendez-vous.

## Hors périmètre

- La planification des créneaux dans l'agenda pastoral (inchangée).
- Les abonnements aux notifications par email et leur réglage par l'utilisateur (issue #581).
- Le formulaire d'accueil des nouveaux arrivants et le rattachement aux familles (spec 051).
- La suppression définitive des jours préférés déjà saisis.
- Tout changement des étapes du suivi d'un nouveau converti (premier contact, formation,
  terminé), hors affectation et retour au qualificateur.
- Un agenda pour les membres du MSDP : leurs rendez-vous sont convenus hors agenda pastoral.
- D'autres départements que le MSDP comme viviers d'accompagnants.
- Une confirmation de prise en charge par l'accompagnant : la validation reste l'acte du
  qualificateur.
- L'affichage de la charge de chaque accompagnant au moment de confier une demande.
- La consignation du contenu des entretiens pastoraux.

## Décisions actées

- **Nouvel espace dédié** : le suivi des nouveaux convertis et les demandes de rendez-vous sont
  regroupés dans un espace « suivi et rendez-vous pastoraux », distinct de l'intégration et de
  l'agenda pastoral.
- **Jours préférés** : plus proposés ni affichés ; les valeurs existantes sont conservées.
- **Validation** : comme aujourd'hui, valider c'est accepter et confier en une seule action,
  par le qualificateur.
- **Rendez-vous confié à un membre du MSDP** : l'accompagnant fixe lui-même le rendez-vous et en
  indique la date ; le protocole n'intervient que pour les profils pastoraux. Le demandeur est
  prévenu de la date dans les deux cas.
- **Affectation réservée au qualificateur** : seuls les détenteurs du droit de qualification
  (Qualificateur agenda, Admin, Super Admin) confient et réaffectent, y compris les suivis de
  nouveaux convertis — que l'équipe intégration et l'équipe MSDP confiaient jusqu'ici.
- **Viviers d'accompagnants** : profils pastoraux et membres des départements MSDP uniquement.
- **Évolutions retenues lors de la revue** : suivi de nouveau converti créé automatiquement ;
  retour d'une demande au qualificateur par l'accompagnant ; issue du rendez-vous ;
  rapprochement des demandes d'une même personne ; relances ; motifs de rejet ; demandeur
  prévenu quel que soit l'accompagnant ; confidentialité du message de la demande.
- **Écarté** : affichage de la charge des accompagnants au moment de confier.
- **Rattrapage** : à la mise en service, chaque demande d'accueil non archivée ayant coché
  l'appel au salut sans suivi reçoit un suivi de nouveau converti « reçu ».
- **Relances** : 7 jours par défaut pour une demande non confiée, 14 jours pour une demande
  confiée non planifiée ; réglables par les détenteurs du droit de qualification.

## Questions ouvertes

Aucune. La spec est prête pour `/plan`.
