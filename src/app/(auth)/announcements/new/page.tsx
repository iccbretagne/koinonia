import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AnnouncementForm from "./AnnouncementForm";

export default async function NewAnnouncementPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("planning:view", churchId);

  const targetEvents = await prisma.event.findMany({
    where: { churchId, allowAnnouncements: true, date: { gte: new Date() } },
    select: { id: true, title: true, date: true },
    orderBy: { date: "asc" },
  });

  // Build source options from user's roles
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Nouvelle annonce</h1>
      <p className="text-sm text-gray-500 mb-6">
        Deadline : <strong>mardi 23h59</strong>. Toute annonce soumise après ce délai est
        reportée au dimanche suivant sauf urgence.
      </p>
      <AnnouncementForm
        churchId={churchId}
        targetEvents={targetEvents.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date.toISOString(),
        }))}
        sourceOptions={sourceOptions}
      />
    </div>
  );
}
