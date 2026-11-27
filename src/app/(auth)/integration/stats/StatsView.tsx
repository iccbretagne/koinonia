"use client";

import { KpiCard, BarChart } from "@/components/StatsWidgets";
import { Alert, StatusChip, type StatusTone } from "@/components/ui";

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

// Barres de l'entonnoir : même famille sémantique que STATUS_TONES ci-dessous, pour rester
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

const STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED: "neutral",
  WAITING_RECONTACT: "warning",
  WAITING_MISSION: "warning",
  ASSIGNED: "info",
  CONTACTED: "warning",
  WHATSAPP_ADDED: "success",
  INTEGRATED: "brand",
  ABANDONED: "danger",
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
          value={avgDaysToIntegration !== null ? `${avgDaysToIntegration} j` : "–"}
          sub="soumission → intégration"
        />
      </div>

      {/* Funnel */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 font-display text-[17px] font-semibold text-ink">Entonnoir de progression</h2>
        {total === 0 ? (
          <p className="text-sm text-ink-muted">Aucune donnée.</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
            {FUNNEL_STATUSES.map((s) => {
              const count = statusMap[s] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-sm font-bold text-ink">{count}</span>
                  <div className="h-20 w-full overflow-hidden rounded-control bg-line sm:h-auto sm:min-h-[20px] sm:w-full">
                    <div
                      className={`${STATUS_COLORS[s]} rounded-control transition-all`}
                      style={{ height: `${Math.max(pct, 4)}%`, minHeight: "8px" }}
                    />
                  </div>
                  <StatusChip tone={STATUS_TONES[s]}>{STATUS_LABELS[s]}</StatusChip>
                  <span className="text-xs text-ink-muted tabular-nums">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tendance mensuelle */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-4 font-display text-[17px] font-semibold text-ink">Demandes par mois (12 derniers mois)</h2>
        {byMonth.every((m) => m.count === 0) ? (
          <p className="text-sm text-ink-muted">Aucune demande sur la période.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-28">
            {byMonth.map((m) => {
              const height = Math.max(Math.round((m.count / maxMonth) * 100), m.count > 0 ? 4 : 0);
              const [year, month] = m.month.split("-");
              const label = `${MONTH_NAMES[Number.parseInt(month, 10) - 1]} ${year.slice(2)}`;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-xs text-ink-muted font-medium">{m.count > 0 ? m.count : ""}</span>
                  <div
                    className="w-full rounded-t-[4px] bg-brand transition-all"
                    style={{ height: `${height}%`, minHeight: m.count > 0 ? "4px" : "0" }}
                  />
                  <span className="text-center text-[11px] leading-tight text-ink-muted">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Par famille */}
        <div className="rounded-card border border-line bg-surface p-5 shadow-card lg:col-span-1">
          <h2 className="mb-4 font-display text-[17px] font-semibold text-ink">Par famille (top 10)</h2>
          {byFamily.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucune affectation.</p>
          ) : (
            <BarChart
              data={byFamily.map((f) => ({ label: f.familyName, count: f.count }))}
              total={byFamily.reduce((s, f) => s + f.count, 0)}
            />
          )}
        </div>

        {/* Par tranche d'âge */}
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 font-display text-[17px] font-semibold text-ink">Tranche d&apos;âge</h2>
          <BarChart
            data={byAgeRange.map((r) => ({ label: AGE_LABELS[r.ageRange] ?? r.ageRange, count: r.count }))}
            total={total}
          />
        </div>

        {/* Par statut église + soins pastoraux */}
        <div className="rounded-card border border-line bg-surface p-5 shadow-card space-y-5">
          <div>
            <h2 className="mb-4 font-display text-[17px] font-semibold text-ink">Situation à l&apos;église</h2>
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
              <span className="mb-0.5 text-sm text-ink-muted">
                {total > 0 ? `(${Math.round((pastoralCare / total) * 100)}% des demandes)` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Statuts abandonnés en bas */}
      {abandoned > 0 && (
        <Alert tone="danger" title={`${abandoned} demande${abandoned > 1 ? "s" : ""} abandonnée${abandoned > 1 ? "s" : ""}.`}>
          Répartition par motif ci-dessous.
        </Alert>
      )}

      {abandoned > 0 && (
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 font-display text-[17px] font-semibold text-ink">Motifs d&apos;abandon</h2>
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
