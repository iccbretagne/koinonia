"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CalendarX2, MessageSquare, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import StatusChip from "@/components/ui/StatusChip";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { getEventTypeLabel } from "@/lib/event-types";
import { eventTypeTone } from "./event-type-tone";
import ExportBar from "./ExportBar";
import { ghostDangerClasses } from "./ghost-danger";
import PeriodNav from "./PeriodNav";
import { useSnapshotExport } from "@/components/useSnapshotExport";

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
  readonly churchId: string;
  readonly departmentId: string;
  readonly departmentName?: string;
  readonly churchName?: string;
  readonly canEdit: boolean;
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
  const toast = useToast();
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [events, setEvents] = useState<WeekEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingNoticeDelete, setPendingNoticeDelete] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
    void fetchWeek();
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
      toast.success("Notice supprimée");
      setPendingNoticeDelete(null);
      await fetchWeek();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur";
      setSaveError(message);
      toast.error(message);
      setPendingNoticeDelete(null);
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
      toast.success("Notice enregistrée");
      await fetchWeek();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  const { exporting, copyImage, downloadImage, exportPdf } = useSnapshotExport(printRef, {
    captureWidth: "672px",
    orientation: "portrait",
    fileName: () => getExportFileName(departmentName, weekStart),
    copyWindowTitle: "Planning - copier l'image",
  });

  const hasContent = events.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PeriodNav
        prev={{ onClick: prevWeek }}
        next={{ onClick: nextWeek }}
        prevLabel="Semaine précédente"
        nextLabel="Semaine suivante"
        label={formatWeekLabel(weekStart)}
        className="mx-auto w-full max-w-md"
      />

      {!loading && hasContent && (
        <ExportBar exporting={exporting} onCopy={copyImage} onDownload={downloadImage} onPdf={exportPdf} />
      )}

      {loading && <SkeletonList rows={3} label="Chargement du planning de la semaine…" className="mx-auto w-full max-w-2xl" />}
      {!loading && !hasContent && (
        <div className="mx-auto w-full max-w-2xl rounded-card border border-line bg-surface">
          <EmptyState
            icon={CalendarX2}
            title="Aucun service cette semaine"
            description="Changez de semaine pour consulter un autre planning."
            size="sm"
          />
        </div>
      )}
      {!loading && hasContent && (
        /* Zone exportée (image, PDF) : passée en thème clair le temps de la capture. */
        <div
          ref={printRef}
          className="mx-auto w-full max-w-2xl overflow-hidden rounded-card border border-line bg-bg text-ink shadow-float"
        >
          <div className="bg-brand px-6 py-4 text-on-brand">
            <p className="font-display text-lg font-bold leading-tight">{churchName ?? "ICC"}</p>
            <p className="mt-0.5 text-sm text-on-brand/85">
              {departmentName ? `${departmentName} — ` : ""}
              {formatWeekLabel(weekStart)}
            </p>
          </div>

          <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
            {events.map((event) => {
              const { day, weekday } = formatDayShort(event.date);
              const isEditing = editingEventId === event.id;
              const hasNotice = !!event.notice?.content;

              return (
                <div key={event.id} className="flex overflow-hidden rounded-control border border-line bg-surface">
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center bg-brand py-3 text-on-brand">
                    <span className="font-display text-xs font-semibold uppercase leading-none text-on-brand/80">{weekday}</span>
                    <span className="mt-0.5 font-display text-2xl font-extrabold leading-none tabular-nums">{day}</span>
                  </div>
                  <div className="min-w-0 flex-1 px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <p className="font-display text-xs font-bold uppercase tracking-wide text-brand-text">{event.title}</p>
                      <StatusChip tone={eventTypeTone(event.type)}>{getEventTypeLabel(event.type)}</StatusChip>
                    </div>
                    {event.members.length === 0 ? (
                      <p className="text-[13px] italic text-ink-muted">Aucun STAR en service</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {event.members.map((m) => (
                          <div key={m.id} className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-ink">
                              {m.firstName} {m.lastName}
                            </span>
                            {m.tasks.map((task) => (
                              <span
                                key={task}
                                className="rounded-full border border-brand/40 px-2 py-0.5 text-[11px] font-semibold leading-4 text-brand-text"
                              >
                                {task}
                              </span>
                            ))}
                            {m.status === "EN_SERVICE_DEBRIEF" && (
                              <StatusChip tone="brand" icon={MessageSquare}>
                                Debrief
                              </StatusChip>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Notice de service — dans la carte, séparée par un filet */}
                    {(hasNotice || isEditing) && (
                      <div
                        className={`mt-3 rounded-control border-t pt-2 ${
                          hasNotice && !isEditing ? "border-brand/20 bg-brand-soft px-3 pb-2" : "border-line"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-brand-text">
                            <NotebookPen aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                            Notice de service
                          </span>
                          {canEdit && !isEditing && (
                            <div data-html2canvas-ignore="true" className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEdit(event.id, event.notice?.content ?? "")}
                              >
                                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />
                                Modifier
                              </Button>
                              <button
                                type="button"
                                onClick={() => setPendingNoticeDelete(event.id)}
                                disabled={saving}
                                className={ghostDangerClasses}
                              >
                                <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                                Supprimer
                              </button>
                            </div>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="flex flex-col gap-2" data-html2canvas-ignore="true">
                            <Textarea
                              aria-label="Notice de service"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={3}
                              maxLength={2000}
                              placeholder="Instructions, rappels, informations pour ce service…"
                              error={saveError ?? undefined}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveNotice(event.id)} disabled={saving}>
                                {saving ? "Enregistrement…" : "Enregistrer"}
                              </Button>
                              <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>
                                Annuler
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{event.notice!.content}</p>
                        )}
                      </div>
                    )}

                    {canEdit && !event.notice && !isEditing && (
                      <Button
                        data-html2canvas-ignore="true"
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(event.id, "")}
                        className="-ml-3 mt-2"
                      >
                        <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                        Ajouter une notice
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ConfirmModal
        open={pendingNoticeDelete !== null}
        title="Supprimer cette notice ?"
        message="Les STAR ne la verront plus dans le planning de la semaine."
        confirmLabel="Supprimer la notice"
        confirmingLabel="Suppression…"
        variant="danger"
        confirming={saving}
        onConfirm={() => pendingNoticeDelete && deleteNotice(pendingNoticeDelete)}
        onCancel={() => setPendingNoticeDelete(null)}
      />
    </div>
  );
}
