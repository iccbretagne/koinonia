"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { FilterChip } from "@/components/ui";
import FundTrackingSection, { type FundTrackingData } from "./FundTrackingSection";

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Soumise",
  PROCESSING: "En cours",
  APPROVED: "Validée",
  REJECTED: "Rejetée",
  CANCELLED: "Annulée",
};
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-warning",
  PROCESSING: "bg-info",
  APPROVED: "bg-success",
  REJECTED: "bg-danger",
  CANCELLED: "bg-control-line",
};

type Period = "month" | "quarter" | "year";

interface Overview {
  totalRequests: number;
  totalAmount: number;
  approvedAmount: number;
  releasedAmount: number;
  pendingAmount: number;
  rejectedCount: number;
  cancelledCount: number;
  approvalRate: number | null;
}

interface StatsData {
  period: Period;
  dateRange: { from: string; to: string };
  overview: Overview;
  byStatus: { status: string; count: number; amount: number }[];
  byType: { type: string; count: number; amount: number }[];
  byDepartment: { name: string; count: number; amount: number; released: number }[];
  byMonth: { month: string; submitted: number; released: number }[];
  overduePayments: { id: string; requestId: string; requestLabel: string; amount: number; scheduledDate: string }[];
  fundTracking?: FundTrackingData;
}

