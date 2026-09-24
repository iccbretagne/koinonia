# Spec — Suivi des nouveaux convertis et des demandes de rendez-vous pastoral

- **Numéro** : 052
- **Statut** : En revue
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
  est rangé dans l'espace intégration.
- **Les demandes de rendez-vous pastoral** : une personne (depuis le formulaire public, depuis son
  compte, ou en cochant « soin pastoral » sur le formulaire d'accueil) demande un rendez-vous. Un
  qualificateur la valide en la confiant à un profil pastoral (pasteur, assistant pasteur,
  berger), ou la rejette ; l'équipe protocole planifie ensuite le rendez-vous dans l'agenda
  pastoral.

Le ministère MSDP demande une refonte de ces flux, pour quatre raisons :

1. **La personne choisit ses jours préférés**, alors que c'est au ministère de fixer le
   rendez-vous. Ce choix crée une attente qui ne sera pas forcément tenue.
2. **Les deux populations d'accompagnants sont cloisonnées** : une demande de rendez-vous ne peut
   être confiée qu'à un profil pastoral, un suivi de nouveau converti qu'à un membre du MSDP. Or
   le besoin est de pouvoir confier l'une ou l'autre à **l'un ou l'autre**, selon la situation.
3. **Le cycle de vie n'est pas lisible** : on ne voit pas d'un coup d'œil qui a reçu la demande,
   à qui elle a été confiée, si elle a été validée ou abandonnée, ni par qui.
4. **La personne à qui l'on confie une demande n'en est pas prévenue** : à la validation d'un
   rendez-vous, seule l'équipe protocole est notifiée ; le profil pastoral désigné l'apprend
   indirectement.

Ces deux flux sont regroupés dans un **espace unique consacré au suivi et aux rendez-vous
pastoraux**, distinct de l'espace intégration (accueil et rattachement aux familles) et de
l'agenda pastoral (planification des créneaux), qui restent chacun centrés sur leur métier.

## Utilisateurs concernés

- **Qualificateur agenda** (et Admin, Super Admin, qui détiennent le même droit) : seul à
  confier ou réaffecter une demande — de rendez-vous comme de suivi de nouveau converti — et à
  rejeter une demande de rendez-vous.
- **Membre du département MSDP** : peut se voir confier une demande — de rendez-vous ou de suivi
  de nouveau converti — et la fait progresser. Quand on lui confie un rendez-vous, c'est lui qui
  le fixe avec la personne.
- **Profil pastoral** (pasteur, assistant pasteur, berger) : peut se voir confier une demande,
  en est prévenu, et la retrouve.
- **Membre de l'équipe intégration** : démarre le suivi d'un nouveau converti depuis une demande
  d'accueil, comme aujourd'hui, et voit où en est ce suivi. Il ne choisit plus l'accompagnant :
  c'est désormais le rôle du qualificateur.
- **Membre de l'équipe protocole** : planifie dans l'agenda pastoral les rendez-vous confiés à un
  profil pastoral, comme aujourd'hui.
- **Secrétaire, Admin, Super Admin** : vue d'ensemble de l'espace, accès complet.
- **Demandeur** (personne extérieure, ou STAR depuis son compte) : dépose une demande sans plus
  choisir de jours.

## Comportement attendu

### Un espace unique pour deux sortes de demandes

L'espace regroupe deux sortes de demandes, reconnaissables au premier coup d'œil :

- les **demandes de rendez-vous pastoral**, quelle que soit leur origine (formulaire public,
  compte d'un membre, case « soin pastoral » du formulaire d'accueil) ;
- les **suivis de nouveaux convertis**, démarrés depuis une demande d'accueil ayant répondu à
  l'appel au salut.

Les suivis de nouveaux convertis existants à la mise en service apparaissent dans ce nouvel
espace, avec leur état, leur accompagnant et leur historique ; ils ne sont plus gérés depuis
l'espace intégration. La fiche de la demande d'accueil continue d'indiquer qu'un suivi existe et
où il en est, avec un accès direct vers lui.

### Plus de choix de jours par le demandeur

Le formulaire de demande de rendez-vous ne propose plus de choisir des jours préférés. Les jours
déjà indiqués sur des demandes antérieures sont conservés mais ne sont plus affichés nulle part.

### Scénario principal — demande de rendez-vous

1. Une personne dépose une demande de rendez-vous. Elle est **reçue**.
2. Un qualificateur l'examine, puis en une seule action :
   - soit il la **valide** en la confiant à un profil pastoral ou à un membre du département
     MSDP, au choix, à partir d'une liste qui distingue clairement les deux ;
   - soit il la **rejette**, avec un motif ; le demandeur en est informé comme aujourd'hui.
3. L'accompagnant désigné est **prévenu immédiatement**, dans l'application et par email s'il en
   a un, avec l'identité du demandeur, l'objet de la demande et un accès direct à celle-ci.
4. Le rendez-vous est fixé :
   - **accompagnant profil pastoral** : l'équipe protocole est prévenue et planifie le rendez-vous
     dans l'agenda pastoral, comme aujourd'hui ;
   - **accompagnant membre du MSDP** : il contacte lui-même la personne, convient d'une date hors
     agenda pastoral, et l'indique sur la demande.
5. La demande est **planifiée** : la date du rendez-vous figure sur la fiche.

À chaque étape, la fiche de la demande montre sa réception, sa validation ou son rejet (par qui,
quand, motif), les affectations successives (à qui, par qui, quand) et la date du rendez-vous.

### Scénario principal — suivi d'un nouveau converti

1. L'équipe intégration démarre le suivi d'une personne ayant répondu à l'appel au salut. Le
   suivi apparaît dans l'espace, **reçu**.
2. Un qualificateur le **confie** à un membre du département MSDP ou à un profil pastoral, au
   choix.
3. L'accompagnant est prévenu, dans l'application et par email.
4. Le suivi progresse par les étapes existantes (premier contact, formation des nouveaux
   convertis) jusqu'à être **terminé** ou **abandonné**.

### Réaffectation

Un qualificateur peut confier à quelqu'un d'autre une demande déjà confiée, tant que le
rendez-vous n'est pas planifié (ou, pour un suivi, tant qu'il n'est ni terminé ni abandonné). Le
nouvel accompagnant est prévenu ; l'ancien est informé qu'il n'en a plus la charge. L'historique
garde les deux affectations. Si le rendez-vous avait été transmis au protocole et que le nouvel
accompagnant est un membre du MSDP, le protocole n'a plus à le planifier.

### Scénarios alternatifs / cas limites

- **Si** l'accompagnant choisi n'a pas d'adresse email, il est prévenu dans l'application
  seulement ; l'affectation n'échoue pas pour autant.
- **Si** un profil pastoral n'est rattaché à aucun compte, il ne peut recevoir de notification
  dans l'application : l'email est alors le seul canal, et le qualificateur en est averti au
  moment de choisir.
- **Si** l'accompagnant membre du MSDP n'a pas encore indiqué de date, la demande reste
  « validée, à planifier » et figure dans sa liste de demandes à traiter.
- **Quand** une demande d'accueil portant un suivi de nouveau converti est archivée, le suivi
  reste consultable dans l'espace.

## Critères d'acceptation

- [ ] Le formulaire de demande de rendez-vous ne propose plus de choisir des jours ; les jours
      déjà saisis ne sont plus affichés, et ne sont pas perdus.
- [ ] Les demandes de rendez-vous et les suivis de nouveaux convertis sont consultables et
      gérables depuis un même espace dédié, distinct de l'espace intégration et de l'agenda.
- [ ] Les suivis de nouveaux convertis existants apparaissent dans le nouvel espace avec leur
      état, leur accompagnant et leur historique.
- [ ] La fiche d'une demande d'accueil indique l'existence et l'état d'un suivi de nouveau
      converti, avec un accès direct vers lui.
- [ ] Un qualificateur valide une demande de rendez-vous en la confiant, en une seule action, à
      un profil pastoral ou à un membre du département MSDP, au choix ; il peut aussi la rejeter
      avec un motif.
- [ ] Un suivi de nouveau converti peut être confié par un qualificateur à un membre du
      département MSDP ou à un profil pastoral, au choix.
- [ ] Seuls les détenteurs du droit de qualification peuvent confier, réaffecter ou rejeter ;
      l'équipe intégration, l'équipe MSDP et les accompagnants ne le peuvent pas.
- [ ] La liste de choix distingue visiblement les profils pastoraux des membres du MSDP.
- [ ] L'accompagnant désigné est notifié dans l'application et par email dès l'affectation ;
      l'absence d'email ne bloque pas l'affectation.
- [ ] Un accompagnant dessaisi par réaffectation en est informé.
- [ ] Une demande de rendez-vous confiée à un profil pastoral est transmise à l'équipe protocole
      pour planification ; une demande confiée à un membre du MSDP ne l'est pas, et c'est ce
      membre qui en indique la date.
- [ ] La fiche de chaque demande montre son cycle de vie : réception, validation ou rejet (par
      qui, quand, motif), affectations successives (à qui, par qui, quand), date du rendez-vous ou
      issue du suivi.
- [ ] Un STAR ou une personne extérieure peut toujours déposer une demande de rendez-vous.

## Hors périmètre

- La planification des créneaux dans l'agenda pastoral (inchangée).
- Les abonnements aux notifications par email et leur réglage par l'utilisateur (issue #581).
- Le formulaire d'accueil des nouveaux arrivants et le rattachement aux familles (spec 051).
- La suppression définitive des jours préférés déjà saisis.
- Tout changement des étapes du suivi d'un nouveau converti (premier contact, formation,
  terminé), hors affectation.
