# Tabs

Onglets de navigation entre pages sœurs d'un espace (Audio, Médias, Intégration). Reprend `SpaceTabs`.

- Libellé `label` en `ink-muted` ; onglet actif `brand-text` souligné de 2px `brand`, avec `aria-current="page"`.
- Défilement horizontal sur mobile, sans barre visible ; l'onglet actif est ramené dans le champ à l'ouverture.
- Collant sous la barre supérieure (`z-sticky`). Un compteur facultatif en `CountBadge`.
- Ce sont des liens (chaque onglet a son URL), pas des onglets ARIA qui masquent du contenu.
