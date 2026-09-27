"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import Select from "@/components/ui/Select";

interface Event {
  id: string;
  title: string;
  type: string;
  date: string;
}

interface EventSelectorProps {
  readonly events: Event[];
  readonly selectedEventId: string | null;
  readonly selectedDeptId: string | null;
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
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [events]);

  // Lazy initializer — runs once on mount to pick the right starting month
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (selectedEventId) {
      const ev = events.find((e) => e.id === selectedEventId);
      if (ev) return toYearMonth(ev.date);
    }
    const sortedMonths = Array.from(new Set(events.map((e) => toYearMonth(e.date)))).sort((a, b) => a.localeCompare(b));
    const d = new Date();
    const now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
      <p className="text-[15px] leading-[22px] text-ink-muted" data-tour="event-selector">
        Aucun événement n&apos;est encore prévu pour ce département.
      </p>
    );
  }

  return (
    <div data-tour="event-selector" className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(14rem,2fr)]">
      <Select
        label="Mois"
        value={selectedMonth}
        onChange={(e) => handleMonthChange(e.target.value)}
        options={months.map((ym) => ({ value: ym, label: capitalize(formatMonthLabel(ym)) }))}
      />
      <Select
        label="Événement"
        value={selectedEventId || ""}
        onChange={(e) => handleEventChange(e.target.value)}
        disabled={monthEvents.length === 0}
        placeholder={selectedEventId ? undefined : "Choisir un événement"}
        options={monthEvents.map((event) => ({ value: event.id, label: formatEventLabel(event) }))}
      />
    </div>
  );
}

function capitalize(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}
