import { requireMediaManageAccess, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CollectionBuilder from "./CollectionBuilder";

export default async function CollectionsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  await requireMediaManageAccess(churchId);

  const [events, projects, totalPhotoCounts] = await Promise.all([
    prisma.mediaEvent.findMany({
      where: { churchId },
      orderBy: { date: "desc" },
      select: {
        id: true,
        name: true,
        date: true,
        _count: { select: { photos: { where: { status: "APPROVED" } } } },
      },
    }),
    prisma.mediaProject.findMany({
      where: { churchId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { files: { where: { status: { in: ["APPROVED", "FINAL_APPROVED"] } } } } },
      },
    }),
    // Total toutes photos (tous statuts) par événement — pour informer le créateur du périmètre
    // possible avec "toutes les photos" (Prisma ne permet pas deux compteurs filtrés différents
    // sur la même relation dans un seul `_count`).
    prisma.mediaPhoto.groupBy({
      by: ["mediaEventId"],
      where: { mediaEvent: { churchId } },
      _count: { _all: true },
    }),
  ]);

  const totalPhotoByEventId = new Map(totalPhotoCounts.map((c) => [c.mediaEventId, c._count._all]));

  const serializedEvents = events.map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date.toISOString(),
    approvedPhotoCount: e._count.photos,
    totalPhotoCount: totalPhotoByEventId.get(e.id) ?? 0,
  }));

  const serializedProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt.toISOString(),
    approvedFileCount: p._count.files,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Collections</h1>
      <p className="text-sm text-gray-500 mb-6">
        Créez un lien de partage regroupant des photos validées et/ou des visuels approuvés provenant de plusieurs événements ou projets.
      </p>
      <CollectionBuilder
        churchId={churchId}
        events={serializedEvents}
        projects={serializedProjects}
      />
    </div>
  );
}
