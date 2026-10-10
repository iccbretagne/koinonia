# SearchInput

Champ de recherche en tête d'une liste filtrable (file de traitement des demandes, espace Offres).

- `type="search"`, loupe à gauche, 44 px de haut, bord `control-line`, focus `brand`.
- Pas de libellé visible : `aria-label` obligatoire, et un `placeholder` qui dit sur quoi porte la recherche (« Rechercher un métier, une entreprise, une ville… »).
- Filtrage immédiat côté client, sans accents ni casse.
- Pleine largeur sur mobile, au-dessus des `FilterChip`.
