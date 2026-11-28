import { requireAuth, hasPastoralRead } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "next/navigation";
import EventReportClient from "./EventReportClient";
import EventReportReadOnly from "./EventReportReadOnly";
import { PageHeader } from "@/components/ui";

function eventDescription(title: string, date: Date) {
  return `${title} — ${new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`;
}

export default async function EventReportPage({
  params,
}: {
  readonly params: Promise<{ eventId: string }>;
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
  const canRead = perms.has("events:manage") || perms.has("reports:view");
  // Lecture pastorale (spec 092, exception 3) : église de l'événement, jamais le contexte affiché.
  const readOnly = !canRead && hasPastoralRead(session, event.churchId);
  if (!canRead && !readOnly) forbidden();

  if (readOnly) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Compte rendu" description={eventDescription(event.title, event.date)} />
        <EventReportReadOnly statsEnabled={event.statsEnabled} report={event.report} />
      </div>
    );
  }

  // Départements liés à l'événement pour pré-remplir les sections
  const eventDepts = await prisma.eventDepartment.findMany({
    where: { eventId },
    include: { department: { select: { id: true, name: true, ministry: { select: { name: true } } } } },
    orderBy: [{ department: { ministry: { name: "asc" } } }, { department: { name: "asc" } }],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compte rendu"
        description={eventDescription(event.title, event.date)}
      />

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
