# Spec — Préférences de notifications par email

- **Numéro** : 053
- **Statut** : Implémentée (lot 1 — mécanisme, page « Mes notifications » et migration des 10
  sites d'email existants ; lot 2 restant — faire passer les notifications encore in-app
  seulement par le même mécanisme — voir `tasks.md`)
- **Créée le** : 2026-09-25
- **Branche suggérée** : `feat/preferences-notifications-email`
- **Issue source** : [#581](https://github.com/iccbretagne/koinonia/issues/581)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia prévient ses utilisateurs de ce qui les concerne par des **notifications dans
l'application** (la cloche). Certaines de ces notifications partent **aussi par email** : rappels
de service, résumé des changements de planning, demandes de comptabilité, rendez-vous pastoraux,
suivis de nouveaux convertis, demandes d'intégration confiées à un berger, offres d'emploi…

Mais le choix d'envoyer un email est aujourd'hui **figé, domaine par domaine**, au moment où
chaque fonctionnalité a été construite. Trois problèmes en découlent :

1. **L'utilisateur ne choisit rien.** Il ne peut ni arrêter les emails qui l'encombrent, ni
   demander à recevoir par email ce qu'il ne voit aujourd'hui que dans l'application. Seul le
   module emploi propose déjà ses propres réglages, à part.
2. **Les domaines sont incohérents.** Une notification importante d'un domaine arrive par email,
   une notification comparable d'un autre domaine n'arrive que dans l'application — sans raison
   visible pour l'utilisateur.
3. **Chaque nouvelle fonctionnalité refait le choix à la main**, et peut l'oublier. Le suivi
   pastoral (spec 052) vient d'ajouter de nouveaux emails sans que le destinataire puisse les
   régler.

Sans cette évolution, les utilisateurs qui reçoivent trop d'emails finissent par les ignorer
tous — y compris les plus utiles — et ceux qui ne consultent pas l'application ratent des
informations qui les concernent directement.

## Utilisateurs concernés

Toute personne qui a un compte Koinonia et reçoit des notifications, **quel que soit son rôle** :
Super Admin, Admin, Secrétaire, Ministre, Resp. département, STAR, Faiseur de Disciples,
Reporter, Référent soins pastoraux, Comptable. Chacun règle **ses propres** préférences et
seulement les siennes.

Ne sont **pas** concernées les personnes sans compte qui reçoivent un email de Koinonia (le
nouvel arrivant qui remplit le formulaire d'accueil, la personne qui demande un rendez-vous
pastoral depuis le formulaire public, un pasteur ou berger sans compte) : elles n'ont pas de
préférences à régler, et leurs emails continuent de partir comme aujourd'hui.

## Comportement attendu

### Une page « Mes notifications »

Depuis son profil, chaque utilisateur accède à une page où il règle ce qu'il reçoit **par email**.
La page présente :

- un **interrupteur général** « Recevoir des emails de Koinonia » ;
- sous cet interrupteur, un réglage **par domaine**, avec pour chacun une phrase qui dit ce que
  couvre ce domaine (exemples de notifications). Les domaines proposés sont ceux que
  l'utilisateur voit dans l'application :

| Domaine | Exemples de notifications |
|---|---|
| Planning et service | ajout ou retrait d'un service, rappel avant un service, changements de planning, absences et remplaçants |
| Demandes | demande reçue, acceptée ou refusée, feuille d'annonces déposée |
| Suivi pastoral | demande confiée, date de rendez-vous, rappel de relance, demande rendue |
| Intégration | demande d'accueil confiée, demande renvoyée, rappel de relance |
| Comptabilité | nouvelle demande, changement de statut, paiement |
| Salles | problème signalé sur une salle |
| Compte et accès | rôle attribué, liaison avec la fiche membre acceptée ou refusée |
| Emploi | offres et profils (réglages détaillés déjà existants, repris tels quels) |

Un domaine n'est **affiché** que si l'utilisateur peut y recevoir des notifications (un STAR sans
accès à la comptabilité ne voit pas « Comptabilité »).

Les notifications **dans l'application ne changent pas** : elles continuent d'arriver pour tout
le monde, quels que soient les réglages email.

### Scénario principal

1. Une Resp. département reçoit chaque semaine le résumé des changements de planning par email,
   ainsi que des emails de comptabilité qu'elle traite déjà depuis l'application.
2. Elle ouvre « Mes notifications » depuis son profil. Elle voit l'interrupteur général activé,
   et les domaines qui la concernent, chacun avec son état actuel.
3. Elle désactive « Comptabilité » et enregistre. Un message confirme l'enregistrement.
4. Elle continue de recevoir par email le planning ; elle ne reçoit plus d'email de
   comptabilité, mais voit toujours ces notifications dans l'application.

### Tous les domaines suivent la même règle

- **Toute** notification d'un domaine couvert peut partir par email, si le destinataire l'a
  choisi pour ce domaine — y compris les domaines qui n'envoient aucun email aujourd'hui.
- Aucun email à destination d'un utilisateur ne part en dehors de cette règle : une nouvelle
  fonctionnalité qui notifie un utilisateur choisit un domaine, et l'email suit la préférence de
  ce domaine.

### Réglage par défaut

Pour un utilisateur qui n'a jamais ouvert la page, **la mise en service ne lui retire aucun
email** qu'il reçoit aujourd'hui :

- un domaine qui envoie déjà des emails, même pour une partie seulement de ses notifications,
  est **activé** — et tout le domaine part alors par email (par exemple, pour le planning, l'ajout
  à un service part désormais par email comme le rappel de service) ;
- un domaine qui n'envoie aucun email aujourd'hui est **désactivé**.

L'utilisateur reçoit donc au moins ce qu'il recevait avant, et le domaine reste cohérent de bout
en bout. Il peut ensuite tout régler lui-même.

### Un lien dans chaque email

Chaque email envoyé à un utilisateur se termine par une phrase indiquant pourquoi il le reçoit
(le domaine) et un lien vers « Mes notifications » pour changer ce réglage.

### Scénarios alternatifs / cas limites

- **Si** l'utilisateur désactive l'interrupteur général, il ne reçoit plus aucun email lié à ces
  domaines ; ses réglages par domaine sont conservés et retrouvés s'il le réactive.
- **Si** l'utilisateur n'a pas d'adresse email sur son compte, la page l'indique et les réglages
  sont sans effet ; les notifications dans l'application continuent.
- **Si** l'utilisateur appartient à plusieurs églises, ses réglages valent pour toutes : un seul
  jeu de réglages par personne.
- **Quand** une notification concerne un domaine désactivé pour ce destinataire, l'action qui l'a
  déclenchée réussit normalement : seul l'email n'est pas envoyé.
- **Si** un email est adressé à une personne **sans compte** (nouvel arrivant, demandeur externe,
  pasteur ou berger sans compte), il part comme aujourd'hui : aucune préférence ne s'applique.
- **Emploi** : les réglages détaillés existants (types d'offres, profils, email ou non) restent
  valables et visibles depuis la même page. L'interrupteur général s'applique aussi à eux.

## Critères d'acceptation

- [x] Un utilisateur connecté accède, depuis son profil, à une page « Mes notifications » qui
      montre l'interrupteur général et un réglage par domaine.
- [x] Désactiver un domaine arrête tous les emails de ce domaine pour cet utilisateur, et pour
      lui seul ; les notifications dans l'application de ce domaine continuent d'arriver.
      *(vérifiable dès le lot 1 sur les domaines déjà migrés — comptabilité, planning, suivi
      pastoral, intégration, emploi)*
- [ ] Activer un domaine qui n'envoyait pas d'email fait partir par email les notifications de ce
      domaine destinées à cet utilisateur. *(le mécanisme le permet — `resolveEmailPreference`
      respecte une préférence explicite au-delà de `defaultEmail` — mais aucun des 10 sites migrés
      au lot 1 n'a `defaultEmail: false` : rien à observer avant que le lot 2 migre un premier
      site de ce type, ex. `rooms`)*
- [x] Désactiver l'interrupteur général arrête tous les emails liés aux domaines ; le réactiver
      rétablit les réglages par domaine précédents.
- [x] À la mise en service, un utilisateur qui n'a rien réglé reçoit encore par email tout ce
      qu'il recevait avant ; les domaines qui envoyaient déjà des emails sont activés en entier,
      les autres sont désactivés.
- [x] Chaque email envoyé à un utilisateur contient le domaine concerné et un lien vers
      « Mes notifications ».
- [x] Les emails adressés à des personnes sans compte partent comme avant.
- [x] Un utilisateur ne peut ni voir ni modifier les préférences d'un autre utilisateur, quel que
      soit son rôle.
- [x] Un utilisateur sans adresse email voit un message l'indiquant sur la page.
- [x] La page n'affiche que les domaines où l'utilisateur peut recevoir des notifications.
- [x] Un utilisateur présent dans plusieurs églises a un seul jeu de réglages, appliqué à
      toutes.
- [x] Les réglages existants du module emploi sont conservés et restent modifiables.
- [x] Aucune action métier n'échoue parce qu'un email n'est pas envoyé.

## Hors périmètre

- Désactiver les notifications **dans l'application** : elles restent toujours actives.
- Un réglage plus fin que le domaine (événement par événement), sauf pour l'emploi qui garde ses
  réglages actuels.
- Les regroupements d'emails (résumé quotidien ou hebdomadaire au lieu d'emails unitaires), en
  dehors du résumé de planning qui existe déjà.
- Les autres canaux (SMS, WhatsApp, notifications push sur téléphone).
- Un lien de désabonnement « en un clic » utilisable sans se connecter.
- Le réglage des préférences d'un utilisateur par un administrateur.

## Décisions

Tranchées en revue le 2026-09-25 :

- **Réglage par défaut** : la mise en service ne retire aucun email à personne ; les domaines qui
  envoient déjà des emails sont activés, les autres désactivés.
- **Domaine partiellement couvert** (planning) : activé en entier.
- **Plusieurs églises** : un seul jeu de réglages par personne, commun à toutes ses églises.
- **Affichage** : seuls les domaines où l'utilisateur peut recevoir des notifications.

## Questions ouvertes

- Aucun domaine « Discipolat » ni « Médias » pour l'instant : ils n'envoient aujourd'hui aucune
  notification à un utilisateur. Ils seront ajoutés, avec la même règle, le jour où ils en
  enverront.
