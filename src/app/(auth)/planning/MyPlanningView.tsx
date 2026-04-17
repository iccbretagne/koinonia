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

function formatMonth(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function getMonthKey(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type FilterMode = "upcoming" | "past" | "all";

export default function MyPlanningView({ plannings }: Props) {
  const [filter, setFilter] = useState<FilterMode>("upcoming");

  const now = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const filtered = useMemo(() => {
    return plannings.filter((p) => {
      const d = new Date(p.eventDepartment.event.date);
      if (filter === "upcoming") return d >= now;
      if (filter === "past") return d < now;
      return true;
    });
  }, [plannings, filter, now]);

  // Group by month
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; entries: PlanningEntry[] }>();
    for (const p of filtered) {
      const key = getMonthKey(p.eventDepartment.event.date);
      if (!map.has(key)) {
        map.set(key, {
          label: formatMonth(p.eventDepartment.event.date),
          entries: [],
        });
      }
      map.get(key)!.entries.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

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
      {/* Filter tabs */}
      <div className="flex rounded-lg border-2 border-gray-200 overflow-hidden text-sm w-fit mb-6">
        {(["upcoming", "past", "all"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={`px-4 py-2 font-medium transition-colors ${
              filter === mode
                ? "bg-icc-violet text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {mode === "upcoming" ? "À venir" : mode === "past" ? "Passés" : "Tout"}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p>Aucun service {filter === "upcoming" ? "à venir" : "passé"}.</p>
        </div>
      )}

      {/* Grouped by month */}
      <div className="space-y-8">
        {grouped.map(([key, { label, entries }]) => (
          <div key={key}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 capitalize">
              {label}
            </h2>
            <div className="space-y-2">
              {entries.map((p) => {
                const event = p.eventDepartment.event;
                const dept = p.eventDepartment.department;
                const isPast = new Date(event.date) < now;
                return (
                  <div
                    key={p.id}
                    className={`bg-white rounded-lg border-2 px-4 py-3 flex items-center justify-between gap-4 ${
                      isPast ? "border-gray-100 opacity-70" : "border-gray-200"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{event.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(event.date)}
                        <span className="mx-1.5">·</span>
                        {dept.name}
                      </p>
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
                      <span className="shrink-0 text-xs text-gray-400 italic">
                        Non défini
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
