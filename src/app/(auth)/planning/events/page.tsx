import Link from "next/link";
import { CalendarX2, ChevronRight, Church } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";
import DateTile from "@/components/DateTile";
import PeriodNav from "@/components/PeriodNav";
import { eventTypeTone } from "@/components/event-type-tone";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import StatusChip from "@/components/ui/StatusChip";
import { getEventTypeLabel } from "@/lib/event-types";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weekBounds, shiftWeek, currentWeekMonday, buildWeekEventsQuery } from "@/lib/week";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
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
  readonly searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return <EmptyState icon={Church} title="Aucune église sélectionnée" description="Choisissez une église dans le menu." />;
  }
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

  const now = new Date();
  // Prochain événement de la semaine affichée (donnée déjà chargée) : carte mise en avant.
  const nextEvent = events.find((e) => e.date >= now);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Agenda de l'église" description="Les événements de l'église, semaine par semaine." />

      <PeriodNav
        label={formatWeekLabel(start, end)}
        prev={{ href: `/planning/events?week=${prevWeek}` }}
        next={{ href: `/planning/events?week=${nextWeek}` }}
        prevLabel="Semaine précédente"
        nextLabel="Semaine suivante"
      />

      {events.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={CalendarX2}
            title="Aucun événement cette semaine"
            description="Passez à la semaine suivante pour voir les prochains événements."
            action={
              <Link href={`/planning/events?week=${nextWeek}`} className={buttonClasses("secondary")}>
                Semaine suivante
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {events.map((event) => {
            const isNext = event.id === nextEvent?.id;
            const isPast = event.date < now;
            return (
              <li key={event.id} className={`border-t border-line first:border-t-0 ${isPast ? "opacity-60" : ""}`}>
                <Link
                  href={`/events/${event.id}/star-view`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  <DateTile date={event.date} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{event.title}</p>
                    <p className="text-[13px] leading-[18px] text-ink-muted">
                      {formatTime(event.date)}
                      {isNext && <span className="font-semibold text-brand-text"> · Prochain</span>}
                    </p>
                  </div>
                  <StatusChip tone={eventTypeTone(event.type)} className="shrink-0">
                    {getEventTypeLabel(event.type)}
                  </StatusChip>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
