# IconButton

Bouton carré 44 × 44px portant une seule icône, pour les actions universellement reconnues (fermer, retour, rechercher, notifications, menu « ⋯ »).

- Toujours un `aria-label` (« Fermer », « Notifications, 3 non lues ») et une infobulle sur desktop.
- Icône `ink-muted` au repos, `ink` au survol sur fond `surface-sunken`.
- Peut porter un `CountBadge` en haut à droite (cerclé de `surface`).
- Remplace les « × » typographiques des modales actuelles, trop petits au doigt sur desktop (`md:min-h-0`).
