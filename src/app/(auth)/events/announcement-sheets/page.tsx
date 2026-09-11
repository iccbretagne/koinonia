import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canReadAnnouncementSheet } from "@/modules/planning";

function formatDate(date: Date) {
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export default async function AnnouncementSheetsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  if (!(await canReadAnnouncementSheet(session, churchId))) {
    redirect("/no-access");
  }

  const events = await prisma.event.findMany({
    where: { churchId, date: { gte: new Date() } },
    select: {
      id: true,
      title: true,
      date: true,
      announcementSheet: { select: { filename: true, uploadedAt: true } },
    },
    orderBy: { date: "asc" },
    take: 20,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trame des annonces</h1>
        <p className="text-sm text-gray-500 mt-1">Prochains cultes de l&apos;église</p>
      </div>

      {events.length === 0 ? (
        <p className="text-gray-400 italic">Aucun événement à venir.</p>
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
