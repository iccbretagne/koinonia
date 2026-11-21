# Spec — Site d'événement de billetterie

- **Numéro** : 084
- **Statut** : Implémentée
- **Créée le** : 2026-11-21
- **Branche suggérée** : `feat/site-evenement`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Un grand événement comme la **Nuit de la traversée** a besoin de plus qu'un formulaire
d'inscription : une identité visuelle (couleurs, logo, ambiance), des pages d'information (dress
code, menus, infos pratiques, programme) et un endroit unique à partager. Aujourd'hui, la page
publique de la billetterie (spec 074) est sobre et identique pour tous les événements ; le reste
se fait ailleurs (affiches, messages WhatsApp, site externe), avec des informations qui divergent
vite des tarifs, menus et places réellement ouverts dans Koinonia.

On veut qu'une église puisse donner à un événement de billetterie **son propre site**,
personnalisé à ses couleurs, construit dans Koinonia à partir des informations qui y sont déjà —
tarifs, options, plats, dates, lieu, règles — et de pages de contenu composées simplement, **sans
jamais permettre d'y injecter du code** ni d'y exposer une donnée personnelle.

## Utilisateurs concernés

- **Admin d'église** : active la fonction « site d'événement » pour son église (coupée par
  défaut).
- **Organisateur de l'événement** (spec 074 : Super Admin, Admin, Secrétaire, ou compte nommé
  organisateur) : compose, prévisualise et publie le site ; demande un domaine dédié ; attribue
  le rôle Communication.
- **Communication** (nouveau rôle d'événement, attribuable à n'importe quel compte de l'église,
  STAR compris) : compose, prévisualise et publie le site ; **aucun accès** aux inscrits, aux
  paiements, à l'équipe ni au paramétrage de l'événement ; ne demande pas de domaine dédié. Comme
  les autres rôles d'événement, il s'arrête à la clôture.
- **Super Admin** : approuve un domaine dédié (il engage la plateforme).
- **Public** : visite le site sans compte, s'inscrit, retrouve et gère sa réservation comme
  aujourd'hui.

## Comportement attendu

### Lot 1 — Thème et page d'accueil (sur l'adresse Koinonia)

1. Depuis l'événement de billetterie, l'organisateur (ou la Communication) ouvre l'onglet **Site**.
2. Il règle le **thème** :
   - 3 à 5 **couleurs** (principale, secondaire, accent, fond, texte) ;
   - une **police** de titres et une de texte, choisies dans une liste fermée ;
   - un **logo** et une **image d'en-tête** (téléversés).
   - un **fond de page** : couleur unie, **dégradé** ou **image** ;
     - dégradé : 2 ou 3 couleurs **prises dans la palette du thème**, linéaire (vertical,
       horizontal, diagonal) ou radial ;
     - image : téléversée, fixe au défilement si on le souhaite, toujours recouverte d'un **voile**
       teinté (couleur du thème, opacité réglable) pour garder le texte lisible.
   Koinonia **vérifie la lisibilité** (contraste du texte sur le fond, mesuré au point le moins
   favorable : chaque couleur d'un dégradé, le voile d'une image) et refuse une combinaison
   illisible, avec la raison et une piste (voile plus sombre, autre couleur de texte).
3. Il compose la **page d'accueil** : titre, accroche, date et lieu (repris de l'événement),
   bouton « Je m'inscris », compte à rebours facultatif.
4. La **page d'inscription existante** prend le thème de l'événement (couleurs, logo, en-tête),
   sans changer son fonctionnement ni ses règles.
5. Il **prévisualise**, puis **publie**. Le site est servi sur une **adresse Koinonia** propre à
   l'événement (sous-domaine, par exemple `nuit-de-la-traversee.<adresse de Koinonia>`).

### Lot 2 — Pages et navigation

