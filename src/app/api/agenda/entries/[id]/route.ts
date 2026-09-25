import { prisma } from "@/lib/prisma";
import { resolveChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { updateAppointmentScheduledFor, revertAppointmentToValidated } from "@/modules/care";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
}).refine(
  (d) => !(d.startsAt && d.endsAt) || new Date(d.endsAt) > new Date(d.startsAt),
  { message: "L'heure de fin doit être après l'heure de début", path: ["endsAt"] }
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("agendaEntry", id);
    const session = await requireAgendaManage(churchId);

    const body = await request.json();
    const data = updateSchema.parse(body);

    // Orchestrateur (spec 052) : un changement de date répercute `scheduledFor` sur la
    // demande liée (service `care`), dans la même transaction que l'écriture de l'agenda.
    const entry = await prisma.$transaction(async (tx) => {
      const updated = await tx.agendaEntry.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.startsAt !== undefined && { startsAt: new Date(data.startsAt) }),
          ...(data.endsAt !== undefined && { endsAt: data.endsAt ? new Date(data.endsAt) : null }),
          ...(data.location !== undefined && { location: data.location }),
          updatedById: session.user.id,
        },
        include: {
          recipient: { select: { id: true, name: true, role: true } },
        },
      });

      if (data.startsAt !== undefined && updated.requestId) {
        await updateAppointmentScheduledFor(tx, updated.requestId, new Date(data.startsAt));
      }

      return updated;
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "AgendaEntry",
      entityId: id,
      details: data,
    });

    return successResponse(entry);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const churchId = await resolveChurchId("agendaEntry", id);
    const session = await requireAgendaManage(churchId);

    const entry = await prisma.agendaEntry.findUnique({
      where: { id },
      select: { requestId: true, title: true },
    });
    if (!entry) throw new ApiError(404, "Entrée agenda introuvable");

    await prisma.$transaction(async (tx) => {
      // Si l'entrée est liée à une demande, repasser la demande en VALIDATED (service `care`)
      if (entry.requestId) {
        await revertAppointmentToValidated(tx, entry.requestId);
      }
      await tx.agendaEntry.delete({ where: { id } });
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "DELETE",
      entityType: "AgendaEntry",
      entityId: id,
      details: { title: entry.title },
    });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
