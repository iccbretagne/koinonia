# Field

Champ de formulaire (Input, Select, Textarea) avec son libellé, son aide et son erreur, empilés dans cet ordre.

- Libellé toujours visible au-dessus (style `label` 13px), jamais remplacé par le placeholder. Champ facultatif : « (facultatif) » en `ink-subtle` ; ne pas marquer les obligatoires d'un astérisque.
- Contrôle : 44px de haut, bordure 1px `control-line` (3.6:1, contre 1.5:1 pour l'actuel `gray-300`), texte saisi 16px (style `input`) pour éviter le zoom iOS. Focus : bordure et halo `focus`.
- Aide sous le champ en `ink-muted` 13px. Erreur à la place de l'aide, en `danger`, avec l'icône `circle-x`, et `aria-invalid` + `aria-describedby` sur le contrôle.
- L'appelant fournit `label`, `id` stable, `hint` et `error` éventuels ; `type="email"`, `inputmode="tel"`, `autocomplete` renseignés pour le clavier mobile.
- Formulaire en une colonne sur mobile, deux au plus sur desktop, limité à `reading-max`.
