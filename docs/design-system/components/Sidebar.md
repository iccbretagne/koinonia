# Sidebar

Navigation principale sur desktop : les espaces du rôle, dépliables sur leurs pages. Reprend `Sidebar` ; se replie en rail de 72px.

- `surface`, largeur `sidebar` (256px), filet `line` à droite. Intitulés de groupe au style `overline` en `ink-subtle`.
- Élément : icône 20px + libellé `label`, 40px de haut, `radius-md`. Actif : fond `brand-soft`, texte et icône `brand-text`, `aria-current="page"`. Survol : `surface-sunken`.
- Un seul espace ouvert à la fois (celui de la page active, sauf choix de l'utilisateur) ; toucher un espace l'ouvre sans changer de page. Un espace à destination unique y mène directement.
- Une seule surbrillance : la page active, fond `brand-soft`, texte `brand-text` gras, trait `brand` posé sur le filet. L'espace ouvert qui la contient indique seulement le chemin (texte `ink`, icône `brand-text`) ; seul un espace à destination unique se remplit en `brand-soft`.
- Sous-pages en texte `ink`, alignées sur le libellé de l'espace et reliées à lui par un filet `line` vertical.
- Séparateurs, un style par niveau : les petites capitales (`overline`) sont réservées aux sections du menu (« Mon service », « Église »), séparées par un filet pleine largeur ; un bloc dans un espace (« Départements », « Agenda pastoral », « Organisation »…) est un libellé `ink-subtle` suivi d'un filet ; un ministère est une rangée repliable avec son nombre de départements.
- Les blocs viennent de `sidebarBlocks` (`src/lib/navigation.ts`) : `sidebarBlock` et `sidebarLabel` (libellé raccourci sous son intitulé) ne servent qu'au desktop. Le panneau « Plus » mobile garde sa propre présentation (`group`), protégée par un test.
- Compteur en `CountBadge` en fin de ligne. Bouton « Réduire » en pied ; le rail garde les icônes avec infobulles.
- En tête : les plumes du logo (`icc-plumes.png`, 40px) et « Koinonia » en Montserrat 700, puis le sélecteur d'église.
- Les entrées de navigation (libellé, icône, permission, sous-pages) sont définies une seule fois et partagées par Sidebar, BottomNav et la feuille « Plus » ; seul le regroupement en blocs est propre à la sidebar.
