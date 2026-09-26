# BottomNav

Barre de navigation du bas sur mobile : quatre destinations adaptées au rôle, puis « Plus ». Reprend `BottomNav`, qui n'offre aujourd'hui que deux destinations et un menu.

- `surface`, filet `line` en haut, 64px + zone de sécurité, `z-nav`.
- Icône 20px au-dessus d'un libellé 11px sur une seule ligne, toujours visible (« Mon planning » tient en 375px). Actif : pastille `brand-soft` de 56 × 30px derrière l'icône, icône et libellé `brand-text`.
- Destinations par rôle : voir la section Navigation (STAR : Accueil · Mon planning · Agenda · Demandes · Plus).
- « Plus » ouvre la `BottomSheet` des espaces ; il est actif quand la page courante n'appartient à aucune des quatre destinations.
- Un `CountBadge` peut signaler ce qui attend (demandes à traiter).
