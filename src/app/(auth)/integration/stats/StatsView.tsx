"use client";

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Soumise",
  WAITING_RECONTACT: "Attente recontact",
  WAITING_MISSION: "Attente mission",
  ASSIGNED: "Affectée",
  CONTACTED: "Contactée",
  WHATSAPP_ADDED: "WhatsApp famille",
  INTEGRATED: "Intégrée",
  ABANDONED: "Abandonnée",
};

// Barres de l'entonnoir : même famille sémantique que STATUS_BADGE ci-dessous, pour rester
// cohérent entre la barre et la pastille de statut.
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-control-line",
  WAITING_RECONTACT: "bg-warning",
  WAITING_MISSION: "bg-warning",
  ASSIGNED: "bg-info",
  CONTACTED: "bg-warning",
  WHATSAPP_ADDED: "bg-success",
  INTEGRATED: "bg-brand",
  ABANDONED: "bg-danger",
};

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED: "bg-surface-sunken text-ink-muted border-line",
  WAITING_RECONTACT: "bg-warning-soft text-warning border-warning/30",
  WAITING_MISSION: "bg-warning-soft text-warning border-warning/30",
  ASSIGNED: "bg-info-soft text-info border-info/30",
  CONTACTED: "bg-warning-soft text-warning border-warning/30",
  WHATSAPP_ADDED: "bg-success-soft text-success border-success/30",
  INTEGRATED: "bg-brand-soft text-brand-text border-brand/20",
  ABANDONED: "bg-danger-soft text-danger border-danger/30",
};

// Miroir client de ABANDON_REASON_LABELS (module intégration) : un composant client ne peut
// pas importer l'index du module, qui tire des dépendances serveur.
const ABANDON_REASON_LABELS: Record<string, string> = {
  UNKNOWN_NUMBER: "Numéro inconnu",
  UNREACHABLE: "Injoignable",
  NO_LONGER_INTERESTED: "Ne souhaite plus",
  OTHER_CHURCH: "Autre église",
  MOVED: "A déménagé",
  DUPLICATE: "Doublon",
  OTHER: "Autre",
};

const AGE_LABELS: Record<string, string> = {
  YOUTH: "−18 ans",
  YOUNG_ADULT: "18–30 ans",
  ADULT: "30–60 ans",
  SENIOR: "60+ ans",
};

const CHURCH_STATUS_LABELS: Record<string, string> = {
  VISITOR: "Visiteur",
  REGULAR: "Régulier",
  ENGAGED: "Engagé",
};

const FUNNEL_STATUSES = ["SUBMITTED", "ASSIGNED", "CONTACTED", "WHATSAPP_ADDED", "INTEGRATED"] as const;

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

interface Props {
  readonly total: number;
  readonly pending: number;
  readonly integrated: number;
  readonly abandoned: number;
  readonly conversionRate: number | null;
  readonly avgDaysToIntegration: number | null;
  readonly byStatus: { status: string; count: number }[];
  readonly byFamily: { familyId: number | null; familyName: string; count: number }[];
  readonly byAgeRange: { ageRange: string; count: number }[];
  readonly byChurchStatus: { churchStatus: string; count: number }[];
  /** `reason: null` = abandon antérieur à la spec 051, sans motif. */
  readonly byAbandonReason: { reason: string | null; count: number }[];
  readonly byMonth: { month: string; count: number }[];
  readonly pastoralCare: number;
}

