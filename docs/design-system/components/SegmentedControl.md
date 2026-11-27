# SegmentedControl

Deux à cinq options exclusives qui changent la présentation de la page (Tableau / Frise, Semaine / Mois / Liste, Planning / Tâches).

- Conteneur `surface-sunken`, `radius-md`, 3px de marge ; segment actif `surface` + `shadow-card`, texte `brand-text` ; inactif `ink-muted`, `ink` au survol. Police `font-display` 14px semi-grasse.
- `role="group"` nommé (`label`, « Affichage ») et boutons `aria-pressed` : chaque segment s'atteint par Tab. Focus `focus`.
- Tailles : `md` 44px ; `sm` 44px sur mobile puis 36px (barre d'outils desktop).
- `fullWidth` : segments de largeur égale sur toute la ligne (bascule Paramètres / Aperçu de `/dons` sur mobile).

Ne pas l'utiliser pour un champ de formulaire (`RadioGroup`) ni pour des panneaux de contenu distincts (`Tabs`).

Adopté par : `dashboard/stats` (Période, Statistiques), `absences` (Tableau / Frise), `rooms` (Semaine / Mois / Liste), `/dons` (Paramètres / Aperçu).
