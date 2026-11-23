# Spec — Visuel du billet d'entrée

- **Numéro** : 088
- **Statut** : Brouillon
- **Créée le** : 2026-11-23
- **Branche suggérée** : `feat/visuel-billet`

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

### Scénario principal

1. Dans la billetterie, l'organisateur ouvre « Visuel du billet » de l'événement.
2. Il dépose une image de fond (format portrait), conçue **sans** QR code ni nom de participant.
3. Il place sur l'image la zone du QR code et la zone du texte nominatif (prénom, nom,
   référence, catégorie d'âge), et peut afficher en surimpression la date, l'heure et le lieu
   tirés de l'événement.
4. Un aperçu avec un billet fictif montre le rendu final ; il publie le visuel.
5. Chaque participant ouvre son billet depuis l'email : il voit le visuel avec **son** QR code,
   son nom et sa référence. Il peut le télécharger en image (PNG) et en PDF.
6. À l'entrée, l'accueil scanne le QR code comme aujourd'hui.

### Scénarios alternatifs / cas limites

- **Pas de visuel publié** : le billet garde la présentation actuelle.
- **Billet annulé** : le visuel n'est pas affiché ; le billet indique qu'il n'est plus valable
  (le téléchargement est impossible).
- **Événement modifié** (date, lieu) : les informations en surimpression suivent l'événement ;
  celles écrites dans l'image ne changent pas — l'écran le rappelle à l'organisateur.
- **Visuel remplacé ou retiré** : tous les billets, déjà envoyés compris, suivent le visuel en
  vigueur ; rien n'est renvoyé par email.
- **Zone du QR trop petite ou sur fond chargé** : l'aperçu le signale ; le QR est toujours
  rendu sur un fond clair avec une marge, pour rester lisible.
- **Image refusée** (format, poids, contenu non image) : message clair, visuel précédent gardé.
- **Email de confirmation** : peut montrer une vignette du billet en plus du lien (à trancher).
- **Assistant IA connecté** : peut déposer et placer le visuel, toujours avec aperçu puis
  confirmation, comme les images du site (spec 087).

## Critères d'acceptation

- [ ] L'organisateur dépose, remplace, retire un visuel de billet pour son événement.
- [ ] Il place la zone du QR et la zone nominative ; l'aperçu montre un billet fictif.
- [ ] Le billet d'un participant affiche le visuel avec son propre QR, ses nom et référence.
- [ ] Le billet se télécharge en PNG et en PDF ; le QR téléchargé est lu par le contrôle d'entrée.
- [ ] Le QR reste toujours sur fond clair avec marge, quelle que soit l'image.
- [ ] Un billet annulé n'affiche ni visuel ni QR et ne se télécharge pas.
- [ ] Sans visuel, le billet reste celui d'aujourd'hui.
- [ ] Le contrôle d'entrée et la sécurité du lien du billet sont inchangés.
- [ ] Seuls les rôles qui gèrent l'événement modifient le visuel ; toute modification est journalisée.
- [ ] L'assistant IA ne prétend jamais appliquer un visuel qu'il ne peut pas appliquer.

## Hors périmètre

- Billets pour portefeuille mobile (Apple Wallet, Google Wallet).
- Visuel différent par catégorie de billet ou par option.
- Éditeur graphique dans Koinonia (le visuel est conçu ailleurs).
- Badges de l'équipe et étiquettes repas.

## Questions ouvertes

- Un visuel propre au billet, ou reprise des couleurs et images du site de l'événement ?
- Téléchargement PNG seul, ou PNG et PDF ?
- Vignette du billet dans l'email de confirmation ?
- Date et lieu : toujours en surimpression, ou laissés dans l'image au choix de l'organisateur ?
