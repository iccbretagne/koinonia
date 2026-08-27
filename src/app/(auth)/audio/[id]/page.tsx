import { notFound } from "next/navigation";
import { requireAudioAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreatePrimaryShareToken, buildPublicAudioUrl } from "@/modules/audio";
import AudioServiceClient from "./AudioServiceClient";
import ServiceInfoEditor from "./ServiceInfoEditor";

export default async function AudioServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const service = await prisma.audioService.findUnique({
    where: { id },
    include: {
      planningEvent: { select: { id: true, title: true, date: true } },
      sources: { orderBy: { createdAt: "asc" } },
      segments: {
        orderBy: { order: "asc" },
        include: { rendition: true, source: true },
      },
      // Sans cela, un job RENDER en échec reste invisible : l'écran affiche « rendu en cours »
      // indéfiniment alors que plus rien ne progresse.
      jobs: {
        where: { type: "RENDER", status: { in: ["PENDING", "RUNNING", "FAILED"] } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!service) return notFound();

  await requireAudioAccess("audio:view", service.churchId);

  const settings = await prisma.audioSettings.findUnique({
    where: { churchId: service.churchId },
    select: { sequenceTemplate: true },
  });
  const templateNames = Array.isArray(settings?.sequenceTemplate)
    ? (settings.sequenceTemplate as unknown[]).filter((n): n is string => typeof n === "string")
    : [];

  const shareUrl =
    service.status === "PUBLISHED"
      ? buildPublicAudioUrl((await getOrCreatePrimaryShareToken(service.id, service.churchId)).token)
      : null;

  return (
    <div>
      <ServiceInfoEditor
        service={{
          id: service.id,
          title: service.title,
          speaker: service.speaker,
          type: service.type,
          serviceDate: service.serviceDate.toISOString(),
          planningEventId: service.planningEventId,
          planningEventTitle: service.planningEvent?.title ?? null,
        }}
      />
      <AudioServiceClient
        templateNames={templateNames}
        service={{
          id: service.id,
          status: service.status,
          serviceDate: service.serviceDate.toISOString(),
          title: service.title,
          speaker: service.speaker,
          shareUrl,
          failedRenders: service.jobs
            .filter((j) => j.status === "FAILED")
            .map((j) => ({
              id: j.id,
              error: j.error,
              segmentId:
                j.payload && typeof j.payload === "object" && "segmentId" in j.payload
                  ? String((j.payload as { segmentId?: unknown }).segmentId ?? "")
                  : "",
            })),
          // Le statut READY seul ne dit pas si un rendu tourne réellement : après un redépôt
          // suite à un échec, le statut reste READY mais les jobs PENDING/RUNNING peuvent avoir
          // disparu (nettoyés à la suppression) sans qu'aucun nouveau job n'ait encore été créé
          // — le prochain « Publier » doit rester cliquable dans ce cas.
          pendingRenderCount: service.jobs.filter((j) => j.status === "PENDING" || j.status === "RUNNING").length,
          sources: service.sources.map((s) => ({
            id: s.id,
            kind: s.kind,
            durationMs: s.durationMs,
            uploadStatus: s.uploadStatus,
            filename: s.originalFilename ?? s.s3Key.split("/").pop() ?? s.s3Key,
            sizeBytes: s.sizeBytes === null ? null : Number(s.sizeBytes),
          })),
          segments: service.segments.map((seg) => ({
            id: seg.id,
            sourceId: seg.sourceId,
            order: seg.order,
            title: seg.title,
            durationMs: seg.source?.durationMs ?? null,
            hasRendition: !!seg.rendition,
            truePeakDb: seg.rendition?.truePeakDb ?? null,
            lufs: seg.rendition?.lufs ?? null,
          })),
        }}
      />
    </div>
  );
}
