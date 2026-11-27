# Tabs

Onglets d'un espace ou d'une page. Deux formes, même apparence.

- Libellé `label` en `ink-muted` ; onglet actif `brand-text` souligné de 2px `brand`. 44px de haut, focus `focus`.
- Défilement horizontal sur mobile, sans barre visible ; l'onglet actif est ramené dans le champ.
- Un compteur facultatif en `CountBadge`. Position collante éventuelle laissée à l'appelant (`z-sticky`).

## Liens (`tabs` avec `href`)
Navigation entre pages sœurs d'un espace (Audio, Médias, Intégration), reprend `SpaceTabs`. Des liens avec `aria-current="page"` : chaque onglet a son URL.

## Pilotés par état (`value`, `onChange`, `idBase`)
Panneaux d'une même page sans URL propre (Discipolat, Comptes rendus, Service d'accueil, Page publique / Slide de `/dons`, mois des disponibilités).
- `role="tablist"`/`tab`, `aria-selected`, `aria-controls` ; un seul onglet dans l'ordre de tabulation (`tabindex` itinérant).
- Flèches gauche/droite (en boucle), Début, Fin : activation immédiate.
- Le contenu va dans `TabPanel` (même `idBase`), `role="tabpanel"` relié à l'onglet actif. Identifiants : `tabIds(idBase, value)`.

Pour changer la présentation d'une même liste (Tableau / Frise), préférer `SegmentedControl`.
