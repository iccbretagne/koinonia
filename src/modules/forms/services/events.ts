import { prisma } from "@/lib/prisma";
import { acceptsResponses } from "./lifecycle";

/**
 * Formulaires rattachés à un événement (spec 079, lot 3), pour le bloc « Formulaires » de la page
 * de l'événement d'église ou de billetterie. `forms` ne lit aucune table d'un autre module : il
 * reçoit l'identifiant, l'appelant (`src/app`) a déjà vérifié l'accès à l'événement.
 */
export async function listFormsForEvent(target: { eventId: string } | { ticketingEventId: string }, now = new Date()) {
  const forms = await prisma.form.findMany({
    where: { ...target, deletedAt: null, status: { in: ["PUBLISHED", "CLOSED"] } },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      access: true,
      opensAt: true,
      closesAt: true,
      deletedAt: true,
      church: { select: { slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return forms.map((f) => ({
    id: f.id,
    title: f.title,
    path: `/f/${f.church.slug}/${f.slug}`,
    open: acceptsResponses(f, now),
    access: f.access,
  }));
}

export type EventForm = Awaited<ReturnType<typeof listFormsForEvent>>[number];
