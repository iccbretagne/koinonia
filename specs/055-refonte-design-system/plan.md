# Plan — Refonte du design system (055)

Référence : `docs/design-system/` (README = règles d'usage, `tokens.json`/`tokens.css`,
`components/*.md`, `components/reference.css` = implémentation de référence, `maquettes/`).
ADR : [0018](../../docs/adr/0018-tokens-semantiques-design-system.md).

## Contrainte structurante

Refonte **front uniquement**. Interdit : nouvelle route `src/app/api/**`, migration, modification de
`prisma/schema.prisma`, service métier, permission ou manifeste de module. Les pages gardent leurs
chargements de données actuels ; seuls le rendu, la navigation et les composants changent.

## Checklist constitution

- [x] Aucune donnée ni droit modifié (pas de migration, pas de permission).
- [x] Composants UI réutilisés et réécrits dans `src/components/ui/` (API compatible).
- [x] Frontières modules inchangées ; `lint:boundaries` doit rester vert.
- [x] Décision transverse documentée (ADR-0018).

## Lots

1. **Fondations** — `globals.css` : variables CSS des tokens (clair, sombre via
   `prefers-color-scheme` et `[data-theme]`), `@theme inline` pour Tailwind (`bg-surface`,
   `text-ink-muted`, `border-line`, `rounded-control|card|sheet|chip`, `shadow-card|float|overlay`,
   `font-display`) ; Source Sans 3 (texte) + Montserrat (titres) via `next/font` ; script de thème
   inline dans `<head>` (localStorage `koinonia-theme`) ; sélecteur Clair/Sombre/Système dans
   `/profile` ; `theme-color` clair/sombre ; logo et icône d'app (`public/brand/`, manifeste PWA).
2. **Primitives** — `src/components/ui/` réécrit sur les tokens, API existante conservée :
   Button (primary/secondary/ghost/danger ; `edit`→primary, `info`→secondary), Input/Select/Textarea
   (Field), CheckboxGroup, Badge (CountBadge), Modal/ConfirmModal (Dialog, plein écran mobile),
   DataTable (lignes compactes mobile), BulkActionBar ; ajouts : IconButton, StatusChip, Alert,
   PageHeader, Toast (fournisseur + `useToast`), Skeleton, EmptyState, BottomSheet. Icônes
   `lucide-react`.
3. **Coquille** — TopBar, Sidebar repliable (rail), BottomNav adaptée au rôle + panneau « Plus »
   (remplace MobileNavSheet), palette de recherche ⌘K (pages : entrées de navigation déjà
   calculées par `(auth)/layout.tsx` ; STAR et événements : routes GET existantes, périmètre
   inchangé), une seule définition des entrées de navigation partagée.
4. **Écrans à fort trafic** — page « Aujourd'hui » (composée à partir des fonctions et requêtes
   déjà utilisées par Mon planning, les événements et les demandes ; aucune nouvelle route), Mon planning, grille de planning (contrôle segmenté), événements,
   demandes, espaces à cartes, profil ; `loading.tsx` par segment ; toasts sur les actions.
5. **Balayage** — remplacement des classes de palette brute par les tokens dans tout `src/`,
   puis règle ESLint (`no-restricted-syntax` sur les littéraux `className`) qui les interdit.

## Risques

- Régressions visuelles sur des écrans peu fréquentés → balayage mécanique par correspondance
  stricte (table de conversion unique), relecture par un agent dédié, recette staging.
- Contraste des couleurs de statut héritées (`green-*`, `red-*`, `amber-*`) → conversion vers
  `success/danger/warning(-soft)`.
- Tests qui vérifient des classes CSS → mis à jour avec la même table de conversion.
