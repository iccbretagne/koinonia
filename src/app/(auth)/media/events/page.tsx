import { requireMediaAccess, isProductionMediaMember, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { rolePermissions } from "@/lib/registry";
import MediaEventsList from "./MediaEventsList";

export default async function MediaEventsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireMediaAccess(churchId);

  const [events, photoStatusRows] = await Promise.all([
    prisma.mediaEvent.findMany({
      where: { churchId },
      orderBy: { date: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, displayName: true } },
        planningEvent: { select: { id: true, title: true, type: true, date: true } },
        _count: { select: { photos: true, files: true } },
      },
    }),
    prisma.mediaPhoto.groupBy({
      by: ["mediaEventId", "status"],
      where: { mediaEvent: { churchId } },
      _count: { _all: true },
    }),
  ]);

  // Map eventId → { PENDING, PREVALIDATED, APPROVED, REJECTED }
  type PhotoCounts = { pending: number; prevalidated: number; approved: number; rejected: number };
  const photoCounts = new Map<string, PhotoCounts>();
  for (const row of photoStatusRows) {
    if (!row.mediaEventId) continue;
    const entry = photoCounts.get(row.mediaEventId) ?? { pending: 0, prevalidated: 0, approved: 0, rejected: 0 };
    if (row.status === "PENDING")      entry.pending      += row._count._all;
    if (row.status === "PREVALIDATED") entry.prevalidated += row._count._all;
    if (row.status === "APPROVED")     entry.approved     += row._count._all;
    if (row.status === "REJECTED")     entry.rejected     += row._count._all;
    photoCounts.set(row.mediaEventId, entry);
  }

  const eventsWithCounts = events.map((e) => ({
    ...e,
    photoCounts: photoCounts.get(e.id) ?? { pending: 0, prevalidated: 0, approved: 0, rejected: 0 },
  }));

  const churchPerms = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const isProductionMember = await isProductionMediaMember(session, churchId);
  const canUpload = session.user.isSuperAdmin || churchPerms.has("media:upload") || isProductionMember;

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
      <MediaEventsList events={eventsWithCounts} canUpload={canUpload} />
    </div>
  );
}
