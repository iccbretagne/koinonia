import Link from "next/link";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weekBounds, shiftWeek, currentWeekMonday, buildWeekEventsQuery } from "@/lib/week";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatDate(date: Date) {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatWeekLabel(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString("fr-FR", { day: "numeric", month: sameMonth ? undefined : "long" });
  const endLabel = end.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `Semaine du ${startLabel} au ${endLabel}`;
}

export default async function StarWeeklyEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const { week } = await searchParams;
  const mondayISO = week && ISO_DATE_RE.test(week) ? week : currentWeekMonday();
  const [y, m, d] = mondayISO.split("-").map(Number);
  const ref = new Date(y, m - 1, d);

  const { start, end } = weekBounds(ref);
  const query = buildWeekEventsQuery(churchId, ref);
  const events = await prisma.event.findMany(query);

  const prevWeek = shiftWeek(mondayISO, -1);
  const nextWeek = shiftWeek(mondayISO, 1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Événements</h1>
        <p className="text-sm text-gray-500 mt-1">Agenda hebdomadaire de l&apos;église</p>
      </div>

      {/* Navigation semaine */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/planning/events?week=${prevWeek}`}
          className="p-2 rounded-lg border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          aria-label="Semaine précédente"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-base font-semibold text-gray-800 capitalize">
          {formatWeekLabel(start, end)}
        </h2>
        <Link
          href={`/planning/events?week=${nextWeek}`}
          className="p-2 rounded-lg border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          aria-label="Semaine suivante"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          <p className="text-lg">Aucun événement cette semaine.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-lg border-2 border-gray-200 px-4 py-3"
            >
              <p className="font-medium text-gray-900">{event.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 capitalize">
                {formatDate(event.date)}
                <span className="mx-1.5">·</span>
                {formatTime(event.date)}
                <span className="mx-1.5">·</span>
                <span className="font-semibold text-gray-700">{event.type}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
