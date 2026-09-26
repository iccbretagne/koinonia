# StatusChip

Pastille d'état : une couleur sémantique **et** un mot, avec une icône quand la place le permet. Remplace les couleurs de statut définies au cas par cas (PlanningGrid, demandes, suivi pastoral).

## Correspondances
- Statuts de service : **En service** `success` + `circle-check` ; **En service + Debrief** `brand` + `message` ; **Indisponible** `danger` + `circle-x` ; **Remplaçant** `info` + `repeat`.
- Demandes : **En attente** `warning` ; **Validée** `success` ; **Refusée** `danger` ; **Brouillon** neutre.
- `accent` (jaune doux) : « Nouveau », une seule par écran.

## Règles
Texte 12px `caption`, fond `-soft`, texte de la couleur pleine : 4.5:1 dans les deux thèmes. Ne jamais afficher un statut par la couleur seule (point, bordure).
