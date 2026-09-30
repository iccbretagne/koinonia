# BottomSheet

Feuille qui monte du bas de l'écran sur mobile : menu « Plus », choix rapide, confirmation. Remplace `MobileNavSheet` et ses sous-niveaux avec bouton retour.

- `surface`, coins supérieurs `radius-xl`, poignée 36 × 4px, `shadow-3`, voile `scrim`. Monte en `duration-slow` / `ease-out`.
- Se ferme par glissement vers le bas, appui sur le voile, Échap, ou un bouton explicite.
- Menu « Plus » : liste à deux niveaux, titre « Menu ». Niveau 1 : les espaces du rôle sous les sections « Mon service » / « Église », en listes groupées `surface-sunken` à lignes de 60px (tuile d'icône, nom, « N pages » ou nom de l'unique page, compteur, chevron — ou flèche pour un accès direct), l'espace courant en `brand-soft` avec tuile `brand`, puis le bloc « Compte » et la déconnexion isolée. Niveau 2 : « ‹ Menu » dans l'en-tête (prop `headerStart`, reçoit le focus), en-tête de l'espace, puis ses pages en blocs groupés par sous-groupe, lignes de 48px. Échap remonte au niveau 1.
- Respecte la zone de sécurité du bas (`env(safe-area-inset-bottom)`).
