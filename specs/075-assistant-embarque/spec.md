# Spec — Assistant de prise en main

- **Numéro** : 075
- **Statut** : Validée
- **Créée le** : 2026-11-04
- **Branche suggérée** : `feat/assistant`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Koinonia couvre désormais beaucoup de domaines : planning, disponibilités, demandes,
comptabilité, navette, dons, suivi pastoral, salles, emploi, billetterie… Chaque rôle n'en voit
qu'une partie, mais cette partie reste riche, et les utilisateurs occasionnels ne retrouvent pas
où faire un geste ni où lire une information.

Aujourd'hui, l'aide existe mais elle est dispersée et peu consultée :
- un **guide des fonctionnalités** par rôle, sur une page à part ;
- une **visite guidée** au premier lancement, qu'on ne revoit plus ensuite ;
- la **recherche** (⌘K), qui trouve des pages mais n'explique pas comment faire.

Les questions arrivent donc sur WhatsApp, auprès des responsables et des administrateurs. Elles
sont de deux sortes :
- **sur l'application** : « comment je déclare une absence ? », « comment je rembourse une
  dépense de la navette ? » ;
- **sur ce que la personne peut déjà voir** : « je sers quand ce mois-ci ? », « qui est en service
  dimanche dans mon département ? », « combien de demandes de compta j'ai à valider ? ».

On veut qu'un utilisateur obtienne la réponse **dans Koinonia, au moment où il se pose la
question**, adaptée à **son rôle** et à **l'écran où il se trouve**, avec un lien direct vers le
bon écran.

