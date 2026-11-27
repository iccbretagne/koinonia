# Switch

Interrupteur marche/arrêt d'un réglage (« Publier la page », « Afficher le logo »).

- `role="switch"` + `aria-checked`. Piste 44 × 24px, `brand` activé, `control-line` désactivé ; pastille `surface` `shadow-card`. Zone tactile 44px.
- Libellé visible à gauche (`label`, 15px `ink`), précision facultative `description` en `ink-muted` reliée par `aria-describedby`. `hideLabel` quand la ligne de réglage porte déjà le libellé : il devient l'`aria-label`.
- Désactivé : opacité 45 %, curseur interdit. Focus `focus`.
- Dire dans l'écran si l'effet est immédiat ou attend « Enregistrer ». Pour une case d'un formulaire classique, préférer `Checkbox`.

Adopté par : `/dons` (PublicationBlock, Section, SupportIdentity) — remplace `dons/Switch.tsx`.
