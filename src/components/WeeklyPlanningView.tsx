"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Notice {
  content: string;
  updatedAt: string;
  authorName: string | null;
}

interface Department {
  id: string;
  name: string;
  notice: Notice | null;
}

interface WeekEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  departments: Department[];
}

interface WeeklyPlanningViewProps {
  churchId: string;
  churchName?: string;
  canEdit: boolean;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  const start = weekStart.toLocaleDateString("fr-FR", opts);
  const end = weekEnd.toLocaleDateString("fr-FR", { ...opts, year: "numeric" });
  return `${start} – ${end}`;
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatDayShort(isoDate: string) {
  const d = new Date(isoDate);
  return {
    day: d.getUTCDate(),
    weekday: d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", ""),
  };
}

export default function WeeklyPlanningView({ churchId, churchName, canEdit }: WeeklyPlanningViewProps) {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [events, setEvents] = useState<WeekEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "image" | "copy" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchWeek = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/planning/weekly?churchId=${churchId}&weekStart=${toISODate(weekStart)}`
      );
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [churchId, weekStart]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  function prevWeek() {
    setWeekStart((w) => { const d = new Date(w); d.setUTCDate(d.getUTCDate() - 7); return d; });
  }

  function nextWeek() {
    setWeekStart((w) => { const d = new Date(w); d.setUTCDate(d.getUTCDate() + 7); return d; });
  }

  function startEdit(deptId: string, eventId: string, current: string) {
    setEditingKey(`${deptId}:${eventId}`);
    setEditContent(current);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditContent("");
    setSaveError(null);
  }

  async function saveNotice(deptId: string, eventId: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/departments/${deptId}/notices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, content: editContent }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur lors de la sauvegarde");
      }
      setEditingKey(null);
      await fetchWeek();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function getExportFileName() {
    return `Notices-semaine-${toISODate(weekStart)}`;
  }

  async function copyImage() {
    if (!printRef.current || exporting) return;
    setExporting("copy");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b: Blob | null) => { if (b) resolve(b); else reject(new Error("toBlob failed")); }, "image/png");
        });
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        alert("Image copiée dans le presse-papier");
      } catch {
        const w = window.open();
        if (w) { w.document.write(`<img src="${canvas.toDataURL("image/png")}" />`); w.document.title = "Notices semaine"; }
      }
    } catch { /* ignore */ } finally { setExporting(null); }
  }

  async function downloadImage() {
    if (!printRef.current || exporting) return;
    setExporting("image");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const link = document.createElement("a");
      link.download = `${getExportFileName()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch { /* ignore */ } finally { setExporting(null); }
  }

  async function exportPdf() {
    if (!printRef.current || exporting) return;
    setExporting("pdf");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.height / canvas.width;
      let renderWidth = pdfWidth;
      let renderHeight = pdfWidth * imgRatio;
      if (renderHeight > pdfHeight) { renderHeight = pdfHeight; renderWidth = pdfHeight / imgRatio; }
      const offsetX = (pdfWidth - renderWidth) / 2;
      pdf.addImage(imgData, "PNG", offsetX, 0, renderWidth, renderHeight);
      pdf.save(`${getExportFileName()}.pdf`);
    } catch { /* ignore */ } finally { setExporting(null); }
  }

  // Group events by day
  const byDay = events.reduce<Record<string, WeekEvent[]>>((acc, ev) => {
    const day = ev.date.slice(0, 10);
    (acc[day] ??= []).push(ev);
    return acc;
  }, {});

  const hasContent = Object.keys(byDay).length > 0;

