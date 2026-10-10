# FilterChip

Pastille de filtre bascule d'une liste (type, « Mes publications », état). Extraite de la file de traitement des demandes (spec 063) pour l'espace Offres (spec 064).

- Bouton `aria-pressed`, 44 px de haut, coins `radius-full`.
- Inactive : bord `control-line`, fond `surface`, texte `ink-muted`. Active : bord `brand`, fond `brand-soft`, texte `brand-text`.
- Les pastilles d'une même famille vont dans un conteneur `role="group"` avec un `aria-label` (« Filtrer par type »). Plusieurs pastilles actives se combinent en « ou » ; aucune active = pas de filtre.
- Retour à la ligne (`flex-wrap`) sur mobile plutôt qu'un défilement horizontal caché.
- Un filtre qui ne renvoie rien affiche un `EmptyState` « Aucun résultat pour ces filtres » avec « Effacer les filtres », distinct de l'état vide de la liste.