- Un agenda pour les membres du MSDP : leurs rendez-vous sont convenus hors agenda pastoral.
- D'autres départements que le MSDP comme viviers d'accompagnants.
- Une confirmation de prise en charge par l'accompagnant : la validation reste l'acte du
  qualificateur.

## Décisions actées

- **Nouvel espace dédié** : le suivi des nouveaux convertis et les demandes de rendez-vous sont
  regroupés dans un espace « suivi et rendez-vous pastoraux », distinct de l'intégration et de
  l'agenda pastoral.
- **Jours préférés** : plus proposés ni affichés ; les valeurs existantes sont conservées.
- **Validation** : comme aujourd'hui, valider c'est accepter et confier en une seule action,
  par le qualificateur.
- **Rendez-vous confié à un membre du MSDP** : l'accompagnant fixe lui-même le rendez-vous et en
  indique la date ; le protocole n'intervient que pour les profils pastoraux.
- **Affectation réservée au qualificateur** : seuls les détenteurs du droit de qualification
  (Qualificateur agenda, Admin, Super Admin) confient et réaffectent, y compris les suivis de
  nouveaux convertis — que l'équipe intégration et l'équipe MSDP confiaient jusqu'ici.
- **Viviers d'accompagnants** : profils pastoraux et membres des départements MSDP uniquement.

## Questions ouvertes

Aucune. La spec est prête pour `/plan`.