1. L'organisateur ajoute des **pages** (jusqu'à 8), chacune avec un titre, une place dans le menu
   et un contenu composé de **blocs** :
   - texte (mise en forme simple : titres, gras, listes, liens) ;
   - image seule ou **galerie** (avec légendes) ;
   - **palette de couleurs** (pastilles nommées : « Vert olive », « Rouge bordeaux »…) ;
   - **cartes** (titre, image, liste à puces — ex. « Pour les femmes / hommes / enfants ») ;
   - **« À faire / À éviter »** (deux listes) ;
   - **pictogrammes et légendes** (choisis dans une bibliothèque fournie) ;
   - **questions fréquentes** ;
   - **bouton** vers une autre page du site ou vers l'inscription.
   Chaque bloc, ou groupe de blocs formant une **bande**, peut avoir son propre **fond** : aucun,
   couleur du thème, dégradé ou image avec voile (mêmes choix et même contrôle de lisibilité que
   le fond de page). S'y ajoutent :
   - la **bannière** pleine largeur : image ou dégradé, titre et accroche par-dessus (ex. l'en-tête
     « Dress code » ou la bande « Autres inspirations » de la maquette) ;
   - les **séparateurs décoratifs**, choisis dans une petite bibliothèque (filet, filet doré avec
     losange, vague), dans la couleur d'accent.
2. Des **pages automatiques**, toujours à jour, peuvent être ajoutées au menu :
   - **Billetterie** : tarifs par tranche d'âge, places restantes, bouton d'inscription ;
   - **Menus** : options et plats, descriptions et allergènes, ceux qui sont fermés ou épuisés
     signalés ;
   - **Infos pratiques** : dates, lieu, règles (mineurs, annulation, paiement).
3. Le **menu de navigation** reprend les pages publiées dans l'ordre choisi ; l'icône
   « compte » mène à « Retrouver ma réservation ».
4. Exemple attendu : la page « Dress code » de la Nuit de la traversée (en-tête, palette des
   quatre couleurs, trois cartes de tenues, galerie d'inspirations, recommandations et à éviter)
   se compose entièrement de ces blocs.

### Lot 3 — Domaine dédié

1. L'organisateur indique un **domaine dédié** (ex. `nuitdelatraversee.fr`) dont l'église est
   propriétaire — **un par événement**, et **5 au plus** par église en même temps.
2. Koinonia affiche les **deux enregistrements DNS** à créer chez le registraire (preuve de
   propriété, et pointage vers Koinonia), avec un guide pas à pas, puis les **vérifie** de
   lui-même.
3. Une fois vérifié, le domaine attend l'**approbation du Super Admin** ; approuvé, il est servi
   en connexion sécurisée, et l'adresse Koinonia du site **redirige** vers lui.
4. Les emails de la billetterie (confirmation, billets, gestion de la réservation) pointent vers
   le domaine dédié ; ils continuent d'être **envoyés par l'adresse de Koinonia**.

### Lot 4 — Par les assistants IA connectés (spec 081, 083)

Le site se conduit aussi depuis son assistant, **dans les mêmes droits** (Organisateur et
Communication pour le site, Organisateur seul pour le domaine), toujours en **aperçu puis
confirmation**, journalisé « via l'assistant IA » :

- **lire** le site : thème, pages, sections et blocs avec leurs identifiants, état (brouillon,
  publié), adresse, problèmes de lisibilité ;
- **régler le thème** : couleurs, polices, fond (couleur, dégradé, image déjà téléversée + voile) ;
- **ajouter, modifier, déplacer, supprimer** une page, une bande ou un bloc — le texte se rédige
  en Markdown restreint, comme dans l'éditeur ;
- **publier** et **dépublier** ;
- **demander un domaine dédié** et lancer sa vérification (Organisateur).

Mêmes contrôles qu'à l'écran : contraste, liens, bornes, images appartenant au site. L'aperçu
montre ce qui change (avant → après) et les problèmes de lisibilité éventuels.

### Cycle de vie

- Un site n'est visible que **publié** et pour un événement **ouvert ou clos aux inscriptions**.
  Brouillon : aperçu réservé à l'organisation.
- Après la **clôture** de l'événement, le site affiche une page « Événement terminé » (titre,
  date, remerciement) pendant **30 jours** par défaut (durée réglable par l'organisateur), puis
  n'est plus servi.
- Toute modification publiée est **journalisée** (qui, quand, quoi).

### Scénarios alternatifs / cas limites

- **Couleurs illisibles** (contraste insuffisant) : refus avec la combinaison en cause.
- **Image** trop lourde, d'un format non autorisé, ou dont le contenu ne correspond pas à son
  extension : refusée ; une image acceptée est redimensionnée et débarrassée de ses métadonnées
  (dont la géolocalisation).
- **Lien** dans un texte : seulement `https`, `mailto:` ou vers une page du site ; tout autre lien
  est refusé.
- **Sous-domaine déjà pris** par un autre événement : Koinonia en propose un autre.
- **Domaine non vérifié** ou en attente : rien n'est servi sur ce domaine (même réponse qu'une
  adresse inconnue).
