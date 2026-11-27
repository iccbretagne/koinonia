"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClasses, statusToneClasses } from "@/components/ui";

interface Profile { id: string; name: string; role: string }
interface EntryRequest { id: string; firstName: string; lastName: string; qualificationNote: string | null }
interface Entry {
  id: string;
  type: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  recipient: { id: string; name: string };
  request: EntryRequest | null;
}

interface Props {
  readonly profiles: Profile[];
  readonly entries: Entry[];
  readonly weekStart: string;
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante",
  BERGER: "Berger",
};

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
function fmtTime(d: Date) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Navigation d'une semaine à l'autre : liens (et non boutons), libellés courts sous 640 px. */
function WeekNav({ prevHref, nextHref, label }: { readonly prevHref: string; readonly nextHref: string; readonly label: string }) {
  const navLinkClasses = `${buttonClasses("secondary", "sm")} min-h-11 sm:min-h-9`;
  return (
    <nav aria-label="Changer de semaine" className="mb-4 flex items-center justify-between gap-2">
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

export default function AgendaCalendar({ profiles, entries, weekStart }: Props) {
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

  function entriesForProfileDay(profileId: string, day: Date) {
    return entries.filter((e) => {
      const eDay = new Date(e.startsAt);
      return (
        e.recipient.id === profileId &&
        eDay.getFullYear() === day.getFullYear() &&
        eDay.getMonth() === day.getMonth() &&
        eDay.getDate() === day.getDate()
      );
    });
  }

  return (
    <div>
      <WeekNav
        prevHref={`/agenda?week=${toLocalISO(prevWeek)}`}
        nextHref={`/agenda?week=${toLocalISO(nextWeek)}`}
        label={`${fmtDate(days[0])} — ${fmtDate(days[6])}`}
      />

      {/* Grille par profil */}
      <div className="space-y-6">
        {profiles.map((profile) => (
          <section key={profile.id} aria-label={profile.name} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 className="font-display text-[15px] font-semibold text-ink">{profile.name}</h2>
                <p className="text-xs text-ink-muted">{ROLE_LABELS[profile.role] ?? profile.role}</p>
              </div>
              <Link href={`/agenda/${profile.id}`} className={`${buttonClasses("ghost", "sm")} min-h-11 shrink-0 sm:min-h-9`}>
                Voir l&apos;agenda
                <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </Link>
            </div>
            <div className="grid grid-cols-7 divide-x divide-line">
              {days.map((day, i) => {
                const dayEntries = entriesForProfileDay(profile.id, day);
                const isToday =
                  day.toDateString() === new Date().toDateString();
                return (
                  <div key={day.toISOString()} className={`p-2 min-h-[80px] ${isToday ? "bg-brand-soft" : ""}`}>
                    <p className={`text-xs font-medium mb-1 ${isToday ? "text-brand-text" : "text-ink-muted"}`}>
                      {DAYS[i]} {day.getDate()}
                    </p>
                    {dayEntries.map((e) => (
                      <div
                        key={e.id}
                        className={`mb-1 truncate rounded-control px-1 py-0.5 text-xs ${
                          statusToneClasses[e.type === "APPOINTMENT" ? "info" : "neutral"]
                        }`}
                        title={e.location ? `${e.title} — ${e.location}` : e.title}
                      >
                        <span>{fmtTime(e.startsAt)}</span> {e.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
