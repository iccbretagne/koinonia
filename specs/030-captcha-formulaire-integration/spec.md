# Spec — Preuve d'humanité sur le formulaire public « Rejoindre une famille »

- **Numéro** : 030
- **Statut** : Implémentée
- **Créée le** : 2026-08-29
- **Branche suggérée** : `feat/captcha-formulaire-integration`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia expose un formulaire public « Rejoindre une famille », accessible sans compte à toute
personne disposant du lien d'une église. Il est conçu pour être partagé largement — c'est sa
raison d'être.

Chaque soumission déclenche pourtant une chaîne d'effets coûteux et visibles, **sans qu'aucune
preuve d'humanité ne soit demandée** :

- une interrogation d'un service de géolocalisation externe sur l'adresse saisie ;
- la création d'une demande d'intégration, visible par les responsables de l'église ;
- la création d'un dossier de suivi de parcours pour la personne ;
- s'il y a demande de soin pastoral, la création d'une demande de rendez-vous supplémentaire ;
- **l'envoi d'un email de confirmation à l'adresse saisie dans le formulaire**.

Ce dernier point est le plus sensible : l'adresse email destinataire est choisie par celui qui
remplit le formulaire. Un script automatisé peut donc faire envoyer des emails, depuis le domaine
de l'église, à des adresses qu'il choisit — un usage qui abîme la réputation d'expéditeur du
domaine en plus de noyer les responsables sous de fausses demandes.

La seule protection actuelle est une limite du nombre de soumissions par minute et par adresse
réseau. Elle ralentit un script naïf, mais ne l'arrête pas : il suffit de faire tourner les
adresses réseau. Elle ne distingue jamais un humain d'un programme.

Un autre formulaire public de Koinonia — la demande de rendez-vous — exige déjà, lui, une preuve
d'humanité avant toute soumission. Les deux formulaires ont le même profil de risque ; seul l'un
des deux est protégé.

**Précision par rapport au constat d'audit** : le rapport présente aussi la limite par adresse
réseau comme mal conçue (« clé de rate limit contournable »). Vérification faite dans le code,
ce point a déjà été corrigé lors d'un correctif antérieur : la limite est bien appliquée par
adresse réseau et bornée. Ce qui reste réellement ouvert, c'est **l'absence de preuve
d'humanité** — objet de cette spec — ainsi que le fait que l'adresse réseau du visiteur est lue
depuis une information transmise par le proxy, ce qui suppose que celui-ci soit configuré pour
la réécrire. Ce second point relève de la configuration d'infrastructure et non du code : il est
mentionné ici comme limite connue, il n'est pas un critère d'acceptation de cette spec.

**Pourquoi maintenant** : le formulaire est en production et son lien est destiné à circuler
publiquement. Le coût d'un abus n'est pas théorique (emails sortants, appels à un service externe
facturable, pollution des dossiers de suivi), et le moyen de s'en protéger existe déjà dans
l'application, éprouvé sur un autre formulaire.

## Utilisateurs concernés

- **Toute personne remplissant le formulaire public** (visiteur sans compte Koinonia) — devra
  franchir une vérification anti-robot avant de pouvoir soumettre, comme c'est déjà le cas sur le
  formulaire public de demande de rendez-vous.
- **Admin / Secrétaire, et les responsables du suivi d'intégration** — destinataires des demandes
  et des dossiers de parcours créés ; ce sont eux qui subissent aujourd'hui le bruit d'une
  soumission automatisée. Leur usage de l'application n'est pas modifié.
- **Aucun autre rôle n'est impacté** : la partie authentifiée de Koinonia ne change pas.

## Comportement attendu

### Scénario principal

1. Une personne ouvre le formulaire public « Rejoindre une famille » d'une église.
2. Elle remplit les informations demandées.
3. Une vérification anti-robot lui est présentée dans le formulaire, au même titre que les autres
   champs à renseigner.
4. Tant que cette vérification n'est pas franchie, la soumission n'aboutit pas.
5. Une fois la vérification franchie, elle soumet le formulaire.
6. Le serveur contrôle **lui-même** la validité de cette preuve avant de créer quoi que ce soit
   ou d'envoyer le moindre email.
7. La demande est enregistrée et l'email de confirmation envoyé, exactement comme aujourd'hui.

### Scénarios alternatifs / cas limites

- **Si une soumission arrive sans preuve d'humanité**, elle est refusée avec un message explicite,
  et aucune donnée n'est créée, aucun email envoyé, aucun service externe interrogé.
- **Si la preuve fournie est invalide ou périmée**, la soumission est refusée de la même manière ;
  la personne peut refaire la vérification et soumettre à nouveau sans perdre sa saisie.
- **Si la vérification expire pendant que la personne remplit le formulaire** (formulaire long,
  hésitation), elle doit pouvoir la refaire, et la soumission doit rester possible ensuite.
- **Si le service de vérification est inaccessible ou non configuré**, la soumission est refusée
  plutôt qu'acceptée sans contrôle — le formulaire est temporairement indisponible, mais jamais
  ouvert aux robots. C'est un choix assumé, cohérent avec le formulaire de rendez-vous existant.
- **Le formulaire public de demande de rendez-vous** doit continuer de fonctionner exactement
  comme avant cette évolution.

## Critères d'acceptation

- [x] Une soumission du formulaire « Rejoindre une famille » sans preuve d'humanité est refusée.
- [x] Une soumission avec une preuve invalide ou périmée est refusée.
- [x] Une soumission refusée pour cette raison ne crée aucune demande d'intégration, aucun dossier
      de suivi, aucune demande de rendez-vous, et ne provoque aucun envoi d'email ni aucune
      interrogation du service de géolocalisation.
- [x] Une soumission accompagnée d'une preuve valide aboutit exactement comme aujourd'hui.
- [x] La vérification est contrôlée côté serveur, pas seulement affichée côté navigateur.
- [x] La personne peut refaire la vérification si celle-ci expire, sans perdre les informations
      déjà saisies.
- [x] Le formulaire public de demande de rendez-vous conserve son comportement actuel, inchangé.

## Hors périmètre

- **La suggestion de famille pendant la saisie de l'adresse** : cette fonction est appelée au fil
  de la frappe et ne crée aucune donnée, n'envoie aucun email. Y exiger une preuve d'humanité
  imposerait de résoudre un défi à chaque caractère saisi, ce qui rendrait le formulaire
  inutilisable. Elle reste protégée par sa seule limite de débit, comme aujourd'hui.
- **La fiabilité de l'identification de l'adresse réseau du visiteur** : elle dépend de la
  configuration du proxy placé devant l'application, pas du code. Limite connue et documentée,
  hors périmètre.
- **Remplacer la limite de débit par un mécanisme partagé entre plusieurs instances** : le
  déploiement actuel est mono-instance ; cette évolution serait une refonte d'infrastructure sans
  rapport avec le problème traité ici.
- **Étendre la preuve d'humanité à d'autres formulaires** que celui visé : les autres points
  d'entrée publics existants sont déjà protégés ou hors sujet.
- **Changer le fournisseur de vérification anti-robot** ou en introduire un second : cette spec
  réutilise celui déjà en service.

## Questions ouvertes

- Aucune sur le comportement attendu. **Point d'attention de déploiement**, à acter plutôt qu'à
  trancher : si le service de vérification n'est pas configuré pour l'environnement, le formulaire
  refusera toute soumission (comportement volontaire, voir cas limites). La configuration existe
  déjà en production pour le formulaire de rendez-vous ; il faut confirmer qu'elle s'applique
  bien au formulaire d'intégration avant mise en ligne.
