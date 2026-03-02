import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EventsClient from "./EventsClient";

export default async function EventsPage() {
  const session = await requirePermission("events:manage");

  const churchRoles = session.user.churchRoles;
  const isSuperAdmin = churchRoles.some((r) => r.role === "SUPER_ADMIN");
  const churchIds = Array.from(new Set(churchRoles.map((r) => r.churchId)));

  const churches = isSuperAdmin
    ? await prisma.church.findMany({ orderBy: { name: "asc" } })
    : churchRoles.map((r) => r.church);

  const uniqueChurches = Array.from(
    new Map(churches.map((c) => [c.id, c])).values()
  );

  const events = await prisma.event.findMany({
    where: isSuperAdmin ? undefined : { churchId: { in: churchIds } },
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
        churches={uniqueChurches.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
