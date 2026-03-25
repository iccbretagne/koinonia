import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import RequestForm from "./RequestForm";

export default async function NewRequestPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const churchPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => hasPermission(r.role))
  );
  const canSubmitDemands = churchPermissions.has("planning:edit") || session.user.isSuperAdmin;

  // Events for announcements and modification/cancellation
  const events = await prisma.event.findMany({
    where: { churchId, date: { gte: new Date() } },
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nouvelle demande</h1>
      <RequestForm
        churchId={churchId}
        canSubmitDemands={canSubmitDemands}
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
      />
    </div>
  );
}
