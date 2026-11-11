# Spec — Formulaires (inscriptions, participation, sondages)

- **Numéro** : 079
- **Statut** : Validée
- **Créée le** : 2026-11-11
- **Branche suggérée** : `feat/formulaires`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Le secrétariat collecte aujourd'hui des inscriptions et des avis par des outils extérieurs
(formulaires en ligne gratuits, messages WhatsApp, feuilles papier) :

- **PCNC** : formation sur un ou deux jours, en plusieurs niveaux (dont le niveau 001), avec un
  nombre de places limité par niveau et par session. Les inscrits sont recopiés à la main dans
  un tableau, les places restantes se comptent à la main, et la présence est notée sur papier
  matin et après-midi.
- **Participation à un événement** : « qui vient ? », « combien de personnes ? », « quel
  atelier ? » — sans billet ni paiement, donc hors de la billetterie.
- **Sondages** : avis sur un culte, choix d'une date, retours après un événement — tantôt
  anonymes, tantôt nominatifs.

Conséquences : données personnelles dispersées hors de l'église et jamais effacées, aucun
suivi des places en temps réel, doubles saisies, pas de lien avec les comptes existants.

Cette fonctionnalité permet au secrétariat de **construire lui-même** ses formulaires dans
Koinonia, de les diffuser par un lien (public ou réservé aux comptes connectés), de suivre les
réponses et les places, de noter la présence par demi-journée, et d'effacer les données au
terme d'une durée de conservation.

## Utilisateurs concernés

| Rôle | Ce qu'il peut faire |
|---|---|
| **Super Admin, Admin, Secrétaire** | Créer, modifier, publier, fermer, dupliquer et supprimer les formulaires de leur église ; consulter les réponses, les exporter ; gérer les places et la liste d'attente ; noter les présences |
| **Intervenant désigné** (ex. formateur PCNC), n'importe quel compte de l'église | Pour **un formulaire donné**, désigné par le secrétariat : consulter la liste des réponses et noter les présences. Ne modifie ni le formulaire ni les réponses, n'exporte pas ; son accès s'éteint à la fermeture du formulaire ou quand le secrétariat le retire |
| **Tout compte connecté de l'église** (Ministre, Resp. département, STAR, Comptable…) | Répondre à un formulaire réservé aux comptes connectés ; retrouver et modifier ou annuler sa propre réponse tant que le formulaire est ouvert |
| **Personne sans compte** | Répondre à un formulaire public par son lien ; recevoir un accusé de réception ; gérer sa réponse par le lien reçu |

Aucun autre rôle ne voit les réponses d'autrui. Dans un sondage anonyme, l'intervenant désigné
ne voit que les résultats regroupés.

## Comportement attendu

### Scénario principal — inscription PCNC

1. La secrétaire crée un formulaire « PCNC — novembre », de type **Inscription**, **public**.
2. Elle déclare les **sessions** : « Samedi 22 novembre » (1 jour) et « 29-30 novembre »
   (2 jours), et pour chacune les **niveaux** proposés (001, 101, 201…) avec un nombre de
   places par niveau. Le niveau **001** est le niveau d'entrée, sans prérequis.
3. Elle ajoute ses questions : nom, prénom, téléphone, email, « Église d'origine » (liste), consentement au traitement des données.
4. Elle fixe la date de fermeture, active la **liste d'attente**, garde la durée de conservation
   par défaut (12 mois), désigne le formateur comme intervenant, puis publie. Elle copie le lien et le partage.
5. Une personne ouvre le lien sur son téléphone, choisit sa session et son niveau (les places
   restantes sont affichées, un niveau complet est signalé). Pour tout niveau autre que 001, on
   lui demande si elle a suivi le niveau précédent (oui/non). Elle répond et envoie.
6. Elle reçoit un **accusé de réception** par email avec un récapitulatif et un lien pour
   modifier ou annuler son inscription.
7. La secrétaire voit les inscrits par session et par niveau, avec le décompte des places, et
   reçoit une notification à chaque nouvelle inscription (réglable).
8. Le jour J, elle ou le **formateur désigné** ouvre la **feuille de présence** de la session et
   coche chaque inscrit **matin** et **après-midi**, pour chaque jour de la session.
