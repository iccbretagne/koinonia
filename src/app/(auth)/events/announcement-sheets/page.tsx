import Link from "next/link";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canReadAnnouncementSheet } from "@/modules/planning";

function formatDate(date: Date) {
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

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
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trame des annonces</h1>
        <p className="text-sm text-gray-500 mt-1">Cultes du mois sélectionné</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/events/announcement-sheets?month=${monthKey(prevMonth)}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 border-2 border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Mois précédent
        </Link>
        <span className="text-sm font-semibold text-gray-900 capitalize">
          {monthStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </span>
        <Link
          href={`/events/announcement-sheets?month=${monthKey(nextMonth)}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 border-2 border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Mois suivant
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-gray-400 italic">Aucun événement ce mois-ci.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}/star-view`}
                className="flex items-center justify-between gap-4 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  <p className="font-medium text-gray-900">{event.title}</p>
                  <p className="text-sm text-gray-500 capitalize">{formatDate(event.date)}</p>
                </div>
                {event.announcementSheet ? (
                  <span className="text-sm text-icc-violet font-medium shrink-0">
                    {event.announcementSheet.filename}
                  </span>
                ) : (
                  <span className="text-sm italic text-gray-400 shrink-0">Pas encore disponible</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
