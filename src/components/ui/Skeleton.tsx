import type { HTMLAttributes } from "react";

/**
 * Bloc de silhouette (docs/design-system/components/Skeleton.md) : `surface-sunken`, reflet qui
 * balaye (`skeleton-shimmer`, coupé sous prefers-reduced-motion dans globals.css). Donner la forme
 * par `className` (`h-4 w-40`, `size-8 rounded-full`…). Décoratif : masqué aux lecteurs d'écran,
 * c'est le conteneur (`PageSkeleton`, `SkeletonList`) qui porte `aria-busy`.
 */
export default function Skeleton({ className = "", ...props }: Readonly<HTMLAttributes<HTMLDivElement>>) {
  // Rayon par défaut seulement si l'appelant n'en fournit pas : deux utilitaires `rounded-*` se
  // départagent par l'ordre de la feuille générée, pas par celui de la chaîne.
  const radius = /(^|\s)rounded(-|\s|$)/.test(className) ? "" : "rounded-chip";
  return <div aria-hidden="true" className={`skeleton-shimmer bg-surface-sunken ${radius} ${className}`} {...props} />;
}

/**
 * Apparition différée de 150 ms (`@starting-style`) : un chargement court ne fait pas clignoter
 * la silhouette. Sans prise en charge du navigateur, elle s'affiche simplement tout de suite.
 */
const delayedAppear = "transition-opacity delay-150 duration-200 starting:opacity-0";

/** Lignes de liste : pastille, titre et métadonnée, comme les lignes mobiles de `DataTable`. */
export function SkeletonList({
  rows = 5,
  className = "",
  label = "Chargement…",
}: {
  readonly rows?: number;
  readonly className?: string;
  /** Annoncé aux lecteurs d'écran. Passer `null` quand un conteneur parent l'annonce déjà. */
  readonly label?: string | null;
}) {
  return (
    <div
      aria-busy={label ? true : undefined}
      aria-live={label ? "polite" : undefined}
      className={`overflow-hidden rounded-card border border-line bg-surface ${delayedAppear} ${className}`}
    >
      {label && <span className="sr-only">{label}</span>}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <Skeleton className="h-3" style={{ width: `${30 + ((i * 23) % 30)}%` }} />
          </div>
          <Skeleton className="hidden h-6 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * Silhouette d'une page complète pour les `loading.tsx` : en-tête (titre, description,
 * action) puis `rows` lignes de liste. Composant serveur.
 */
export function PageSkeleton({
  rows = 6,
  withAction = true,
  className = "",
  label = "Chargement de la page…",
}: {
  readonly rows?: number;
  /** Réserve la place du bouton d'action de l'en-tête. */
  readonly withAction?: boolean;
  readonly className?: string;
  readonly label?: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className={`flex flex-col gap-6 ${delayedAppear} ${className}`}>
      <span className="sr-only">{label}</span>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
          <Skeleton className="h-7 w-48 md:h-8 md:w-64" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        {withAction && <Skeleton className="h-11 w-36 rounded-control" />}
      </div>
      <SkeletonList rows={rows} label={null} />
    </div>
  );
}
