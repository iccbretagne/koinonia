"use client";

import { useState, useMemo } from "react";

const STATUS_LABEL: Record<string, string> = {
  EN_SERVICE: "En service",
  EN_SERVICE_DEBRIEF: "En service + débrief",
  INDISPONIBLE: "Indisponible",
  REMPLACANT: "Remplaçant",
};

const STATUS_COLOR: Record<string, string> = {
  EN_SERVICE: "bg-green-100 text-green-800",
  EN_SERVICE_DEBRIEF: "bg-blue-100 text-blue-800",
  INDISPONIBLE: "bg-red-100 text-red-700",
  REMPLACANT: "bg-amber-100 text-amber-800",
};

type PlanningEntry = {
  id: string;
  status: string | null;
  eventDepartment: {
    event: {
      id: string;
      title: string;
      type: string;
      date: Date | string;
    };
    department: {
      id: string;
      name: string;
    };
  };
};

interface Props {
  plannings: PlanningEntry[];
  tasksByEvent?: Record<string, string[]>;
}

function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatMonthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

function monthKeyOf(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function MyPlanningView({ plannings, tasksByEvent = {} }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);

  const { minKey, maxKey } = useMemo(() => {
    if (plannings.length === 0) return { minKey: currentMonthKey(), maxKey: currentMonthKey() };
    const keys = plannings.map((p) => monthKeyOf(p.eventDepartment.event.date)).sort();
    // Extend range to include current month
    const cur = currentMonthKey();
    return {
      minKey: keys[0] < cur ? keys[0] : cur,
      maxKey: keys[keys.length - 1] > cur ? keys[keys.length - 1] : cur,
    };
  }, [plannings]);

  const entries = useMemo(
    () => plannings.filter((p) => monthKeyOf(p.eventDepartment.event.date) === selectedMonth)
             .sort((a, b) => new Date(a.eventDepartment.event.date).getTime() - new Date(b.eventDepartment.event.date).getTime()),
    [plannings, selectedMonth]
  );

  const { year, month } = parseMonthKey(selectedMonth);
  const canPrev = selectedMonth > minKey;
  const canNext = selectedMonth < maxKey;

  if (plannings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
        <p className="text-lg">Aucun service planifié.</p>
        <p className="text-sm mt-1">
          Votre responsable de département vous assignera à des événements.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Navigation mois */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setSelectedMonth((k) => addMonths(k, -1))}
          disabled={!canPrev}
          className="p-2 rounded-lg border-2 border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Mois précédent"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-base font-semibold text-gray-800 capitalize">
          {formatMonthLabel(year, month)}
        </h2>
        <button
          onClick={() => setSelectedMonth((k) => addMonths(k, 1))}
          disabled={!canNext}
          className="p-2 rounded-lg border-2 border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Mois suivant"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 text-gray-400 border-2 border-gray-100 border-dashed rounded-lg">
          <p>Aucun service ce mois-ci.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((p) => {
            const event = p.eventDepartment.event;
            const dept = p.eventDepartment.department;
            const isPast = new Date(event.date) < new Date();
            const tasks = tasksByEvent[event.id] ?? [];
            return (
              <div
                key={p.id}
                className={`bg-white rounded-lg border-2 px-4 py-3 ${
                  isPast ? "border-gray-100 opacity-70" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{event.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(event.date)}
                      <span className="mx-1.5">·</span>
                      {dept.name}
                    </p>
                    {tasks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tasks.map((t) => (
                          <span key={t} className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {p.status ? (
                    <span
                      className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                        STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs bg-gray-100 text-gray-400 px-2.5 py-1 rounded-full">
                      Pas en service
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
