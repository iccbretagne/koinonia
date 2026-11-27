# Menu

Menu d'actions « ⋯ » d'une ligne ou d'une page : l'action principale reste visible à côté, les autres passent dans le menu (au plus deux actions visibles sur mobile).

- Déclencheur : `IconButton` `MoreHorizontal`, `aria-label` qui nomme l'objet (« Autres actions pour Marie Kouassi »), `aria-haspopup="menu"`, `aria-expanded`. Taille `sm` dans un tableau (44px sur mobile).
- Desktop (≥ 768px) : liste ancrée au déclencheur, position fixe (pas coupée par un tableau défilant), `surface`, bordure `line`, `radius-lg`, `shadow-float`, `z-overlay`. Retournée au-dessus si elle déborde en bas.
- Mobile : `BottomSheet` titrée par le libellé, comme le panneau « Plus ».
- Éléments : `role="menuitem"`, 44px, verbe à l'infinitif, icône 16px facultative ; `href` = lien `next/link` ; `tone="danger"` pour une action destructive (confirmée ensuite par un `Dialog`) ; `disabled` = `aria-disabled`, sauté au clavier.
- Clavier : Entrée/Espace ou flèche bas ouvre sur le premier élément, flèche haut sur le dernier ; flèches haut/bas, Début, Fin dans la liste ; Échap ferme et rend le focus au déclencheur ; Tab ferme. Clic extérieur ou défilement ferment.

Adopté par : `collectes/[id]/TrackingTab` (Valider / Ouvrir visibles, le reste dans le menu).
