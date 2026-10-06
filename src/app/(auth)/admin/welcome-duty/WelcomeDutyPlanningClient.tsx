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
  readonly churchId: string;
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

  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [assigning, setAssigning]     = useState<string | null>(null);
  const [removing, setRemoving]       = useState<string | null>(null);

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

  useEffect(() => { fetchMonth().catch(() => undefined); }, [fetchMonth]);

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
      if (openEventId === removed?.eventId) {
        const res2 = await fetch(`/api/welcome-duty/suggestions?eventId=${removed.eventId}&limit=8`);
        const data = await res2.json();
        setSuggestions(Array.isArray(data) ? data : []);
      }
    } finally {
      setRemoving(null);
    }
  }

  function formatLastServed(date: string | null) {
    if (!date) return "Jamais";
    return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  }

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-surface-sunken text-ink-muted transition-colors"
          aria-label="Mois précédent"
        >
          ‹
        </button>
        <span className="text-base font-semibold text-ink min-w-[160px] text-center">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-surface-sunken text-ink-muted transition-colors"
          aria-label="Mois suivant"
        >
          ›
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-subtle">Chargement…</p>
      ) : events.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-lg border border-dashed border-line">
          <p className="text-ink-subtle text-sm">Aucun événement avec service d&apos;accueil ce mois-ci.</p>
          <p className="text-ink-subtle text-xs mt-1">Activez le flag &laquo;&nbsp;Familles de service attendues&nbsp;&raquo; sur les événements concernés.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const eventAssignments = assignmentsFor(event.id);
            const isOpen = openEventId === event.id;

            return (
              <div key={event.id} className="bg-surface rounded-lg shadow-card border border-line">
                {/* Event row — stacked on mobile, inline on desktop */}
                <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  {/* Date + title */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xs text-ink-subtle shrink-0 capitalize pt-0.5 w-24">
                      {formatDate(event.date)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-ink truncate block">{event.title}</span>
                      <span className="text-xs text-ink-subtle">{event.type}</span>
                    </div>
                  </div>

                  {/* Families + assign button */}
                  <div className="flex items-center gap-2 justify-between sm:justify-end">
                    <div className="flex flex-wrap gap-1.5">
                      {eventAssignments.length === 0 ? (
                        <span className="text-xs text-ink-subtle italic">Non affecté</span>
                      ) : (
                        eventAssignments.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-soft text-brand-text text-xs rounded-full font-medium"
                          >
                            {a.welcomeDutyFamily.familyName}
                            <button
                              onClick={() => remove(a.id)}
                              disabled={removing === a.id}
                              className="text-brand-text hover:text-brand-text disabled:opacity-40 leading-none ml-0.5"
                              aria-label="Retirer"
                            >
                              ✕
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <button
                      onClick={() => openSuggestions(event.id)}
                      className={`shrink-0 text-sm px-3 py-2 rounded-lg border transition-colors ${
                        isOpen
                          ? "border-brand bg-brand text-on-brand"
                          : "border-line text-ink-muted hover:border-brand hover:text-brand-text"
                      }`}
                    >
                      {isOpen ? "Fermer" : "+ Affecter"}
                    </button>
                  </div>
                </div>

                {/* Suggestion panel */}
                {isOpen && (
                  <div className="border-t border-line px-4 py-3 bg-surface-sunken rounded-b-lg">
                    <p className="text-xs font-semibold text-ink-muted uppercase mb-2">
                      Rotation suggérée
                    </p>
                    {loadingSugg ? (
                      <p className="text-xs text-ink-subtle">Chargement…</p>
                    ) : suggestions.length === 0 ? (
                      <p className="text-xs text-ink-subtle">Toutes les familles du pool sont déjà affectées.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => assign(event.id, s.id)}
                            disabled={assigning === s.id}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-full text-sm text-ink-muted hover:border-brand hover:text-brand-text disabled:opacity-50 transition-colors"
                          >
                            <span className="font-medium">{s.familyName}</span>
                            <span className="text-ink-subtle text-xs">{formatLastServed(s.lastServedAt)}</span>
                            {assigning === s.id ? (
                              <span className="text-ink-subtle text-xs">…</span>
                            ) : (
                              <span className="text-brand-text">+</span>
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
