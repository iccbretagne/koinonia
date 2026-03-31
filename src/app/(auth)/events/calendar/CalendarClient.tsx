"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import html2canvas from "html2canvas-pro";
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

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Build YYYY-MM-DD from local date components — avoids UTC offset shift from toISOString() */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: { date: number; inMonth: boolean; dateStr: string }[] = [];

  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month - 1, -startDow + i + 1);
    days.push({ date: d.getDate(), inMonth: false, dateStr: localDateStr(d) });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month - 1, d);
    days.push({ date: d, inMonth: true, dateStr: localDateStr(dt) });
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month, i);
      days.push({ date: d.getDate(), inMonth: false, dateStr: localDateStr(d) });
    }
  }

  return days;
}

function MonthGrid({
  year,
  month,
  eventsByDate,
  todayStr,
}: {
  year: number;
  month: number;
  eventsByDate: Map<string, CalendarEvent[]>;
  todayStr: string;
}) {
  const days = useMemo(() => buildMonthDays(year, month), [year, month]);

  return (
    <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-800">
          {MONTHS_FR[month - 1]} {year}
        </h2>
      </div>
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
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
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
                      <span
                        key={ev.id}
                        className={`w-2 h-2 rounded-full ${getEventTypeColors(ev.type).dot}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                {dayEvents.map((ev) => {
                  const colors = getEventTypeColors(ev.type);
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
  );
}

export default function CalendarClient({ events }: Props) {
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "png" | "copy" | null>(null);

  const [mode, setMode] = useState<"single" | "multi">("single");
  const [currentMonth, setCurrentMonth] = useState(currentYM);
  const [startMonth, setStartMonth] = useState(currentYM);
  const [endMonth, setEndMonth] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [year, month] = currentMonth.split("-").map(Number);

  function navigateMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  // Months to display in multi mode (capped at 12)
  const months = useMemo(() => {
    if (mode === "single") return [];
    const [sy, sm] = startMonth.split("-").map(Number);
    const [ey, em] = endMonth.split("-").map(Number);
    const result: { year: number; month: number }[] = [];
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      result.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
      if (result.length >= 12) break;
    }
    return result;
  }, [mode, startMonth, endMonth]);

  // Group all events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const dateStr = ev.date.split("T")[0];
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(ev);
    }
    return map;
  }, [events]);

  // Single-month grid days
  const calendarDays = useMemo(() => {
    if (mode !== "single") return [];
    return buildMonthDays(year, month);
  }, [mode, year, month]);

  const todayStr = localDateStr(new Date());

  const printTitle =
    mode === "single"
      ? `${MONTHS_FR[month - 1]} ${year}`
      : months.length > 0
        ? `${MONTHS_FR[months[0].month - 1]} ${months[0].year} — ${MONTHS_FR[months[months.length - 1].month - 1]} ${months[months.length - 1].year}`
        : "";

  async function captureCanvas() {
    if (!captureRef.current) return null;
    return html2canvas(captureRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#f9fafb",
    });
  }

  async function handleDownloadPng() {
    setExporting("png");
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `calendrier-${printTitle.replace(/\s/g, "-").replace(/—/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExporting(null);
    }
  }

  async function handleCopyPng() {
    setExporting("copy");
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        } catch {
          // Clipboard API non supportée (Firefox sans flag) — fallback silencieux
        }
      }, "image/png");
    } finally {
      setExporting(null);
    }
  }

  const legend = (
    <div className="mt-4 flex flex-wrap gap-3 justify-center">
      {Object.entries(EVENT_TYPE_COLORS).map(([type, colors]) => (
        <div key={type} className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
          <span className="text-xs text-gray-600">{colors.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {/* Controls — hidden on print */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 print:hidden">
        {/* Mode toggle */}
        <div className="flex rounded-lg border-2 border-icc-violet/20 overflow-hidden">
          <button
            onClick={() => setMode("single")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mode === "single"
                ? "bg-icc-violet text-white"
                : "bg-white text-icc-violet hover:bg-icc-violet-light"
            }`}
          >
            Vue mensuelle
          </button>
          <button
            onClick={() => setMode("multi")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mode === "multi"
                ? "bg-icc-violet text-white"
                : "bg-white text-icc-violet hover:bg-icc-violet-light"
            }`}
          >
            Vue multi-mois
          </button>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-icc-violet bg-white border-2 border-icc-violet/30 rounded-lg hover:bg-icc-violet-light transition-colors disabled:opacity-50"
            title="Exporter en PDF"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            PDF
          </button>
          <button
            onClick={handleDownloadPng}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-icc-violet bg-white border-2 border-icc-violet/30 rounded-lg hover:bg-icc-violet-light transition-colors disabled:opacity-50"
            title="Télécharger en PNG"
          >
            {exporting === "png" ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            PNG
          </button>
          <button
            onClick={handleCopyPng}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 transition-colors disabled:opacity-50"
            title="Copier l'image dans le presse-papiers"
          >
            {exporting === "copy" ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            Copier
          </button>
        </div>
      </div>

      {/* Single-month navigation */}
      {mode === "single" && (
        <div className="flex items-center justify-center gap-2 mb-6 print:hidden">
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
            onChange={(e) => { if (e.target.value) setCurrentMonth(e.target.value); }}
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
      )}

      {/* Multi-month period selector */}
      {mode === "multi" && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 font-medium">Du</label>
            <input
              type="month"
              value={startMonth}
              max={endMonth}
              onChange={(e) => { if (e.target.value) setStartMonth(e.target.value); }}
              className="px-3 py-2 text-sm font-semibold text-icc-violet bg-icc-violet-light border-2 border-icc-violet/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-icc-violet"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 font-medium">Au</label>
            <input
              type="month"
              value={endMonth}
              min={startMonth}
              onChange={(e) => { if (e.target.value) setEndMonth(e.target.value); }}
              className="px-3 py-2 text-sm font-semibold text-icc-violet bg-icc-violet-light border-2 border-icc-violet/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-icc-violet"
            />
          </div>
          {months.length > 0 && (
            <span className="text-sm text-gray-500">
              {months.length} mois affiché{months.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Capture zone */}
      <div ref={captureRef} className="bg-gray-50 rounded-xl p-4">

      {/* Period title — visible on print and PNG capture */}
      <div className="mb-4 print:mb-6">
        <p className="text-base font-semibold text-gray-700">Calendrier — {printTitle}</p>
      </div>

      {/* Calendar content */}
      {mode === "single" ? (
        <>
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 overflow-hidden">
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
                            <span
                              key={ev.id}
                              className={`w-2 h-2 rounded-full ${getEventTypeColors(ev.type).dot}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((ev) => {
                        const colors = getEventTypeColors(ev.type);
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
        </>
      ) : (
        <div className="space-y-8">
          {months.map(({ year: y, month: m }) => (
            <MonthGrid
              key={`${y}-${m}`}
              year={y}
              month={m}
              eventsByDate={eventsByDate}
              todayStr={todayStr}
            />
          ))}
          {months.length === 0 && (
            <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
              Sélectionnez une période valide.
            </div>
          )}
        </div>
      )}

      {legend}
      </div>{/* end capture zone */}
    </div>
  );
}
