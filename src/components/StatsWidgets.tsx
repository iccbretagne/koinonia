/** Indicateur chiffré d'un tableau de statistiques, mis en avant si `accent`. */
export function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly sub?: string;
  readonly accent?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-xl border p-4 sm:p-5 ${accent ? "border-brand/30 bg-brand-soft" : "border-line"}`}>
      <p className="text-xs text-ink-muted font-medium mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accent ? "text-brand-text" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-xs text-ink-subtle mt-1">{sub}</p>}
    </div>
  );
}

/** Répartition en barres horizontales : effectif et part du total pour chaque libellé. */
export function BarChart({
  data,
  total,
  labelWidth = "w-24",
}: {
  readonly data: { label: string; count: number }[];
  readonly total: number;
  /** Largeur Tailwind de la colonne des libellés. */
  readonly labelWidth?: "w-24" | "w-28";
}) {
  if (data.length === 0 || total === 0) return <p className="text-sm text-ink-subtle">Aucune donnée</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className={`text-xs text-ink-muted ${labelWidth} shrink-0 truncate`}>{d.label}</span>
          <div className="flex-1 bg-surface-sunken rounded-full h-2">
            <div
              className="bg-brand rounded-full h-2 transition-all"
              style={{ width: `${Math.round((d.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-ink-muted w-8 text-right shrink-0">{d.count}</span>
          <span className="text-xs text-ink-subtle w-8 text-right shrink-0">
            {`${Math.round((d.count / total) * 100)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}
