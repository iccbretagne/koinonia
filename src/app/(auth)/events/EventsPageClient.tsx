"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface EventDept {
  id: string;
  department: { id: string; name: string };
}

interface EventItem {
  id: string;
  title: string;
  type: string;
  date: string;
  eventDepts: EventDept[];
}

function getInitialMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  // 6 months back, 12 months forward
  for (let i = -6; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}

function navigateMonth(current: string, delta: number) {
  const [y, m] = current.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

const typeBadgeColors: Record<string, string> = {
  CULTE: "bg-icc-violet/10 text-icc-violet",
  PRIERE: "bg-icc-jaune/20 text-yellow-700",
  REUNION: "bg-icc-bleu/10 text-icc-bleu",
  CONFERENCE: "bg-icc-rouge/10 text-icc-rouge",
  AUTRE: "bg-gray-100 text-gray-600",
};

function getTypeBadgeClass(type: string) {
  return typeBadgeColors[type] || "bg-gray-100 text-gray-600";
}

const monthOptions = buildMonthOptions();

export default function EventsPageClient({ churchId }: { churchId: string }) {
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/churches/${churchId}/events?month=${currentMonth}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.data || data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [churchId, currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Evenements</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth((m) => navigateMonth(m, -1))}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <select
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
            className="text-sm font-medium text-gray-700 capitalize border border-gray-200 rounded-md px-3 py-1.5 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-icc-violet/30 focus:border-icc-violet transition-colors"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setCurrentMonth((m) => navigateMonth(m, 1))}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-icc-violet border-t-transparent" />
          <span className="ml-3 text-sm text-gray-500">Chargement...</span>
        </div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          Aucun evenement ce mois
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs text-gray-500 capitalize">
                  {formatEventDate(event.date)}
                </span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${getTypeBadgeClass(event.type)}`}
                >
                  {event.type}
                </span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-3">{event.title}</h3>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {event.eventDepts.length} département{event.eventDepts.length !== 1 ? "s" : ""}
                </span>
                <Link
                  href={`/events/${event.id}/star-view`}
                  className="text-xs font-medium text-icc-violet hover:text-icc-violet/80 transition-colors"
                >
                  Voir STAR en service &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
