import { requireMediaUploadAccess, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NewMediaEventForm from "./NewMediaEventForm";

export default async function NewMediaEventPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireMediaUploadAccess(churchId);

  // Load upcoming planning events for linking
  const planningEvents = await prisma.event.findMany({
    where: {
      churchId,
      date: { gte: new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { date: "desc" },
    select: { id: true, title: true, type: true, date: true },
    take: 50,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nouvel événement média</h1>
      <NewMediaEventForm churchId={churchId} planningEvents={planningEvents} />
    </div>
  );
}
