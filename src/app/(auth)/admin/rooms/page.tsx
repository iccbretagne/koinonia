import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RoomsAdminClient from "./RoomsAdminClient";

export default async function AdminRoomsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("rooms:manage", churchId);

  const rooms = await prisma.room.findMany({
    where: { churchId },
    include: {
      sharedWith: { include: { church: { select: { id: true, name: true } } } },
      _count: { select: { reservations: true } },
    },
    orderBy: { name: "asc" },
  });

  const churches = await prisma.church.findMany({
    where: { id: { not: churchId } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Salles</h1>
      <RoomsAdminClient
        churchId={churchId}
        initialRooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity,
          location: r.location,
          isActive: r.isActive,
          reservationCount: r._count.reservations,
          sharedWith: r.sharedWith.map((a) => ({ id: a.id, church: a.church })),
        }))}
        otherChurches={churches}
      />
    </div>
  );
}
