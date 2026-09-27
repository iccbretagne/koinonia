"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { controlClasses, fieldLabelClasses } from "@/components/ui/field-classes";
import { ChartColumn, ListChecks } from "lucide-react";

/**
 * Couleurs des séries (exception documentée, migration.md) : recharts les pose en attributs SVG,
 * qui ne lisent pas les variables CSS. Violet et bleu de la charte, lisibles dans les deux thèmes.
 */
const SERIES = { primary: "#7c4dff", danger: "#e5484d", secondary: "#38B6FF" };

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: { value: T; label: string }[];
  readonly onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex w-fit gap-0.5 rounded-control bg-surface-sunken p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-[7px] px-4 font-display text-sm font-semibold transition-colors duration-120
            focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              value === o.value ? "bg-surface text-brand-text shadow-card" : "text-ink-muted hover:text-ink"
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatTile({ label, value, accent = false }: { readonly label: string; readonly value: React.ReactNode; readonly accent?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-[13px] leading-[18px] text-ink-muted">{label}</p>
      <p className={`font-display text-[28px] font-bold leading-[34px] tabular-nums ${accent ? "text-brand-text" : "text-ink"}`}>{value}</p>
    </div>
  );
}

interface Department {
  id: string;
  name: string;
  ministryName: string;
}

interface MemberStat {
  id: string;
  name: string;
  services: number;
  indisponible: number;
  rate: number;
}

interface TrendPoint {
  month: string;
  enService: number;
  totalSlots: number;
}

interface TaskStat {
  id: string;
  name: string;
  count: number;
}

interface MemberTaskStat {
  id: string;
  name: string;
  tasks: { taskId: string; taskName: string; count: number }[];
  totalAssignments: number;
}

interface StatsData {
  department: { id: string; name: string };
  totalEvents: number;
  months: number;
  members: MemberStat[];
  trend: TrendPoint[];
  taskStats: { tasks: TaskStat[]; memberTasks: MemberTaskStat[] };
}

interface Props {
  readonly departments: Department[];
  readonly initialDeptId?: string;
}

function toLocalDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StatsClient({ departments, initialDeptId }: Props) {
  const [selectedDeptId, setSelectedDeptId] = useState(
    (initialDeptId && departments.some((d) => d.id === initialDeptId))
      ? initialDeptId
      : (departments[0]?.id || "")
  );
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
  const [months, setMonths] = useState("6");
  const defaultFrom = toLocalDateInputValue(new Date(new Date().setMonth(new Date().getMonth() - 6)));
  const defaultTo = toLocalDateInputValue(new Date());
  const [customFrom, setCustomFrom] = useState(defaultFrom);
  const [customTo, setCustomTo] = useState(defaultTo);
  const [tab, setTab] = useState<"planning" | "tasks">("planning");

  const fetchStats = useCallback(async () => {
    if (!selectedDeptId) return;
    setLoading(true);
    try {
      const url = periodMode === "custom"
        ? `/api/departments/${selectedDeptId}/stats?from=${customFrom}&to=${customTo}`
        : `/api/departments/${selectedDeptId}/stats?months=${months}`;
      const res = await fetch(url);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedDeptId, periodMode, months, customFrom, customTo]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  function formatMonth(ym: string) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", {
      month: "short",
      year: "2-digit",
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="w-64">
          <Select
            label="Département"
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            options={departments.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.ministryName})`,
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={fieldLabelClasses}>Période</span>
          <Segmented
            label="Période"
            value={periodMode}
            onChange={setPeriodMode}
            options={[
              { value: "preset", label: "Prédéfinie" },
              { value: "custom", label: "Personnalisée" },
            ]}
          />
        </div>

        {periodMode === "preset" ? (
          <div className="w-36">
            <Select
              label="Durée"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              options={[
                { value: "1", label: "1 mois" },
                { value: "3", label: "3 mois" },
                { value: "6", label: "6 mois" },
                { value: "12", label: "12 mois" },
                { value: "24", label: "24 mois" },
              ]}
            />
          </div>
        ) : (
          <div className="flex gap-3 items-end">
            <div>
              <label className="flex flex-col gap-1.5"><span className={fieldLabelClasses}>Du</span><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={controlClasses()} /></label>
            </div>
            <div>
              <label className="flex flex-col gap-1.5"><span className={fieldLabelClasses}>Au</span><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={controlClasses()} /></label>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6">
        <Segmented
          label="Statistiques"
          value={tab}
          onChange={setTab}
          options={[
            { value: "planning", label: "Planning" },
            { value: "tasks", label: "Tâches" },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <span className="sr-only">Chargement des statistiques…</span>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-[88px] rounded-card" />
            <Skeleton className="h-[88px] rounded-card" />
            <Skeleton className="h-[88px] rounded-card" />
          </div>
          <Skeleton className="h-72 rounded-card" />
        </div>
      ) : !data ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState icon={ChartColumn} title="Choisissez un département" description="Sélectionnez un département pour afficher ses statistiques." />
        </div>
      ) : (
        <div className="space-y-8">
          {tab === "planning" ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatTile label="Événements" value={<>{data.totalEvents}</>} />
                <StatTile label="STAR actifs" value={<>{data.members.filter((m) => m.services > 0).length}</>} />
                <StatTile label="Taux moyen" accent value={<>{data.members.length > 0
                      ? Math.round(
                          data.members.reduce((s, m) => s + m.rate, 0) /
                            data.members.length
                        )
                      : 0}
                    %</>} />
              </div>

              {/* Bar chart: services per member */}
              {data.members.length > 0 && (
                <div className="rounded-card border border-line bg-surface shadow-card p-4">
                  <h3 className="mb-4 font-display text-[15px] font-semibold text-ink">
                    Services par STAR
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.members} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip />
                      <Bar dataKey="services" fill={SERIES.primary} name="En service" />
                      <Bar
                        dataKey="indisponible"
                        fill={SERIES.danger}
                        name="Indisponible"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Line chart: monthly trend */}
              {data.trend.length > 1 && (
                <div className="rounded-card border border-line bg-surface shadow-card p-4">
                  <h3 className="mb-4 font-display text-[15px] font-semibold text-ink">
                    Tendance mensuelle
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart
                      data={data.trend.map((t) => ({
                        ...t,
                        month: formatMonth(t.month),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="enService"
                        stroke={SERIES.primary}
                        strokeWidth={2}
                        name="En service"
                      />
                      <Line
                        type="monotone"
                        dataKey="totalSlots"
                        stroke={SERIES.secondary}
                        strokeWidth={2}
                        name="Total"
                        strokeDasharray="5 5"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Table: member details */}
              {data.members.length > 0 && (
                <div className="rounded-card border border-line bg-surface shadow-card overflow-hidden">
                  <h3 className="border-b border-line px-4 py-3 font-display text-[15px] font-semibold text-ink">
                    Détail par STAR
                  </h3>
                  <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-surface-sunken">
                        <th className="px-4 py-2 text-left text-xs font-medium text-ink-muted">
                          STAR
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted">
                          Services
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted">
                          Indispo.
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted">
                          Taux
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.members.map((m) => (
                        <tr key={m.id} className="hover:bg-surface-sunken">
                          <td className="px-4 py-2 text-sm text-ink-muted">
                            {m.name}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-success">
                            {m.services}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-danger">
                            {m.indisponible}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-medium">
                            <span
                              className={`rounded-chip px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                m.rate >= 50
                                  ? "bg-success-soft text-success"
                                  : m.rate >= 25
                                    ? "bg-warning-soft text-warning"
                                    : "bg-danger-soft text-danger"
                              }`}
                            >
                              {m.rate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Task stats tab */}
              {data.taskStats.tasks.length === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                  <EmptyState icon={ListChecks} title="Aucune tâche attribuée sur cette période" description="Élargissez la période pour voir la répartition des tâches." size="sm" />
                </div>
              ) : (
                <>
                  {/* Task summary cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatTile label="Tâches définies" value={<>{data.taskStats.tasks.length}</>} />
                    <StatTile label="Assignations totales" value={<>{data.taskStats.tasks.reduce((s, t) => s + t.count, 0)}</>} />
                    <StatTile label="STAR assignés" accent value={<>{data.taskStats.memberTasks.length}</>} />
                  </div>

                  {/* Bar chart: assignments per task */}
                  <div className="rounded-card border border-line bg-surface shadow-card p-4">
                    <h3 className="mb-4 font-display text-[15px] font-semibold text-ink">
                      Répartition par tâche
                    </h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, data.taskStats.tasks.length * 40)}>
                      <BarChart data={data.taskStats.tasks} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip />
                        <Bar dataKey="count" fill={SERIES.primary} name="Assignations" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Table: member task breakdown */}
                  <div className="rounded-card border border-line bg-surface shadow-card overflow-hidden">
                    <h3 className="border-b border-line px-4 py-3 font-display text-[15px] font-semibold text-ink">
                      Détail par STAR
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-surface-sunken">
                            <th className="px-4 py-2 text-left text-xs font-medium text-ink-muted sticky left-0 bg-surface-sunken">
                              STAR
                            </th>
                            {data.taskStats.tasks.map((t) => (
                              <th key={t.id} className="px-3 py-2 text-center text-xs font-medium text-ink-muted whitespace-nowrap">
                                {t.name}
                              </th>
                            ))}
                            <th className="px-4 py-2 text-right text-xs font-medium text-ink-muted">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {data.taskStats.memberTasks.map((m) => (
                            <tr key={m.id} className="hover:bg-surface-sunken">
                              <td className="px-4 py-2 text-sm text-ink-muted sticky left-0 bg-surface">
                                {m.name}
                              </td>
                              {data.taskStats.tasks.map((t) => {
                                const count = m.tasks.find((mt) => mt.taskId === t.id)?.count ?? 0;
                                return (
                                  <td key={t.id} className="px-3 py-2 text-sm text-center">
                                    {count > 0 ? (
                                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-soft text-brand-text text-xs font-medium">
                                        {count}
                                      </span>
                                    ) : (
                                      <span className="text-ink-subtle">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-2 text-sm text-right font-semibold text-ink">
                                {m.totalAssignments}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
