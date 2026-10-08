"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CalendarX2, MessageSquare } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import StatusChip from "@/components/ui/StatusChip";
import { getEventTypeLabel } from "@/lib/event-types";
import { eventTypeTone } from "./event-type-tone";
import PeriodNav from "./PeriodNav";
import ExportBar from "./ExportBar";
import { useSnapshotExport } from "@/components/useSnapshotExport";

interface MemberItem {
  id: string;
  firstName: string;
  lastName: string;
  status: "EN_SERVICE" | "EN_SERVICE_DEBRIEF";
  tasks: string[];
}

interface EventItem {
  id: string;
  title: string;
  type: string;
  date: string;
  members: MemberItem[];
}

interface Props {
  readonly departmentId: string;
  readonly departmentName?: string;
  readonly churchName?: string;
}

export default function MonthlyPlanningView({ departmentId, departmentName, churchName }: Props) {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/departments/${departmentId}/monthly-planning?month=${currentMonth}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [departmentId, currentMonth]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function navigateMonth(delta: number) {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCurrentMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  function formatMonthLabel(ym: string) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }

  function getExportFileName() {
    const label = formatMonthLabel(currentMonth);
    const name = departmentName || "planning";
    return `Planning-${name}-${label}`;
  }

  const { exporting, copyImage, downloadImage, exportPdf } = useSnapshotExport(printRef, {
    captureWidth: "672px",
    orientation: "portrait",
    fileName: getExportFileName,
    copyWindowTitle: "Planning - copier l'image",
  });

  return (
    <div className="flex flex-col gap-4">
      <PeriodNav
        prev={{ onClick: () => navigateMonth(-1) }}
        next={{ onClick: () => navigateMonth(1) }}
        prevLabel="Mois précédent"
        nextLabel="Mois suivant"
        className="mx-auto w-full max-w-md"
      >
        <label className="sr-only" htmlFor="monthly-planning-month">
          Mois affiché
        </label>
        <input
          id="monthly-planning-month"
          type="month"
          value={currentMonth}
          onChange={(e) => {
            if (e.target.value) setCurrentMonth(e.target.value);
          }}
          className="min-h-11 w-full max-w-60 cursor-pointer rounded-control border border-control-line bg-surface px-3 text-center font-display text-base font-semibold text-ink
            focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </PeriodNav>

      {!loading && events.length > 0 && (
        <ExportBar exporting={exporting} onCopy={copyImage} onDownload={downloadImage} onPdf={exportPdf} />
      )}

      {loading && <SkeletonList rows={4} label="Chargement du planning du mois…" className="mx-auto w-full max-w-2xl" />}
      {!loading && events.length === 0 && (
        <div className="mx-auto w-full max-w-2xl rounded-card border border-line bg-surface">
          <EmptyState
            icon={CalendarX2}
            title="Aucun événement ce mois-ci"
            description="Changez de mois pour consulter un autre planning."
            size="sm"
          />
        </div>
      )}
      {!loading && events.length > 0 && (
        /* Zone exportée (image, PDF) : passée en thème clair le temps de la capture. */
        <div
          ref={printRef}
          className="mx-auto w-full max-w-2xl overflow-hidden rounded-card border border-line bg-bg text-ink shadow-float"
        >
          <div className="bg-brand px-6 py-4 text-on-brand">
            <p className="font-display text-lg font-bold leading-tight">{churchName ?? "ICC"}</p>
            <p className="mt-0.5 text-sm text-on-brand/85 first-letter:uppercase">
              {departmentName ? `${departmentName} — ` : ""}
              {formatMonthLabel(currentMonth)}
            </p>
          </div>

          <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
            {events.map((event) => {
              const withTasks = event.members.filter((m) => m.tasks.length > 0);
              const withoutTasks = event.members.filter((m) => m.tasks.length === 0);
              const d = new Date(event.date);
              const dayNum = d.getDate();
              const dayName = d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");

              return (
                <div key={event.id} className="flex overflow-hidden rounded-control border border-line bg-surface">
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center bg-brand py-3 text-on-brand">
                    <span className="font-display text-xs font-semibold uppercase leading-none text-on-brand/80">{dayName}</span>
                    <span className="mt-0.5 font-display text-2xl font-extrabold leading-none tabular-nums">{dayNum}</span>
                  </div>

                  <div className="min-w-0 flex-1 px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <p className="font-display text-xs font-bold uppercase tracking-wide text-brand-text">{event.title}</p>
                      <StatusChip tone={eventTypeTone(event.type)}>
                        {getEventTypeLabel(event.type)}
                      </StatusChip>
                    </div>

                    {event.members.length === 0 ? (
                      <p className="text-[13px] italic text-ink-muted">Aucun STAR en service</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {withTasks.map((member) => (
                          <MemberLine key={member.id} member={member} strong />
                        ))}
                        {withTasks.length > 0 && withoutTasks.length > 0 && <div className="h-px bg-line" />}
                        {withoutTasks.map((member) => (
                          <MemberLine key={member.id} member={member} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Un STAR en service : nom, tâches et mention « Debrief » (mot + icône, jamais la couleur seule). */
function MemberLine({ member, strong = false }: { readonly member: MemberItem; readonly strong?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`text-sm ${strong ? "font-semibold text-ink" : "font-medium text-ink-muted"}`}>
        {member.firstName} {member.lastName}
      </span>
      {member.tasks.map((task) => (
        <span
          key={task}
          className="rounded-full border border-brand/40 px-2 py-0.5 text-[11px] font-semibold leading-4 text-brand-text"
        >
          {task}
        </span>
      ))}
      {member.status === "EN_SERVICE_DEBRIEF" && (
        <StatusChip tone="brand" icon={MessageSquare}>
          Debrief
        </StatusChip>
      )}
    </div>
  );
}