- **Domaine qui ne pointe plus vers Koinonia** ou dont la preuve disparaît (domaine expiré, puis
  racheté) : le domaine est **suspendu** automatiquement, l'organisateur prévenu, le site reste
  servi sur l'adresse Koinonia.
- **Fonction coupée** par l'Admin d'église : tous les sites de l'église cessent d'être servis ;
  la page d'inscription standard reste disponible.
- **Plusieurs événements** de la même église : un site par événement, indépendants.
- **Sixième domaine dédié** pour une même église : refusé, en nommant les domaines en service ;
  libérer un domaine (événement clôturé et délai passé, ou retrait) en rend un disponible.

### Sécurité et données personnelles

- L'organisateur ne fournit **jamais de code** (HTML, CSS, script) : seulement des blocs typés et
  des choix dans des listes fermées. Dégradés, fonds et séparateurs se composent uniquement à partir
  des couleurs du thème, de directions et motifs prédéfinis et d'images téléversées et vérifiées :
  jamais une valeur de style saisie ni une image externe.
- Le site n'affiche **aucune donnée personnelle** : ni inscrits, ni équipe, ni coordonnées.
- Un domaine dédié ne donne accès **qu'au site et à la billetterie publique** de son événement :
  jamais à la connexion, à l'administration ni à l'application ; la session Koinonia n'y est
  jamais transmise.
- Images de personnes : un rappel demande de s'assurer de leur **accord** (droit à l'image).

## Critères d'acceptation

- [ ] Un organisateur compose le thème et la page d'accueil, prévisualise et publie ; le site
      est servi sur une adresse Koinonia propre à l'événement, sans compte.
- [ ] La page d'inscription existante prend le thème de l'événement, sans changement de règles.
- [ ] Une combinaison de couleurs au contraste insuffisant est refusée, y compris sur un dégradé
      ou une image de fond (contrôle au point le moins favorable).
- [ ] Le fond de page et le fond de chaque bloc ou bande acceptent couleur, dégradé ou image avec
      voile, uniquement à partir du thème et d'images téléversées.
- [ ] La page « Dress code » de la maquette de la Nuit de la traversée se compose avec les
      blocs fournis.
- [ ] Les pages Billetterie, Menus et Infos pratiques reflètent sans délai un changement de
      tarif, de plat ou de lieu.
- [ ] Aucun contenu saisi ne permet d'exécuter un script ni de charger une ressource externe
      (texte, liens, images vérifiés).
- [ ] Aucune page du site n'affiche une donnée personnelle.
- [ ] Un site non publié, ou d'un événement en brouillon, n'est visible que de l'organisation.
- [ ] Un domaine dédié n'est servi qu'après vérification DNS et approbation du Super Admin ; il
      est suspendu automatiquement s'il cesse de pointer vers Koinonia.
- [ ] Sur un domaine dédié, la connexion, l'administration et l'application sont inaccessibles.
- [ ] L'Admin d'église active ou coupe la fonction pour son église ; coupée par défaut.
- [ ] Toute publication est journalisée.
- [ ] Un compte au rôle Communication édite et publie le site, sans voir les inscrits, les
      paiements, l'équipe ni le paramétrage de l'événement.
- [ ] Le site d'un événement clôturé affiche « Événement terminé » 30 jours (ou la durée réglée),
      puis n'est plus servi.
- [ ] Une église ne peut pas avoir plus de 5 domaines dédiés en service.
- [ ] Depuis un assistant connecté, un compte Organisateur ou Communication règle le thème,
      compose les pages et publie le site, après aperçu et confirmation, avec les mêmes contrôles
      qu'à l'écran ; un compte sans ce rôle ne se voit proposer aucune de ces actions.

