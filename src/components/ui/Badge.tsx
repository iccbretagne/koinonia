/**
 * Petite pastille numérique (ex. « nouvelles offres » du menu, spec 042). Plafonne
 * l'affichage à "9+" — même convention que le compteur de `NotificationBell`.
 */
export function Badge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span
      className="inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1
        rounded-full bg-icc-rouge text-white text-[10px] font-semibold leading-none"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
