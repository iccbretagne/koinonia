# RadioGroup

Choix unique dans un formulaire. `<fieldset>` + `<legend>` et radios natifs : flèches du clavier, envoi du formulaire, `required`.

- Variante `list` (défaut) : un rond 20px `accent-brand` par ligne de 44px, libellé 15px `ink`, `description` facultative en `ink-muted` 13px.
- Variante `chips` : pastilles de 44px, coins `radius-full`, active `brand-soft`/`brand-text`, focus visible porté par l'étiquette (`has-[:focus-visible]`). Pour des choix courts sur une ligne qui passe à la ligne. Contrôlée seulement (`value`).
- Contrôlé (`value` + `onChange`) ou non contrôlé (`defaultValue` + `name`, utilisable depuis un composant serveur, comme `/mcp/autoriser`).
- `hideLegend` quand un titre de section pose déjà la question ; `hint`/`error` sous le groupe.
- `choiceChipClasses(on)` : classes de la pastille, pour une pastille de case à cocher ou un choix au markup propre (une seule définition au lieu des copies locales).

Pour changer la vue d'une page, préférer `SegmentedControl`.

Adopté par : `admin/backups` (Périmètre, Stratégie de fusion), `admin/messages` (Sévérité, Public, Début), `admin/events/[eventId]` (portée de la série), `/mcp/autoriser` (église). `choiceChipClasses` : `care/request`, `agenda-public`, `agenda/new`, `candidatures/entretiens`, `/servir`, `integration/requests/[id]`, `integration/leaders`, `profile/notifications`.
