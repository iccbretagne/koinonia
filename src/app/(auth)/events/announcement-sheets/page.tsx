import Link from "next/link";
import { CalendarX2, ChevronRight, Church, FileCheck2, FileClock } from "lucide-react";
import DateTile from "@/components/DateTile";
import PeriodNav from "@/components/PeriodNav";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import StatusChip from "@/components/ui/StatusChip";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canReadAnnouncementSheet } from "@/modules/planning";

function parseMonth(param: string | undefined): Date {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [year, month] = param.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default async function AnnouncementSheetsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) {
    return <EmptyState icon={Church} title="Aucune église sélectionnée" description="Choisissez une église dans le menu." />;
  }
  await requireChurchPermission("planning:view", churchId);

  if (!(await canReadAnnouncementSheet(session, churchId))) {
    throw new Error("FORBIDDEN");
  }

  const { month } = await searchParams;
  const monthStart = parseMonth(month);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const prevMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const events = await prisma.event.findMany({
    where: { churchId, date: { gte: monthStart, lt: monthEnd } },
    select: {
      id: true,
      title: true,
      date: true,
      announcementSheet: { select: { filename: true, uploadedAt: true } },
    },
    orderBy: { date: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Trame des annonces" description="La trame déposée pour chaque culte du mois." />

      <PeriodNav
        label={monthStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        prev={{ href: `/events/announcement-sheets?month=${monthKey(prevMonth)}` }}
        next={{ href: `/events/announcement-sheets?month=${monthKey(nextMonth)}` }}
        prevLabel="Mois précédent"
        nextLabel="Mois suivant"
      />

      {events.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState icon={CalendarX2} title="Aucun événement ce mois-ci" description="Changez de mois pour consulter d'autres cultes." />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {events.map((event) => (
            <li key={event.id} className="border-t border-line first:border-t-0">
              <Link
                href={`/events/${event.id}/star-view`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                <DateTile date={event.date} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{event.title}</p>
                  <p className="truncate text-[13px] leading-[18px] text-ink-muted">
                    {event.announcementSheet ? event.announcementSheet.filename : "Pas encore disponible"}
                  </p>
                </div>
                {event.announcementSheet ? (
                  <StatusChip tone="success" icon={FileCheck2} className="shrink-0">Déposée</StatusChip>
                ) : (
                  <StatusChip tone="neutral" icon={FileClock} className="shrink-0">En attente</StatusChip>
                )}
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
