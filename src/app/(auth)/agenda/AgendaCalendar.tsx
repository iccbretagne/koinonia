"use client";

import { useRouter } from "next/navigation";

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
  profiles: Profile[];
  entries: Entry[];
  weekStart: string;
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
          onClick={() => router.push(`/agenda?week=${prevWeek.toISOString().split("T")[0]}`)}
          className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          ← Semaine précédente
        </button>
        <span className="text-sm font-medium text-gray-700">
          {fmtDate(days[0])} — {fmtDate(days[6])}
        </span>
        <button
          onClick={() => router.push(`/agenda?week=${nextWeek.toISOString().split("T")[0]}`)}
          className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Semaine suivante →
        </button>
      </div>

      {/* Grille par profil */}
      <div className="space-y-6">
        {profiles.map((profile) => (
          <div key={profile.id} className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-icc-violet/5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-900">{profile.name}</span>
                <span className="ml-2 text-xs text-gray-500">{ROLE_LABELS[profile.role] ?? profile.role}</span>
              </div>
              <a href={`/agenda/${profile.id}`} className="text-xs text-icc-violet hover:underline">
                Voir l&apos;agenda →
              </a>
            </div>
            <div className="grid grid-cols-7 divide-x divide-gray-100">
              {days.map((day, i) => {
                const dayEntries = entriesForProfileDay(profile.id, day);
                const isToday =
                  day.toDateString() === new Date().toDateString();
                return (
                  <div key={i} className={`p-2 min-h-[80px] ${isToday ? "bg-icc-violet/5" : ""}`}>
                    <p className={`text-xs font-medium mb-1 ${isToday ? "text-icc-violet" : "text-gray-500"}`}>
                      {DAYS[i]} {day.getDate()}
                    </p>
                    {dayEntries.map((e) => (
                      <div
                        key={e.id}
                        className={`text-xs rounded px-1 py-0.5 mb-1 truncate ${
                          e.type === "APPOINTMENT"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-700"
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
