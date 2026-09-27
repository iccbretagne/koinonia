# BottomSheet

Feuille qui monte du bas de l'écran sur mobile : menu « Plus », choix rapide, confirmation. Remplace `MobileNavSheet` et ses sous-niveaux avec bouton retour.

- `surface`, coins supérieurs `radius-xl`, poignée 36 × 4px, `shadow-3`, voile `scrim`. Monte en `duration-slow` / `ease-out`.
- Se ferme par glissement vers le bas, appui sur le voile, Échap, ou un bouton explicite.
- Menu « Plus » : les espaces du rôle en grille de tuiles (4 colonnes), l'espace courant en `brand-soft`, puis les liens de compte en liste.
- Respecte la zone de sécurité du bas (`env(safe-area-inset-bottom)`).
