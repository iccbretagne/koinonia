# IconButton

Bouton carré 44 × 44px portant une seule icône, pour les actions universellement reconnues (fermer, retour, rechercher, notifications, menu « ⋯ »).

- Toujours un `aria-label` (« Fermer », « Notifications, 3 non lues ») et une infobulle sur desktop.
- Icône `ink-muted` au repos, `ink` au survol sur fond `surface-sunken`.
- Peut porter un `CountBadge` en haut à droite (cerclé de `surface`).
- Taille `sm` : 44px sur mobile, 36px à partir de `sm:`.
- Variante `on-dark` : icône blanche à 80 %, survol `white/10`, anneau de focus blanc, pour les visionneuses toujours sombres (photos, vidéos, liens de partage). Combinée à un fond `bg-scrim` par l'appelant pour les flèches posées sur l'image.
- Accepte `ref` (focus rendu au déclencheur d'un `Menu` ou d'une visionneuse).
- Remplace les « × » typographiques des modales actuelles, trop petits au doigt sur desktop (`md:min-h-0`).
