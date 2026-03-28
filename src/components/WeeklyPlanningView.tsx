"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  status: "EN_SERVICE" | "EN_SERVICE_DEBRIEF" | null;
  tasks: string[];
}

interface Notice {
  content: string;
  updatedAt: string;
  authorName: string | null;
}

interface WeekEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  planningDeadline: string | null;
  notice: Notice | null;
  members: Member[];
}

interface WeeklyPlanningViewProps {
  churchId: string;
  departmentId: string;
  departmentName?: string;
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

function formatDayShort(isoDate: string) {
  const d = new Date(isoDate);
  return {
    day: d.getUTCDate(),
    weekday: d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", ""),
  };
}

function getExportFileName(departmentName: string | undefined, weekStart: Date) {
  return `Planning-${departmentName ?? "dept"}-semaine-${toISODate(weekStart)}`;
}

export default function WeeklyPlanningView({
  churchId,
  departmentId,
  departmentName,
  churchName,
  canEdit,
}: WeeklyPlanningViewProps) {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [events, setEvents] = useState<WeekEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "image" | "copy" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchWeek = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/planning/weekly?churchId=${churchId}&departmentId=${departmentId}&weekStart=${toISODate(weekStart)}`
      );
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [churchId, departmentId, weekStart]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  function prevWeek() {
    setWeekStart((w) => { const d = new Date(w); d.setUTCDate(d.getUTCDate() - 7); return d; });
  }

  function nextWeek() {
    setWeekStart((w) => { const d = new Date(w); d.setUTCDate(d.getUTCDate() + 7); return d; });
  }

  function startEdit(eventId: string, current: string) {
    setEditingEventId(eventId);
    setEditContent(current);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingEventId(null);
    setEditContent("");
    setSaveError(null);
  }

  async function deleteNotice(eventId: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/departments/${departmentId}/notices?eventId=${eventId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur lors de la suppression");
      }
      await fetchWeek();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotice(eventId: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/departments/${departmentId}/notices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, content: editContent }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur lors de la sauvegarde");
      }
      setEditingEventId(null);
      await fetchWeek();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function copyImage() {
    if (!printRef.current || exporting) return;
    setExporting("copy");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b: Blob | null) => { if (b) resolve(b); else reject(new Error("failed")); }, "image/png");
        });
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        alert("Image copiée dans le presse-papier");
      } catch {
        const w = window.open();
        if (w) { w.document.write(`<img src="${canvas.toDataURL("image/png")}" />`); }
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
      link.download = `${getExportFileName(departmentName, weekStart)}.png`;
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
      pdf.addImage(imgData, "PNG", (pdfWidth - renderWidth) / 2, 0, renderWidth, renderHeight);
      pdf.save(`${getExportFileName(departmentName, weekStart)}.pdf`);
    } catch { /* ignore */ } finally { setExporting(null); }
  }

  const hasContent = events.length > 0;

  return (
    <div>
      {/* Navigation */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <button
          onClick={prevWeek}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-icc-violet hover:bg-icc-violet-light transition-colors"
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
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Export buttons */}
      {!loading && hasContent && (
        <div className="flex flex-wrap justify-end gap-2 mb-4">
          <button onClick={copyImage} disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            {exporting === "copy" ? "Copie..." : "Copier image"}
          </button>
          <button onClick={downloadImage} disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-icc-violet border-2 border-icc-violet rounded-lg hover:bg-icc-violet/10 disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting === "image" ? "Export..." : "Télécharger PNG"}
          </button>
          <button onClick={exportPdf} disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-icc-violet border-2 border-icc-violet rounded-lg hover:bg-icc-violet/10 disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting === "pdf" ? "Export..." : "Export PDF"}
          </button>
        </div>
      )}

      {/* Printable card */}
      <div ref={printRef} className="max-w-2xl mx-auto rounded-xl overflow-hidden shadow-lg border border-gray-100">
        {loading ? (
          <div className="p-8 text-center text-gray-400 bg-white">Chargement...</div>
        ) : !hasContent ? (
          <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-xl">
            Aucun service cette semaine
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-icc-violet px-6 py-4">
              <p className="text-lg font-bold text-white leading-tight">{churchName ?? "ICC"}</p>
              <p className="text-sm text-white/80 mt-0.5">
                {departmentName ? `${departmentName} — ` : ""}
                <span className="capitalize">{formatWeekLabel(weekStart)}</span>
              </p>
            </div>

            {/* Events */}
            <div className="bg-gray-50 px-5 py-4 space-y-3">
              {events.map((event) => {
                const { day, weekday } = formatDayShort(event.date);
                const isEditing = editingEventId === event.id;

                return (
                  <div key={event.id} className="bg-white rounded-lg overflow-hidden shadow-sm">
                    {/* Event header row + members */}
                    <div className="flex">
                      <div className="bg-icc-violet w-16 shrink-0 flex flex-col items-center justify-center py-3">
                        <span className="text-xs font-semibold text-white/80 uppercase leading-none">{weekday}</span>
                        <span className="text-2xl font-black text-white leading-none mt-0.5">{day}</span>
                      </div>
                      <div className="flex-1 px-4 py-3 min-w-0">
                        <p className="font-bold text-icc-violet text-xs uppercase tracking-wide mb-2">{event.title}</p>
                        {event.members.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">(aucun STAR en service)</p>
                        ) : (
                          <div className="space-y-1.5">
                            {event.members.map((m) => (
                              <div key={m.id} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm text-gray-900 font-bold">
                                  {m.firstName} {m.lastName}
                                </span>
                                {m.tasks.map((task) => (
                                  <span key={task} className="text-[11px] font-medium border border-icc-violet/40 text-icc-violet px-2 py-0.5 rounded-full">
                                    {task}
                                  </span>
                                ))}
                                {m.status === "EN_SERVICE_DEBRIEF" && (
                                  <span className="text-[11px] font-semibold text-white bg-icc-violet px-2 py-0.5 rounded-full">
                                    Debrief
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Notice — dans le flex, séparée par un trait */}
                        {(event.notice?.content || isEditing) && (
                          <div className={`mt-3 pt-2 border-t rounded-lg ${event.notice?.content && !isEditing ? "border-icc-violet/20 bg-icc-violet/5 px-2 pb-2" : "border-gray-100"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[11px] font-semibold uppercase tracking-wide ${event.notice?.content && !isEditing ? "text-icc-violet/70" : "text-gray-400"}`}>
                                ⚠️ Notice de service
                              </span>
                              {canEdit && !isEditing && (
                                <div data-html2canvas-ignore="true" className="flex items-center gap-2">
                                  <button
                                    onClick={() => startEdit(event.id, event.notice?.content ?? "")}
                                    className="text-[11px] text-icc-violet hover:underline"
                                  >
                                    Modifier
                                  </button>
                                  <button
                                    onClick={() => deleteNotice(event.id)}
                                    disabled={saving}
                                    className="text-[11px] text-icc-rouge hover:underline disabled:opacity-50"
                                  >
                                    Supprimer
                                  </button>
                                </div>
                              )}
                            </div>
                            {isEditing ? (
                              <div className="space-y-2">
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
                                    onClick={() => saveNotice(event.id)}
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
                            ) : (
                              <p className={`text-sm whitespace-pre-wrap leading-relaxed ${event.notice?.content ? "text-icc-violet/80" : "text-gray-400 italic"}`}>
                                {event.notice!.content}
                              </p>
                            )}
                          </div>
                        )}

                        {canEdit && !event.notice && !isEditing && (
                          <button
                            data-html2canvas-ignore="true"
                            onClick={() => startEdit(event.id, "")}
                            className="mt-2 text-[11px] text-icc-violet hover:underline"
                          >
                            + Ajouter une notice
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
