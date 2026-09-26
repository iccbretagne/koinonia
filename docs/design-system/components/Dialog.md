# Dialog

Fenêtre modale pour une décision ou un formulaire court. Reprend `Modal` et `ConfirmModal` (prop `open`, pas `isOpen`).

- Desktop : 480px, centrée, `surface`, `radius-lg`, `shadow-3`, sur voile `scrim`. Apparition en fondu et échelle 0.98 → 1 (`duration-base`).
- Mobile : devient une `BottomSheet` pour une confirmation, un plein écran avec barre supérieure pour un formulaire.
- En-tête : titre `title-sm` en `ink` et `IconButton` Fermer. Pied : actions à droite, la principale en dernier.
- Confirmation d'une action irréversible : le titre pose la question (« Supprimer la fiche de Marie Kouassi ? »), le corps dit la conséquence, le bouton répète le verbe (`danger` « Supprimer la fiche »). Pour une action réversible, préférer un `Toast` avec « Annuler ».
- Focus piégé, Échap ferme, focus rendu au déclencheur.
