# Spec — Visuel du billet d'entrée

- **Numéro** : 088
- **Statut** : V1 et V2 implémentées et déployées en recette. Validation fonctionnelle en recette à terminer.
- **Créée le** : 2026-11-23
- **Branche de travail** : `claude/visual-deposit-validation-process-gbyji8` (branche existante reprise à la demande de l’utilisateur)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

Pour la Nuit de la Traversée 2027, l'équipe communication a conçu une maquette de billet aux
couleurs de l'événement (bandeau, titre, date, lieu, emplacement du QR code). Aujourd'hui, le
billet reçu par chaque participant a une mise en page fixe et neutre : rien ne permet d'y
appliquer un visuel. Le site de l'événement se personnalise, mais pas le billet ; l'email de
confirmation garde toujours le même bandeau. L'assistant IA connecté a laissé croire qu'il
suffisait « d'activer » la maquette, ce qui est faux.

Les participants gardent et montrent leur billet (téléphone, impression, partage) : c'est une
vitrine de l'événement, et il doit rester lisible à l'entrée.

## Utilisateurs concernés

- **Organisateur de l'événement** (et détenteur de `ticketing:manage`, organisateur implicite) :
  dépose le visuel, place les zones, vérifie l'aperçu, publie ou retire le visuel.
- **Participant (sans compte)** : voit son billet avec le visuel, le télécharge.
- **Accueil / sécurité** : contrôle à l'entrée inchangé (même QR code, même lecture).
- Autres rôles d'événement : lecture seule de l'aperçu, comme le reste de la billetterie.

## Comportement attendu

### Scénario historique (V1)

1. Dans la billetterie, l'organisateur ouvre « Visuel du billet » de l'événement.
2. Il dépose une image de fond (format portrait), conçue **sans** QR code ni nom de participant.
3. Dans l'**éditeur du billet**, il place et dimensionne sur l'image des **vignettes** : QR code,
   nom du participant (prénom, nom, référence, catégorie d'âge), date et heure, lieu, adresse.
   Pour chaque vignette de texte, il choisit **soit** un rendu texte (police, taille, couleur,
   fond, bordure), **soit** une image à positionner à la place (par exemple la date déjà
   dessinée dans le style de la maquette). Les textes viennent de l'événement et du participant ;
   une vignette peut être masquée.
4. Un aperçu avec un billet fictif montre le rendu final ; il publie le visuel.
5. Chaque participant ouvre son billet depuis l'email : il voit le visuel avec **son** QR code,
   son nom et sa référence. Il peut le télécharger en image (PNG) et en PDF.
6. À l'entrée, l'accueil scanne le QR code comme aujourd'hui.

### Scénario principal (V2)

1. L’organisateur crée un modèle V2 ou choisit de convertir une copie de son modèle V1. La conversion prépare un brouillon. Le modèle publié reste celui utilisé par les billets jusqu’à la publication explicite.
2. Il compose le billet sur un fond uni ou une image de fond facultative. Il ajoute des textes, images et formes, règle leur superposition et déplace ou redimensionne les éléments. Il peut dupliquer les éléments, verrouiller leur position et annuler ou rétablir ses modifications.
3. Il compose ses textes à partir de champs autorisés de l’événement et du billet. Il règle leur alignement, les retours à la ligne et l’adaptation de la taille. Le nom complet du participant reste dynamique.
4. Il vérifie les profils fictifs, dont un nom très long, puis enregistre le brouillon. La publication reste une action séparée et explicite.

### Scénarios alternatifs / cas limites

- **Pas de visuel publié** : le billet garde la présentation actuelle.
- **Billet annulé** : le visuel n'est pas affiché ; le billet indique qu'il n'est plus valable
  (le téléchargement est impossible).
- **Événement modifié** (date, lieu, adresse) : les vignettes en mode texte suivent l'événement ;
  celles remplacées par une image ne changent pas — l'écran le rappelle à l'organisateur.
- **Vignette du QR code** : toujours générée par Koinonia (jamais une image déposée), sur fond
  clair avec marge ; seuls sa position et sa taille se règlent, avec une taille minimale.
- **Vignette nominative** : toujours en mode texte (propre à chaque participant).
- **Texte trop long** : en V2, le texte peut revenir à la ligne ou diminuer jusqu’à la taille
  minimale selon le réglage. Si la zone reste trop petite, une erreur identifie l’élément à
  corriger. Le rendu V1 conserve son comportement historique.
- **Visuel remplacé ou retiré** : tous les billets, déjà envoyés compris, suivent le visuel en
  vigueur ; rien n'est renvoyé par email.
- **Zone du QR trop petite ou sur fond chargé** : l'aperçu le signale ; le QR est toujours
  rendu sur un fond clair avec une marge, pour rester lisible.
- **Image refusée** (format, poids, contenu non image) : message clair, visuel précédent gardé.
- **Email de confirmation** : conserve le lien vers le billet courant, sans vignette ajoutée.
- **Assistant IA connecté** : peut déposer et placer le visuel, toujours avec aperçu puis
  confirmation, comme les images du site (spec 087).

## Critères d'acceptation

- [x] L'organisateur dépose, remplace, retire un visuel de billet pour son événement.
- [x] Dans l'éditeur, il place et dimensionne les vignettes QR code, nom, date et heure, lieu,
      adresse ; l'aperçu montre un billet fictif.
- [x] Chaque vignette de texte se règle en texte (police, taille, couleur, fond, bordure) ou se
      remplace par une image positionnée ; le QR code et le nom restent générés par Koinonia.
- [x] Les vignettes en mode texte suivent les changements de l'événement.
- [x] Le billet d'un participant affiche le visuel avec son propre QR, ses nom et référence.
- [x] Le billet se télécharge en PNG et en PDF ; le QR téléchargé est lu par le contrôle d'entrée.
- [x] Le QR reste toujours sur fond clair avec marge, quelle que soit l'image.
- [x] Un billet annulé n'affiche ni visuel ni QR et ne se télécharge pas.
- [x] Sans visuel, le billet reste celui d'aujourd'hui.
- [x] Le contrôle d'entrée et la sécurité du lien du billet sont inchangés.
- [x] Seuls les rôles qui gèrent l'événement modifient le visuel ; toute modification est journalisée.
- [x] L'assistant IA ne prétend jamais appliquer un visuel qu'il ne peut pas appliquer.

- [x] La V2 compose plusieurs éléments indépendants et accepte un fond uni.
- [x] Les noms longs s’adaptent dans leur zone ou déclenchent une erreur explicite.
- [x] La conversion V1 vers V2 et la sauvegarde du brouillon préservent le modèle publié.
- [x] L’API et le MCP acceptent les deux formats avec publication explicite.
- [ ] Valider le parcours complet sur l’instance de recette, puis imprimer et scanner sur un appareil de l’équipe.

## Hors périmètre

- Billets pour portefeuille mobile (Apple Wallet, Google Wallet).
- Visuel différent par catégorie de billet ou par option.
- Groupes imbriqués, rotation, polices personnalisées, export vectoriel et historique des
  anciennes publications.
- Badges de l'équipe et étiquettes repas.

## Arbitrages de l’implémentation

- Visuel propre au billet, indépendant du site de l’événement.
- Téléchargements PNG **et** PDF, conformément aux critères d’acceptation.
- Email inchangé : lien vers le billet courant ; pas de vignette ajoutée.
- Liste fermée de polices : sans empattement, avec empattement, chasse fixe.

Le [plan technique](plan.md) et le [rapport V2](../../docs/ticket-editor-v2.md) détaillent les choix et les validations.