9. Après la formation, elle exporte la liste des inscrits avec leurs présences.
10. Au terme de la durée de conservation, les réponses nominatives sont effacées ; restent les
    chiffres (nombre d'inscrits, de présents par niveau).

### Scénario — participation à un événement

1. La secrétaire crée un formulaire de type **Participation**, réservé aux **comptes connectés**,
   rattaché à un événement existant de l'église — événement d'église ou événement de la
   billetterie.
2. Les questions : « Je viens » (oui/non), « Nombre d'accompagnants » (nombre, 0 à 5),
   « Atelier » (choix unique, 20 places par atelier).
3. Un STAR connecté répond ; son nom et son email sont déjà connus, il ne les ressaisit pas.
4. Le formulaire est accessible depuis la page de l'événement ; la secrétaire voit le total des
   participants (accompagnants compris) et le remplissage des ateliers.

### Scénario — sondage

1. La secrétaire crée un formulaire de type **Sondage** et choisit **anonyme** ou **nominatif**.
2. Elle ajoute des questions (choix unique, choix multiple, note de 1 à 5, texte libre).
3. Les répondants répondent ; dans un sondage anonyme, aucun nom, email ni compte n'est
   enregistré ni affiché, même à la secrétaire.
4. La secrétaire voit les **résultats regroupés** (pourcentages et graphiques par question,
   liste des réponses libres) et peut les exporter.

### Construction d'un formulaire

- Types de questions : texte court, texte long, choix unique, choix multiple, liste déroulante,
  oui/non, nombre (bornes min/max), date, email, téléphone, note (1 à 5), consentement, et
  **session et niveau** (propre aux inscriptions).
- Chaque question : libellé, aide facultative, obligatoire ou non.
- Un choix peut avoir un **nombre de places** ; une fois atteint, il n'est plus proposé (ou
  passe en liste d'attente si elle est activée).
- **Affichage conditionnel simple** : une question peut n'apparaître que si une réponse
  précédente vaut une valeur donnée.
- Questions réordonnables, aperçu avant publication, duplication d'un formulaire existant
  (ex. reprendre le PCNC du mois précédent).

### Diffusion et accès

- Par formulaire, au choix : **public** (lien, sans compte, protection anti-robot et limite de
  débit) ou **comptes connectés de l'église**.
- États : brouillon → publié → fermé. Ouverture et fermeture automatiques à des dates choisies ;
  fermeture aussi par nombre maximal de réponses atteint.
- Un formulaire fermé, brouillon, supprimé ou inexistant affiche le même message « formulaire
  non disponible ».

### Scénarios alternatifs / cas limites

- **Si deux personnes prennent la dernière place en même temps**, une seule l'obtient ; l'autre
  est prévenue que le niveau est complet (et proposée en liste d'attente si elle est active).
- **Quand une place se libère** (annulation, place réduite par le secrétariat), la place est
  **proposée** à la première personne de la liste d'attente, prévenue par email ou notification.
  Elle confirme dans le délai fixé par le formulaire (48 h par défaut) ; sans confirmation, la
  proposition expire et passe à la suivante. Elle peut aussi décliner, ce qui la retire de la
  liste.
- **Si le répondant n'a pas suivi le niveau précédent**, l'inscription est quand même acceptée :
  le prérequis est **indicatif**, jamais bloquant. La liste des inscrits affiche « niveau
  précédent suivi : oui / non » ; la question n'est pas posée pour le niveau 001.
- **Si la même personne s'inscrit deux fois** au même formulaire (même email, ou même compte),
  la seconde réponse est refusée avec un lien vers la première pour la modifier.
- **Si la secrétaire modifie un formulaire qui a déjà des réponses**, elle peut corriger les
  libellés, ajouter une question facultative, augmenter les places ; elle ne peut ni supprimer
  une question ayant des réponses, ni réduire les places sous le nombre d'inscrits, ni changer
  un sondage anonyme en nominatif (ou l'inverse).
- **Si un sondage anonyme est réservé aux comptes connectés**, chaque compte ne répond qu'une
  fois, mais le lien entre le compte et sa réponse n'est jamais visible ni exportable.
- **Quand un inscrit est absent une demi-journée**, la feuille de présence le montre ; les
  présences sont modifiables par le secrétariat jusqu'à la purge.
- **Durée de conservation** : 12 mois par défaut après la fermeture, réglable par formulaire
  jusqu'à **24 mois au plus**. [Durée maximale proposée, à confirmer au plan.]
- **Quand la durée de conservation est écoulée**, les réponses nominatives et les présences sont
  effacées sans retour possible ; les totaux restent consultables.
- **Une personne d'une autre église** (compte connecté ailleurs) ne voit pas un formulaire
  réservé aux comptes connectés de cette église.

## Critères d'acceptation

- [ ] Seuls Super Admin, Admin et Secrétaire créent, modifient, publient, ferment et suppriment
      un formulaire, et seulement dans leur église.
- [ ] Les 13 types de questions listés sont disponibles, avec obligatoire/facultatif et aide.
- [ ] Un formulaire public est accessible sans compte, protégé contre les robots et limité en
      débit ; un formulaire réservé refuse toute personne non connectée à l'église.
- [ ] Une inscription PCNC propose des sessions d'un ou deux jours et des niveaux avec places ;
      les places restantes sont affichées et jamais dépassées, même en cas de réponses simultanées.
- [ ] La liste d'attente prend le relais quand un niveau ou un choix est complet ; une place
      libérée est proposée à la première personne, qui confirme dans le délai, sinon la
      proposition passe à la suivante.
- [ ] Le prérequis entre niveaux n'empêche jamais l'inscription ; « niveau précédent suivi »
      est affiché pour tout niveau autre que 001.
- [ ] Un intervenant désigné voit les réponses et note les présences de ce formulaire seulement,
      sans pouvoir modifier ni exporter ; son accès s'éteint à la fermeture ou au retrait.
- [ ] La feuille de présence permet de noter matin et après-midi pour chaque jour d'une session,
      et l'export inclut ces présences.
- [ ] Le répondant reçoit un accusé de réception et peut modifier ou annuler sa réponse tant que
      le formulaire est ouvert.
- [ ] Un sondage anonyme n'enregistre ni n'affiche aucune information permettant d'identifier le
      répondant ; un sondage nominatif montre qui a répondu quoi.
- [ ] Les résultats d'un sondage sont présentés regroupés par question.
- [ ] L'affichage conditionnel masque et ignore une question dont la condition n'est pas remplie.
- [ ] Les réponses sont exportables par le secrétariat.
- [ ] Le secrétariat est notifié des nouvelles réponses selon sa préférence de notifications.
- [ ] Un formulaire de participation peut être rattaché à un événement d'église ou de la
      billetterie, et s'y retrouve.
- [ ] Les réponses nominatives sont effacées au terme de la durée de conservation (12 mois par
      défaut, 24 mois au plus) ; les totaux restent.
- [ ] Un formulaire indisponible donne le même message quelle que soit la raison.
- [ ] Toute création, modification, publication, fermeture, suppression et tout export sont
      journalisés.

## Hors périmètre

- Paiement (formulaire payant → billetterie).
- Formulaires sur plusieurs pages, calculs, logique conditionnelle combinant plusieurs réponses.
- Dépôt de fichiers par le répondant.
- Signature électronique.
- Création automatique d'une fiche STAR ou d'un compte à partir d'une réponse.
- Modèles partagés entre églises.
- Remplacement des questions de la billetterie et des formulaires existants (`/servir`,
  accueil) — éventuellement une évolution ultérieure.
- Attestation ou certificat de fin de formation PCNC.
- Suivi du parcours PCNC d'une personne d'une session à l'autre.

## Questions ouvertes

Tranchées le 2026-11-11 :

- Intervenant désigné par formulaire (formateur PCNC) : **oui**, consultation et présences.
- Liste d'attente : **proposition à confirmer** dans un délai (48 h par défaut).
- Niveau 001 = niveau d'entrée, sans prérequis ; « niveau précédent suivi : oui / non » affiché.
- Durée de conservation : **maximum** fixé (24 mois proposé), 12 mois par défaut.
- Participation : événements d'église **et** de la billetterie.
