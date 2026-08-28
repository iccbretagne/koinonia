import { requireAudioAccess, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AudioQueueClient from "./AudioQueueClient";

export default async function AudioQueuePage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireAudioAccess("audio:view", churchId);

  const services = await prisma.audioService.findMany({
    where: { churchId },
    include: {
      planningEvent: { select: { id: true, title: true, date: true } },
      _count: { select: { segments: true } },
    },
    orderBy: { serviceDate: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Audio évènements</h1>
      <AudioQueueClient
        services={services.map((s) => ({
          id: s.id,
          title: s.title,
          speaker: s.speaker,
          serviceDate: s.serviceDate.toISOString(),
          status: s.status,
          type: s.type,
          openCount: s.openCount,
          segmentCount: s._count.segments,
          eventTitle: s.planningEvent?.title ?? null,
        }))}
      />
    </div>
  );
}
