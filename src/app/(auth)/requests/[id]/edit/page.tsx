import { notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import RequestForm, { type EditData } from "../../new/RequestForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditRequestPage({ params }: Props) {
  const { id } = await params;

  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  // Fetch the request with its announcement relation
  const request = await prisma.request.findUnique({
    where: { id },
    include: {
      announcement: {
        select: {
          id: true,
          title: true,
          content: true,
          eventDate: true,
          isSaveTheDate: true,
          isUrgent: true,
          channelInterne: true,
          channelExterne: true,
          targetEvents: { select: { eventId: true } },
        },
      },
    },
  });

  // Only the owner can edit, only EN_ATTENTE requests can be edited
  if (
    !request ||
    request.submittedById !== session.user.id ||
    request.status !== "EN_ATTENTE"
  ) {
    notFound();
  }

  const churchPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const canSubmitDemands = churchPermissions.has("planning:edit") || session.user.isSuperAdmin;

  const now = new Date();
  const in90days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const announcementEvents = await prisma.event.findMany({
    where: { churchId, date: { gte: now, lte: in90days }, allowAnnouncements: true },
    select: { id: true, title: true, type: true, date: true },
    orderBy: { date: "asc" },
  });

  // Events for modification/cancellation demands
  const events = await prisma.event.findMany({
    where: { churchId, date: { gte: now } },
    select: { id: true, title: true, type: true, date: true },
    orderBy: { date: "asc" },
  });

  // Source options (departments/ministries from user's roles)
  const churchRoles = session.user.churchRoles.filter(
    (r) => r.churchId === churchId
  );

  const sourceOptions: { type: "department" | "ministry"; id: string; label: string }[] = [];
  const seenIds = new Set<string>();

  for (const role of churchRoles) {
    if (role.ministryId && !seenIds.has(role.ministryId)) {
      const ministry = await prisma.ministry.findUnique({
        where: { id: role.ministryId },
        select: { id: true, name: true },
      });
      if (ministry) {
        sourceOptions.push({ type: "ministry", id: ministry.id, label: ministry.name });
        seenIds.add(ministry.id);
      }
    }
    for (const { department } of role.departments) {
      if (!seenIds.has(department.id)) {
        sourceOptions.push({ type: "department", id: department.id, label: department.name });
        seenIds.add(department.id);
      }
    }
  }

  // Departments for planning modification requests
  const departments = await prisma.department.findMany({
    where: { ministry: { churchId } },
    select: { id: true, name: true, ministry: { select: { name: true } } },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  // Users for access requests
  const users = await prisma.user.findMany({
    where: {
      churchRoles: { some: { churchId } },
    },
    select: { id: true, name: true, displayName: true, email: true },
    orderBy: { name: "asc" },
  });

  // Ministries for access requests
  const ministries = await prisma.ministry.findMany({
    where: { churchId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Build editData for the form
  const editData: EditData = {
    id: request.id,
    type: request.type,
    title: request.title,
    payload: request.payload as Record<string, unknown>,
    announcement: request.announcement
      ? {
          id: request.announcement.id,
          title: request.announcement.title,
          content: request.announcement.content,
          eventDate: request.announcement.eventDate
            ? request.announcement.eventDate.toISOString()
            : null,
          isSaveTheDate: request.announcement.isSaveTheDate,
          isUrgent: request.announcement.isUrgent,
          channelInterne: request.announcement.channelInterne,
          channelExterne: request.announcement.channelExterne,
          targetEvents: request.announcement.targetEvents,
        }
      : null,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Modifier la demande</h1>
      <RequestForm
        churchId={churchId}
        canSubmitDemands={canSubmitDemands}
        announcementEvents={announcementEvents.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          date: e.date.toISOString(),
        }))}
        events={events.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          date: e.date.toISOString(),
        }))}
        sourceOptions={sourceOptions}
        departments={departments.map((d) => ({
          id: d.id,
          name: d.name,
          ministryName: d.ministry.name,
        }))}
        users={users.map((u) => ({
          id: u.id,
          label: u.displayName ?? u.name ?? u.email,
        }))}
        ministries={ministries}
        editData={editData}
      />
    </div>
  );
}
