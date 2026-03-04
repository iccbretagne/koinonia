"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

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
  date: string;
  members: MemberItem[];
}

interface Props {
  departmentId: string;
  departmentName?: string;
}

export default function MonthlyPlanningView({ departmentId, departmentName }: Props) {
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
    fetchData();
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

  function formatEventDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  function getExportFileName() {
    const label = formatMonthLabel(currentMonth);
    const name = departmentName || "planning";
    return `Planning-${name}-${label}`;
  }

  async function copyImage() {
    if (!printRef.current || exporting) return;
    setExporting("copy");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
      });

      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("toBlob failed"));
          }, "image/png");
        });

        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        alert("Image copiée dans le presse-papier");
      } catch {
        const dataUrl = canvas.toDataURL("image/png");
        const w = window.open();
        if (w) {
          w.document.write(`<img src="${dataUrl}" />`);
          w.document.title = "Planning - copier l'image";
        } else {
          alert("Impossible de copier l'image. Vérifiez les permissions du navigateur.");
        }
      }
    } catch {
      // ignore export errors
    } finally {
      setExporting(null);
    }
  }

  async function downloadImage() {
    if (!printRef.current || exporting) return;
    setExporting("image");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${getExportFileName()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // ignore export errors
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (!printRef.current || exporting) return;
    setExporting("pdf");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
      });

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
      // ignore export errors
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
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

      {!loading && events.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2 mb-4">
          <button
            onClick={copyImage}
            disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            {exporting === "copy" ? "Copie..." : "Copier image"}
          </button>
          <button
            onClick={downloadImage}
            disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-icc-violet border-2 border-icc-violet rounded-lg hover:bg-icc-violet/10 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting === "image" ? "Export..." : "Télécharger PNG"}
          </button>
          <button
            onClick={exportPdf}
            disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-icc-violet border-2 border-icc-violet rounded-lg hover:bg-icc-violet/10 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting === "pdf" ? "Export..." : "Export PDF"}
          </button>
        </div>
      )}

      <div ref={printRef}>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
            Aucun evenement ce mois
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-lg shadow p-4"
              >
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-sm font-medium text-icc-violet capitalize">
                    {formatEventDate(event.date)}
                  </span>
                  <Link
                    href={`/dashboard?dept=${departmentId}&event=${event.id}&view=event`}
                    className="text-sm text-gray-500 hover:text-icc-violet hover:underline transition-colors"
                  >
                    {event.title}
                  </Link>
                </div>
                {event.members.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    (aucun STAR en service)
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {event.members.map((member) => (
                      <li key={member.id} className="text-sm text-gray-700">
                        {member.status === "EN_SERVICE_DEBRIEF" && (
                          <svg className="inline-block w-4 h-4 mr-1 text-icc-violet align-text-bottom" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 2C6.48 2 2 5.58 2 10c0 2.24 1.12 4.27 2.94 5.72L3 22l5.34-2.56C9.5 19.8 10.72 20 12 20c5.52 0 10-3.58 10-8s-4.48-8-10-8z"/>
                          </svg>
                        )}
                        {member.firstName} {member.lastName}
                        {member.tasks.length > 0 && (
                          <span className="ml-1.5 text-xs text-icc-violet">
                            ({member.tasks.join(", ")})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