function KpiCard({
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

function BarChart({ data, total }: { readonly data: { label: string; count: number }[]; readonly total: number }) {
  if (total === 0) return <p className="text-sm text-ink-subtle">Aucune donnée</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-xs text-ink-muted w-24 shrink-0 truncate">{d.label}</span>
          <div className="flex-1 bg-surface-sunken rounded-full h-2">
            <div
              className="bg-brand rounded-full h-2 transition-all"
              style={{ width: `${Math.round((d.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-ink-muted w-8 text-right shrink-0">{d.count}</span>
          <span className="text-xs text-ink-subtle w-8 text-right shrink-0">
            {total > 0 ? `${Math.round((d.count / total) * 100)}%` : "–"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StatsView({
  total,
  pending,
  integrated,
  abandoned,
  conversionRate,
  avgDaysToIntegration,
  byStatus,
  byFamily,
  byAgeRange,
  byChurchStatus,
  byAbandonReason,
  byMonth,
  pastoralCare,
}: Props) {
  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r.count]));
  const maxMonth = Math.max(...byMonth.map((m) => m.count), 1);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total" value={total} />
        <KpiCard label="En cours" value={pending} sub="actives" />
        <KpiCard label="Intégrées" value={integrated} accent />
        <KpiCard label="Abandonnées" value={abandoned} />
        <KpiCard
          label="Taux conversion"
          value={conversionRate !== null ? `${conversionRate}%` : "–"}
          sub="intégrées / total"
        />
        <KpiCard
          label="Délai moyen"
          value={avgDaysToIntegration !== null ? `${avgDaysToIntegration}j` : "–"}
          sub="soumission → intégration"
        />
      </div>

      {/* Funnel */}
      <div className="bg-surface rounded-xl border border-line p-5">
        <h2 className="font-semibold text-ink mb-4">Entonnoir de progression</h2>
        {total === 0 ? (
          <p className="text-sm text-ink-subtle">Aucune donnée</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
            {FUNNEL_STATUSES.map((s, i) => {
              const count = statusMap[s] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-sm font-bold text-ink">{count}</span>
                  <div className="w-full bg-surface-sunken rounded-lg overflow-hidden h-20 sm:h-auto sm:w-full sm:min-h-[20px]">
                    <div
                      className={`${STATUS_COLORS[s]} rounded-lg transition-all`}
                      style={{ height: `${Math.max(pct, 4)}%`, minHeight: "8px" }}
                    />
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[s]}`}>
                    {STATUS_LABELS[s]}
                  </span>
                  <span className="text-xs text-ink-subtle">{pct}%</span>
                  {i < FUNNEL_STATUSES.length - 1 && (
                    <span className="hidden sm:block text-ink-subtle text-lg absolute">→</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tendance mensuelle */}
      <div className="bg-surface rounded-xl border border-line p-5">
        <h2 className="font-semibold text-ink mb-4">Demandes par mois (12 derniers mois)</h2>
        {byMonth.every((m) => m.count === 0) ? (
          <p className="text-sm text-ink-subtle">Aucune demande sur la période</p>
        ) : (
          <div className="flex items-end gap-1.5 h-28">
            {byMonth.map((m) => {
              const height = Math.max(Math.round((m.count / maxMonth) * 100), m.count > 0 ? 4 : 0);
              const [year, month] = m.month.split("-");
              const label = `${MONTH_NAMES[parseInt(month) - 1]} ${year.slice(2)}`;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-xs text-ink-muted font-medium">{m.count > 0 ? m.count : ""}</span>
                  <div
                    className="w-full bg-brand rounded-t-md transition-all"
                    style={{ height: `${height}%`, minHeight: m.count > 0 ? "4px" : "0" }}
                  />
                  <span className="text-[10px] text-ink-subtle rotate-0 leading-tight text-center">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Par famille */}
        <div className="bg-surface rounded-xl border border-line p-5 lg:col-span-1">
          <h2 className="font-semibold text-ink mb-4">Par famille (top 10)</h2>
          {byFamily.length === 0 ? (
            <p className="text-sm text-ink-subtle">Aucune affectation</p>
          ) : (
            <BarChart
              data={byFamily.map((f) => ({ label: f.familyName, count: f.count }))}
              total={byFamily.reduce((s, f) => s + f.count, 0)}
            />
          )}
        </div>

        {/* Par tranche d'âge */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="font-semibold text-ink mb-4">Tranche d&apos;âge</h2>
          <BarChart
            data={byAgeRange.map((r) => ({ label: AGE_LABELS[r.ageRange] ?? r.ageRange, count: r.count }))}
            total={total}
          />
        </div>

        {/* Par statut église + soins pastoraux */}
        <div className="bg-surface rounded-xl border border-line p-5 space-y-5">
          <div>
            <h2 className="font-semibold text-ink mb-4">Situation à l&apos;église</h2>
            <BarChart
              data={byChurchStatus.map((r) => ({
                label: CHURCH_STATUS_LABELS[r.churchStatus] ?? r.churchStatus,
                count: r.count,
              }))}
              total={total}
            />
          </div>
          <div className="border-t border-line pt-4">
            <p className="text-xs text-ink-muted font-medium mb-1">Soins pastoraux demandés</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-warning">{pastoralCare}</span>
              <span className="text-sm text-ink-subtle mb-0.5">
                {total > 0 ? `(${Math.round((pastoralCare / total) * 100)}% des demandes)` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Statuts abandonnés en bas */}
      {abandoned > 0 && (
        <div className="bg-danger-soft border border-danger/30 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-danger-soft flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-danger">
            <span className="font-semibold">{abandoned} demande{abandoned > 1 ? "s" : ""} abandonnée{abandoned > 1 ? "s" : ""}</span>
            {" "}— répartition par motif ci-dessous.
          </p>
        </div>
      )}

      {abandoned > 0 && (
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="font-semibold text-ink mb-4">Motifs d&apos;abandon</h2>
          <BarChart
            data={[...byAbandonReason]
              .sort((a, b) => b.count - a.count)
              .map((r) => ({
                label: r.reason ? (ABANDON_REASON_LABELS[r.reason] ?? r.reason) : "Sans motif (antérieur)",
                count: r.count,
              }))}
            total={abandoned}
          />
        </div>
      )}
    </div>
  );
}