  return (
    <div>
      {/* Navigation */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <button
          onClick={prevWeek}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-icc-violet hover:bg-icc-violet-light transition-colors"
          aria-label="Semaine précédente"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="px-4 py-2 text-lg font-semibold text-icc-violet bg-icc-violet-light border-2 border-icc-violet/20 rounded-lg capitalize">
          {formatWeekLabel(weekStart)}
        </span>
        <button
          onClick={nextWeek}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-icc-violet hover:bg-icc-violet-light transition-colors"
          aria-label="Semaine suivante"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Export buttons */}
      {!loading && hasContent && (
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

      {/* Printable card */}
      <div ref={printRef} className="max-w-lg mx-auto rounded-xl overflow-hidden shadow-lg border border-gray-100">
        {loading ? (
          <div className="p-8 text-center text-gray-400 bg-white">Chargement...</div>
        ) : !hasContent ? (
          <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-xl">
            Aucun événement cette semaine
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-icc-violet px-6 py-4">
              <p className="text-lg font-bold text-white leading-tight">
                {churchName ?? "ICC"}
              </p>
              <p className="text-sm text-white/80 mt-0.5 capitalize">
                Semaine du {formatWeekLabel(weekStart)}
              </p>
            </div>

            {/* Days */}
            <div className="bg-gray-50 px-5 py-4 space-y-4">
              {Object.entries(byDay).map(([day, dayEvents]) => (
                <div key={day}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 capitalize">
                    {formatDayLabel(day)}
                  </p>
                  <div className="space-y-3">
                    {dayEvents.map((event) => {
                      const { day: dayNum, weekday } = formatDayShort(event.date);
                      return (
                        <div key={event.id} className="bg-white rounded-lg overflow-hidden shadow-sm">
                          {/* Event header */}
                          <div className="flex">
                            <div className="bg-icc-violet w-16 shrink-0 flex flex-col items-center justify-center py-3">
                              <span className="text-xs font-semibold text-white/80 uppercase leading-none">{weekday}</span>
                              <span className="text-2xl font-black text-white leading-none mt-0.5">{dayNum}</span>
                            </div>
                            <div className="flex-1 px-4 py-3 min-w-0">
                              <p className="font-bold text-icc-violet text-xs uppercase tracking-wide">
                                {event.title}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{event.type}</p>
                            </div>
                          </div>

                          {/* Departments + notices */}
                          {event.departments.length > 0 && (
                            <div className="divide-y divide-gray-100 border-t border-gray-100">
                              {event.departments.map((dept) => {
                                const key = `${dept.id}:${event.id}`;
                                const isEditing = editingKey === key;
                                return (
                                  <div key={dept.id} className="px-4 py-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                        {dept.name}
                                      </span>
                                      {canEdit && !isEditing && !exporting && (
                                        <button
                                          onClick={() => startEdit(dept.id, event.id, dept.notice?.content ?? "")}
                                          className="text-[11px] text-icc-violet hover:underline shrink-0"
                                        >
                                          {dept.notice ? "Modifier" : "Ajouter"}
                                        </button>
                                      )}
                                    </div>

                                    {isEditing ? (
                                      <div className="mt-2 space-y-2">
                                        <textarea
                                          value={editContent}
                                          onChange={(e) => setEditContent(e.target.value)}
                                          rows={3}
                                          maxLength={2000}
                                          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet resize-none"
                                          placeholder="Instructions, rappels, informations pour ce service…"
                                          autoFocus
                                        />
                                        {saveError && <p className="text-xs text-icc-rouge">{saveError}</p>}
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => saveNotice(dept.id, event.id)}
                                            disabled={saving}
                                            className="px-3 py-1.5 text-xs font-medium bg-icc-violet text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                                          >
                                            {saving ? "Enregistrement…" : "Enregistrer"}
                                          </button>
                                          <button
                                            onClick={cancelEdit}
                                            disabled={saving}
                                            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                                          >
                                            Annuler
                                          </button>
                                        </div>
                                      </div>
                                    ) : dept.notice ? (
                                      <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                        {dept.notice.content}
                                      </p>
                                    ) : (
                                      <p className="mt-1 text-xs text-gray-400 italic">Aucune notice</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
