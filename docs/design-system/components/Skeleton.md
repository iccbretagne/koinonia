# Skeleton

Silhouette grise de la page pendant son chargement, affichée par le `loading.tsx` de chaque segment de route (aucune page n'en a aujourd'hui).

- Blocs `surface-sunken`, coins `radius-sm`, reflet qui balaye en 1.4 s (coupé sous `prefers-reduced-motion`).
- Reproduit la forme réelle : en-tête, puis lignes de liste ou cartes. Pas de spinner centré.
- Apparition différée de 150 ms pour ne pas clignoter sur un chargement court. `aria-busy="true"` sur le conteneur.
