# Diagnostic et plan de migration

## Ce que montre le code aujourd'hui

- **Couleurs en dur** : environ 3 000 classes Tailwind grises ou sémantiques écrites directement (`text-gray-400` ×532, `border-gray-200` ×511, `text-gray-500` ×493…). Aucun token de surface ou de texte : impossible d'ajouter un mode sombre ou d'ajuster un gris sans toucher des centaines de fichiers.
- **Pas de mode sombre** : aucune classe `dark:` dans le code.
- **Contrastes** : `icc-rouge` (#FF3131) sert de texte d'erreur à 3.7:1 ; `icc-bleu` (#38B6FF) à 2.2:1 ; les bordures de champ `gray-300` à 1.5:1.
- **Bouton principal** : survol violet → jaune, changement de teinte complet et texte violet sur jaune ; `primary` et `edit` sont identiques ; `info` est bleu clair sur blanc.
- **Barre supérieure** : peinte à la couleur de l'église ; une couleur claire force un calcul de contraste à l'exécution et le mode sombre est impossible.
- **Navigation mobile** : deux destinations plus un menu ; la plupart des rôles passent par le menu pour tout. Sidebar (838 lignes) et MobileNavSheet (729 lignes) dupliquent les mêmes icônes et la même logique.
- **Retour utilisateur** : 0 `loading.tsx` sur 229 pages, pas de système de toasts, libellés sans accents (« Remplacant », « selectionne »).
- **Typographie** : Montserrat seule, du titre à la cellule de tableau.

## Plan en cinq lots

Chaque lot est livrable seul et ne casse rien de visible avant le suivant.

1. **Fondations** — tokens CSS (`:root` + `[data-theme=dark]` + `prefers-color-scheme`) dans `globals.css`, exposés à Tailwind v4 par `@theme inline` (`--color-surface: var(--surface)`…) ; Source Sans 3 ajoutée via `next/font` ; réglage Clair / Sombre / Système dans « Mon profil ». Les anciennes classes `icc-*` restent valides.
2. **Primitives** — `src/components/ui/` réécrit sur les tokens : Button (4 variantes), IconButton, Field (Input/Select/Textarea), Checkbox, StatusChip, CountBadge, Dialog (+ confirmation), BottomSheet, Toast, Skeleton, EmptyState, Tabs, DataTable. API compatible avec l'existant (`<Modal open>` reste accepté).
3. **Coquille** — TopBar, Sidebar dépliable en rail, BottomNav adaptée au rôle, feuille « Plus », palette de recherche ⌘K ; une seule définition des entrées de navigation partagée par les trois vues.
4. **Écrans à fort trafic** — Mon planning, grille de planning, événements, demandes, accueil « Aujourd'hui » ; `loading.tsx` sur chaque segment.
5. **Balayage** — codemod des classes grises vers les tokens (`text-gray-500` → `text-ink-muted`, `bg-white` → `bg-surface`, `border-gray-200` → `border-line`…), puis règle ESLint qui refuse `gray-*`, `white` et les hex en dur dans `className`.

Ce plan relève d'une spec (`/specify`) et d'un ADR : le passage aux tokens sémantiques est une décision transverse et durable.
