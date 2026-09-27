# Toast

Retour bref après une action, en bas de l'écran (au-dessus de la barre du bas sur mobile, en bas à gauche sur desktop). N'existe pas aujourd'hui.

- Fond `ink`, texte `bg` (inversé dans les deux thèmes), `radius-md`, `shadow-2`, `z-overlay`. Entre en glissant de 8px (`duration-base`).
- Message au participe passé (« Absence enregistrée »), icône `circle-check` ou `circle-x`. Une action facultative (« Annuler », « Voir »).
- Disparaît après 4 s (6 s avec une action), reste tant qu'il est survolé ou focalisé. Annoncé par une région `aria-live="polite"`.
- Un seul toast à la fois ; le suivant remplace le précédent.
