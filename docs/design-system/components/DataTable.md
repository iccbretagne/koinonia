# DataTable

Liste de données : tableau sur desktop, lignes compactes sur mobile. Reprend `DataTable` (tri, sélection, ligne mise en évidence).

## Desktop (≥ 768px)
Tableau dans un conteneur `surface` à coins `radius-lg`. En-têtes 12px en capitales `ink-muted` sur `surface-sunken`, filets `line`, survol de ligne `surface-sunken`, ligne sélectionnée `brand-soft`. Chiffres alignés à droite en `tabular-nums`.

## Mobile (< 768px)
Une ligne de 64px par élément : avatar ou icône, titre, une ligne de métadonnées, statut ou chevron à droite ; toute la ligne ouvre le détail. Remplace les cartes actuelles qui empilent chaque colonne en paires libellé/valeur (4 à 6 lignes par élément).

## Ce que fournit l'appelant
`columns` (avec `primary: true` sur la colonne titre et `meta: true` sur celles qui composent la ligne mobile), `data`, `rowHref` ou `actions`, `sort`, `selectable`. État vide : `EmptyState` ; chargement : `Skeleton` en lignes.
