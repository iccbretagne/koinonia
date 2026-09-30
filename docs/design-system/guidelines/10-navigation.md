# Navigation et responsive

Koinonia compte plus de 200 pages réparties en une quinzaine de sections, et chaque rôle n'en voit qu'une partie. La navigation doit donc rester courte pour chacun, sans masquer ce qui existe.

## Architecture : huit espaces

Regrouper les sections actuelles de la sidebar en espaces stables, dans cet ordre :

| Espace | Contenu actuel regroupé |
|---|---|
| **Accueil** | Nouvelle page « Aujourd'hui » : prochains services, tâches à traiter, demandes en attente, raccourcis du rôle |
| **Planning** | Mon planning, planning par département, absences, événements d'équipe |
| **Agenda** | Événements d'église, calendrier, comptes rendus, agenda pastoral |
| **Personnes** | STAR, discipolat, intégration, suivi pastoral |
| **Demandes** | Mes demandes, secrétariat, comptabilité |
| **Médias** | Communication & Production, Audio |
| **Ressources** | Salles, Emploi, Guide |
| **Administration** | Église, accès, ministères, départements, fonctions, journal |

Un espace n'apparaît que si le rôle y a au moins une page. À l'intérieur, les pages se présentent en liste sous l'espace déplié (sidebar) ou au second niveau du panneau « Plus ». Un sous-espace peut en plus regrouper ses propres pages en onglets (`Tabs`) quand elles sont au même niveau, comme Visuels (Projets / Demandes) au sein de Médias.

## Desktop (≥ 1024px)

- **Sidebar** dépliée (`sidebar`, 256px) sur `surface`, séparée du contenu par `line` : sélecteur d'église en tête, puis les espaces, chacun dépliable sur ses pages. Élément actif : fond `brand-soft`, texte et icône `brand-text`.
- En tête : la marque (plumes du logo, 40px) et « Koinonia » en Montserrat 700, puis le sélecteur d'église.
- La sidebar se replie en **rail** (`rail`, 72px, icônes + infobulles) par un bouton en pied ; le choix est mémorisé.
- **Barre supérieure** (`topbar`, 56px) au-dessus du contenu seulement : fil d'Ariane à gauche, recherche au centre (« Rechercher… ⌘K »), notifications et avatar à droite.
- **En-tête de page** (`PageHeader`) : titre `title-xl`, description courte en `ink-muted`, action principale à droite, onglets dessous. Il colle en haut au défilement (`z-sticky`).

## Tablette (768–1023px)

- Rail d'icônes permanent (72px) ; un appui sur un espace ouvre ses pages dans un panneau flottant.
- Barre supérieure et en-tête de page identiques au desktop.

## Mobile (< 768px)

- **Barre supérieure** (56px, `surface`, filet `line` + filet de 3px à la couleur de l'église) :
  - sur une page d'espace : nom de l'église (ouvre le sélecteur), recherche, notifications, avatar ;
  - sur une page de détail : chevron retour, titre de la page tronqué, au plus deux actions puis « ⋯ ».
- **Barre du bas** (`bottom-nav`, 64px + zone de sécurité) : quatre destinations adaptées au rôle, puis **Plus**. L'onglet actif porte une pastille `brand-soft` derrière l'icône et un libellé `brand-text`. Les libellés restent toujours visibles.

  | Rôle | Destinations |
  |---|---|
  | STAR | Accueil · Mon planning · Agenda · Demandes · Plus |
  | Resp. département, Ministre | Accueil · Planning · Agenda · Personnes · Plus |
  | Secrétaire, Admin, Super Admin | Accueil · Agenda · Demandes · Personnes · Plus |
  | Référent soins pastoraux | Accueil · Suivi · Personnes · Agenda · Plus |
  | Comptable | Accueil · Comptabilité · Demandes · Plus |
  | Reporter, Faiseur de disciples (sans priorité dédiée) | Accueil, puis les premières sections réellement accessibles parmi Mon planning, Planning, Agenda, Personnes, Demandes · Plus |
  | Vue pastorale (tout rôle, bascule de vue) | Accueil · Mes membres · Plus |

- **Plus** ouvre une feuille du bas (`BottomSheet`, titre « Menu ») en deux niveaux. Niveau 1 : les espaces du rôle rangés sous les mêmes sections que la sidebar (« Mon service », « Église »), en listes groupées (`surface-sunken`, filet entre deux lignes) ; chaque espace porte une **tuile d'icône** (fond `surface`, ou `brand` pour l'espace courant, ligne en `brand-soft`), son nom, « N pages » et son compteur ; puis le bloc « Compte » (profil, guide, bascule de vue) et la déconnexion isolée en `danger`. La tuile est ce qui distingue un espace d'une page : les pages n'en ont jamais. Toucher un espace fait glisser vers ses pages : « ‹ Menu » dans l'en-tête, en-tête d'espace (tuile, nom, nombre de pages) souligné d'un filet, puis un bloc groupé par sous-groupe (ministère) avec son intitulé et son nombre de départements ; la page active est en `brand-soft` avec un trait `brand` à gauche. Un espace à une seule destination y mène directement (flèche au lieu du chevron). Échap remonte d'un niveau avant de fermer. Un seul modèle d'interaction : pas de tuiles d'un côté et d'accordéon de l'autre.
- L'action principale d'une page de liste (« Nouvel événement ») passe dans l'en-tête de page ; dans un formulaire, les boutons Enregistrer / Annuler se placent dans une barre collée au-dessus de la barre du bas.
- Les onglets d'espace défilent horizontalement et collent sous la barre supérieure.

## Recherche et palette de commandes

- `⌘K` / `Ctrl K` sur desktop, icône loupe sur mobile (plein écran).
- Une seule entrée cherche les pages (« Absences », « Salles »), les STAR, les événements et les demandes, dans le périmètre du rôle.
- Sans saisie, elle propose les pages récentes et les actions fréquentes du rôle (« Marquer une absence », « Nouvelle demande »).

## Retour et fil d'Ariane

- Desktop : fil d'Ariane dans la barre supérieure, dernier segment en `ink`, les autres en `ink-muted` cliquables.
- Mobile : pas de fil d'Ariane ; le chevron retour remonte d'un niveau dans l'arborescence (pas dans l'historique), pour qu'un lien reçu par notification ramène toujours au bon endroit.
