# PlanningGrid

Saisie du statut de service de chaque STAR pour un événement, en un geste. Reprend `PlanningGrid` (enregistrement automatique).

- Une ligne par STAR : nom (`body-strong`), fonction en `ink-muted`, puis un contrôle segmenté de quatre boutons-icônes (En service, Debrief, Indisponible, Remplaçant). Le bouton actif prend le fond `-soft` et la couleur de son statut ; chaque bouton a un `aria-label` et `aria-pressed`.
- Remplace le menu déroulant par ligne : un appui au lieu de trois, et l'état de toute l'équipe se lit d'un regard.
- Pied de grille sur `surface-sunken` : le décompte par statut en `StatusChip`.
- Enregistrement optimiste ; en cas d'échec, la cellule revient à l'état précédent et un `Toast` l'explique.
