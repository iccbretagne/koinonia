# BulkActionBar

Barre flottante qui apparaît quand des éléments sont sélectionnés dans une `DataTable`. Reprend `BulkActionBar`.

- Fond `ink` inversé, `radius-lg`, `shadow-2`, centrée en bas (au-dessus de la barre du bas sur mobile), `z-overlay`.
- Décompte à gauche (« 3 STAR sélectionnés », accords et accents corrects), puis les actions en `ghost` inversé ; la suppression reste une action de la barre mais ouvre un `Dialog` de confirmation.
- `IconButton` Désélectionner à droite ; Échap désélectionne.
