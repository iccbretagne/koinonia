import { requireAuth } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EventReportClient from "./EventReportClient";

export default async function EventReportPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await requireAuth();
  const { eventId } = await params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      date: true,
      type: true,
      churchId: true,
      reportEnabled: true,
      statsEnabled: true,
      report: {
        include: {
          sections: {
            include: { department: { select: { id: true, name: true, ministry: { select: { name: true } } } } },
            orderBy: { position: "asc" },
          },
          author: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!event) notFound();
  if (!event.reportEnabled) notFound();

  // Allow access if user has events:manage OR reports:view for this church
  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === event.churchId);
  const perms = new Set(churchRoles.flatMap((r) => rolePermissions[r.role] ?? []));
  if (!perms.has("events:manage") && !perms.has("reports:view")) {
    const { ApiError } = await import("@/lib/api-utils");
    throw new ApiError(403, "Forbidden");
  }

  // Départements liés à l'événement pour pré-remplir les sections
  const eventDepts = await prisma.eventDepartment.findMany({
    where: { eventId },
    include: { department: { select: { id: true, name: true, ministry: { select: { name: true } } } } },
    orderBy: [{ department: { ministry: { name: "asc" } } }, { department: { name: "asc" } }],
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Compte rendu</h1>
        <p className="text-sm text-gray-500 mt-1">
          {event.title} &mdash;{" "}
          {new Date(event.date).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <EventReportClient
        eventId={event.id}
        eventTitle={event.title}
        eventDate={event.date.toISOString()}
        eventType={event.type}
        statsEnabled={event.statsEnabled}
        existingReport={event.report}
        eventDepts={eventDepts.map((ed) => ({
          id: ed.department.id,
          name: ed.department.name,
          ministryName: ed.department.ministry.name,
        }))}
      />
    </div>
  );
}
