"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

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

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

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
      days.push({
        date: d.getDate(),
        inMonth: false,
        dateStr: d.toISOString().split("T")[0],
      });
    }

    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(year, month - 1, d);
      days.push({
        date: d,
        inMonth: true,
        dateStr: dt.toISOString().split("T")[0],
      });
    }

    // Next month padding
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month, i);
        days.push({
          date: d.getDate(),
          inMonth: false,
          dateStr: d.toISOString().split("T")[0],
        });
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

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigateMonth(-1)}
          className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
        >
          &larr;
        </button>
        <input
          type="month"
          value={currentMonth}
          onChange={(e) => {
            if (e.target.value) setCurrentMonth(e.target.value);
          }}
          className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer text-center capitalize"
        />
        <button
          onClick={() => navigateMonth(1)}
          className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
        >
          &rarr;
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b">
          {DAYS_FR.map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-xs font-semibold text-gray-500 text-center"
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
                className={`min-h-[80px] md:min-h-[100px] border-b border-r p-1 ${
                  day.inMonth ? "bg-white" : "bg-gray-50"
                }`}
              >
                <div
                  className={`text-xs font-medium mb-1 ${
                    isToday
                      ? "bg-icc-violet text-white w-6 h-6 rounded-full flex items-center justify-center"
                      : day.inMonth
                        ? "text-gray-700"
                        : "text-gray-300"
                  }`}
                >
                  {day.date}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/events/${ev.id}/star-view`}
                      className="block px-1 py-0.5 text-xs rounded bg-icc-violet/10 text-icc-violet hover:bg-icc-violet/20 truncate"
                      title={`${ev.title} (${ev.type})`}
                    >
                      {ev.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
