"use client";

import { useState, useCallback } from "react";
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

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Soumise",
  PROCESSING: "En cours",
  APPROVED: "Validée",
  REJECTED: "Rejetée",
  CANCELLED: "Annulée",
};
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-amber-400",
  PROCESSING: "bg-blue-400",
  APPROVED: "bg-emerald-500",
  REJECTED: "bg-red-400",
  CANCELLED: "bg-gray-300",
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
}

function fmt(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  warning,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 sm:p-5 ${
        accent
          ? "border-icc-violet/30 bg-icc-violet/5"
          : warning
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200"
      }`}
    >
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p
        className={`text-2xl font-bold ${
          accent ? "text-icc-violet" : warning ? "text-amber-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function HBar({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-28 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="bg-icc-violet rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-800 w-20 text-right shrink-0">{sub ?? fmt(value)}</span>
    </div>
  );
}

export default function AccountingStats({
  initialData,
  churchId,
}: {
  initialData: StatsData;
  churchId: string;
}) {
  const [data, setData] = useState<StatsData>(initialData);
  const [period, setPeriod] = useState<Period>(initialData.period);
  const [loading, setLoading] = useState(false);

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
    fetchStats(p);
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

  const maxDeptAmount = Math.max(...byDepartment.map((d) => d.amount), 1);

  const periodFrom = dateRange ? new Date(dateRange.from) : null;
  const periodTo = dateRange ? new Date(dateRange.to) : null;

  const chartData = byMonth
    .filter((m) => {
      if (!periodFrom || !periodTo) return true;
      const [y, mo] = m.month.split("-");
      const monthStart = new Date(parseInt(y), parseInt(mo) - 1, 1);
      const fromMonth = new Date(periodFrom.getFullYear(), periodFrom.getMonth(), 1);
      const toMonth = new Date(periodTo.getFullYear(), periodTo.getMonth(), 1);
      return monthStart >= fromMonth && monthStart <= toMonth;
    })
    .map((m) => {
      const [y, mo] = m.month.split("-");
      return {
        label: MONTH_NAMES[parseInt(mo) - 1] + (y !== String(new Date().getFullYear()) ? ` ${y.slice(2)}` : ""),
        submitted: Math.round(m.submitted * 100) / 100,
        released: Math.round(m.released * 100) / 100,
      };
    });

  return (
    <div className={`space-y-6 transition-opacity ${loading ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Sélecteur de période */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["month", "quarter", "year"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePeriod(p)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              period === p ? "bg-white text-icc-violet shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      {dateLabel && (
        <span className="text-xs text-gray-400">{dateLabel}</span>
      )}
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
          sub={`${(byStatus.find((s) => s.status === "SUBMITTED")?.count ?? 0) + (byStatus.find((s) => s.status === "PROCESSING")?.count ?? 0)} demandes`}
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
            <p className="text-sm text-gray-400">Aucune donnée sur la période</p>
          ) : (
            <div className="space-y-3">
              {byStatus
                .sort((a, b) => b.count - a.count)
                .map((s) => (
                  <div key={s.status} className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_COLORS[s.status] ?? "bg-gray-300"}`}
                    />
                    <span className="text-xs text-gray-600 w-24 shrink-0">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className={`${STATUS_COLORS[s.status] ?? "bg-gray-300"} rounded-full h-2 transition-all`}
                        style={{
                          width: `${Math.round((s.count / overview.totalRequests) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-800 w-6 text-right shrink-0">
                      {s.count}
                    </span>
                    <span className="text-xs text-gray-400 w-20 text-right shrink-0">{fmt(s.amount)}</span>
                  </div>
                ))}
            </div>
          )}
        </Section>

        {/* Par type */}
        <Section title="Type de demande">
          {byType.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune donnée sur la période</p>
          ) : (
            <div className="space-y-4">
              {byType.map((t) => (
                <div key={t.type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-gray-700">
                      {t.type === "EXPENSE_REPORT" ? "Note de frais" : "Avance de budget"}
                    </span>
                    <span className="text-gray-500">
                      {t.count} demande{t.count > 1 ? "s" : ""} · {fmt(t.amount)}
                    </span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-2">
                    <div
                      className={`rounded-full h-2 ${t.type === "EXPENSE_REPORT" ? "bg-icc-violet" : "bg-icc-bleu"}`}
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

      {/* Tendance mensuelle */}
      <Section title={`Tendance — montants soumis vs versés (€) · ${PERIOD_LABELS[period].toLowerCase()}`}>
        {chartData.every((d) => d.submitted === 0 && d.released === 0) ? (
          <p className="text-sm text-gray-400">Aucune donnée sur les 12 derniers mois</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} width={60} />
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
              <Bar dataKey="submitted" fill="#5E17EB" radius={[3, 3, 0, 0]} />
              <Bar dataKey="released" fill="#38B6FF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Par département */}
      <Section title="Par département — montant soumis vs versé">
        {byDepartment.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune donnée sur la période</p>
        ) : (
          <div className="space-y-4">
            {byDepartment.map((d) => (
              <div key={d.name} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-gray-700">{d.name}</span>
                  <span className="text-gray-400">{d.count} demande{d.count > 1 ? "s" : ""}</span>
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
          <div className="space-y-2">
            {overduePayments.map((p) => {
              const daysLate = Math.floor(
                (Date.now() - new Date(p.scheduledDate).getTime()) / 86_400_000
              );
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.requestLabel}</p>
                    <p className="text-xs text-red-500">
                      Prévu le {new Date(p.scheduledDate).toLocaleDateString("fr-FR")} · {daysLate}j
                      de retard
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{fmt(p.amount)}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
