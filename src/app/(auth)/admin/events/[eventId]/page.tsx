import { requireAuth, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader, buttonClasses } from "@/components/ui";
import { getOrCreatePrimaryShareToken, buildPublicAudioUrl } from "@/modules/audio";
import EventDetailClient from "./EventDetailClient";
import EventFormsBlock from "@/components/forms/EventFormsBlock";
import { registry } from "@/lib/registry";

export default async function EventDetailPage({
  params,
}: {
  readonly params: Promise<{ eventId: string }>;
}) {
  const session = await requireAuth();
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

  // Formulaires de participation rattachés (spec 079, lot 3).
  const forms = registry.has("forms") ? await (await import("@/modules/forms")).listFormsForEvent({ eventId: event.id }) : [];
  const formsManager = forms.length > 0 && (await (await import("@/lib/auth")).hasChurchPermission(session, "forms:manage", event.churchId));

  const linkedDeptIds = new Set(event.eventDepts.map((ed) => ed.departmentId));

  // Signalement d'un enregistrement audio rattaché (spec 020) — events:manage (Super Admin,
  // Admin, Secrétaire) est un sous-ensemble strict des rôles ayant audio:view : aucun contrôle
  // d'accès audio supplémentaire n'est nécessaire pour quiconque atteint déjà cette page.
  const audioService = await prisma.audioService.findUnique({
    where: { planningEventId: event.id },
    include: { segments: { include: { rendition: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={event.title}
        description={`${event.type} — ${new Date(event.date).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })} — ${event.church.name}`}
      />

      {audioService && (
        <section className="flex flex-col items-start gap-2 rounded-card border border-line bg-surface p-4">
          <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Enregistrement audio</h2>
          {audioService.status === "PUBLISHED" ? (
            <a
              href={buildPublicAudioUrl(
                (await getOrCreatePrimaryShareToken(audioService.id, event.churchId)).token
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("secondary", "md")}
            >
              Écouter l&apos;enregistrement
              <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </a>
          ) : (
            <>
              <p className="text-[15px] leading-[22px] text-ink-muted">
                En préparation — {audioService.segments.filter((s) => s.rendition).length}/
                {audioService.segments.length} séquence
                {audioService.segments.length > 1 ? "s" : ""} prête
                {audioService.segments.length > 1 ? "s" : ""}
              </p>
              <Link href={`/audio/production/${audioService.id}`} className={buttonClasses("secondary", "md")}>
                Suivre la production
              </Link>
            </>
          )}
        </section>
      )}

      <EventFormsBlock forms={forms} manage={formsManager} />

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
