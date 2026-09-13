// NEXT_PUBLIC_BUILD_VERSION n'est inliné que par deploy-staging.yml (voir docs/staging.md) :
// sa seule présence dans le bundle suffit à distinguer une recette d'une production, sans
// variable dédiée supplémentaire. Partagé par le bandeau (src/app/layout.tsx) et le header
// sticky de l'espace authentifié (AuthLayoutShell), qui doit se décaler sous le bandeau fixe
// plutôt que de passer dessous.
export const STAGING_BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? null;

// Hauteur du bandeau, répétée en toutes lettres (Tailwind scanne le code source pour des noms
// de classes littéraux — une classe reconstruite par concaténation/`replace()` à l'exécution ne
// serait pas détectée et son CSS ne serait jamais généré). Les trois valeurs ci-dessous doivent
// rester cohérentes (2.25rem) : `h-*` pour le bandeau, `pt-*` pour <body>, `top-*` pour le header
// sticky de AuthLayoutShell qui doit se décaler sous le bandeau plutôt que de passer dessous.
export const STAGING_BANNER_HEIGHT_CLASS = "h-9";
export const STAGING_BANNER_BODY_PADDING_CLASS = "pt-9";
export const STAGING_BANNER_HEADER_OFFSET_CLASS = "top-9";
