"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { getEventTypeColors, EVENT_TYPE_COLORS } from "@/lib/event-types";

interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  date: string;
}

interface Props {
  events: CalendarEvent[];
}

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getEventColors(type: string) {
  return getEventTypeColors(type);
}

/** Build YYYY-MM-DD from local date components — avoids UTC offset shift from toISOString() */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarClient({ events }: Props) {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const [year, month] = currentMonth.split("-").map(Number);

  function navigateMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // Monday = 0 in our grid
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { date: number; inMonth: boolean; dateStr: string }[] = [];

    // Previous month padding
    for (let i = 0; i < startDow; i++) {
      const d = new Date(year, month - 1, -startDow + i + 1);
      days.push({ date: d.getDate(), inMonth: false, dateStr: localDateStr(d) });
    }

    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(year, month - 1, d);
      days.push({ date: d, inMonth: true, dateStr: localDateStr(dt) });
    }

    // Next month padding
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month, i);
        days.push({ date: d.getDate(), inMonth: false, dateStr: localDateStr(d) });
      }
    }

    return days;
  }, [year, month]);

  // Group events by date string
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const dateStr = ev.date.split("T")[0];
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(ev);
    }
    return map;
  }, [events]);

  const todayStr = localDateStr(new Date());

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <button
          onClick={() => navigateMonth(-1)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-icc-violet hover:bg-icc-violet-light transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <input
          type="month"
          value={currentMonth}
          onChange={(e) => {
            if (e.target.value) setCurrentMonth(e.target.value);
          }}
          className="px-4 py-2 text-lg font-semibold text-icc-violet bg-icc-violet-light border-2 border-icc-violet/20 rounded-lg cursor-pointer text-center capitalize focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
        />
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-icc-violet hover:bg-icc-violet-light transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-icc-violet">
          {DAYS_FR.map((day) => (
            <div
              key={day}
              className="px-2 py-3 text-xs font-bold text-white text-center uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const dayEvents = eventsByDate.get(day.dateStr) || [];
            const isToday = day.dateStr === todayStr;

            return (
              <div
                key={idx}
                className={`min-h-[80px] md:min-h-[110px] border-b border-r border-gray-100 p-1.5 transition-colors ${
                  day.inMonth
                    ? isToday
                      ? "bg-icc-violet-light/50"
                      : "bg-white hover:bg-gray-50"
                    : "bg-gray-50/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-semibold mb-1 ${
                      isToday
                        ? "bg-icc-violet text-white w-7 h-7 rounded-full shadow-sm"
                        : day.inMonth
                          ? "text-gray-700 w-7 h-7"
                          : "text-gray-300 w-7 h-7"
                    }`}
                  >
                    {day.date}
                  </span>
                  {dayEvents.length > 0 && !isToday && (
                    <div className="flex gap-0.5 mt-1">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span key={ev.id} className={`w-2 h-2 rounded-full ${getEventColors(ev.type).dot}`} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {dayEvents.map((ev) => {
                    const colors = getEventColors(ev.type);
                    return (
                      <Link
                        key={ev.id}
                        href={`/events/${ev.id}/star-view`}
                        className={`block px-1.5 py-1 text-xs font-medium rounded-md ${colors.bg} ${colors.text} ${colors.hover} hover:text-white transition-colors truncate`}
                        title={`${ev.title} (${ev.type})`}
                      >
                        {ev.title}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        {Object.entries(EVENT_TYPE_COLORS).map(([type, colors]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
            <span className="text-xs text-gray-600">{colors.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
