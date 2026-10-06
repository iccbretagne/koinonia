"use client";

import { useRouter } from "next/navigation";

interface EntryRequest { id: string; firstName: string; lastName: string; qualificationNote: string | null }
interface Creator { id: string; name: string | null; displayName: string | null }
interface Entry {
  id: string;
  type: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  request: EntryRequest | null;
  createdBy: Creator;
}
interface Profile { id: string; name: string; role: string }

interface Props { readonly profile: Profile; readonly entries: Entry[]; readonly weekStart: string }


function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export default function ProfileAgenda({ profile, entries, weekStart }: Props) {
  const router = useRouter();
  const from = new Date(weekStart);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    return d;
  });

  const prevWeek = new Date(from);
  prevWeek.setDate(from.getDate() - 7);
  const nextWeek = new Date(from);
  nextWeek.setDate(from.getDate() + 7);

  const fromLabel = new Date(from).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const toLabel = days[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  function entriesForDay(day: Date) {
    return entries.filter((e) => {
      const ed = new Date(e.startsAt);
      return ed.getFullYear() === day.getFullYear() && ed.getMonth() === day.getMonth() && ed.getDate() === day.getDate();
    });
  }

  const hasEntries = entries.length > 0;

  return (
    <div>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/agenda/${profile.id}?week=${toLocalISO(prevWeek)}`)}
          className="px-3 py-1 text-sm border border-line rounded-lg hover:bg-surface-sunken"
        >
          ← Semaine précédente
        </button>
        <span className="text-sm font-medium text-ink-muted">{fromLabel} — {toLabel}</span>
        <button
          onClick={() => router.push(`/agenda/${profile.id}?week=${toLocalISO(nextWeek)}`)}
          className="px-3 py-1 text-sm border border-line rounded-lg hover:bg-surface-sunken"
        >
          Semaine suivante →
        </button>
      </div>

      {!hasEntries ? (
        <div className="text-center py-12 text-ink-subtle">
          <p>Aucune entrée cette semaine.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const dayEntries = entriesForDay(day);
            if (dayEntries.length === 0) return null;
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div key={day.toISOString()} className="bg-surface rounded-lg shadow border border-line overflow-hidden">
                <div className={`px-4 py-2 border-b border-line ${isToday ? "bg-brand-soft" : "bg-surface-sunken"}`}>
                  <p className={`text-sm font-semibold capitalize ${isToday ? "text-brand-text" : "text-ink-muted"}`}>
                    {fmtDate(day)}
                  </p>
                </div>
                <div className="divide-y divide-line">
                  {dayEntries.map((entry) => (
                    <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-shrink-0 text-right min-w-[48px]">
                        <p className="text-xs font-medium text-ink-muted">{fmtTime(entry.startsAt)}</p>
                        {entry.endsAt && (
                          <p className="text-xs text-ink-subtle">{fmtTime(entry.endsAt)}</p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            entry.type === "APPOINTMENT"
                              ? "bg-info-soft text-info"
                              : "bg-surface-sunken text-ink-muted"
                          }`}>
                            {entry.type === "APPOINTMENT" ? "RDV" : "Activité"}
                          </span>
                          <p className="font-medium text-ink text-sm truncate">{entry.title}</p>
                        </div>
                        {entry.location && (
                          <p className="text-xs text-ink-muted mt-0.5">📍 {entry.location}</p>
                        )}
                        {entry.request && (
                          <p className="text-xs text-ink-muted mt-0.5">
                            {entry.request.firstName} {entry.request.lastName}
                            {entry.request.qualificationNote && ` · ${entry.request.qualificationNote}`}
                          </p>
                        )}
                        {entry.description && (
                          <p className="text-xs text-ink-muted mt-1">{entry.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
