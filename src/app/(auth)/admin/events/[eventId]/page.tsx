import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EventDetailClient from "./EventDetailClient";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requirePermission("events:manage");
  const { eventId } = await params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      church: { select: { id: true, name: true } },
      eventDepts: {
        include: { department: { select: { id: true, name: true } } },
      },
    },
  });

  if (!event) notFound();

  const allDepartments = await prisma.department.findMany({
    where: { ministry: { churchId: event.churchId } },
    include: { ministry: { select: { id: true, name: true } } },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  const linkedDeptIds = new Set(event.eventDepts.map((ed) => ed.departmentId));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{event.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {event.type} &mdash;{" "}
        {new Date(event.date).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}{" "}
        &mdash; {event.church.name}
      </p>

      <EventDetailClient
        eventId={event.id}
        isRecurring={event.isRecurrenceParent || !!event.seriesId}
        departments={allDepartments.map((d) => ({
          id: d.id,
          name: d.name,
          ministryName: d.ministry.name,
          linked: linkedDeptIds.has(d.id),
        }))}
      />
    </div>
  );
}
