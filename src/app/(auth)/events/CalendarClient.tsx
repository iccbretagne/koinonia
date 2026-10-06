"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import html2canvas from "html2canvas-pro";
import { CalendarX2, ChevronRight, TriangleAlert, UserX } from "lucide-react";
import DateTile from "@/components/DateTile";
import ExportBar from "@/components/ExportBar";
import PeriodNav from "@/components/PeriodNav";
import { eventTypeDot, eventTypeTone } from "@/components/event-type-tone";
import Alert from "@/components/ui/Alert";
import EmptyState from "@/components/ui/EmptyState";
import UnstaffedChip from "@/components/UnstaffedChip";
import StatusChip, { statusToneClasses } from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/Toast";
import { EVENT_TYPES, getEventTypeLabel } from "@/lib/event-types";

interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  /** Départements sans STAR planifié (événement à venir, pour qui peut planifier ; 0 sinon). */
  unstaffed: number;
}

interface Props {
  readonly events: CalendarEvent[];
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

const WEEKDAY_HEADERS = DAYS_FR;

/**
 * Grille d'un mois. Sous 768px, les cellules ne portent que des points colorés (le titre ne tient
 * pas dans 50px) : la liste du mois, sous la grille, donne le détail.
 */
function DaysGrid({
  days,
  eventsByDate,
  todayStr,
}: {
  readonly days: { date: number; inMonth: boolean; dateStr: string }[];
  readonly eventsByDate: Map<string, CalendarEvent[]>;
  readonly todayStr: string;
}) {
  return (
    <>
      <div className="grid grid-cols-7 border-b border-line bg-surface-sunken">
        {WEEKDAY_HEADERS.map((day) => (
          <div
            key={day}
            className="px-1 py-2 text-center font-display text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted"
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
              key={day.dateStr}
              className={`min-h-14 border-b border-r border-line p-1 md:min-h-[110px] md:p-1.5 ${
                idx % 7 === 6 ? "border-r-0" : ""
              } ${day.inMonth ? (isToday ? "bg-brand-soft" : "bg-surface") : "bg-surface-sunken/60"}`}
            >
              <div className="flex items-start justify-between">
                <span
                  aria-current={isToday ? "date" : undefined}
                  className={`mb-1 inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                    isToday ? "bg-brand text-on-brand" : day.inMonth ? "text-ink" : "text-ink-subtle"
                  }`}
                >
                  {day.date}
                </span>
              </div>
              {dayEvents.length > 0 && (
                <div className="flex flex-wrap gap-0.5 px-1 md:hidden" aria-hidden="true">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span key={ev.id} className={`size-1.5 rounded-full ${eventTypeDot(ev.type)}`} />
                  ))}
                </div>
              )}
              <div className="hidden flex-col gap-1 md:flex">
                {dayEvents.map((ev) => (
                  <Link
                    key={ev.id}
                    href={`/events/${ev.id}/star-view`}
                    className={`block truncate rounded-chip px-1.5 py-1 text-xs font-semibold transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${statusToneClasses[eventTypeTone(ev.type)]}`}
                    title={`${ev.title} (${getEventTypeLabel(ev.type)})${
                      ev.unstaffed > 0 ? ` — ${ev.unstaffed} département${ev.unstaffed > 1 ? "s" : ""} sans STAR planifié` : ""
                    }`}
                  >
                    {ev.unstaffed > 0 && (
                      <UserX
                        aria-hidden="true"
                        className="mr-1 inline size-3.5 align-[-2px] text-warning group-data-[capturing]:hidden print:hidden"
                        strokeWidth={2.25}
                      />
                    )}
                    {ev.title}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Événements d'un mois en lignes compactes : vue liste, et détail sous la grille sur mobile. */
function EventRows({ events }: { readonly events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState icon={CalendarX2} title="Aucun événement ce mois-ci" size="sm" />
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-card border border-line bg-surface">
      {events.map((ev) => {
        const d = new Date(ev.date);
        return (
          <li key={ev.id} className="border-t border-line first:border-t-0">
            <Link
              href={`/events/${ev.id}/star-view`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              <DateTile date={d} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{ev.title}</p>
                <p className="text-[13px] leading-[18px] text-ink-muted">
                  {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h")}
                </p>
              </div>
              {ev.unstaffed > 0 && <UnstaffedChip count={ev.unstaffed} />}
              <StatusChip tone={eventTypeTone(ev.type)} className="shrink-0">
                {getEventTypeLabel(ev.type)}
              </StatusChip>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function MonthGrid({
  year,
  month,
  eventsByDate,
  todayStr,
}: {
  readonly year: number;
  readonly month: number;
  readonly eventsByDate: Map<string, CalendarEvent[]>;
  readonly todayStr: string;
}) {
  const days = useMemo(() => buildMonthDays(year, month), [year, month]);

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <h2 className="border-b border-line px-4 py-3 font-display text-[15px] font-semibold text-ink">
        {MONTHS_FR[month - 1]} {year}
      </h2>
      <DaysGrid days={days} eventsByDate={eventsByDate} todayStr={todayStr} />
    </section>
  );
}

export default function CalendarClient({ events }: Props) {
  const toast = useToast();
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "png" | "copy" | null>(null);

  const [mode, setMode] = useState<"single" | "multi" | "list">("single");
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

  // Événements du mois courant, pour la vue liste
  const monthEvents = useMemo(() => {
    if (mode === "multi") return [];
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    return events
      .filter((ev) => ev.date.slice(0, 7) === prefix)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [mode, events, year, month]);

  const todayStr = localDateStr(new Date());
  const unstaffedEvents = events.filter((ev) => ev.unstaffed > 0).length;

  const printTitle =
    mode !== "multi"
      ? `${MONTHS_FR[month - 1]} ${year}`
      : months.length > 0
        ? `${MONTHS_FR[months[0].month - 1]} ${months[0].year} — ${MONTHS_FR[months.at(-1)!.month - 1]} ${months.at(-1)!.year}`
        : "";

  async function captureCanvas() {
    if (!captureRef.current) return null;
    // L'image exportée reste en thème clair, quel que soit le thème affiché (partage, impression).
    const el = captureRef.current;
    el.dataset.theme = "light";
    el.dataset.capturing = "true";
    try {
      return await html2canvas(el, {
        scale: 2,
        useCORS: true,
        // Exception documentée (migration.md) : couleur d'export, `bg` du thème clair.
        backgroundColor: "#f6f5fa",
      });
    } finally {
      delete el.dataset.theme;
      delete el.dataset.capturing;
    }
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
    } catch {
      toast.error("Export impossible. Réessayez dans un instant.");
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
          toast.success("Image copiée dans le presse-papiers");
        } catch {
          // Clipboard API non supportée (Firefox sans flag)
          toast.error("Copie impossible dans ce navigateur. Téléchargez l'image en PNG.");
        }
      }, "image/png");
    } finally {
      setExporting(null);
    }
  }

  const legend = (
    <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2" aria-label="Légende des types d'événement">
      {EVENT_TYPES.map((type) => (
        <li key={type} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-2.5 rounded-full ${eventTypeDot(type)}`} />
          <span className="text-xs text-ink-muted">{getEventTypeLabel(type)}</span>
        </li>
      ))}
    </ul>
  );

  const modes = [
    { value: "single" as const, label: "Mois" },
    { value: "multi" as const, label: "Plusieurs mois" },
    { value: "list" as const, label: "Liste" },
  ];
  const monthInputClasses =
    "min-h-11 cursor-pointer rounded-control border border-control-line bg-surface px-3 text-center font-display text-base font-semibold text-ink focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus";

  return (
    <div className="flex flex-col gap-4">
      {/* Contrôles — masqués à l'impression */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <fieldset aria-label="Affichage" className="inline-flex min-w-0 w-fit gap-0.5 rounded-control bg-surface-sunken p-[3px]">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`min-h-10 rounded-[7px] px-3 font-display text-sm font-semibold transition-colors duration-120 sm:px-4
                focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                  mode === m.value ? "bg-surface text-brand-text shadow-card" : "text-ink-muted hover:text-ink"
                }`}
            >
              {m.label}
            </button>
          ))}
        </fieldset>

        {/* Exports — ils capturent la grille, sans objet en vue liste */}
        {mode !== "list" && (
          <ExportBar
            exporting={exporting}
            onCopy={handleCopyPng}
            onDownload={handleDownloadPng}
            onPdf={() => window.print()}
            pdfLabel="Imprimer / PDF"
            className="hidden sm:flex"
          />
        )}
      </div>

      {/* Navigation mensuelle — partagée par la vue mensuelle et la vue liste */}
      {mode !== "multi" && (
        <PeriodNav
          prev={{ onClick: () => navigateMonth(-1) }}
          next={{ onClick: () => navigateMonth(1) }}
          prevLabel="Mois précédent"
          nextLabel="Mois suivant"
          className="mx-auto w-full max-w-md print:hidden"
        >
          <label className="sr-only" htmlFor="calendar-month">
            Mois affiché
          </label>
          <input
            id="calendar-month"
            type="month"
            value={currentMonth}
            onChange={(e) => { if (e.target.value) setCurrentMonth(e.target.value); }}
            className={`${monthInputClasses} w-full max-w-60`}
          />
        </PeriodNav>
      )}

      {/* Sélecteur de période multi-mois */}
      {mode === "multi" && (
        <div className="flex flex-wrap items-end justify-center gap-4 print:hidden">
          <label className="flex flex-col gap-1.5 font-display text-[13px] font-semibold text-ink">
            Du
            <input
              type="month"
              value={startMonth}
              max={endMonth}
              onChange={(e) => { if (e.target.value) setStartMonth(e.target.value); }}
              className={monthInputClasses}
            />
          </label>
          <label className="flex flex-col gap-1.5 font-display text-[13px] font-semibold text-ink">
            Au
            <input
              type="month"
              value={endMonth}
              min={startMonth}
              onChange={(e) => { if (e.target.value) setEndMonth(e.target.value); }}
              className={monthInputClasses}
            />
          </label>
          {months.length > 0 && (
            <span className="pb-3 text-sm text-ink-muted">
              {months.length} mois affiché{months.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {unstaffedEvents > 0 && (
        <Alert tone="warning" icon={TriangleAlert} className="print:hidden">
          <strong className="font-semibold">
            {unstaffedEvents} événement{unstaffedEvents > 1 ? "s" : ""} à venir {unstaffedEvents > 1 ? "ont" : "a"}
          </strong>{" "}
          des départements sans STAR planifié, repérés par l&apos;icône{" "}
          <UserX aria-label="sans STAR" className="inline size-4 align-[-3px] text-warning" strokeWidth={2.25} /> dans le
          calendrier.
        </Alert>
      )}

      {/* Zone capturée (PNG, impression) */}
      <div ref={captureRef} className="group rounded-card bg-bg data-[capturing]:p-4">
        {/* Titre de période — visible à l'impression et dans l'image */}
        <p className="mb-4 hidden font-display text-base font-semibold text-ink group-data-[capturing]:block print:mb-6 print:block">Calendrier — {printTitle}</p>

        {mode === "list" ? (
          <EventRows events={monthEvents} />
        ) : mode === "single" ? (
          <div className="flex flex-col gap-4">
            <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-label={printTitle}>
              <DaysGrid days={calendarDays} eventsByDate={eventsByDate} todayStr={todayStr} />
            </section>
            <div className="md:hidden" data-html2canvas-ignore="true">
              <EventRows events={monthEvents} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
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
              <div className="rounded-card border border-line bg-surface">
                <EmptyState title="Période invalide" description="Choisissez un mois de début antérieur au mois de fin." size="sm" />
              </div>
            )}
          </div>
        )}

        {mode !== "list" && legend}
      </div>
    </div>
  );
}
