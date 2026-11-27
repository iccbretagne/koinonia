# RadioGroup

Choix unique dans un formulaire. `<fieldset>` + `<legend>` et radios natifs : flèches du clavier, envoi du formulaire, `required`.

- Variante `list` (défaut) : un rond 20px `accent-brand` par ligne de 44px, libellé 15px `ink`, `description` facultative en `ink-muted` 13px.
- Variante `chips` : pastilles de 44px, coins `radius-full`, active `brand-soft`/`brand-text`, focus visible porté par l'étiquette (`has-[:focus-visible]`). Pour des choix courts sur une ligne qui passe à la ligne. Contrôlée seulement (`value`).
- Variante `cards` : cartes bordées `control-line` de 44px minimum, rond visible, libellé et `description`, cochée en `brand`/`brand-soft` (`has-[:checked]`, contrôlée ou non). Pour des choix riches : créneau (heure, lieu), mode avec exemple.
- `columns` (`1` par défaut, `2`, `3`) : grille à partir de 640px pour `list` et `cards` ; une seule colonne sur mobile.
- Par option : `label` (contenu riche accepté), `description` (prix, lieu, ou **raison** d'une option `disabled` : « Complet », « Épuisé »), `disabled`.
- `description` du groupe : aide de la question sous la légende, avant les choix, relue avec `hint`/`error` par `aria-describedby`.
- Contrôlé (`value` + `onChange`) ou non contrôlé (`defaultValue` + `name`, utilisable depuis un composant serveur, comme `/mcp/autoriser`).
- `hideLegend` quand un titre de section pose déjà la question ; `hint`/`error` sous le groupe.
- `choiceChipClasses(on)` : classes de la pastille, pour une pastille de case à cocher ou un choix au markup propre (une seule définition au lieu des copies locales).
- `choiceCardClasses` / `radioInputClasses` : carte de choix et rond natif (20px, `accent-brand`, focus visible) pour un markup qui ne tient pas dans le composant (liste défilante avec recherche, question à « Effacer » propre), toujours dans un `<fieldset>`/`<legend>`.

Pour changer la vue d'une page, préférer `SegmentedControl`.

Adopté par : `admin/backups` (Périmètre, Stratégie de fusion), `admin/messages` (Sévérité, Public, Début), `admin/events/[eventId]` (portée de la série), `/mcp/autoriser` (église), `admin/members/duplicates` (valeur à garder, compte lié), billetterie (groupe au choix unique de l'inscription ; `cards` pour le mode de l'option), formulaires (choix unique, note en `chips`, session et niveau), entretiens du candidat (`cards` en 2 colonnes), demande de visuel (rattachement au projet), `dons` (taille du nom, `chips`), absences (départements, `chips`), `/rejoindre` (`chips`). `radioInputClasses` : campagnes (`AssignmentForm`, réponses et consultation), filtres de la galerie média. `choiceChipClasses` : `care/request`, `agenda-public`, `agenda/new`, `candidatures/entretiens`, `/servir`, `integration/requests/[id]`, `integration/leaders`, `profile/notifications`.
