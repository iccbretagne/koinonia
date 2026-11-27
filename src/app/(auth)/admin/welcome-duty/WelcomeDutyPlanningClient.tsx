"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button, EmptyState, IconButton, SkeletonList, StatusChip, useToast } from "@/components/ui";

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
  const toast = useToast();

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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
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
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur"); return; }
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
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erreur"); return; }
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

  let eventsContent: ReactNode;
  if (loading) {
    eventsContent = <SkeletonList rows={4} />;
  } else if (events.length === 0) {
    eventsContent = (
      <EmptyState
        title="Aucun événement avec service d'accueil ce mois-ci"
        description="Activez le réglage « Familles de service attendues » sur les événements concernés."
      />
    );
  } else {
    eventsContent = (
      <div className="flex flex-col gap-2">
        {events.map((event) => {
          const eventAssignments = assignmentsFor(event.id);
          const isOpen = openEventId === event.id;

          let suggestionsContent: ReactNode = null;
          if (isOpen) {
            if (loadingSugg) {
              suggestionsContent = <p className="text-[13px] text-ink-muted">Chargement…</p>;
            } else if (suggestions.length === 0) {
              suggestionsContent = <p className="text-[13px] text-ink-muted">Toutes les familles du pool sont déjà affectées.</p>;
            } else {
              suggestionsContent = (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Button
                      key={s.id}
                      variant="secondary"
                      size="sm"
                      className="min-h-11 sm:min-h-9"
                      onClick={() => assign(event.id, s.id)}
                      disabled={assigning === s.id}
                      aria-label={`Affecter ${s.familyName} (dernier service : ${formatLastServed(s.lastServedAt)})`}
                    >
                      <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      <span className="font-semibold">{s.familyName}</span>
                      <span className="text-[13px] font-normal text-ink-muted">
                        {assigning === s.id ? "Affectation…" : formatLastServed(s.lastServedAt)}
                      </span>
                    </Button>
                  ))}
                </div>
              );
            }
          }

          return (
            <div key={event.id} className="rounded-card border border-line bg-surface shadow-card">
              {/* Event row — stacked on mobile, inline on desktop */}
              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                {/* Date + title */}
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="w-24 shrink-0 pt-0.5 text-[13px] capitalize text-ink-muted">
                    {formatDate(event.date)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{event.title}</span>
                    <span className="text-[13px] text-ink-muted">{event.type}</span>
                  </div>
                </div>

                {/* Families + assign button */}
                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {eventAssignments.length === 0 ? (
                      <StatusChip tone="warning">Non affecté</StatusChip>
                    ) : (
                      eventAssignments.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-0.5 rounded-control border border-line py-0.5 pl-2.5 pr-0.5 text-sm font-semibold text-ink"
                        >
                          {a.welcomeDutyFamily.familyName}
                          <IconButton
                            icon={X}
                            size="sm"
                            aria-label={`Retirer ${a.welcomeDutyFamily.familyName}`}
                            onClick={() => remove(a.id)}
                            disabled={removing === a.id}
                          />
                        </span>
                      ))
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11 shrink-0 sm:min-h-9"
                    aria-expanded={isOpen}
                    onClick={() => openSuggestions(event.id)}
                  >
                    {isOpen ? "Fermer les suggestions" : "Affecter une famille"}
                  </Button>
                </div>
              </div>

              {/* Suggestion panel */}
              {isOpen && (
                <div className="rounded-b-card border-t border-line px-4 py-3">
                  <p className="mb-2 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
                    Rotation suggérée
                  </p>
                  {suggestionsContent}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Month navigation */}
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon={ChevronLeft} aria-label="Mois précédent" onClick={prevMonth} />
        <span className="min-w-[160px] text-center font-display text-[17px] font-semibold leading-6 text-ink">
          {MONTH_NAMES[month]} {year}
        </span>
        <IconButton icon={ChevronRight} aria-label="Mois suivant" onClick={nextMonth} />
      </div>

      {eventsContent}
    </div>
  );
}
