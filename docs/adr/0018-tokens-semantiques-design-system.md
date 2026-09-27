# ADR-0018 — L'interface passe par des tokens sémantiques

- **Statut** : Accepté
- **Date** : 2026-09-26

## Contexte

Les couleurs de l'interface étaient écrites directement dans chaque composant (`text-gray-500`,
`bg-white`, `border-gray-200`…, environ 3 000 occurrences). Impossible d'ajouter un mode sombre, de
corriger un contraste ou d'ajuster la charte sans toucher des centaines de fichiers ; chaque écran
choisissait ses propres gris et ses propres couleurs de statut.

## Décision

1. Les couleurs sont des **tokens sémantiques** (rôle, pas teinte) déclarés en variables CSS dans
   `src/app/globals.css`, avec une valeur claire et une valeur sombre : `bg`, `surface`,
   `surface-sunken`, `line`, `control-line`, `ink`, `ink-muted`, `ink-subtle`, `brand*`,
   `accent*`, `success*`, `warning*`, `danger*`, `info*`, `focus`. Ils sont exposés à Tailwind v4
   par `@theme inline` (`bg-surface`, `text-ink-muted`, `border-line`…).
2. Les quatre couleurs de la charte ICC (`icc-violet`, `icc-jaune`, `icc-rouge`, `icc-bleu`)
   restent disponibles pour l'identité (logo, illustrations), jamais pour du texte d'interface.
3. Le thème suit `prefers-color-scheme`, surchargé par `data-theme` sur `<html>` (choix de
   l'utilisateur stocké dans son navigateur).
4. Une règle ESLint refuse les classes de palette Tailwind brute (`gray-*`, `red-*`, `white`…) et
   les couleurs hexadécimales dans `className`.

Référence complète : `docs/design-system/` (tokens, composants, règles d'usage).

## Conséquences

- Mode sombre et ajustements de charte se font en un seul endroit.
- Tout nouvel écran utilise les tokens et les composants de `src/components/ui/` ; la garde ESLint
  empêche la réintroduction de couleurs en dur.
- La couleur propre à une église (`Church.primaryColor`) ne colore plus la barre supérieure : elle
  devient un repère (pastille, filet), pour garantir le contraste dans les deux thèmes.
