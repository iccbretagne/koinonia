# Spec — Notifications natives sur le téléphone et l'ordinateur

- **Numéro** : 068
- **Statut** : Validée
- **Créée le** : 2026-10-27
- **Branche suggérée** : `feat/notifications-push`
- **Prolonge** : [spec 053 — préférences de notification par email](../053-preferences-notifications-email/spec.md)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia prévient déjà ses utilisateurs de deux façons : la cloche de notifications dans
l'application, et l'email, réglable domaine par domaine depuis « Mes notifications » (spec 053).

La cloche n'est vue que lorsqu'on ouvre l'application. L'email arrive, mais se perd souvent
parmi les autres, et beaucoup de serviteurs ne le consultent pas. Résultat : un ajout à un
service, une demande acceptée ou un paiement à valider restent parfois ignorés plusieurs jours,
et l'information repart sur WhatsApp, ce que Koinonia cherche justement à remplacer.

Koinonia s'installe déjà comme une application sur l'écran d'accueil du téléphone. Il lui
manque la **notification native** : le bandeau qui s'affiche sur l'écran de verrouillage ou dans
le centre de notifications, comme pour une application classique, et qui ouvre directement le
bon écran de Koinonia.

## Utilisateurs concernés

**Tous les rôles disposant d'un compte** : Super Admin, Admin, Secrétaire, Ministre,
Resp. département, STAR, Faiseur de Disciples, Reporter, Référent soins pastoraux, Comptable.

Chacun ne règle que ses propres notifications, et uniquement pour les domaines qu'il voit déjà
dans « Mes notifications ». Aucun rôle ne règle les notifications d'un autre utilisateur, et
aucun nouveau droit n'est créé.

Les personnes sans compte (formulaires publics, page « Donner ») ne sont pas concernées.

## Comportement attendu

### Activer les notifications sur un appareil

Les notifications natives s'activent **appareil par appareil** : le téléphone, puis
l'ordinateur du bureau, par exemple. Dans « Mes notifications », une nouvelle partie
« Notifications sur cet appareil » indique l'état de l'appareil utilisé :

- **non activées** : un bouton « Activer les notifications sur cet appareil » ;
- **activées** : le rappel que l'appareil reçoit les notifications, et un bouton « Désactiver
  sur cet appareil » ;
- **bloquées** : l'utilisateur a refusé l'autorisation au navigateur ; une explication dit
  comment la rétablir dans les réglages de l'appareil ;
- **indisponibles** : l'appareil ou le navigateur ne les permet pas, ou Koinonia n'est pas
  installée sur l'écran d'accueil alors que l'appareil l'exige (iPhone, iPad). Un guide dit
  comment installer Koinonia pour les obtenir.

L'autorisation n'est **jamais demandée sans action de l'utilisateur** : ni au chargement d'une
page, ni à la connexion. Seul le bouton la déclenche.

### Choisir domaine par domaine

Les réglages par domaine de « Mes notifications » gagnent une seconde colonne. Pour chaque
domaine visible, l'utilisateur choisit indépendamment :

- **Email** : le réglage actuel, inchangé ;
- **Sur l'appareil** : la notification native.

Ce choix par domaine vaut pour **tous les appareils activés** de l'utilisateur. Activer ou
désactiver un appareil ne touche pas aux choix par domaine.

Un interrupteur général « Recevoir les notifications sur mes appareils », à côté de
l'interrupteur général email, coupe toutes les notifications natives d'un coup. Les choix par
domaine sont conservés et retrouvés quand il est réactivé.

La cloche de l'application **ne change pas** : toute notification y arrive, quels que soient les
réglages email et appareil.

### Ce que montre une notification native

- un titre et une phrase courte, les mêmes que dans la cloche ;
- l'icône de Koinonia ;
- un appui ouvre Koinonia **sur l'écran concerné** (le service, la demande, le paiement…),
  comme un clic dans la cloche. Si Koinonia est déjà ouverte, elle passe au premier plan sur cet
  écran.

Le texte reste **sobre** : il ne contient jamais de coordonnée bancaire, de contenu d'entretien
pastoral ni de donnée personnelle d'un tiers au-delà de ce que la cloche affiche déjà. Le détail
se lit dans l'application, après connexion.

### Scénario principal

1. Un STAR du département Son ne lit pas ses emails. Il a installé Koinonia sur l'écran
   d'accueil de son téléphone.
2. Il ouvre « Mes notifications », touche « Activer les notifications sur cet appareil » et
   accepte la demande d'autorisation du téléphone.
3. La partie « Notifications sur cet appareil » indique que le téléphone reçoit les
   notifications. Dans la colonne « Sur l'appareil », il garde « Planning et service » et
   désactive « Emploi ».
4. Le jeudi, son responsable l'ajoute au service de dimanche. Un bandeau « Koinonia » apparaît
   sur son écran de verrouillage : il est ajouté au service de dimanche.
5. Il touche le bandeau : Koinonia s'ouvre sur son planning.
6. Une nouvelle offre d'emploi est publiée : il ne reçoit aucun bandeau, mais la voit dans la
   cloche.

