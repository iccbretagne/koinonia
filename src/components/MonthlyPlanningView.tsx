"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CalendarX2, MessageSquare } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import StatusChip from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/Toast";
import { getEventTypeLabel } from "@/lib/event-types";
import { eventTypeTone } from "./event-type-tone";
import PeriodNav from "./PeriodNav";
import ExportBar from "./ExportBar";

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
  const toast = useToast();
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "image" | "copy" | null>(null);
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

  // Force portrait A4 width (max-w-2xl = 672px) for consistent capture on mobile.
  async function captureForExport(): Promise<HTMLCanvasElement | null> {
    if (!printRef.current) return null;
    const html2canvas = (await import("html2canvas-pro")).default;
    const el = printRef.current;
    const savedWidth = el.style.width;
    el.style.width = "672px";
    // L'image partagée reste en thème clair, quel que soit le thème affiché.
    el.dataset.theme = "light";
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      return await html2canvas(el, { scale: 2, useCORS: true, windowWidth: 1440 });
    } finally {
      el.style.width = savedWidth;
      delete el.dataset.theme;
    }
  }

  async function copyImage() {
    if (!printRef.current || exporting) return;
    setExporting("copy");
    try {
      const canvas = await captureForExport();
      if (!canvas) return;

      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b: Blob | null) => {
            if (b) resolve(b);
            else reject(new Error("toBlob failed"));
          }, "image/png");
        });

        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        toast.success("Image copiée dans le presse-papiers");
      } catch {
        const dataUrl = canvas.toDataURL("image/png");
        const w = window.open();
        if (w) {
          const img = w.document.createElement("img");
          img.src = dataUrl;
          w.document.body.append(img);
          w.document.title = "Planning - copier l'image";
        } else {
          toast.error("Impossible de copier l'image. Vérifiez les permissions du navigateur.");
        }
      }
    } catch {
      toast.error("Export impossible. Réessayez dans un instant.");
    } finally {
      setExporting(null);
    }
  }

  async function downloadImage() {
    if (!printRef.current || exporting) return;
    setExporting("image");
    try {
      const canvas = await captureForExport();
      if (!canvas) return;

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${getExportFileName()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error("Export impossible. Réessayez dans un instant.");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (!printRef.current || exporting) return;
    setExporting("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const canvas = await captureForExport();
      if (!canvas) return;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.height / canvas.width;

      let renderWidth = pdfWidth;
      let renderHeight = pdfWidth * imgRatio;

      if (renderHeight > pdfHeight) {
        renderHeight = pdfHeight;
        renderWidth = pdfHeight / imgRatio;
      }

      const offsetX = (pdfWidth - renderWidth) / 2;
      pdf.addImage(imgData, "PNG", offsetX, 0, renderWidth, renderHeight);
      pdf.save(`${getExportFileName()}.pdf`);
    } catch {
      toast.error("Export impossible. Réessayez dans un instant.");
    } finally {
      setExporting(null);
    }
  }

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

      {loading ? (
        <SkeletonList rows={4} label="Chargement du planning du mois…" className="mx-auto w-full max-w-2xl" />
      ) : events.length === 0 ? (
        <div className="mx-auto w-full max-w-2xl rounded-card border border-line bg-surface">
          <EmptyState
            icon={CalendarX2}
            title="Aucun événement ce mois-ci"
            description="Changez de mois pour consulter un autre planning."
            size="sm"
          />
        </div>
      ) : (
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
