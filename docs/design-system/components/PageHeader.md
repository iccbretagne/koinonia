# PageHeader

En-tête de chaque page : fil d'Ariane (desktop), titre, description courte, action principale à droite, onglets dessous.

- Titre `title-xl` (≥ 768px) ou `title-lg`, un seul par page. Description d'une phrase en `ink-muted`.
- Une seule action primary ; les autres en `secondary` ou dans un menu « ⋯ ».
- Colle en haut au défilement (`z-sticky`), avec un filet `line` qui apparaît dès qu'on a défilé.
- L'appelant fournit `title`, `description?`, `actions?`, `tabs?`.
