import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Button from "@/components/ui/Button";
import MediaEventsList from "./MediaEventsList";

export default async function MediaEventsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("media:view", churchId);

  const events = await prisma.mediaEvent.findMany({
    where: { churchId },
    orderBy: { date: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
      planningEvent: { select: { id: true, title: true, type: true, date: true } },
      _count: { select: { photos: true, files: true } },
    },
  });

  const canUpload = session.user.isSuperAdmin || session.user.churchRoles.some(
    (r) => r.churchId === churchId && ["SUPER_ADMIN", "ADMIN", "SECRETARY"].includes(r.role)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Événements média</h1>
        {canUpload && (
          <Link href="/media/events/new">
            <Button>+ Nouvel événement</Button>
          </Link>
        )}
      </div>
      <MediaEventsList events={events} canUpload={canUpload} />
    </div>
  );
}
