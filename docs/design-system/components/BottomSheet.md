# BottomSheet

Feuille qui monte du bas de l'écran sur mobile : menu « Plus », choix rapide, confirmation. Remplace `MobileNavSheet` et ses sous-niveaux avec bouton retour.

- `surface`, coins supérieurs `radius-xl`, poignée 36 × 4px, `shadow-3`, voile `scrim`. Monte en `duration-slow` / `ease-out`.
- Se ferme par glissement vers le bas, appui sur le voile, Échap, ou un bouton explicite.
- Menu « Plus » : liste à deux niveaux. Niveau 1 : les espaces du rôle en lignes de 56px (icône, nom, « N pages » ou nom de l'unique page, compteur, chevron — ou flèche pour un accès direct), l'espace courant en `brand-soft`, puis les liens de compte. Niveau 2 : « ‹ Espaces » (reçoit le focus), titre de l'espace, ses pages en lignes de 44px. Échap remonte au niveau 1.
- Respecte la zone de sécurité du bas (`env(safe-area-inset-bottom)`).
