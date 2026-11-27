"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { EmptyState, StatusChip, buttonClasses } from "@/components/ui";

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

/** Navigation d'une semaine à l'autre : liens (et non boutons), libellés courts sous 640 px. */
function WeekNav({ prevHref, nextHref, label }: { readonly prevHref: string; readonly nextHref: string; readonly label: string }) {
  const navLinkClasses = `${buttonClasses("secondary", "sm")}`;
  return (
    <nav aria-label="Changer de semaine" className="mb-6 flex items-center justify-between gap-2">
      <Link href={prevHref} className={navLinkClasses} aria-label="Semaine précédente">
        <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span aria-hidden="true" className="hidden sm:inline">Semaine précédente</span>
      </Link>
      <span className="text-center text-sm font-medium text-ink-muted">{label}</span>
      <Link href={nextHref} className={navLinkClasses} aria-label="Semaine suivante">
        <span aria-hidden="true" className="hidden sm:inline">Semaine suivante</span>
        <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </Link>
    </nav>
  );
}

export default function ProfileAgenda({ profile, entries, weekStart }: Props) {
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
      <WeekNav
        prevHref={`/agenda/${profile.id}?week=${toLocalISO(prevWeek)}`}
        nextHref={`/agenda/${profile.id}?week=${toLocalISO(nextWeek)}`}
        label={`${fromLabel} — ${toLabel}`}
      />

      {!hasEntries ? (
        <EmptyState icon={CalendarDays} title="Aucune entrée cette semaine" />
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const dayEntries = entriesForDay(day);
            if (dayEntries.length === 0) return null;
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <section key={day.toISOString()} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                <div className={`border-b border-line px-4 py-2 ${isToday ? "bg-brand-soft" : ""}`}>
                  <h2 className={`text-sm font-semibold capitalize ${isToday ? "text-brand-text" : "text-ink-muted"}`}>
                    {fmtDate(day)}
                  </h2>
                </div>
                <div className="divide-y divide-line">
                  {dayEntries.map((entry) => (
                    <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-shrink-0 text-right min-w-[48px]">
                        <p className="text-xs font-medium text-ink-muted">{fmtTime(entry.startsAt)}</p>
                        {entry.endsAt && (
                          <p className="text-xs text-ink-muted">{fmtTime(entry.endsAt)}</p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusChip tone={entry.type === "APPOINTMENT" ? "info" : "neutral"} className="shrink-0">
                            {entry.type === "APPOINTMENT" ? "RDV" : "Activité"}
                          </StatusChip>
                          <p className="font-medium text-ink text-sm truncate">{entry.title}</p>
                        </div>
                        {entry.location && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                            <MapPin aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                            <span className="sr-only">Lieu : </span>{entry.location}
                          </p>
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
