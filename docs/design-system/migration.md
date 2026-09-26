# Table de conversion vers les tokens (spec 055, lot 5)

Source unique pour remplacer les couleurs en dur par les tokens sémantiques (ADR-0018). Toute
personne ou agent qui migre un fichier applique **cette** table, pour que l'application reste
homogène. En cas de doute, lire le rôle du token dans `docs/design-system/README.md`.

Utilitaires disponibles (déclarés dans `src/app/globals.css`) : `bg-bg`, `bg-surface`,
`bg-surface-sunken`, `border-line`, `border-control-line`, `text-ink`, `text-ink-muted`,
`text-ink-subtle`, `bg-brand`, `hover:bg-brand-hover`, `text-brand-text`, `bg-brand-soft`,
`text-on-brand`, `bg-accent`, `bg-accent-soft`, `text-on-accent`, `text-/bg-/border-` +
`success|warning|danger|info` et leurs variantes `-soft`, `text-on-danger`, `ring-focus`,
`bg-scrim`, `rounded-chip|control|card|sheet`, `shadow-card|float|overlay`, `font-display`.
Les modificateurs d'opacité fonctionnent (`border-danger/30`, `bg-brand/10`).

## Neutres

| Avant | Après |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-gray-50` (fond de page, zone) | `bg-bg` si c'est le fond de page, sinon `bg-surface-sunken` |
| `hover:bg-gray-50`, `hover:bg-gray-100` | `hover:bg-surface-sunken` |
| `bg-gray-100`, `bg-gray-200` | `bg-surface-sunken` (piste de barre de progression : `bg-line`) |
| `bg-gray-300` et plus foncé (aplat décoratif) | `bg-control-line` |
| `text-gray-900`, `text-gray-800`, `text-black` | `text-ink` |
| `text-gray-700`, `text-gray-600`, `text-gray-500` | `text-ink-muted` |
| `text-gray-400`, `text-gray-300` | `text-ink-subtle` |
| `border-gray-100`, `border-gray-200` | `border-line` |
| `border-gray-300`, `border-gray-400` (bordure de contrôle) | `border-control-line` |
| `divide-gray-*` | `divide-line` |
| `ring-gray-*` | `ring-line` |
| `placeholder-gray-*`, `placeholder:text-gray-*` | supprimer (géré globalement) ou `placeholder:text-ink-subtle` |
| `bg-black/40`…`bg-black/60` (voile) | `bg-scrim` |
| `text-white` sur un aplat coloré | `text-on-brand`, `text-on-danger`, `text-on-accent` selon l'aplat |

## Couleurs sémantiques

Même règle pour chaque famille : **texte** → token plein, **fond clair** (50–100) → `-soft`,
**bordure claire** (100–300) → token plein à 30 % d'opacité, **aplat** (400–700) → token plein avec
le texte `on-*` correspondant.

| Famille Tailwind | Token |
|---|---|
| `red`, `rose`, `pink` | `danger` |
| `green`, `emerald`, `teal`, `lime` | `success` |
| `yellow`, `amber`, `orange` | `warning` |
| `blue`, `sky`, `cyan`, `indigo` | `info` |
| `purple`, `violet`, `fuchsia` | `brand` (`text-brand-text`, `bg-brand-soft`) |

Exemples : `text-red-600` → `text-danger` ; `bg-red-50` → `bg-danger-soft` ;
`border-red-200` → `border-danger/30` ; `bg-red-600 text-white hover:bg-red-700` →
`bg-danger text-on-danger hover:bg-danger/90` ; `bg-green-100 text-green-800` →
`bg-success-soft text-success`.

## Couleurs de la charte

| Avant | Après |
|---|---|
| `text-icc-violet` | `text-brand-text` |
| `bg-icc-violet` (+ `text-white`) | `bg-brand` (+ `text-on-brand`) |
| `hover:bg-icc-violet-dark`, `hover:bg-icc-violet/90` | `hover:bg-brand-hover` |
| `bg-icc-violet-light`, `bg-icc-violet/5`…`/10` | `bg-brand-soft` |
| `border-icc-violet`, `border-icc-violet/20`… | `border-brand` (ou `border-brand/20`…) |
| `ring-icc-violet`, `focus:ring-icc-violet` | `ring-focus` |
| `bg-icc-jaune` | `bg-accent` + `text-on-accent` |
| `bg-icc-jaune/20`…`/40`, `bg-yellow-50` en surlignage | `bg-accent-soft` |
| `text-icc-rouge`, `bg-icc-rouge` | `text-danger`, `bg-danger` + `text-on-danger` |
| `text-icc-bleu`, `bg-icc-bleu` | `text-info`, `bg-info` + `text-surface` |

## Formes

- Cartes et conteneurs : `rounded-card`, `border border-line`, `shadow-card` si posés sur `bg-bg`.
- Contrôles (boutons, champs, menus) : `rounded-control`. Pastilles : `rounded-chip` ou `rounded-full`.
- `border-2` : remplacer par `border`, sauf pour marquer un état sélectionné.
- `shadow-sm`, `shadow` → `shadow-card` ; `shadow-md`, `shadow-lg` → `shadow-float` ;
  `shadow-xl`, `shadow-2xl` → `shadow-overlay`.

## Exceptions autorisées (commentées dans le code)

- Couleurs de données dans les graphiques (séries), et `Church.primaryColor` en style inline.
- Gabarits d'email HTML (`src/lib/email.ts` et gabarits) : les clients mail ignorent les variables
  CSS, les hex y restent.
- Exports PDF / impression générés côté serveur.
- Aperçus de couleur choisis par l'utilisateur (sélecteur de couleur d'église).
