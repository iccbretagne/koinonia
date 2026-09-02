import { notFound } from "next/navigation";
import { requireAuth, requireAudioListenAccess, getCurrentChurchId } from "@/lib/auth";
import { getPublishedServiceForMember } from "@/modules/audio";
import { prisma } from "@/lib/prisma";
import MemberAudioPlayer from "./MemberAudioPlayer";

export default async function AudioListenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();

  // L'église du culte fait autorité (spec 036) — jamais le contexte d'église affiché côté
  // client, qui peut venir d'un cookie manipulé (cf. requireAudioListenAccess).
  const serviceChurch = await prisma.audioService.findUnique({
    where: { id },
    select: { churchId: true, church: { select: { name: true } } },
  });
  if (!serviceChurch) notFound();

  await requireAudioListenAccess(serviceChurch.churchId);

  const service = await getPublishedServiceForMember(id, [serviceChurch.churchId]);
  if (!service) notFound();

  const currentChurchId = await getCurrentChurchId(session);
  const originChurchName = serviceChurch.churchId !== currentChurchId ? serviceChurch.church.name : undefined;

  return (
    <MemberAudioPlayer
      serviceId={id}
      service={{
        title: service.title,
        serviceDate: service.serviceDate.toISOString(),
        speaker: service.speaker,
        coverUrl: service.coverUrl,
        segments: service.segments,
        churchName: originChurchName ?? null,
      }}
    />
  );
}