### Scénarios alternatifs / cas limites

- **Plusieurs appareils** : un utilisateur qui a activé son téléphone et son ordinateur reçoit
  la notification sur les deux.
- **Désactivation d'un appareil** : il ne reçoit plus rien sur cet appareil ; ses autres
  appareils continuent de recevoir.
- **Déconnexion** : en se déconnectant de Koinonia sur un appareil, celui-ci cesse de recevoir
  les notifications de ce compte. Un appareil partagé ne montre donc jamais les notifications
  de l'utilisateur précédent.
- **Autorisation retirée dans les réglages du téléphone, application désinstallée, appareil
  perdu** : Koinonia cesse d'envoyer vers cet appareil dès qu'il ne répond plus, sans erreur
  visible pour l'émetteur de la notification.
- **Notification non reçue** (téléphone éteint, en économie d'énergie) : rien n'est perdu ; la
  notification reste dans la cloche, et l'email part selon le réglage email du domaine. La
  notification native n'est **jamais le seul** canal d'une information.
- **Plusieurs églises** : l'utilisateur reçoit les notifications de toutes les églises où il a un
  rôle, avec les mêmes choix par domaine ; ouvrir la notification l'amène sur l'écran concerné,
  dans la bonne église.
- **Domaine non visible** : un domaine que l'utilisateur ne voit pas dans « Mes notifications »
  ne lui envoie aucune notification native.
- **Appareil activé avec un autre compte** : un même appareil n'envoie les notifications que du
  compte connecté.
- **Nouvelle fonctionnalité** : toute nouvelle notification d'un domaine suit automatiquement
  les choix « Sur l'appareil » de ce domaine, sans réglage supplémentaire.

## Critères d'acceptation

- [ ] Dans « Mes notifications », la partie « Notifications sur cet appareil » affiche l'un des
  quatre états (non activées, activées, bloquées, indisponibles) correspondant à l'appareil.
- [ ] L'autorisation de l'appareil n'est demandée qu'après un appui sur « Activer les
  notifications sur cet appareil » ; aucune page ne la demande d'elle-même.
- [ ] Sur un iPhone ou un iPad où Koinonia n'est pas installée sur l'écran d'accueil, l'état
  « indisponibles » s'affiche avec le guide d'installation.
- [ ] Chaque domaine visible propose un choix « Sur l'appareil » indépendant du choix « Email ».
- [ ] Une notification d'un domaine dont « Sur l'appareil » est activé apparaît en notification
  native sur chaque appareil activé de l'utilisateur.
- [ ] Une notification d'un domaine dont « Sur l'appareil » est désactivé n'apparaît sur aucun
  appareil, mais reste dans la cloche.
- [ ] L'interrupteur général coupe toutes les notifications natives et conserve les choix par
  domaine.
- [ ] Les réglages email existants ne changent pas à la mise en service.
- [ ] Un appui sur la notification ouvre Koinonia sur l'écran que la cloche aurait ouvert.
- [ ] Le texte d'une notification native ne contient rien de plus que ce que la cloche affiche.
- [ ] Après déconnexion sur un appareil, celui-ci ne reçoit plus les notifications du compte.
- [ ] Désactiver un appareil n'arrête pas les notifications sur les autres appareils du compte.
- [ ] Un appareil qui ne répond plus (autorisation retirée, désinstallation) cesse d'être visé,
  sans faire échouer l'action qui a déclenché la notification.
- [ ] Une notification native n'est envoyée que pour un domaine visible de l'utilisateur.
- [ ] Koinonia installée affiche une icône nette sur l'écran d'accueil et dans les
  notifications, sur Android et sur iPhone.

## Hors périmètre

- Notifications aux personnes **sans compte** (formulaires publics, page « Donner »).
- **Envoi manuel** d'une notification par un Admin ou un responsable (annonce à tout un
  département, message libre) : les notifications natives ne transportent que les notifications
  que Koinonia émet déjà.
- **Réglages par appareil** différents d'un appareil à l'autre (par exemple « Comptabilité »
  sur l'ordinateur seulement) : les choix par domaine valent pour tous les appareils.
- **Plages de silence**, regroupement ou résumé des notifications natives.
- **Actions dans la notification** elle-même (accepter, refuser) : un appui ouvre l'écran, où
  l'action se fait comme aujourd'hui.
- **Pastille de compteur** sur l'icône de l'application.
- Applications publiées dans les stores (App Store, Play Store).
- Changement du contenu ou des règles d'envoi des emails.

## Décisions

- **Réglage par défaut** : à l'activation d'un premier appareil, **tous les domaines visibles**
  sont activés « Sur l'appareil » — l'utilisateur vient de demander les notifications ; il en
  retire ensuite. Ses choix email ne sont pas repris.
- **Mise en service** : **tous les domaines d'un coup**.
- **Domaine Emploi** : la notification native d'une alerte d'offre suit le choix « Sur
  l'appareil » du domaine Emploi **et** le réglage détaillé existant « dans l'application » des
  alertes d'offres, en cumul, sans nouveau réglage.

## Questions ouvertes

- Aucune.
