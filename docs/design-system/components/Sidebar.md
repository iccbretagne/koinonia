# Sidebar

Navigation principale sur desktop : les espaces du rôle, dépliables sur leurs pages. Reprend `Sidebar` ; se replie en rail de 72px.

- `surface`, largeur `sidebar` (256px), filet `line` à droite. Intitulés de groupe au style `overline` en `ink-subtle`.
- Élément : icône 20px + libellé `label`, 40px de haut, `radius-md`. Actif : fond `brand-soft`, texte et icône `brand-text`, `aria-current="page"`. Survol : `surface-sunken`.
- Sous-pages en retrait, reliées par un filet `line` ; la sous-page active en `brand-text` gras.
- Compteur en `CountBadge` en fin de ligne. Bouton « Réduire » en pied ; le rail garde les icônes avec infobulles.
- En tête : les plumes du logo (`icc-plumes.png`, 40px) et « Koinonia » en Montserrat 700, puis le sélecteur d'église.
- Les entrées de navigation (libellé, icône, permission, sous-pages) sont définies une seule fois et partagées par Sidebar, BottomNav et la feuille « Plus ».
