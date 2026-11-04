# Spec — Assistant de prise en main

- **Numéro** : 075
- **Statut** : En revue
- **Créée le** : 2026-11-04
- **Branche suggérée** : `feat/assistant`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia couvre désormais beaucoup de domaines : planning, disponibilités, demandes,
comptabilité, navette, dons, suivi pastoral, salles, emploi, billetterie… Chaque rôle n'en voit
qu'une partie, mais cette partie reste riche, et les utilisateurs occasionnels ne retrouvent pas
où faire un geste.

Aujourd'hui, l'aide existe mais elle est dispersée et peu consultée :
- un **guide des fonctionnalités** par rôle, sur une page à part ;
- une **visite guidée** au premier lancement, qu'on ne revoit plus ensuite ;
- la **recherche** (⌘K), qui trouve des pages mais n'explique pas comment faire.

Les questions arrivent donc sur WhatsApp, auprès des responsables et des administrateurs :
« comment je déclare une absence ? », « où je vois mon planning ? », « comment je rembourse une
dépense de la navette ? ». Chaque nouveau module ajoute des questions, et les mêmes reviennent à
chaque nouvel arrivant.

On veut qu'un utilisateur trouve la réponse **dans Koinonia, au moment où il se pose la
question**, adaptée à **son rôle** et à **l'écran où il se trouve**, avec un lien direct vers le
bon écran.

## Utilisateurs concernés

**Tous les rôles connectés** (Super Admin, Admin, Secrétaire, Ministre, Resp. département,
Faiseur de Disciples, Reporter, STAR, Référent soins pastoraux, Comptable) :
- ouvrent l'aide depuis n'importe quel écran ;
- posent une question en langage courant ;
- reçoivent une réponse limitée à ce que **leur rôle** permet de faire, avec des liens vers les
  écrans concernés.

**Super Admin** : active ou désactive l'assistant pour toute l'instance, et voit son usage
(nombre de questions, part des réponses jugées utiles) ainsi que le texte **anonymisé** des
questions jugées « Pas utile », pour améliorer la documentation.

**Admin d'église** : peut couper l'assistant pour **son** église quand l'instance l'a activé ;
ses membres gardent alors l'aide écrite.

**Public sans compte** (pages d'inscription, de dons…) : non concerné.

## Comportement attendu

### Scénario principal — poser une question

1. Un STAR, sur l'écran « Mon planning », touche le bouton d'aide présent sur tous les écrans.
2. Le panneau d'aide s'ouvre. Il propose d'abord **quelques questions fréquentes liées à cet
   écran** (par exemple « Comment déclarer une indisponibilité ? »), puis un champ libre.
3. Il écrit : « je ne suis pas dispo dimanche, je fais comment ? ».
4. L'assistant répond en quelques phrases, en français simple :
   - les étapes à suivre ;
   - un **lien direct** vers l'écran concerné (« Ouvrir Disponibilités ») ;
   - si besoin, ce que son rôle **ne permet pas** et à qui s'adresser (« votre responsable de
     département »).
5. Il peut poser une question de suivi dans la même conversation.
6. Sous chaque réponse, il indique si elle l'a aidé (« Utile » / « Pas utile »).

### Scénario — réponse adaptée au rôle

- Un **STAR** demande « comment je modifie le planning du département ? ». L'assistant explique
  que ce geste revient au responsable de département ou au ministre, et ce que le STAR peut faire
  lui-même (déclarer une indisponibilité, demander un remplacement).
- Un **Resp. département** pose la même question : l'assistant donne les étapes et le lien vers
  la grille de son département.
- L'assistant ne propose **jamais** un écran que le rôle ne peut pas ouvrir.

### Scénario — aide sans assistant (repli)

- **Si l'assistant n'est pas configuré, désactivé ou indisponible** (panne du service, quota
  atteint), le bouton d'aide reste là. Le panneau montre alors :
  - l'**aide de l'écran courant** pour le rôle : ce qu'on y fait et les gestes principaux ;
  - les **questions fréquentes** de cet écran, avec leurs réponses écrites ;
  - une **recherche** dans l'aide ;
  - un lien vers le guide complet.
- Le passage de l'un à l'autre ne casse rien : l'utilisateur voit un message clair (« L'assistant
  n'est pas disponible, voici l'aide de cet écran »).

### Scénarios alternatifs / cas limites

- **Question hors sujet** (météo, Bible, conseil personnel, question sur une personne) :
  l'assistant répond qu'il aide uniquement à utiliser Koinonia, poliment, sans argumenter.
