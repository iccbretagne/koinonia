import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EventsClient from "./EventsClient";
import { PageHeader } from "@/components/ui";
import { isOpenFlag } from "@/lib/opening-params";

export default async function EventsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ nouveau?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
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
    <div className="flex flex-col gap-6">
      <PageHeader title="Événements" />
      <EventsClient
        initialEvents={events.map((e) => ({
          ...e,
          date: e.date.toISOString(),
          planningDeadline: e.planningDeadline?.toISOString() ?? null,
          createdAt: e.createdAt.toISOString(),
        }))}
        churches={church ? [{ id: church.id, name: church.name }] : []}
        initialCreate={isOpenFlag((await searchParams).nouveau)}
      />
    </div>
  );
}
