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
  departments: Department[];
  initialDeptId?: string;
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

        {/* Period mode toggle */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Période</span>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 h-fit">
            <button
              onClick={() => setPeriodMode("preset")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                periodMode === "preset" ? "bg-white text-icc-violet shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Prédéfinie
            </button>
            <button
              onClick={() => setPeriodMode("custom")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                periodMode === "custom" ? "bg-white text-icc-violet shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Personnalisée
            </button>
          </div>
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
              <label className="block mb-1 text-sm font-medium text-gray-700">Du</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">Au</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("planning")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "planning" ? "bg-white text-icc-violet shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Planning
        </button>
        <button
          onClick={() => setTab("tasks")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "tasks" ? "bg-white text-icc-violet shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Tâches
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Chargement...</div>
      ) : !data ? (
        <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          Sélectionnez un département
        </div>
      ) : (
        <div className="space-y-8">
          {tab === "planning" ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-500">Événements</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.totalEvents}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-500">STAR actifs</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.members.filter((m) => m.services > 0).length}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-500">Taux moyen</p>
                  <p className="text-2xl font-bold text-icc-violet">
                    {data.members.length > 0
                      ? Math.round(
                          data.members.reduce((s, m) => s + m.rate, 0) /
                            data.members.length
                        )
                      : 0}
                    %
                  </p>
                </div>
              </div>

              {/* Bar chart: services per member */}
              {data.members.length > 0 && (
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">
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
                      <Bar dataKey="services" fill="#5E17EB" name="En service" />
                      <Bar
                        dataKey="indisponible"
                        fill="#FF3131"
                        name="Indisponible"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Line chart: monthly trend */}
              {data.trend.length > 1 && (
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">
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
                        stroke="#5E17EB"
                        strokeWidth={2}
                        name="En service"
                      />
                      <Line
                        type="monotone"
                        dataKey="totalSlots"
                        stroke="#38B6FF"
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
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b">
                    Détail par STAR
                  </h3>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                          STAR
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                          Services
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                          Indispo.
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                          Taux
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.members.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-700">
                            {m.name}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-green-700">
                            {m.services}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-red-700">
                            {m.indisponible}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-medium">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                m.rate >= 50
                                  ? "bg-green-100 text-green-800"
                                  : m.rate >= 25
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-red-100 text-red-800"
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
              )}
            </>
          ) : (
            <>
              {/* Task stats tab */}
              {data.taskStats.tasks.length === 0 ? (
                <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
                  Aucune assignation de tâche sur cette période.
                </div>
              ) : (
                <>
                  {/* Task summary cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg shadow p-4">
                      <p className="text-sm text-gray-500">Tâches définies</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {data.taskStats.tasks.length}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                      <p className="text-sm text-gray-500">Assignations totales</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {data.taskStats.tasks.reduce((s, t) => s + t.count, 0)}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                      <p className="text-sm text-gray-500">STAR assignés</p>
                      <p className="text-2xl font-bold text-icc-violet">
                        {data.taskStats.memberTasks.length}
                      </p>
                    </div>
                  </div>

                  {/* Bar chart: assignments per task */}
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
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
                        <Bar dataKey="count" fill="#5E17EB" name="Assignations" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Table: member task breakdown */}
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b">
                      Détail par STAR
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 sticky left-0 bg-gray-50">
                              STAR
                            </th>
                            {data.taskStats.tasks.map((t) => (
                              <th key={t.id} className="px-3 py-2 text-center text-xs font-medium text-gray-500 whitespace-nowrap">
                                {t.name}
                              </th>
                            ))}
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {data.taskStats.memberTasks.map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-sm text-gray-700 sticky left-0 bg-white">
                                {m.name}
                              </td>
                              {data.taskStats.tasks.map((t) => {
                                const count = m.tasks.find((mt) => mt.taskId === t.id)?.count ?? 0;
                                return (
                                  <td key={t.id} className="px-3 py-2 text-sm text-center">
                                    {count > 0 ? (
                                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-icc-violet/10 text-icc-violet text-xs font-medium">
                                        {count}
                                      </span>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">
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
