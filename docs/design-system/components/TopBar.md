# TopBar

Barre supérieure de 56px, sur mobile et desktop. Remplace l'en-tête peint à la couleur de l'église.

- Fond `surface`, filet `line`, et filet de 3px à la couleur de l'église (`Church.primaryColor`) en bas : l'église reste identifiable sans imposer sa couleur au contraste.
- Page d'espace (mobile) : pastille de couleur + nom de l'église (ouvre le sélecteur d'église), puis Rechercher, Notifications, avatar.
- Page de détail (mobile) : chevron retour, titre tronqué, au plus deux actions puis « ⋯ ».
- Desktop : fil d'Ariane à gauche, champ de recherche « Rechercher… ⌘K » au centre, notifications et avatar à droite.
- `theme-color` du navigateur suit `surface` (clair et sombre).
