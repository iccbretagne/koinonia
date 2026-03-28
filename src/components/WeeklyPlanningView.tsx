"use client";

import { useState, useEffect, useCallback } from "react";

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
  canEdit: boolean;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday
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
  return new Date(isoDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function WeeklyPlanningView({ churchId, canEdit }: WeeklyPlanningViewProps) {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [events, setEvents] = useState<WeekEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null); // "deptId:eventId"
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchWeek = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/planning/weekly?churchId=${churchId}&weekStart=${toISODate(weekStart)}`
      );
      const data = await res.json();
      setEvents(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [churchId, weekStart]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  function prevWeek() {
    setWeekStart((w) => {
      const d = new Date(w);
      d.setUTCDate(d.getUTCDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setWeekStart((w) => {
      const d = new Date(w);
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    });
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

  // Group events by day
  const byDay = events.reduce<Record<string, WeekEvent[]>>((acc, ev) => {
    const day = ev.date.slice(0, 10);
    (acc[day] ??= []).push(ev);
    return acc;
  }, {});

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={prevWeek}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          aria-label="Semaine précédente"
        >
          ←
        </button>
        <span className="font-semibold text-gray-800 capitalize">
          {formatWeekLabel(weekStart)}
        </span>
        <button
          onClick={nextWeek}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          aria-label="Semaine suivante"
        >
          →
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Chargement...</div>
      ) : Object.keys(byDay).length === 0 ? (
        <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          Aucun événement cette semaine
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDay).map(([day, dayEvents]) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 capitalize">
                {formatDayLabel(day)}
              </h2>
              <div className="space-y-4">
                {dayEvents.map((event) => (
                  <div key={event.id} className="border-2 border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <span className="font-semibold text-gray-800">{event.title}</span>
                      <span className="ml-2 text-xs text-gray-500">{event.type}</span>
                    </div>
                    {event.departments.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">Aucun département assigné</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {event.departments.map((dept) => {
                          const key = `${dept.id}:${event.id}`;
                          const isEditing = editingKey === key;
                          return (
                            <div key={dept.id} className="px-4 py-3">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-sm text-gray-700">
                                  {dept.name}
                                </span>
                                {canEdit && !isEditing && (
                                  <button
                                    onClick={() =>
                                      startEdit(dept.id, event.id, dept.notice?.content ?? "")
                                    }
                                    className="text-xs text-icc-violet hover:underline shrink-0"
                                  >
                                    {dept.notice ? "Modifier" : "Ajouter une notice"}
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
                                  {saveError && (
                                    <p className="text-xs text-icc-rouge">{saveError}</p>
                                  )}
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
                                <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                                  {dept.notice.content}
                                </p>
                              ) : (
                                <p className="mt-1 text-xs text-gray-400 italic">
                                  Aucune notice
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
