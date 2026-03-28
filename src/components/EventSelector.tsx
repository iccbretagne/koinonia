"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

interface Event {
  id: string;
  title: string;
  type: string;
  date: string;
}

interface EventSelectorProps {
  events: Event[];
  selectedEventId: string | null;
  selectedDeptId: string | null;
}

function toYearMonth(isoDate: string): string {
  return isoDate.slice(0, 7); // "YYYY-MM"
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function formatEventLabel(event: Event): string {
  const date = new Date(event.date).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${event.title} — ${date}`;
}

export default function EventSelector({
  events,
  selectedEventId,
  selectedDeptId,
}: EventSelectorProps) {
  const router = useRouter();

  // Sorted unique months that have at least one event
  const months = useMemo(() => {
    const set = new Set(events.map((e) => toYearMonth(e.date)));
    return Array.from(set).sort();
  }, [events]);

  // Lazy initializer — runs once on mount to pick the right starting month
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (selectedEventId) {
      const ev = events.find((e) => e.id === selectedEventId);
      if (ev) return toYearMonth(ev.date);
    }
    const sortedMonths = Array.from(new Set(events.map((e) => toYearMonth(e.date)))).sort();
    const now = toYearMonth(new Date().toISOString());
    return sortedMonths.find((m) => m >= now) ?? sortedMonths[0] ?? "";
  });

  // Events for the selected month
  const monthEvents = useMemo(
    () => events.filter((e) => toYearMonth(e.date) === selectedMonth),
    [events, selectedMonth]
  );

  // Auto-select event when month changes or on initial load
  useEffect(() => {
    if (!selectedMonth) return;

    if (monthEvents.length === 0) return;

    // If the currently selected event is in this month, keep it
    if (selectedEventId && monthEvents.some((e) => e.id === selectedEventId)) return;

    // Auto-select: pick the next upcoming event, otherwise the first
    const now = new Date();
    const upcoming = monthEvents.find((e) => new Date(e.date) >= now);
    const eventId = (upcoming ?? monthEvents[0]).id;

    const params = new URLSearchParams(window.location.search);
    if (selectedDeptId) params.set("dept", selectedDeptId);
    params.set("event", eventId);
    router.replace(`/dashboard?${params.toString()}`);
  }, [selectedMonth, monthEvents, selectedEventId, selectedDeptId, router]);

  function handleMonthChange(ym: string) {
    setSelectedMonth(ym);
    // Event will be auto-selected by the effect above
  }

  function handleEventChange(eventId: string) {
    const params = new URLSearchParams(window.location.search);
    if (selectedDeptId) params.set("dept", selectedDeptId);
    params.set("event", eventId);
    router.push(`/dashboard?${params.toString()}`);
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic" data-tour="event-selector">
        Aucun événement disponible
      </p>
    );
  }

  return (
    <div data-tour="event-selector" className="flex flex-wrap gap-3 items-end">
      {/* Month select */}
      <div className="flex-1 min-w-[160px]">
        <label className="block mb-1 text-sm font-medium text-gray-700">
          Mois
        </label>
        <select
          value={selectedMonth}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="w-full px-3 py-2.5 md:py-2 border-2 border-gray-300 rounded-lg shadow-sm text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet capitalize"
        >
          <option value="" disabled>Choisir le mois</option>
          {months.map((ym) => (
            <option key={ym} value={ym} className="capitalize">
              {formatMonthLabel(ym)}
            </option>
          ))}
        </select>
      </div>

      {/* Event select */}
      <div className="flex-[2] min-w-[220px]">
        <label className="block mb-1 text-sm font-medium text-gray-700">
          Événement
        </label>
        <select
          value={selectedEventId || ""}
          onChange={(e) => handleEventChange(e.target.value)}
          disabled={monthEvents.length === 0}
          className="w-full px-3 py-2.5 md:py-2 border-2 border-gray-300 rounded-lg shadow-sm text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="" disabled>Choisir un événement</option>
          {monthEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {formatEventLabel(event)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