L'assistant fonctionne **entièrement dans Koinonia, sans service externe** : aucune question ni
donnée ne quitte l'instance, il n'y a ni abonnement ni coût à l'usage, et ses réponses sont
prévisibles. Il comprend les questions **prévues** (sur l'application et sur les données), pas
toute question imaginable ; ce qu'il ne sait pas faire est remonté pour enrichir l'aide.

## Utilisateurs concernés

**Tous les rôles connectés** (Super Admin, Admin, Secrétaire, Ministre, Resp. département,
Faiseur de Disciples, Reporter, STAR, Référent soins pastoraux, Comptable) :
- ouvrent l'assistant depuis n'importe quel écran ;
- posent une question en langage courant ;
- reçoivent une réponse limitée à ce que **leur rôle** permet de faire et de voir.

**Super Admin** :
- active ou désactive l'assistant pour toute l'instance ;
- voit son usage : nombre de questions, part des réponses jugées utiles, et le texte
  **anonymisé** des questions restées sans réponse ou jugées « Pas utile », pour compléter l'aide.

**Admin d'église** : peut couper l'assistant pour **son** église quand l'instance l'a activé ; ses
membres gardent alors l'accès au guide.

**Public sans compte** (pages d'inscription, de dons…) : non concerné.

## Comportement attendu

### Scénario principal — question sur l'application

1. Un STAR, sur l'écran « Mon planning », touche le bouton d'aide présent sur tous les écrans.
2. Le panneau s'ouvre. Il propose d'abord **quelques questions fréquentes liées à cet écran et à
   son rôle**, puis un champ libre.
3. Il écrit : « je suis pas dispo dimanche je fais comment ».
4. L'assistant reconnaît la question malgré la formulation, les fautes et les mots familiers
   (« dispo », « absent », « pas là ») et répond :
   - les étapes à suivre, en français simple ;
   - un **lien direct** vers l'écran concerné (« Ouvrir Disponibilités ») ;
   - si besoin, ce que son rôle ne permet pas et à qui s'adresser (« votre responsable de
     département »).
5. Sous chaque réponse, il indique si elle l'a aidé (« Utile » / « Pas utile »).

### Scénario principal — question sur ses données

1. Un STAR demande : « je sers quand ce mois-ci ? ».
2. L'assistant reconnaît une question de données prévue et répond avec **ses propres
   informations**, celles qu'il voit déjà dans « Mon planning » : la liste de ses services du
   mois, avec la date, l'événement et le département.
3. Un lien « Voir dans Mon planning » ouvre l'écran complet.

Exemples de questions de données prévues dès le départ, selon le rôle :
- **Tous** : mon prochain service ; mes services du mois ; mes demandes en attente ; mes
  réservations de billetterie ; mes affectations à l'équipe d'un événement.
- **STAR** : mes indisponibilités déclarées ; qui me remplace ; les consignes de mon département.
- **Resp. département / Ministre** : qui est en service dimanche ; qui est indisponible ; les
  postes non pourvus ; les demandes à traiter dans mon périmètre.
- **Secrétaire / Admin** : les événements de la semaine ; les demandes en attente par type ; les
  comptes rendus manquants.
- **Comptable** : les demandes à valider ; le montant en attente de paiement ; le solde de la
  navette.

### Scénario — réponse adaptée au rôle

- Un **STAR** demande « comment je modifie le planning du département ? ». L'assistant explique
  que ce geste revient au responsable de département ou au ministre, et ce que le STAR peut faire
  lui-même (déclarer une indisponibilité, demander un remplacement).
- Le même STAR demande « qui est indisponible dimanche ? ». L'assistant répond que cette
  information est réservée aux responsables, sans rien en dévoiler.
- Un **Resp. département** pose les mêmes questions : il obtient les étapes, la liste demandée
  **pour ses départements seulement**, et les liens vers la grille de son département.
- L'assistant ne propose **jamais** un écran que le rôle ne peut pas ouvrir, et ne montre
  **jamais** une information que l'écran correspondant ne montrerait pas à cette personne.

### Scénarios alternatifs / cas limites

- **Question non reconnue** : l'assistant le dit simplement, propose les deux ou trois questions
  les plus proches qu'il connaît et le lien vers le guide. La question est enregistrée, sans le
  nom de la personne, pour compléter l'aide.
- **Question hors sujet** (météo, Bible, conseil personnel) : l'assistant répond qu'il aide
  uniquement à utiliser Koinonia, poliment.
- **Question de données non prévue** (« combien de STAR ont servi plus de 3 fois en octobre ? ») :
  l'assistant indique l'écran le plus proche (statistiques, planning) et enregistre la question
  comme ci-dessus.
- **Plusieurs églises** : les réponses sur les données portent sur l'**église courante**, comme
  les écrans ; l'assistant le rappelle si la personne a plusieurs églises.
- **Fonction absente de l'instance** (module désactivé) : l'assistant ne la mentionne pas, ni
  pour expliquer un geste ni pour répondre sur des données.
- **Rien à montrer** (aucun service ce mois-ci, aucune demande en attente) : l'assistant le dit
  clairement plutôt que de renvoyer une liste vide.
- **Liste longue** : l'assistant montre les premiers éléments et renvoie vers l'écran pour la
  suite.
- **Mobile** : le panneau s'ouvre en plein écran sur téléphone, sans masquer la barre de
  navigation une fois fermé.
- **Nouvelle version de Koinonia** : les questions et réponses suivent la version en service ;
  un nouveau module arrive avec ses propres questions.

## Critères d'acceptation

- [ ] Un bouton d'aide est accessible depuis tous les écrans connectés, sur ordinateur et sur
      téléphone.
- [ ] Le panneau propose des questions fréquentes propres à l'écran courant et au rôle.
- [ ] Une question sur l'application formulée librement, avec fautes ou mots familiers, reçoit
      la bonne réponse écrite et un lien vers l'écran concerné.
- [ ] Une question de données prévue reçoit les informations de la personne, pour l'église
      courante, avec un lien vers l'écran complet.
- [ ] Une réponse sur des données ne montre jamais plus que ce que l'écran correspondant montre à
      cette personne (même périmètre de rôle, de département, de ministère et d'église).
- [ ] Aucune réponse ne recopie une donnée de suivi pastoral ni le téléphone, l'email ou
      l'adresse d'une autre personne : l'assistant renvoie vers l'écran.
- [ ] Un lien proposé par l'assistant ouvre toujours un écran accessible au rôle de la personne.
- [ ] Un STAR qui demande une information ou un geste réservé à un autre rôle reçoit
      l'explication de qui peut le faire, sans aucune donnée.
- [ ] Aucune question ni aucune donnée ne quitte Koinonia : l'assistant fonctionne sans service
      externe.
- [ ] Une question non reconnue reçoit des suggestions proches et le lien vers le guide ; elle
      est enregistrée sans le nom de la personne.
- [ ] Une question hors sujet reçoit un refus poli.
- [ ] Une fonction d'un module désactivé n'est jamais mentionnée.
- [ ] Chaque réponse peut être jugée « Utile » / « Pas utile ».
- [ ] Une conversation n'est pas conservée après la fermeture du panneau ; seuls restent les
      compteurs, les avis et le texte anonymisé des questions sans réponse ou jugées
      « Pas utile ».
- [ ] Le Super Admin active ou désactive l'assistant pour l'instance et voit l'usage et les
      questions anonymisées, sans jamais savoir qui les a posées.
- [ ] L'Admin d'église peut couper l'assistant pour son église ; ses membres voient alors le lien
      vers le guide à la place.
- [ ] Le module se désactive comme les autres ; désactivé, aucun bouton d'aide ne mène à
      l'assistant.

## Hors périmètre

- Comprendre **n'importe quelle** question ou combiner librement les données : seules les
  questions prévues sont traitées. Une IA (externe ou installée sur le serveur) pourra s'ajouter
  plus tard, sur les mêmes questions et les mêmes droits ; ce n'est pas l'objet de cette spec.
- Agir à la place de l'utilisateur (déclarer une absence, créer un événement, valider une
  demande) : l'assistant **explique et montre**, il ne fait pas.
- Toute donnée que la personne ne voit pas déjà dans un écran.
- Données de suivi pastoral et coordonnées personnelles d'autres personnes (téléphone, email,
  adresse), même visibles à l'écran : l'assistant renvoie vers l'écran sans les recopier.
- Assistance au public sans compte.
- Accompagnement spirituel ou pastoral, réponses bibliques.
- Messages vocaux, captures d'écran envoyées par l'utilisateur.
- Langues autres que le français.
- Remplacement de la visite guidée existante.

## Questions ouvertes

- Le contenu (questions-réponses sur l'application, catalogue des questions de données) est à
  rédiger. Proposition : les 10 écrans les plus utilisés et une vingtaine de questions de données
  au premier lot, puis chaque module enrichit les siennes.

## Décisions

- Aucun service externe : tout se passe dans Koinonia.
- Deux familles de questions : sur l'application, et sur les données que la personne voit déjà.
- Activation : Super Admin pour l'instance ; l'Admin d'église peut le couper pour son église.
- Données sensibles : l'assistant ne recopie jamais de données de suivi pastoral ni les
  coordonnées personnelles d'autres personnes ; il renvoie vers l'écran concerné.
- Conservation : aucune conversation ; compteurs, avis et texte anonymisé des questions sans
  réponse ou jugées « Pas utile » seulement.