## Addendum du 21 novembre 2026 : évolutions après recette

Retours de la recette, livrés en six lots empilés (aucune nouvelle table, sauf trois colonnes sur les images) :

- **Édition par lot par l'assistant** : un outil applique 1 à 50 opérations dans l'ordre, tout ou rien ;
  les aperçus indépendants ne s'invalident plus entre eux (le jeton garde l'opération, l'empreinte ne
  porte que sur la portion touchée). L'assistant dispose d'une description générée des blocs et reçoit
  les clés ou `kind` permis quand il se trompe.
- **Images par l'assistant** (le « téléversement » devient possible, ce qui lève l'exclusion
  correspondante ci-dessous) : par adresse https publique ou en base64, texte alternatif obligatoire, JPEG,
  PNG, WebP ou **SVG rastérisé** (aucun SVG n'est stocké ni servi), variantes 640, 1280 et 2400 px, suppression
  refusée tant que l'image sert au brouillon ou à la version publiée. Le téléchargement par adresse est
  protégé contre le SSRF (adresse vérifiée et épinglée, aucune redirection, délai et poids bornés).
- **Boutons et blocs** : boutons vers une page, un lien https, un email, un téléphone, une ancre de la
  page ou l'inscription, en style plein, contour ou discret (lisibilité contrôlée) ; ancres sur bandes et
  blocs ; bandeau avec fond et bouton propre ; bannière avec ligne secondaire et bouton ; cartes (titre,
  texte, colonnes), pictogrammes avec description, titre de questions, galerie ronde ; police Cinzel.
- **Publication** : l'aperçu et le résultat indiquent l'adresse publique finale et un **avertissement**
  explicite si le site ne sera pas accessible (sites non activés, adresse non configurée, événement en
  brouillon) ; la publication reste possible. Les outils du site ne sont proposés à l'assistant que si
  l'église a activé les sites d'événement.
- **Écarts d'outils** : lieu et description dès la création d'un événement, position d'un plat à la création,
  **duplication** d'un événement en brouillon (sans inscrits, paiements, rôles, affectations ni IBAN),
  **export et import JSON** entre instances (sans donnée personnelle).

Critères d'acceptation ajoutés :

- [ ] Deux aperçus du site sur des endroits différents se confirment l'un après l'autre ; sur le même endroit,
      le second est refusé.
- [ ] Un lot dont une opération est invalide, ou qui rend le site illisible, ne change rien.
- [ ] Une adresse d'image pointant vers un réseau privé, ou redirigée, est refusée ; aucun SVG n'est servi.
- [ ] Une image utilisée ne se supprime pas ; sans texte alternatif, une image n'est pas acceptée.
- [ ] Église sans activation des sites : aucun outil du site n'est proposé à l'assistant.
- [ ] Une copie ou un import d'événement est un brouillon sans inscrit, paiement, rôle, affectation ni IBAN ;
      un export ne contient aucune donnée personnelle.

## Hors périmètre

- Code personnalisé (HTML, CSS, scripts), thèmes importés, polices hors liste.
- Envoi des emails depuis le domaine dédié (configuration de messagerie de l'église).
- Achat ou renouvellement du domaine par Koinonia.
- Site pour autre chose qu'un événement de billetterie (site de l'église, d'un ministère).
- Paiement en ligne (Koinonia n'encaisse toujours rien).
- Statistiques de visite.
- ~~Téléversement d'images par un assistant IA~~ : levé par l'addendum du 21 novembre 2026.
- Traduction du site en plusieurs langues.

## Questions ouvertes

Tranché le 21 novembre 2026 :
- Rôle d'événement **Communication** (édition du site seulement).
- Site en ligne **30 jours** après la clôture par défaut, réglable.
- **Un domaine dédié par événement, 5 au plus par église.**
- Adresse par défaut : **sous-domaine** de Koinonia ; domaine dédié en option (lot 3).

Ordre de livraison : lot 1, puis lot 2, puis lot 3, puis lot 4 (assistants) — chaque lot utile seul. À planifier après la
release v1.38.0.
