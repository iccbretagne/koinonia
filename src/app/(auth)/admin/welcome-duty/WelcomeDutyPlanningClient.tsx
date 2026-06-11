"use client";

import { useState, useEffect, useCallback } from "react";

interface EventItem {
  id: string;
  title: string;
  type: string;
  date: string;
  welcomeDutyEnabled: boolean;
}

interface Assignment {
  id: string;
  eventId: string;
  welcomeDutyFamily: { id: string; familyName: string };
}

interface Suggestion {
  id: string;
  familyName: string;
  lastServedAt: string | null;
}

interface Props {
  churchId: string;
}

function monthRange(year: number, month: number) {
  const from = new Date(year, month, 1);
  const to   = new Date(year, month + 1, 0, 23, 59, 59);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short", day: "2-digit", month: "short",
  });
}

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export default function WelcomeDutyPlanningClient({ churchId }: Props) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [events, setEvents]           = useState<EventItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading]         = useState(true);

  // Per-event suggestion panel
  const [openEventId, setOpenEventId]     = useState<string | null>(null);
  const [suggestions, setSuggestions]     = useState<Suggestion[]>([]);
  const [loadingSugg, setLoadingSugg]     = useState(false);
  const [assigning, setAssigning]         = useState<string | null>(null);
  const [removing, setRemoving]           = useState<string | null>(null);

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    setOpenEventId(null);
    try {
      const { from, to } = monthRange(year, month);
      const [evRes, asRes] = await Promise.all([
        fetch(`/api/events?churchId=${churchId}&from=${from}`),
        fetch(`/api/welcome-duty/assignments?from=${from}&to=${to}`),
      ]);
      const evData = await evRes.json();
      const asData = await asRes.json();

      const allEvents: EventItem[] = Array.isArray(evData) ? evData : [];
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
      setEvents(
        allEvents
          .filter((e) => new Date(e.date) <= endOfMonth && e.welcomeDutyEnabled)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      );
      setAssignments(Array.isArray(asData) ? asData : []);
    } finally {
      setLoading(false);
    }
  }, [year, month, churchId]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  function assignmentsFor(eventId: string) {
    return assignments.filter((a) => a.eventId === eventId);
  }

  async function openSuggestions(eventId: string) {
    if (openEventId === eventId) { setOpenEventId(null); return; }
    setOpenEventId(eventId);
    setLoadingSugg(true);
    setSuggestions([]);
    try {
      const res = await fetch(`/api/welcome-duty/suggestions?eventId=${eventId}&limit=8`);
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } finally {
      setLoadingSugg(false);
    }
  }

  async function assign(eventId: string, familyId: string) {
    setAssigning(familyId);
    try {
      const res = await fetch("/api/welcome-duty/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, welcomeDutyFamilyId: familyId }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      const created: Assignment = await res.json();
      setAssignments((prev) => [...prev, created]);
      // Remove from suggestions
      setSuggestions((prev) => prev.filter((s) => s.id !== familyId));
    } finally {
      setAssigning(null);
    }
  }

  async function remove(assignmentId: string) {
    setRemoving(assignmentId);
    try {
      const res = await fetch(`/api/welcome-duty/assignments/${assignmentId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      const removed = assignments.find((a) => a.id === assignmentId);
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      // Re-add to suggestions if the panel is open for that event
      if (removed && openEventId === removed.eventId) {
        // Refetch suggestions to restore correct order
        const res2 = await fetch(`/api/welcome-duty/suggestions?eventId=${removed.eventId}&limit=8`);
        const data = await res2.json();
        setSuggestions(Array.isArray(data) ? data : []);
      }
    } finally {
      setRemoving(null);
    }
  }

  function formatLastServed(date: string | null) {
    if (!date) return "Jamais servi";
    return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Mois précédent"
        >
          ‹
        </button>
        <span className="text-base font-semibold text-gray-800 min-w-[160px] text-center">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Mois suivant"
        >
          ›
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : events.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-200">
          <p className="text-gray-400 text-sm">Aucun événement avec service d&apos;accueil ce mois-ci.</p>
          <p className="text-gray-400 text-xs mt-1">Activez le flag &laquo;&nbsp;Familles de service attendues&nbsp;&raquo; sur les événements concernés.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const eventAssignments = assignmentsFor(event.id);
            const isOpen = openEventId === event.id;

            return (
              <div key={event.id} className="bg-white rounded-lg shadow-sm border border-gray-100">
                {/* Event row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Date */}
                  <span className="text-xs text-gray-400 w-28 shrink-0 capitalize">
                    {formatDate(event.date)}
                  </span>

                  {/* Title + type */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate block">{event.title}</span>
                    <span className="text-xs text-gray-400">{event.type}</span>
                  </div>

                  {/* Assigned families */}
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {eventAssignments.length === 0 ? (
                      <span className="text-xs text-gray-300 italic">Non affecté</span>
                    ) : (
                      eventAssignments.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-icc-violet/10 text-icc-violet text-xs rounded-full font-medium"
                        >
                          {a.welcomeDutyFamily.familyName}
                          <button
                            onClick={() => remove(a.id)}
                            disabled={removing === a.id}
                            className="text-icc-violet/50 hover:text-icc-violet disabled:opacity-40 leading-none ml-0.5"
                            aria-label="Retirer"
                          >
                            ✕
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {/* Assign button */}
                  <button
                    onClick={() => openSuggestions(event.id)}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      isOpen
                        ? "border-icc-violet bg-icc-violet text-white"
                        : "border-gray-200 text-gray-500 hover:border-icc-violet hover:text-icc-violet"
                    }`}
                  >
                    {isOpen ? "Fermer" : "+ Affecter"}
                  </button>
                </div>

                {/* Suggestion panel */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 rounded-b-lg">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      Rotation suggérée
                    </p>
                    {loadingSugg ? (
                      <p className="text-xs text-gray-400">Chargement…</p>
                    ) : suggestions.length === 0 ? (
                      <p className="text-xs text-gray-400">Toutes les familles du pool sont déjà affectées.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => assign(event.id, s.id)}
                            disabled={assigning === s.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-700 hover:border-icc-violet hover:text-icc-violet disabled:opacity-50 transition-colors"
                          >
                            <span className="font-medium">{s.familyName}</span>
                            <span className="text-gray-400">{formatLastServed(s.lastServedAt)}</span>
                            {assigning === s.id ? (
                              <span className="text-gray-400">…</span>
                            ) : (
                              <span className="text-icc-violet">+</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
