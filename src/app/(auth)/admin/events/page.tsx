import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EventsClient from "./EventsClient";

export default async function EventsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("events:manage", churchId);

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { id: true, name: true },
  });

  const events = await prisma.event.findMany({
    where: { churchId },
    include: {
      church: { select: { id: true, name: true } },
      eventDepts: {
        include: { department: { select: { id: true, name: true } } },
      },
    },
    orderBy: { date: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Evenements</h1>
      <EventsClient
        initialEvents={events.map((e) => ({
          ...e,
          date: e.date.toISOString(),
          planningDeadline: e.planningDeadline?.toISOString() ?? null,
          createdAt: e.createdAt.toISOString(),
        }))}
        churches={church ? [{ id: church.id, name: church.name }] : []}
      />
    </div>
  );
}
