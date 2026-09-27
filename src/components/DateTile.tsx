/**
 * Pavé de date (jour abrégé + quantième) des listes d'événements et de services — « DIM 4 » des
 * maquettes (docs/design-system/maquettes). Aucun état : utilisable côté serveur comme client.
 *
 * `onBrand` : posé sur un aplat `brand` (carte « prochain service »), fond translucide et texte
 * `on-brand`. `timeZone` : à fournir quand le rendu se fait côté serveur (fuseau de l'église).
 */
export default function DateTile({
  date,
  onBrand = false,
  timeZone,
  className = "",
}: {
  readonly date: Date | string;
  readonly onBrand?: boolean;
  readonly timeZone?: string;
  readonly className?: string;
}) {
  const d = typeof date === "string" ? new Date(date) : date;
  const weekday = d
    .toLocaleDateString("fr-FR", { weekday: "short", timeZone })
    .replace(".", "")
    .toUpperCase();
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", timeZone });
  const full = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone });

  return (
    <div
      className={`flex w-12 shrink-0 flex-col items-center rounded-control py-1.5 text-center ${
        onBrand ? "bg-on-brand/15 text-on-brand" : "bg-surface-sunken text-ink"
      } ${className}`}
    >
      <span className="sr-only">{full}</span>
      <span
        aria-hidden="true"
        className={`font-display text-[10px] font-bold leading-3 tracking-[0.08em] ${
          onBrand ? "text-on-brand/80" : "text-ink-subtle"
        }`}
      >
        {weekday}
      </span>
      <span aria-hidden="true" className="font-display text-[19px] font-bold leading-[22px] tabular-nums">
        {day}
      </span>
    </div>
  );
}
