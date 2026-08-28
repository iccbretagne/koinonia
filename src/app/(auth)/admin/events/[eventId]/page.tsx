import { requireAuth, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { getOrCreatePrimaryShareToken, buildPublicAudioUrl } from "@/modules/audio";
import EventDetailClient from "./EventDetailClient";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requireAuth();
  const { eventId } = await params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      church: { select: { id: true, name: true } },
      eventDepts: {
        include: { department: { select: { id: true, name: true } } },
      },
    },
  });

  if (!event) notFound();

  await requireChurchPermission("events:manage", event.churchId);

  const allDepartments = await prisma.department.findMany({
    where: { ministry: { churchId: event.churchId } },
    include: { ministry: { select: { id: true, name: true } } },
    orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
  });

  const linkedDeptIds = new Set(event.eventDepts.map((ed) => ed.departmentId));

  // Signalement d'un enregistrement audio rattaché (spec 020) — events:manage (Super Admin,
  // Admin, Secrétaire) est un sous-ensemble strict des rôles ayant audio:view : aucun contrôle
  // d'accès audio supplémentaire n'est nécessaire pour quiconque atteint déjà cette page.
  const audioService = await prisma.audioService.findUnique({
    where: { planningEventId: event.id },
    include: { segments: { include: { rendition: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{event.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {event.type} &mdash;{" "}
        {new Date(event.date).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}{" "}
        &mdash; {event.church.name}
      </p>

      {audioService && (
        <div className="mb-6 border-2 border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Enregistrement audio</h2>
          {audioService.status === "PUBLISHED" ? (
            <a
              href={buildPublicAudioUrl(
                (await getOrCreatePrimaryShareToken(audioService.id, event.churchId)).token
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" size="sm">Écouter l&apos;enregistrement ↗</Button>
            </a>
          ) : (
            <Link href={`/audio/production/${audioService.id}`}>
              <Button variant="secondary" size="sm">
                En préparation — {audioService.segments.filter((s) => s.rendition).length}/
                {audioService.segments.length} séquence
                {audioService.segments.length > 1 ? "s" : ""} prête
                {audioService.segments.length > 1 ? "s" : ""}
              </Button>
            </Link>
          )}
        </div>
      )}

      <EventDetailClient
        eventId={event.id}
        isRecurring={event.isRecurrenceParent || !!event.seriesId}
        allowAnnouncements={event.allowAnnouncements}
        trackedForDiscipleship={event.trackedForDiscipleship}
        reportEnabled={event.reportEnabled}
        statsEnabled={event.statsEnabled}
        welcomeDutyEnabled={event.welcomeDutyEnabled}
        departments={allDepartments.map((d) => ({
          id: d.id,
          name: d.name,
          ministryName: d.ministry.name,
          linked: linkedDeptIds.has(d.id),
        }))}
      />
    </div>
  );
}
