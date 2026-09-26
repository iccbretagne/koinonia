/**
 * Compteur en pastille pleine `danger` (docs/design-system/components/CountBadge.md), ex. « nouvelles
 * offres » du menu (spec 042). Plafonne l'affichage à "9+" — même convention que le compteur de
 * `NotificationBell` — et ne s'affiche pas à zéro. Le nombre exact est à répéter dans
 * l'`aria-label` du parent quand la pastille est seule sur une icône.
 */
export function Badge({ count, className = "" }: { readonly count: number; readonly className?: string }) {
  if (count <= 0) return null;

  return (
    <span
      className={`inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-[5px]
        font-sans text-[11px] font-bold leading-none tabular-nums text-on-danger ${className}`}
    >
      {formatCount(count)}
    </span>
  );
}

/** Texte affiché par la pastille : le nombre jusqu'à 9, puis « 9+ ». */
export function formatCount(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export default Badge;
