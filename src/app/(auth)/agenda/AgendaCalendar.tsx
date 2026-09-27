"use client";

import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/button-classes";
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

export default function AgendaCalendar({ profiles, entries, weekStart }: Props) {
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
      {/* Navigation semaine */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => router.push(`/agenda?week=${toLocalISO(prevWeek)}`)}
          className="px-3 py-1 text-sm border border-line rounded-lg hover:bg-surface-sunken"
        >
          ← Semaine précédente
        </button>
        <span className="text-sm font-medium text-ink-muted">
          {fmtDate(days[0])} — {fmtDate(days[6])}
        </span>
        <button
          onClick={() => router.push(`/agenda?week=${toLocalISO(nextWeek)}`)}
          className="px-3 py-1 text-sm border border-line rounded-lg hover:bg-surface-sunken"
        >
          Semaine suivante →
        </button>
      </div>

      {/* Grille par profil */}
      <div className="space-y-6">
        {profiles.map((profile) => (
          <div key={profile.id} className="bg-surface rounded-lg shadow border border-line overflow-hidden">
            <div className="px-4 py-3 bg-brand-soft border-b border-line flex items-center justify-between">
              <div>
                <span className="font-semibold text-ink">{profile.name}</span>
                <span className="ml-2 text-xs text-ink-muted">{ROLE_LABELS[profile.role] ?? profile.role}</span>
              </div>
              <a href={`/agenda/${profile.id}`} className={buttonClasses("ghost", "sm")}>
                Voir l&apos;agenda →
              </a>
            </div>
            <div className="grid grid-cols-7 divide-x divide-line">
              {days.map((day, i) => {
                const dayEntries = entriesForProfileDay(profile.id, day);
                const isToday =
                  day.toDateString() === new Date().toDateString();
                return (
                  <div key={i} className={`p-2 min-h-[80px] ${isToday ? "bg-brand-soft" : ""}`}>
                    <p className={`text-xs font-medium mb-1 ${isToday ? "text-brand-text" : "text-ink-muted"}`}>
                      {DAYS[i]} {day.getDate()}
                    </p>
                    {dayEntries.map((e) => (
                      <div
                        key={e.id}
                        className={`text-xs rounded px-1 py-0.5 mb-1 truncate ${
                          e.type === "APPOINTMENT"
                            ? "bg-info-soft text-info"
                            : "bg-surface-sunken text-ink-muted"
                        }`}
                        title={`${e.title}${e.location ? ` — ${e.location}` : ""}`}
                      >
                        <span>{fmtTime(e.startsAt)}</span> {e.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
