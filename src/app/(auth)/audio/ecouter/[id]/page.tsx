import { notFound } from "next/navigation";
import { requireAuth, requireChurchPermission, getCurrentChurchId } from "@/lib/auth";
import { getPublishedServiceForMember } from "@/modules/audio";
import MemberAudioPlayer from "./MemberAudioPlayer";

export default async function AudioListenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("audio:listen", churchId);

  const service = await getPublishedServiceForMember(id, churchId);
  if (!service) notFound();

  return (
    <MemberAudioPlayer
      serviceId={id}
      service={{
        title: service.title,
        serviceDate: service.serviceDate.toISOString(),
        speaker: service.speaker,
        coverUrl: service.coverUrl,
        segments: service.segments,
      }}
    />
  );
}