function fmt(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

function kpiBorderClass(accent?: boolean, warning?: boolean): string {
  if (accent) return "border-brand/30 bg-brand-soft";
  if (warning) return "border-warning/30 bg-warning-soft";
  return "border-line";
}

function kpiValueClass(accent?: boolean, warning?: boolean): string {
  if (accent) return "text-brand-text";
  if (warning) return "text-warning";
  return "text-ink";
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  warning,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly sub?: string;
  readonly accent?: boolean;
  readonly warning?: boolean;
}) {
  return (
    <div
      className={`rounded-card border bg-surface p-4 shadow-card sm:p-5 ${kpiBorderClass(accent, warning)}`}
    >
      <p className="mb-1 text-[13px] font-semibold leading-[18px] text-ink-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${kpiValueClass(accent, warning)}`}>{value}</p>
      {sub && <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card md:p-5">
      <h2 className="mb-4 font-display text-[17px] font-semibold leading-6 text-ink">{title}</h2>
      {children}
    </section>
  );
}

function HBar({ label, value, max, sub }: { readonly label: string; readonly value: number; readonly max: number; readonly sub?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-[13px] leading-[18px] text-ink-muted" title={label}>{label}</span>
      <div className="flex-1 bg-line rounded-full h-2">
        <div className="bg-brand rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-[13px] font-semibold tabular-nums leading-[18px] text-ink">{sub ?? fmt(value)}</span>
    </div>
  );
}

export default function AccountingStats({
  initialData,
  churchId,
}: {
  readonly initialData: StatsData;
  readonly churchId: string;
}) {
  const [data, setData] = useState<StatsData>(initialData);
  const [period, setPeriod] = useState<Period>(initialData.period);
  const [loading, setLoading] = useState(false);
  const [now] = useState(Date.now);

  const fetchStats = useCallback(
    async (p: Period) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/accounting/stats?churchId=${churchId}&period=${p}`);
        if (res.ok) {
          setData(await res.json());
        }
      } finally {
        setLoading(false);
      }
    },
    [churchId]
  );

  const handlePeriod = (p: Period) => {
    setPeriod(p);
    fetchStats(p).catch(() => undefined);
  };

  const { overview, byStatus, byType, byDepartment, byMonth, overduePayments, dateRange } = data;

  const PERIOD_LABELS: Record<Period, string> = {
    month: "Ce mois",
    quarter: "Ce trimestre",
    year: "Cette année",
  };

  const dateLabel = dateRange
    ? `${new Date(dateRange.from).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(dateRange.to).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
    : null;

  const pendingCount =
    (byStatus.find((s) => s.status === "SUBMITTED")?.count ?? 0) + (byStatus.find((s) => s.status === "PROCESSING")?.count ?? 0);
  const maxDeptAmount = Math.max(...byDepartment.map((d) => d.amount), 1);

  const periodFrom = dateRange ? new Date(dateRange.from) : null;
  const periodTo = dateRange ? new Date(dateRange.to) : null;

  const chartData = byMonth
    .filter((m) => {
      if (!periodFrom || !periodTo) return true;
      const [y, mo] = m.month.split("-");
      const monthStart = new Date(Number.parseInt(y), Number.parseInt(mo) - 1, 1);
      const fromMonth = new Date(periodFrom.getFullYear(), periodFrom.getMonth(), 1);
      const toMonth = new Date(periodTo.getFullYear(), periodTo.getMonth(), 1);
      return monthStart >= fromMonth && monthStart <= toMonth;
    })
    .map((m) => {
      const [y, mo] = m.month.split("-");
      return {
        label: MONTH_NAMES[Number.parseInt(mo) - 1] + (y !== String(new Date().getFullYear()) ? ` ${y.slice(2)}` : ""),
        submitted: Math.round(m.submitted * 100) / 100,
        released: Math.round(m.released * 100) / 100,
      };
    });

  return (
    <div className={`flex flex-col gap-6 transition-opacity ${loading ? "pointer-events-none opacity-60" : ""}`} aria-busy={loading}>
      {/* Sélecteur de période */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Période">
          {(["month", "quarter", "year"] as Period[]).map((p) => (
            <FilterChip key={p} pressed={period === p} onClick={() => handlePeriod(p)}>
              {PERIOD_LABELS[p]}
            </FilterChip>
          ))}
        </div>
        {dateLabel && <span className="text-[13px] leading-[18px] text-ink-muted">{dateLabel}</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Montant soumis"
          value={fmt(overview.totalAmount)}
          sub={`${overview.totalRequests} demande${overview.totalRequests > 1 ? "s" : ""}`}
          accent
        />
        <KpiCard label="Montant versé" value={fmt(overview.releasedAmount)} sub="Paiements confirmés" />
        <KpiCard
          label="En attente"
          value={fmt(overview.pendingAmount)}
          sub={`${pendingCount} demande${pendingCount > 1 ? "s" : ""}`}
          warning={overview.pendingAmount > 0}
        />
        <KpiCard
          label="Taux d'approbation"
          value={overview.approvalRate !== null ? `${overview.approvalRate}%` : "–"}
          sub={`${overview.rejectedCount} rejetée${overview.rejectedCount > 1 ? "s" : ""}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Par statut */}
        <Section title="Répartition par statut">
          {byStatus.length === 0 ? (
            <p className="text-[15px] leading-[22px] text-ink-muted">Aucune donnée sur la période</p>
          ) : (
            <div className="space-y-3">
              {byStatus
                .toSorted((a, b) => b.count - a.count)
                .map((s) => (
                  <div key={s.status} className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_COLORS[s.status] ?? "bg-control-line"}`}
                    />
                    <span className="w-24 shrink-0 text-[13px] leading-[18px] text-ink-muted">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <div className="flex-1 bg-line rounded-full h-2">
                      <div
                        className={`${STATUS_COLORS[s.status] ?? "bg-control-line"} rounded-full h-2 transition-all`}
                        style={{
                          width: `${Math.round((s.count / overview.totalRequests) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-[13px] font-semibold tabular-nums leading-[18px] text-ink">
                      {s.count}
                    </span>
                    <span className="w-20 shrink-0 text-right text-[13px] tabular-nums leading-[18px] text-ink-muted">{fmt(s.amount)}</span>
                  </div>
                ))}
            </div>
          )}
        </Section>

        {/* Par type */}
        <Section title="Type de demande">
          {byType.length === 0 ? (
            <p className="text-[15px] leading-[22px] text-ink-muted">Aucune donnée sur la période</p>
          ) : (
            <div className="space-y-4">
              {byType.map((t) => (
                <div key={t.type} className="space-y-1">
                  <div className="flex justify-between gap-2 text-[13px] leading-[18px]">
                    <span className="font-semibold text-ink">
                      {t.type === "EXPENSE_REPORT" ? "Note de frais" : "Avance de budget"}
                    </span>
                    <span className="text-ink-muted">
                      {t.count} demande{t.count > 1 ? "s" : ""} · {fmt(t.amount)}
                    </span>
                  </div>
                  <div className="bg-line rounded-full h-2">
                    <div
                      className={`rounded-full h-2 ${t.type === "EXPENSE_REPORT" ? "bg-brand" : "bg-info"}`}
                      style={{
                        width: `${Math.round((t.count / overview.totalRequests) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {data.fundTracking && <FundTrackingSection data={data.fundTracking} />}

      {/* Tendance mensuelle */}
      <Section title={`Tendance — montants soumis vs versés (€) · ${PERIOD_LABELS[period].toLowerCase()}`}>
        {chartData.every((d) => d.submitted === 0 && d.released === 0) ? (
          <p className="text-[15px] leading-[22px] text-ink-muted">Aucune donnée sur les 12 derniers mois</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-muted)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--ink-muted)" }} tickFormatter={(v) => `${v}€`} width={60} />
              <Tooltip
                formatter={(value, name) => [
                  typeof value === "number" ? fmt(value) : value,
                  name === "submitted" ? "Soumis" : "Versé",
                ]}
              />
              <Legend
                formatter={(value) => (value === "submitted" ? "Soumis" : "Versé")}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="submitted" fill="var(--brand)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="released" fill="var(--info)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Par département */}
      <Section title="Par département — montant soumis vs versé">
        {byDepartment.length === 0 ? (
          <p className="text-[15px] leading-[22px] text-ink-muted">Aucune donnée sur la période</p>
        ) : (
          <div className="space-y-4">
            {byDepartment.map((d) => (
              <div key={d.name} className="space-y-1.5">
                <div className="flex justify-between gap-2 text-[13px] leading-[18px]">
                  <span className="font-semibold text-ink">{d.name}</span>
                  <span className="text-ink-muted">{d.count} demande{d.count > 1 ? "s" : ""}</span>
                </div>
                <HBar label="Soumis" value={d.amount} max={maxDeptAmount} />
                <HBar label="Versé" value={d.released} max={maxDeptAmount} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Paiements en retard */}
      {overduePayments.length > 0 && (
        <Section title={`Paiements en retard (${overduePayments.length})`}>
          <ul className="flex flex-col">
            {overduePayments.map((p) => {
              const daysLate = Math.floor(
                (now - new Date(p.scheduledDate).getTime()) / 86_400_000
              );
              return (
                <li key={p.id} className="border-b border-line last:border-0">
                  <Link
                    href={`/accounting/requests/${p.requestId}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-control px-2 py-2 transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{p.requestLabel}</p>
                      <p className="text-[13px] leading-[18px] text-danger">
                        Prévu le {new Date(p.scheduledDate).toLocaleDateString("fr-FR")} · {daysLate} jour{daysLate > 1 ? "s" : ""} de retard
                      </p>
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{fmt(p.amount)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
