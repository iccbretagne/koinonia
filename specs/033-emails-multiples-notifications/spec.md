# Spec — Emails multiples pour les notifications comptabilité et secrétariat

- **Numéro** : 033
- **Statut** : Implémentée
- **Créée le** : 2026-08-30
- **Branche suggérée** : `feat/emails-multiples-notifications`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Une église configure aujourd'hui **une seule** adresse email pour recevoir les
notifications de la comptabilité (nouvelle demande financière à traiter) et **une seule**
adresse email pour recevoir celles du secrétariat (digest hebdomadaire des changements de
planning). Ces deux adresses sont saisies une fois pour toutes dans la configuration de
l'église.

Dans la pratique, une seule adresse ne correspond pas à l'organisation réelle d'une église :
la comptabilité et le secrétariat sont souvent tenus par plusieurs personnes (le/la titulaire
et un·e suppléant·e, une adresse de service partagée et la boîte personnelle d'un
responsable qui la double par sécurité), et l'absence, le changement de titulaire ou un simple
oubli de suivi d'une boîte partagée fait qu'une notification importante n'atteint personne
capable d'agir dessus.

Le besoin est demandé pour la comptabilité (issue GitHub #468) et concerne, à l'identique,
le secrétariat : les deux canaux de notification reposent sur le même mécanisme à adresse
unique et souffrent de la même limite.

## Utilisateurs concernés

| Rôle | Ce qui change |
|---|---|
| **Super Admin** | Peut déclarer **plusieurs** adresses email pour la comptabilité et plusieurs adresses pour le secrétariat, au lieu d'une seule par canal, depuis la configuration de l'église. |
| **Comptable** | Reçoit toujours les notifications de nouvelle demande financière — désormais sur toutes les adresses déclarées, pas seulement la première. |
| **Toute personne soumettant une demande financière** | Aucun changement de son point de vue : le traitement de sa demande n'est pas affecté par le nombre de destinataires notifiés côté comptabilité. |
| **Secrétariat / destinataires du digest planning** | Reçoivent toujours le digest hebdomadaire des changements de planning — désormais sur toutes les adresses déclarées pour le secrétariat. |

## Comportement attendu

### Scénario principal — la comptabilité déclare deux adresses

1. Le Super Admin ouvre la configuration de son église.
2. Là où il ne pouvait saisir qu'une seule adresse email pour la comptabilité, il peut
   désormais en déclarer **plusieurs** (par exemple l'adresse du/de la comptable titulaire
   et celle d'un·e responsable en copie).
3. Il enregistre. Les deux adresses sont conservées.
4. Un STAR soumet une nouvelle demande de note de frais.
5. **Les deux adresses déclarées reçoivent la notification**, avec le même contenu qu'aujourd'hui.

### Scénario — le secrétariat fait de même pour le digest planning

1. Le Super Admin déclare deux adresses pour le secrétariat : l'adresse du secrétariat et
   celle d'un backup.
2. À la prochaine exécution du digest planning hebdomadaire, **les deux adresses** reçoivent
   le récapitulatif des changements survenus depuis le dernier envoi.

### Scénarios alternatifs / cas limites

- **Si** aucune adresse n'est déclarée pour un canal (comptabilité ou secrétariat), **aucun
  email n'est envoyé** pour ce canal — comportement identique à aujourd'hui avec un champ
  vide.
- **Si** une seule adresse est déclarée, le comportement observable est **identique** à
  aujourd'hui : un seul email envoyé, au même contenu.
- **Quand** le Super Admin retire une adresse précédemment déclarée, elle cesse de recevoir
  toute notification future — sans purge des envois passés.
- **Si** une adresse email saisie est invalide (syntaxe incorrecte), l'enregistrement est
  refusé et l'adresse fautive est signalée, comme c'est déjà le cas pour l'adresse unique
  actuelle.
- **Si** la même adresse est saisie plusieurs fois pour un même canal, elle ne reçoit la
  notification **qu'une seule fois**.
- **Quand** l'envoi échoue pour une des adresses déclarées (adresse injoignable, panne
  ponctuelle du serveur d'envoi), les autres adresses du même canal reçoivent tout de même
  leur notification — l'échec d'une adresse ne doit pas empêcher les autres.
- **Les églises existantes qui ont déjà une adresse comptabilité et/ou secrétariat
  configurée** conservent cette adresse après la mise en service de la fonctionnalité, sans
  action requise de leur part : leur unique adresse actuelle continue de recevoir les
  notifications comme avant.

## Critères d'acceptation

- [ ] Le Super Admin peut déclarer zéro, une ou plusieurs adresses email pour la
      comptabilité d'une église.
- [ ] Le Super Admin peut déclarer zéro, une ou plusieurs adresses email pour le secrétariat
      d'une église, indépendamment de la comptabilité.
- [ ] Une notification de nouvelle demande financière est reçue par **toutes** les adresses
      comptabilité déclarées pour l'église concernée.
- [ ] Un digest planning hebdomadaire est reçu par **toutes** les adresses secrétariat
      déclarées pour l'église concernée.
- [ ] Une adresse email syntaxiquement invalide, à la création ou à l'ajout, est rejetée
      avec un message clair — pour la comptabilité comme pour le secrétariat.
- [ ] Une même adresse déclarée plusieurs fois pour un canal ne reçoit qu'un seul envoi par
      notification.
- [ ] Les églises qui n'ont configuré qu'une seule adresse (comptabilité et/ou secrétariat)
      avant la mise en service continuent, sans intervention, à la recevoir après.
- [ ] Une église sans aucune adresse déclarée pour un canal n'envoie aucun email pour ce
      canal, sans erreur visible pour l'utilisateur qui déclenche la notification.
- [ ] L'échec d'envoi vers une adresse d'un canal n'empêche pas l'envoi aux autres adresses
      du même canal.

## Hors périmètre

- **Toute distinction de rôle entre les adresses déclarées** (ex. une adresse "principale"
  vs "copie") : toutes les adresses d'un canal sont traitées à l'identique.
- **Un nouveau canal de notification** : seuls les deux canaux existants (comptabilité,
  secrétariat) sont concernés — pas d'ajout de notifications par email qui n'existent pas
  aujourd'hui.
- **La personnalisation du contenu des emails** selon le destinataire : le contenu envoyé
  reste identique pour toutes les adresses d'un même canal.
- **Les autres issues du dépôt** sans rapport avec les emails multiples de notification.
- **Les notifications in-app** (déjà existantes pour la comptabilité, adressées aux
  utilisateurs ayant le rôle Comptable) : elles ne sont pas modifiées par cette spec, qui ne
  porte que sur le canal email.

## Questions ouvertes

- Aucune.