- **Question sur des données** (« combien de STAR sont dispo dimanche ? », « qui est en service
  ? ») : l'assistant explique **où** trouver l'information dans Koinonia, sans jamais y accéder
  lui-même.
- **Information personnelle tapée dans la question** (nom, téléphone, situation pastorale) : un
  rappel discret sous le champ invite à ne pas en saisir, et les adresses email et numéros de
  téléphone sont **masqués automatiquement** avant que la question ne quitte Koinonia.
- **Réponse incertaine** : l'assistant dit qu'il ne sait pas, plutôt que d'inventer, et propose
  le guide ou de contacter un administrateur de l'église.
- **Fonction absente de l'instance** (module désactivé) : l'assistant ne la mentionne pas, comme
  si elle n'existait pas.
- **Trop de questions** : au-delà d'une limite par personne et par jour, l'assistant se met en
  pause pour cette personne et l'aide écrite prend le relais, avec un message clair. La limite
  est de **30 questions par personne et par jour**.
- **Mobile** : le panneau s'ouvre en plein écran sur téléphone, sans masquer la barre de
  navigation une fois fermé.
- **Nouvelle version de Koinonia** : les réponses suivent la documentation de la version en
  service, sans action manuelle de l'église.

## Critères d'acceptation

- [ ] Un bouton d'aide est accessible depuis tous les écrans connectés, sur ordinateur et sur
      téléphone.
- [ ] Le panneau propose des questions fréquentes propres à l'écran courant et au rôle.
- [ ] L'assistant répond en français à une question libre, avec au moins un lien vers l'écran
      concerné quand il en existe un.
- [ ] Un lien proposé par l'assistant ouvre toujours un écran accessible au rôle de la personne.
- [ ] Un STAR qui demande comment faire un geste réservé à un autre rôle reçoit l'explication de
      qui peut le faire, sans lien vers un écran qu'il ne peut pas ouvrir.
- [ ] L'assistant n'a accès à **aucune donnée de l'église** (personnes, plannings, finances,
      suivi pastoral) : seule la documentation, le rôle et l'écran courant lui sont fournis.
- [ ] Une question hors sujet reçoit un refus poli et une redirection vers l'aide.
- [ ] Une fonction d'un module désactivé n'est jamais mentionnée.
- [ ] Sans assistant (non configuré, désactivé, panne, limite atteinte), l'aide écrite de l'écran
      s'affiche avec ses questions fréquentes et une recherche.
- [ ] Au-delà de 30 questions dans la journée, la personne bascule sur l'aide écrite, avec un
      message clair.
- [ ] Les emails et numéros de téléphone tapés dans une question sont masqués avant l'envoi.
- [ ] Une conversation n'est pas conservée après la fermeture du panneau ; seuls restent les
      compteurs, les avis « Utile / Pas utile » et le texte anonymisé des questions « Pas utile ».
- [ ] Chaque réponse peut être jugée « Utile » / « Pas utile ».
- [ ] Le Super Admin peut activer et désactiver l'assistant pour l'instance, et voit le nombre de
      questions, la part de réponses jugées utiles et le texte des questions « Pas utile »,
      sans jamais savoir qui les a posées.
- [ ] L'Admin d'église peut couper l'assistant pour son église ; ses membres voient alors l'aide
      écrite.
- [ ] Le module se désactive comme les autres ; désactivé, aucun bouton d'aide ne mène à
      l'assistant, et l'aide écrite reste disponible.

## Hors périmètre

- Agir à la place de l'utilisateur (déclarer une absence, créer un événement, remplir un
  formulaire) : l'assistant **explique**, il ne fait pas.
- Lire, résumer ou analyser les données de l'église.
- Assistance au public sans compte (pages d'inscription, de dons, d'accueil).
- Accompagnement spirituel ou pastoral, réponses bibliques.
- Messages vocaux, captures d'écran envoyées par l'utilisateur.
- Langues autres que le français.
- Remplacement de la visite guidée existante (elle reste en place).

## Questions ouvertes

- Les réponses écrites de l'aide de repli (questions fréquentes par écran) sont à rédiger.
  Proposition : les 10 écrans les plus utilisés, rédigés avec le plan.
- Coût : l'assistant repose sur un service externe payant à l'usage ; le budget mensuel accepté
  est à confirmer avant la mise en production (sans effet sur le plan).

## Décisions

- Activation : Super Admin pour l'instance ; l'Admin d'église peut le couper pour son église.
- Limite : 30 questions par personne et par jour.
- Conservation : aucune conversation ; compteurs, avis et texte anonymisé des questions
  « Pas utile » seulement.
- Emails et numéros de téléphone masqués automatiquement avant l'envoi.
